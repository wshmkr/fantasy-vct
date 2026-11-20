import { and, eq, isNotNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/client.js";
import {
  matches,
  matchMaps,
  pickables,
  playerMapStats,
  rosterEntries,
  stages,
  tournamentMembers,
  users,
} from "../db/schema.js";
import { insertUser, loginAs } from "../test-utils.js";
import { createFakeVlr, FIXTURE_EVENT_URL } from "../vlr/fake-vlr.js";
import { importEvent } from "../vlr/import.js";
import { discord } from "./client.js";
import { matchPostMessage, postFinishedMatches } from "./match-posts.js";

vi.mock("./client.js", () => ({
  isDiscordBotConfigured: () => true,
  discord: {
    guildIdOfChannel: vi.fn(async () => "guild-1"),
    createRole: vi.fn(async () => "role-1"),
    addMemberRole: vi.fn(async () => {}),
    removeMemberRole: vi.fn(async () => {}),
    postMessage: vi.fn(async () => {}),
  },
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
    await postFinishedMatches();
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

    await postFinishedMatches();
    await postFinishedMatches();

    expect(discord.postMessage).toHaveBeenCalledTimes(1);
    const [channelId, message] = vi.mocked(discord.postMessage).mock
      .calls[0] ?? [undefined, undefined];
    expect(channelId).toBe(CHANNEL_ID);
    expect(message?.content).toMatch(/^<@&role-1> .+ 1–0 .+ is final$/);
    expect(message?.allowed_mentions).toEqual({ roles: ["role-1"] });
    const fields = message?.embeds[0]?.fields ?? [];
    expect(fields.map((field) => field.name)).toContain("Standings");
    expect(fields[0]?.value).toContain(`**${draftedPlayer.handle}** 20/10/5`);
    expect(fields[0]?.value).toContain(" · amy");
    expect(fields.at(-1)?.value).toMatch(/^1\. amy · \*\*\d+\*\* \(\+\d+\)/);
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

  test("the message pings only the tournament role and lists points high to low", () => {
    const message = matchPostMessage({
      roleId: "role-9",
      tournamentName: "Kickoff",
      stageName: "Swiss Stage",
      matchesUrl: "https://example.test/tournaments/1/matches",
      maps: [{ mapName: "Bind", team1Rounds: 13, team2Rounds: 11 }],
      team1: {
        name: "FlyQuest",
        score: 1,
        picks: [
          {
            handle: "low",
            isCoach: false,
            stats: null,
            points: 2,
            ownerName: null,
          },
          {
            handle: "Mikes",
            isCoach: true,
            stats: null,
            points: 10,
            ownerName: "Bo",
          },
        ],
      },
      team2: { name: "Masterclass", score: 0, picks: [] },
      standings: [
        { rank: 1, displayName: "Bo", points: 10, matchPoints: 10 },
        { rank: 2, displayName: "Al", points: null, matchPoints: 0 },
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
          "**Mikes** coach · **10** pts · Bo\n**low** didn't play · **2** pts",
      },
      { name: "Masterclass", value: "—" },
      { name: "Standings", value: "1. Bo · **10** (+10)\n2. Al · **0**" },
    ]);
  });
});
