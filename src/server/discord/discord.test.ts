import { and, eq, isNotNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/client.js";
import {
  matches,
  matchMaps,
  pickables,
  playerMapStats,
  rosterEntries,
  stageManagers,
  stages,
  teams,
  tournamentMembers,
  users,
} from "../db/schema.js";
import { insertUser, loginAs } from "../test-utils.js";
import { createFakeVlr, FIXTURE_EVENT_URL } from "../vlr/fake-vlr.js";
import { importEvent } from "../vlr/import.js";
import { discord } from "./client.js";
import { teamEmojiName } from "./team-emojis.js";
import { matchPostMessage, postDiscordUpdates } from "./updates.js";

vi.mock("./client.js", () => ({
  isDiscordBotConfigured: () => true,
  discord: {
    guildIdOfChannel: vi.fn(async () => "guild-1"),
    createRole: vi.fn(async () => "role-1"),
    addMemberRole: vi.fn(async () => {}),
    removeMemberRole: vi.fn(async () => {}),
    postMessage: vi.fn(async () => {}),
    listApplicationEmojis: vi.fn(async () => [
      { id: "emoji-uploaded-before", name: "Backed_by_Nobody" },
    ]),
    createApplicationEmoji: vi.fn(async (name: string) => `emoji-${name}`),
  },
}));

// The fake VLR serves placeholder bytes, not real logos; emoji-image has its own tests.
vi.mock("./emoji-image.js", () => ({
  emojiImageOf: async (logo: Buffer) => logo,
}));

const CHANNEL_ID = "1573187782690734090";

let tournamentId: number;
let stageMatchIds: number[];

function insertManager(username: string, discordId: string | null) {
  const user = db
    .insert(users)
    .values({ discordUsername: username, displayName: username, discordId })
    .returning()
    .get();
  db.insert(tournamentMembers)
    .values({
      tournamentId,
      userId: user.id,
      color: username === "amy" ? "manager-red" : "manager-blue",
    })
    .run();
  return user;
}

// Writes what a successful scrape would: one finished map and every rostered player's line.
function finishMatch(matchId: number) {
  const match = db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match?.team1Id || !match.team2Id) throw new Error("match without teams");
  db.insert(matchMaps)
    .values({
      matchId,
      mapNo: 1,
      mapName: "Ascent",
      team1Rounds: 13,
      team2Rounds: 7,
    })
    .run();
  for (const teamId of [match.team1Id, match.team2Id]) {
    const players = db
      .select()
      .from(pickables)
      .where(and(eq(pickables.teamId, teamId), eq(pickables.kind, "player")))
      .limit(5)
      .all();
    for (const player of players) {
      db.insert(playerMapStats)
        .values({
          matchId,
          mapNo: 1,
          vlrPlayerId: player.vlrId ?? "",
          handle: player.handle,
          teamId,
          k: 20,
          d: 10,
          a: 5,
          fk: 2,
          fd: 1,
          mk3: 1,
          mk4: 0,
          aces: 0,
          clutches: 0,
        })
        .run();
    }
  }
  db.update(matches)
    .set({ status: "completed", scrapeStatus: "ok", score1: 1, score2: 0 })
    .where(eq(matches.id, matchId))
    .run();
}

beforeAll(async () => {
  tournamentId = await importEvent(FIXTURE_EVENT_URL, {
    download: createFakeVlr().download,
  });
  const [firstStage] = db
    .select()
    .from(stages)
    .where(eq(stages.tournamentId, tournamentId))
    .all();
  if (!firstStage) throw new Error("no stage");
  db.update(matches)
    .set({ status: "upcoming", scrapeStatus: "pending" })
    .where(eq(matches.tournamentId, tournamentId))
    .run();
  stageMatchIds = db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournamentId),
        isNotNull(matches.team1Id),
        isNotNull(matches.team2Id),
      ),
    )
    .all()
    .map(({ id }) => id)
    .filter((id) => {
      const match = db.select().from(matches).where(eq(matches.id, id)).get();
      return firstStage.vlrStageKeysJson.includes(match?.stageKey ?? "");
    });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Discord", () => {
  test("connecting a channel creates the tournament role and gives it to the managers", async () => {
    const amy = insertManager("amy", "discord-amy");
    insertManager("ghost", null);
    const [alreadyFinished, nextMatch] = stageMatchIds;
    if (alreadyFinished === undefined || nextMatch === undefined) {
      throw new Error("need two stage matches");
    }
    finishMatch(alreadyFinished);

    const commissioner = await loginAs(
      insertUser("commish", "commissioner").id,
    );
    const { body } = await commissioner
      .put(`/api/tournaments/${tournamentId}/discord`)
      .send({ channelId: CHANNEL_ID })
      .expect(200);

    expect(body).toEqual({ managersWithoutRole: ["ghost"] });
    expect(discord.createRole).toHaveBeenCalledWith(
      "guild-1",
      "Spike Series 2026: Convergence EMEA - DACH",
    );
    expect(discord.addMemberRole).toHaveBeenCalledWith(
      "guild-1",
      "discord-amy",
      "role-1",
    );
    const tournament = (
      await commissioner.get(`/api/tournaments/${tournamentId}`)
    ).body;
    expect(tournament.discordChannelId).toBe(CHANNEL_ID);

    // A match that ended before connecting isn't posted.
    await postDiscordUpdates();
    expect(discord.postMessage).not.toHaveBeenCalled();

    const match = db
      .select()
      .from(matches)
      .where(eq(matches.id, nextMatch))
      .get();
    const draftedPlayer = db
      .select()
      .from(pickables)
      .where(
        and(
          eq(pickables.teamId, match?.team1Id ?? -1),
          eq(pickables.kind, "player"),
        ),
      )
      .get();
    const [stage] = db
      .select()
      .from(stages)
      .where(eq(stages.tournamentId, tournamentId))
      .all();
    if (!draftedPlayer || !stage) throw new Error("no player or stage");
    db.insert(rosterEntries)
      .values({
        stageId: stage.id,
        userId: amy.id,
        pickableId: draftedPlayer.id,
      })
      .run();
    finishMatch(nextMatch);

    await postDiscordUpdates();
    await postDiscordUpdates();

    expect(discord.postMessage).toHaveBeenCalledTimes(1);
    const [channelId, message] = vi.mocked(discord.postMessage).mock
      .calls[0] ?? [undefined, undefined];
    expect(channelId).toBe(CHANNEL_ID);
    expect(message?.content).toMatch(/^<@&role-1> .+ 1–0 .+ is final$/);
    expect(message?.allowed_mentions).toEqual({ roles: ["role-1"] });
    const fields = message?.embeds[0]?.fields ?? [];
    expect(fields.map((field) => field.name)).toContain("Standings");
    expect(fields[0]?.value).toContain(`**${draftedPlayer.handle}** 20/10/5`);
    expect(fields[0]?.value).toContain(" · <@discord-amy>");
    expect(fields.at(-1)?.value).toMatch(
      /^1\. <@discord-amy> · \*\*\d+\*\* \(\+\d+\)/,
    );
  });

  test("joining after the channel is connected gives the role", async () => {
    const newcomer = db
      .insert(users)
      .values({ discordUsername: "newbie", discordId: "discord-newbie" })
      .returning()
      .get();
    const agent = await loginAs(newcomer.id);
    await agent
      .post(`/api/tournaments/${tournamentId}/members`)
      .send({ color: "manager-green" })
      .expect(204);

    await vi.waitFor(() =>
      expect(discord.addMemberRole).toHaveBeenCalledWith(
        "guild-1",
        "discord-newbie",
        "role-1",
      ),
    );
  });

  test("a finished draft posts every manager's team once, in draft order", async () => {
    const [stage] = db
      .select()
      .from(stages)
      .where(eq(stages.tournamentId, tournamentId))
      .all();
    const amy = db
      .select()
      .from(users)
      .where(eq(users.discordUsername, "amy"))
      .get();
    if (!stage || !amy) throw new Error("no stage or amy");
    db.insert(stageManagers)
      .values({ stageId: stage.id, userId: amy.id, seat: 0 })
      .run();
    db.update(stages)
      .set({ status: "complete" })
      .where(eq(stages.id, stage.id))
      .run();

    await postDiscordUpdates();
    await postDiscordUpdates();

    expect(discord.postMessage).toHaveBeenCalledTimes(1);
    const message = vi.mocked(discord.postMessage).mock.calls[0]?.[1];
    expect(message?.content).toBe(
      `<@&role-1> The ${stage.name} draft is done. Here are the teams:`,
    );
    const [firstPick] = message?.embeds[0]?.fields ?? [];
    expect(firstPick?.name).toBe("1st pick");
    expect(firstPick?.value).toMatch(
      /^<@discord-amy>\n<:(\w+):emoji-\1> \*\*.+\*\*/,
    );
  });

  test("each team logo is uploaded once as a bot emoji, reusing one uploaded before", async () => {
    const emojis = () =>
      db
        .select({ vlrId: teams.vlrId, emoji: teams.discordEmoji })
        .from(teams)
        .all();
    expect(emojis()).toContainEqual({
      vlrId: "23401",
      emoji: "<:Backed_by_Nobody:emoji-uploaded-before>",
    });
    expect(
      emojis().every(({ emoji }) => /^<:\w{2,32}:/.test(emoji ?? "")),
    ).toBe(true);

    await postDiscordUpdates();
    expect(discord.listApplicationEmojis).not.toHaveBeenCalled();
    expect(discord.createApplicationEmoji).not.toHaveBeenCalled();
  });

  test("emoji names are the team name, so hovering one shows the team", () => {
    expect(teamEmojiName("Shopify Rebellion Black", "9353")).toBe(
      "Shopify_Rebellion_Black",
    );
    expect(teamEmojiName("SaD Esports", "13920")).toBe("SaD_Esports");
    expect(teamEmojiName("KRÜ", "2355")).toBe("KR");
    expect(teamEmojiName("的", "77")).toBe("team_77");
  });

  test("the message pings only the tournament role and lists points high to low", () => {
    const message = matchPostMessage({
      roleId: "role-9",
      tournamentName: "Kickoff",
      stageName: "Swiss Stage",
      matchesUrl: "https://example.test/tournaments/1/matches",
      maps: [{ mapName: "Bind", team1Rounds: 13, team2Rounds: 11 }],
      team1: {
        name: "FlyQuest",
        emoji: "<:team_1:9>",
        score: 1,
        picks: [
          {
            handle: "low",
            isCoach: false,
            stats: null,
            points: 2,
            owner: null,
          },
          {
            handle: "Mikes",
            isCoach: true,
            stats: null,
            points: 10,
            owner: "<@bo>",
          },
        ],
      },
      team2: { name: "Masterclass", emoji: null, score: 0, picks: [] },
      standings: [
        { rank: 1, manager: "<@bo>", points: 10, matchPoints: 10 },
        { rank: 2, manager: "Al", points: null, matchPoints: 0 },
      ],
    });

    expect(message.content).toBe(
      "<@&role-9> FlyQuest 1–0 Masterclass is final",
    );
    expect(message.allowed_mentions).toEqual({ roles: ["role-9"] });
    expect(message.embeds[0]?.description).toBe("Swiss Stage · Bind 13–11");
    expect(message.embeds[0]?.fields).toEqual([
      {
        name: "FlyQuest",
        value:
          "<:team_1:9> **Mikes** coach · **10** pts · <@bo>\n<:team_1:9> **low** didn't play · **2** pts",
      },
      { name: "Masterclass", value: "—" },
      { name: "Standings", value: "1. <@bo> · **10** (+10)\n2. Al · **0**" },
    ]);
  });
});
