import { eq } from "drizzle-orm";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, test } from "vitest";
import type {
  MatchDetail,
  MatchesResponse,
  MatchTeamDetail,
  StandingsResponse,
} from "../shared/api.js";
import type {
  DraftState,
  TeamWithPickables,
  Tournament,
} from "../shared/entities.js";
import { db } from "./db/client.js";
import {
  images,
  matches,
  pickables,
  playerMapStats,
  rosterEntries,
  stageManagers,
  stagePool,
  stages,
  teams,
  tournamentMembers,
  tournaments,
  tournamentTeams,
} from "./db/schema.js";
import { scoreTournament } from "./points.js";
import { scrapeMatch } from "./sync.js";
import { insertUser, loginAs } from "./test-utils.js";
import { createFakeVlr } from "./vlr/fake-vlr.js";

// Fixture teams: 314896 is 11001 2-0 106; 314898 is 5038 2-1 14822 with ScrewFace subbing for Lear; 314929 is 15011 1-2 14822.
const TEAM_VLR_IDS = ["11001", "106", "5038", "14822", "15011", "99999"];
const SUB_VLR_ID = "3227";

let commissioner: TestAgent;
let member: TestAgent;
let commissionerId: number;
let memberId: number;
let tournamentId: number;
let firstStageId: number;
const matchIdByVlrId = new Map<string, number>();
const teamIdByVlrId = new Map<string, number>();
const pickableIdByHandle = new Map<string, number>();

function idOf<Key>(ids: Map<Key, number>, key: Key): number {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`No id for ${String(key)}`);
  return id;
}
const pickableId = (handle: string) => idOf(pickableIdByHandle, handle);
const matchId = (vlrId: string) => idOf(matchIdByVlrId, vlrId);

function insertPickable(
  kind: "player" | "coach",
  handle: string,
  teamId: number,
  vlrId: string | null,
  photoImageId: number,
) {
  const id = db
    .insert(pickables)
    .values({ kind, handle, vlrId, teamId, photoImageId })
    .returning()
    .get().id;
  pickableIdByHandle.set(handle, id);
}

function rosterOf(stageId: number, userId: number, handles: string[]) {
  db.insert(rosterEntries)
    .values(
      handles.map((handle) => ({
        stageId,
        userId,
        pickableId: pickableId(handle),
      })),
    )
    .run();
}

async function standings(): Promise<StandingsResponse> {
  return (
    await member.get(`/api/tournaments/${tournamentId}/standings`).expect(200)
  ).body;
}

async function matchDetail(vlrId: string): Promise<MatchDetail> {
  return (await member.get(`/api/matches/${matchId(vlrId)}`).expect(200)).body;
}

function pickPoints(team: MatchTeamDetail | null, handle: string) {
  return team?.picks.find((pick) => pick.pickable.handle === handle)?.points;
}

beforeAll(async () => {
  commissionerId = insertUser("commish", "commissioner").id;
  memberId = insertUser("member").id;
  commissioner = await loginAs(commissionerId);
  member = await loginAs(memberId);

  tournamentId = db
    .insert(tournaments)
    .values({ name: "Split 1", vlrEventUrl: "fixture", vlrEventId: "fixture" })
    .returning()
    .get().id;
  for (const vlrId of TEAM_VLR_IDS) {
    const teamId = db
      .insert(teams)
      .values({ vlrId, name: `Team ${vlrId}` })
      .returning()
      .get().id;
    teamIdByVlrId.set(vlrId, teamId);
    db.insert(tournamentTeams).values({ tournamentId, teamId }).run();
  }
  const [first, second, third] = [["s1"], ["s2"], ["s3"]].map(
    (vlrStageKeysJson, position) =>
      db
        .insert(stages)
        .values({
          tournamentId,
          name: `Stage ${position + 1}`,
          position,
          source: "vlr",
          vlrStageKeysJson,
        })
        .returning()
        .get().id,
  );
  if (!first || !second || !third) throw new Error("no stages");
  firstStageId = first;

  const fakeVlr = createFakeVlr();
  for (const [vlrId, stageKey] of [
    ["314896", "s1"],
    ["314898", "s1"],
    ["314929", "s2"],
  ] as const) {
    const id = db
      .insert(matches)
      .values({
        tournamentId,
        vlrId,
        stageKey,
        bestOf: 3,
        status: "completed",
        scheduledAt: "2024-03-20T20:00:00.000Z",
      })
      .returning()
      .get().id;
    matchIdByVlrId.set(vlrId, id);
    await scrapeMatch(id, { download: fakeVlr.download });
  }
  db.insert(matches)
    .values({
      tournamentId,
      vlrId: "upcoming",
      stageKey: "s3",
      bestOf: 3,
      status: "upcoming",
    })
    .run();

  const photoImageId = db
    .insert(images)
    .values({
      sourceUrl: "photo",
      contentType: "image/png",
      bytes: Buffer.from(""),
    })
    .returning()
    .get().id;
  const players = new Map(
    db
      .select()
      .from(playerMapStats)
      .all()
      .filter((row) => row.vlrPlayerId !== SUB_VLR_ID)
      .map((row) => [row.vlrPlayerId, row]),
  );
  const teamId = (vlrId: string) => idOf(teamIdByVlrId, vlrId);
  for (const player of players.values()) {
    insertPickable(
      "player",
      player.handle,
      player.teamId,
      player.vlrPlayerId,
      photoImageId,
    );
  }
  for (const vlrId of TEAM_VLR_IDS) {
    insertPickable(
      "coach",
      `Coach ${vlrId}`,
      teamId(vlrId),
      null,
      photoImageId,
    );
  }
  insertPickable(
    "player",
    "unplayed",
    teamId("99999"),
    "unplayed",
    photoImageId,
  );
  insertPickable("player", "bench", teamId("14822"), "bench", photoImageId);
  const allPickableIds = [...pickableIdByHandle.values()];
  for (const stageId of [first, second, third]) {
    db.insert(stagePool)
      .values(allPickableIds.map((id) => ({ stageId, pickableId: id })))
      .run();
  }

  for (const [n, userId] of [commissionerId, memberId].entries()) {
    db.insert(tournamentMembers)
      .values({
        tournamentId,
        userId,
        color: n === 0 ? "manager-red" : "manager-blue",
      })
      .run();
  }
  db.insert(stageManagers)
    .values([
      { stageId: first, userId: commissionerId, seat: 0, lockedAt: "now" },
      { stageId: first, userId: memberId, seat: 1 },
      { stageId: third, userId: commissionerId, seat: 1 },
      { stageId: third, userId: memberId, seat: 0 },
    ])
    .run();
  rosterOf(first, commissionerId, [
    "NiSMO",
    "Coach 11001",
    "koalanoob",
    "zander",
    "BcJ",
    "nitr0",
  ]);
  rosterOf(first, memberId, [
    "Lear",
    "POISED",
    "sym",
    "gMd",
    "aproto",
    "Coach 14822",
  ]);
});

describe("match detail", () => {
  test("scores players with the sweep and coaches with rounds and the unplayed map", async () => {
    const detail = await matchDetail("314896");

    expect(detail.maps.map((map) => map.mapName)).toEqual(["Lotus", "Icebox"]);
    expect(pickPoints(detail.team1, "NiSMO")).toBe(53 + 70 + 15);
    expect(pickPoints(detail.team2, "POISED")).toBe(124 - 21);
    expect(pickPoints(detail.team1, "Coach 11001")).toBe(82);
    expect(pickPoints(detail.team2, "Coach 106")).toBe(34);
    expect(
      detail.team1?.picks.find((pick) => pick.pickable.handle === "NiSMO"),
    ).toMatchObject({
      ownerUserId: commissionerId,
      playerStatTotals: { k: 45, d: 29, a: 14, mk3: 5, clutches: 0 },
    });
    expect(
      detail.team1?.picks.find((pick) => pick.pickable.kind === "coach")
        ?.playerStatTotals,
    ).toBeNull();
  });

  test("a sub standing in alone is credited to the rostered player they replaced", async () => {
    const detail = await matchDetail("314898");

    expect(pickPoints(detail.team2, "Lear")).toBe(1 + 47 + 25);
    expect(detail.team2?.subs).toHaveLength(3);
    expect(detail.team2?.subs[0]).toMatchObject({
      mapNo: 1,
      vlrPlayerId: SUB_VLR_ID,
      handle: "ScrewFace",
      stats: { k: 12, d: 18, clutches: 2 },
      replacesPickableId: pickableId("Lear"),
      needsAssignment: false,
      missingPickableIds: [],
    });
    // The sub's credited rows count as Lear taking part.
    const scored = scoreTournament(tournamentId).matches.find(
      ({ match }) => match.id === matchId("314898"),
    );
    expect(scored?.participantIds.has(pickableId("Lear"))).toBe(true);
  });
});

describe("standings", () => {
  test("ranks managers, and a stage only counts its own matches", async () => {
    const result = await standings();
    const [leader, runnerUp] = result.managers;
    const firstStage = (standing: typeof leader) =>
      standing?.stages.find((stage) => stage.stageId === firstStageId);

    expect(leader?.points).not.toBeNull();
    expect(leader?.user.id).toBe(commissionerId);
    expect(leader?.rank).toBe(1);
    expect(runnerUp?.rank).toBe(2);
    expect(firstStage(leader)).toMatchObject({ locked: true, rank: 1 });
    expect(
      firstStage(leader)?.picks.map((pick) => pick.pickable.handle),
    ).toEqual(["NiSMO", "koalanoob", "zander", "BcJ", "nitr0", "Coach 11001"]);
    const memberFirstStage = firstStage(runnerUp);
    expect(
      memberFirstStage?.picks.find((pick) => pick.pickable.handle === "Lear")
        ?.points,
    ).toBe(73);
    expect(
      memberFirstStage?.picks.find(
        (pick) => pick.pickable.handle === "Coach 14822",
      )?.points,
    ).toBe(2 * (11 + 13 + 6));
    expect(memberFirstStage?.points).toBe(
      (memberFirstStage?.picks ?? []).reduce(
        (sum, pick) => sum + (pick.points ?? 0),
        0,
      ),
    );
    expect(runnerUp?.points).toBe(memberFirstStage?.points);
  });

  test("the tournament carries the leaders and lists members in rank order", async () => {
    const { managers } = await standings();
    const tournament: Tournament = (
      await member.get(`/api/tournaments/${tournamentId}`).expect(200)
    ).body;

    expect(tournament.leaders).toEqual(
      managers.slice(0, 3).map(({ user, color, rank, points }) => ({
        user,
        color,
        rank,
        points,
      })),
    );
    expect(tournament.leaders.length).toBeGreaterThan(0);
    expect(tournament.members.map(({ user }) => user.id)).toEqual(
      managers.map(({ user }) => user.id),
    );
  });

  test("a stage without points has null totals and keeps the draft order", async () => {
    const [leader] = (await standings()).managers;
    const third = leader?.stages[2];

    expect(third?.points).toBeNull();
    expect(third?.rank).toBe(2);
  });
});

describe("tournament points", () => {
  test("teams and the draft pool sum every stage, null before a team has played", async () => {
    const lear = 73 + (-2 - 12 + 53);
    const teamsBody: TeamWithPickables[] = (
      await member.get(`/api/tournaments/${tournamentId}/teams`).expect(200)
    ).body;
    const pickablesByHandle = new Map(
      teamsBody.flatMap((team) =>
        team.pickables.map((pickable) => [pickable.handle, pickable]),
      ),
    );
    expect(pickablesByHandle.get("Lear")?.points).toBe(lear);
    expect(pickablesByHandle.get("Coach 14822")?.points).toBe(60 + 76);
    expect(pickablesByHandle.get("unplayed")?.points).toBeNull();

    const draft: DraftState = (
      await member.get(`/api/stages/${firstStageId}/draft`).expect(200)
    ).body;
    expect(
      draft.pool.find((pickable) => pickable.handle === "Lear")?.points,
    ).toBe(lear);
  });
});

describe("matches", () => {
  test("lists the schedule with owners per team and sync state", async () => {
    const body: MatchesResponse = (
      await member.get(`/api/tournaments/${tournamentId}/matches`).expect(200)
    ).body;
    const twoNil = body.matches.find((match) => match.id === matchId("314896"));

    expect(body.syncRunning).toBe(false);
    expect(twoNil).toMatchObject({
      stageId: firstStageId,
      bestOf: 3,
      status: "completed",
      scrapeStatus: "ok",
      needsAttention: false,
      mapCount: 2,
      team1: { score: 2, ownerUserIds: [commissionerId] },
      team2: { score: 0, ownerUserIds: [memberId] },
    });
    expect(
      body.matches.find((match) => match.status === "upcoming"),
    ).toMatchObject({ team1: null, team2: null, mapCount: 0 });
  });

  test("an ambiguous sub needs attention until the commissioner assigns it", async () => {
    rosterOf(firstStageId, commissionerId, ["bench"]);
    const needsAttention = async () =>
      (
        (await member.get(`/api/tournaments/${tournamentId}/matches`)).body
          .matches as MatchesResponse["matches"]
      ).find((match) => match.id === matchId("314898"))?.needsAttention;

    expect(await needsAttention()).toBe(true);
    const before = await matchDetail("314898");
    expect(pickPoints(before.team2, "Lear")).toBe(0);
    expect(before.team2?.subs[0]).toMatchObject({
      replacesPickableId: null,
      needsAssignment: true,
      missingPickableIds: [pickableId("Lear"), pickableId("bench")],
    });

    const body = {
      assignments: [1, 2, 3].map((mapNo) => ({
        mapNo,
        subVlrPlayerId: SUB_VLR_ID,
        replacesPickableId: pickableId("Lear"),
      })),
    };
    await member
      .put(`/api/matches/${matchId("314898")}/subs`)
      .send(body)
      .expect(403);
    await commissioner
      .put(`/api/matches/${matchId("314898")}/subs`)
      .send(body)
      .expect(204);

    expect(await needsAttention()).toBe(false);
    const after = await matchDetail("314898");
    expect(pickPoints(after.team2, "Lear")).toBe(73);
    expect(after.team2?.subs[0]).toMatchObject({
      replacesPickableId: pickableId("Lear"),
      needsAssignment: false,
    });

    await commissioner
      .put(`/api/matches/${matchId("314898")}/subs`)
      .send({
        assignments: [
          { mapNo: 1, subVlrPlayerId: SUB_VLR_ID, replacesPickableId: null },
        ],
      })
      .expect(204);
    expect(pickPoints((await matchDetail("314898")).team2, "Lear")).toBe(
      47 + 25,
    );
  });

  test("a failed scrape needs attention", async () => {
    db.update(matches)
      .set({ scrapeStatus: "failed" })
      .where(eq(matches.id, matchId("314896")))
      .run();
    const body: MatchesResponse = (
      await member.get(`/api/tournaments/${tournamentId}/matches`)
    ).body;
    expect(
      body.matches.find((match) => match.id === matchId("314896"))
        ?.needsAttention,
    ).toBe(true);
  });
});

describe("forfeits", () => {
  test("every pick of the winner gets the forfeit bonus and nothing else; the forfeiting side gets 0", async () => {
    const winnerTeamId = idOf(teamIdByVlrId, "11001");
    const tournamentPointsOf = async (handle: string) => {
      const teamsBody: TeamWithPickables[] = (
        await member.get(`/api/tournaments/${tournamentId}/teams`).expect(200)
      ).body;
      return teamsBody
        .flatMap((team) => team.pickables)
        .find((pickable) => pickable.handle === handle)?.points;
    };
    const nismoBefore = await tournamentPointsOf("NiSMO");
    const benchPhoto = db.select().from(images).get()?.id ?? 0;
    insertPickable("player", "bench 11001", winnerTeamId, "b11", benchPhoto);
    db.insert(stagePool)
      .values({ stageId: firstStageId, pickableId: pickableId("bench 11001") })
      .run();
    const id = db
      .insert(matches)
      .values({
        tournamentId,
        vlrId: "forfeit",
        stageKey: "s1",
        team1Id: winnerTeamId,
        team2Id: idOf(teamIdByVlrId, "106"),
        bestOf: 3,
        status: "completed",
        score1: 0,
        score2: 0,
        forfeitWinner: 1,
        scrapeStatus: "ok",
      })
      .returning()
      .get().id;
    matchIdByVlrId.set("forfeit", id);

    const detail = await matchDetail("forfeit");
    const winnerPicks = detail.team1?.picks ?? [];
    expect(winnerPicks.map((pick) => pick.pickable.handle)).toEqual(
      expect.arrayContaining(["NiSMO", "bench 11001", "Coach 11001"]),
    );
    expect(winnerPicks.every((pick) => pick.points === 80)).toBe(true);
    expect(detail.team2?.picks.length).toBeGreaterThan(0);
    expect(detail.team2?.picks.every((pick) => pick.points === 0)).toBe(true);
    expect(await tournamentPointsOf("NiSMO")).toBe((nismoBefore ?? 0) + 80);
  });
});
