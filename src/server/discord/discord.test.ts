import { and, eq, isNotNull, isNull } from "drizzle-orm";
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
import { scheduleMessages } from "./schedule-post.js";
import {
  type RankingScope,
  rankedPicksOf,
  stageResultsMessage,
} from "./stage-results-post.js";
import { teamEmojiName } from "./team-emojis.js";
import { postDiscordUpdates } from "./updates.js";

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
// 4:00 AM Pacific: before the 9:00 daily schedule, so only the posts under test go out.
const EARLY_MORNING = new Date("2026-11-20T12:00:00Z");

const postedMessages = () =>
  vi.mocked(discord.postMessage).mock.calls.map(([, message]) => message);

// Connecting kicks off a background post run; let it finish before the next one.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

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
  test("connecting creates the tournament role, gives it out and skips what already happened", async () => {
    insertManager("amy", "discord-amy");
    insertManager("ghost", null);
    const [alreadyFinished] = stageMatchIds;
    if (alreadyFinished === undefined) throw new Error("no stage match");
    finishMatch(alreadyFinished);

    const commissioner = await loginAs(
      insertUser("commish", "commissioner").id,
    );
    const { body } = await commissioner
      .put(`/api/tournaments/${tournamentId}/discord`)
      .send({ channelId: CHANNEL_ID })
      .expect(200);
    await settle();

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
    expect(
      (await commissioner.get(`/api/tournaments/${tournamentId}`)).body
        .discordChannelId,
    ).toBe(CHANNEL_ID);
    expect(discord.postMessage).not.toHaveBeenCalled();
  });

  test("a finished match posts once, silently, with each pick's stats, points and manager", async () => {
    const [, nextMatch] = stageMatchIds;
    const match = db
      .select()
      .from(matches)
      .where(eq(matches.id, nextMatch ?? -1))
      .get();
    const [stage] = db
      .select()
      .from(stages)
      .where(eq(stages.tournamentId, tournamentId))
      .all();
    const drafted = db
      .select()
      .from(pickables)
      .where(
        and(
          eq(pickables.teamId, match?.team1Id ?? -1),
          eq(pickables.kind, "player"),
        ),
      )
      .get();
    const amy = db
      .select()
      .from(users)
      .where(eq(users.discordUsername, "amy"))
      .get();
    if (!match || !stage || !drafted || !amy) throw new Error("missing rows");
    db.insert(rosterEntries)
      .values({ stageId: stage.id, userId: amy.id, pickableId: drafted.id })
      .run();
    finishMatch(match.id);

    await postDiscordUpdates(EARLY_MORNING);
    await postDiscordUpdates(EARLY_MORNING);

    const [message, ...others] = postedMessages();
    expect(others).toEqual([]);
    expect(message?.content).toBeUndefined();
    expect(message?.allowed_mentions).toEqual({ parse: [] });
    const fields = message?.embeds[0]?.fields ?? [];
    const [players, stats, owners] = fields;
    const standings = fields.at(-1);
    expect(players?.value).toContain(
      `[**${drafted.handle}**](${drafted.vlrUrl})`,
    );
    expect(stats?.value).toContain("20/10/5");
    expect(owners?.value).toMatch(/\*\*\d+\*\* · <@discord-amy>/);
    // Mentions are taller than text, so a standings row is one line rather than two columns.
    expect(standings?.inline).toBe(false);
    expect(standings?.value).toMatch(
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

  test("a match posts once at its scheduled time, listing both rosters", async () => {
    const [, , upcoming] = stageMatchIds;
    db.update(matches)
      .set({
        scheduledAt: "2026-11-20T11:00:00.000Z",
        status: "upcoming",
        discordStartPostedAt: null,
      })
      .where(eq(matches.id, upcoming ?? -1))
      .run();

    await postDiscordUpdates(new Date("2026-11-20T10:59:00Z"));
    expect(discord.postMessage).not.toHaveBeenCalled();
    await postDiscordUpdates(EARLY_MORNING);
    await postDiscordUpdates(EARLY_MORNING);

    const [message, ...others] = postedMessages();
    expect(others).toEqual([]);
    expect(message?.allowed_mentions).toEqual({ parse: [] });
    expect(message?.embeds[0]?.title).toMatch(/^.+ vs .+$/);
    const rosters = message?.embeds[0]?.fields ?? [];
    expect(rosters).toHaveLength(2);
    expect(rosters[0]?.value.split("\n").length).toBeGreaterThanOrEqual(5);
  });

  test("a finished draft posts every manager's team once, pinging the role", async () => {
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

    await postDiscordUpdates(EARLY_MORNING);
    await postDiscordUpdates(EARLY_MORNING);

    const [message, ...others] = postedMessages();
    expect(others).toEqual([]);
    expect(message?.content).toBe("<@&role-1>");
    expect(message?.allowed_mentions).toEqual({ roles: ["role-1"] });
    const [firstPick] = message?.embeds[0]?.fields ?? [];
    expect(firstPick?.name).toBe("1st pick");
    expect(firstPick?.value).toMatch(
      /^<@discord-amy>\n<:(\w+):emoji-\1> \[\*\*.+\*\*\]\(https:\/\/www\.vlr\.gg\/player\//,
    );
  });

  test("a finished match needing a fix pings the commissioner once; clean ones are only checked", async () => {
    db.update(users)
      .set({ discordId: "discord-commish" })
      .where(eq(users.discordUsername, "commish"))
      .run();
    const [, , , broken] = stageMatchIds;
    db.update(matches)
      .set({
        status: "completed",
        scrapeStatus: "failed",
        scrapeError: "Map 2 has 4 players for team 1",
      })
      .where(eq(matches.id, broken ?? -1))
      .run();

    await postDiscordUpdates(EARLY_MORNING);
    await postDiscordUpdates(EARLY_MORNING);

    const [message, ...others] = postedMessages();
    expect(others).toEqual([]);
    expect(message?.content).toBe("<@discord-commish>");
    expect(message?.allowed_mentions).toEqual({ users: ["discord-commish"] });
    expect(message?.embeds[0]?.description).toContain(
      "Map 2 has 4 players for team 1",
    );
    const unchecked = db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.status, "completed"),
          isNull(matches.discordAlertCheckedAt),
        ),
      )
      .all();
    expect(unchecked).toEqual([]);
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

    await postDiscordUpdates(EARLY_MORNING);
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

  test("the schedule is one message when it fits, otherwise split between start times", () => {
    const match = (scheduledAt: string, playerLength: number) => ({
      scheduledAt,
      bestOf: 3,
      stageName: "Swiss Stage",
      vlrMatchUrl: "https://www.vlr.gg/1",
      team1: { name: "A", emoji: null, lines: ["a".repeat(playerLength)] },
      team2: { name: "B", emoji: null, lines: ["b".repeat(playerLength)] },
    });
    const post = (playerLength: number) => ({
      tournamentName: "Kickoff",
      dayLabel: "Friday, Nov 20",
      matches: [
        match("2026-11-20T22:00:00.000Z", playerLength),
        match("2026-11-20T22:00:00.000Z", playerLength),
        match("2026-11-21T00:30:00.000Z", playerLength),
      ],
    });

    expect(scheduleMessages(post(10))).toHaveLength(1);
    const split = scheduleMessages(post(1000));
    expect(split.map(({ embeds }) => embeds[0]?.fields?.length)).toEqual([
      6, 3,
    ]);
    expect(split[0]?.embeds[0]?.title).toBe("Today's matches · Friday, Nov 20");
    expect(split[1]?.embeds[0]?.title).toBeUndefined();
  });

  test("stage results rank top and bottom players and coaches, skipping players who never played", () => {
    const pickable = (id: number, kind: "player" | "coach", played = true) => ({
      id,
      kind,
      handle: `${kind}-${id}`,
      teamId: -1,
      vlrId: played ? `vlr-${id}` : `bench-${id}`,
      vlrUrl: null,
      isPlaceholder: false,
    });
    const players = Array.from({ length: 24 }, (_, n) =>
      pickable(n + 1, "player", n !== 23),
    );
    const coaches = Array.from({ length: 5 }, (_, n) =>
      pickable(100 + n, "coach"),
    );
    // Points equal the id, except the benched player's zero.
    const pointsOf = (id: number) => (id === 24 ? 0 : id);
    const scope = {
      scoredStages: [
        {
          pool: [...players, ...coaches],
          rosterEntries: [{ userId: 7, pickableId: 23 }],
        },
      ],
      scoredMatches: [
        {
          statRows: players
            .filter((p) => p.vlrId.startsWith("vlr-"))
            .map((p) => ({ vlrPlayerId: p.vlrId })),
        },
      ],
      pointsOfPickable: pointsOf,
    } as unknown as RankingScope;

    const ranked = rankedPicksOf(scope, (userId) => `<@u${userId}>`);

    const handles = (picks: { pick: { handle: string } }[]) =>
      picks.map(({ pick }) => pick.handle);
    expect(handles(ranked.player.top)).toEqual(
      [23, 22, 21, 20, 19, 18, 17, 16, 15, 14].map((n) => `player-${n}`),
    );
    expect(ranked.player.top[0]?.managers).toEqual(["<@u7>"]);
    expect(handles(ranked.player.bottom)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `player-${n}`),
    );
    expect(handles(ranked.coach.top)).toEqual([
      "coach-104",
      "coach-103",
      "coach-102",
    ]);
    expect(handles(ranked.coach.bottom)).toEqual(["coach-100", "coach-101"]);

    const message = stageResultsMessage({
      roleId: "role-9",
      tournamentName: "Kickoff",
      stageName: "Playoffs",
      rostersUrl: "https://example.test/tournaments/1/rosters",
      stageStandings: [{ rank: 1, manager: "<@bo>", points: 251 }],
      tournamentStandings: null,
      players: ranked.player,
      coaches: ranked.coach,
    });
    const fields = message.embeds[0]?.fields ?? [];
    const spacer = "\u200b";
    expect(fields.map(({ name, inline }) => [name, inline ?? false])).toEqual([
      ["Playoffs", false],
      [spacer, false],
      ["Top 10 players", true],
      ["Bottom 10 players", true],
      [spacer, false],
      ["Top 3 coaches", true],
      ["Bottom 2 coaches", true],
    ]);
    expect(fields[0]?.value).toBe("1. <@bo> · **251**");
    expect(fields[2]?.value.split("\n")[0]).toBe(
      "1. **player-23** · **23** · <@u7>",
    );
    expect(fields[3]?.value.split("\n")[0]).toBe("1. **player-1** · **1**");
  });

  test("a stage ends with its leader; the last one crowns the tournament winner", () => {
    const post = {
      roleId: "role-9",
      tournamentName: "Kickoff",
      stageName: "Swiss Stage",
      rostersUrl: "https://example.test/tournaments/1/rosters",
      stageStandings: [{ rank: 1, manager: "<@bo>", points: 251 }],
      players: { top: [], bottom: [] },
      coaches: { top: [], bottom: [] },
    };
    expect(
      stageResultsMessage({ ...post, tournamentStandings: null }).embeds[0]
        ?.description,
    ).toBe("<@bo> ends Swiss Stage with **251** points");
    expect(
      stageResultsMessage({
        ...post,
        tournamentStandings: [
          { rank: 1, manager: "<@bo>", points: 400, stagePoints: 251 },
        ],
      }).embeds[0]?.description,
    ).toBe("🏆 <@bo> wins the tournament with **400** points");
  });
});
