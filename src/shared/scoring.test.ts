import { describe, expect, test } from "vitest";
import {
  coachMatchPoints,
  isFinishedMap,
  type MapStatLine,
  mapRowPoints,
  pairSubs,
  playerMatchPoints,
  type RosteredPlayer,
  rankStandings,
  type SwissSeriesResult,
  scoringConfigWith,
  sweepBonus,
  swissPhantomPoints,
  type TeamSeries,
} from "./scoring.js";

describe("isFinishedMap", () => {
  test.each([
    [13, 11],
    [14, 12],
    [6, 13],
  ])("%i-%i is finished", (team1Rounds, team2Rounds) => {
    expect(isFinishedMap(team1Rounds, team2Rounds)).toBe(true);
  });

  test.each([
    [12, 12],
    [13, 12],
    [9, 7],
  ])("%i-%i is not finished", (team1Rounds, team2Rounds) => {
    expect(isFinishedMap(team1Rounds, team2Rounds)).toBe(false);
  });
});

describe("pairSubs", () => {
  const poolPlayerVlrIds = ["a", "b", "c", "d", "e"];
  const rostered: RosteredPlayer[] = poolPlayerVlrIds.map(
    (vlrPlayerId, index) => ({ pickableId: index + 1, vlrPlayerId }),
  );

  test("one missing player and one sub pair automatically", () => {
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered,
        mapPlayerVlrIds: ["a", "b", "c", "d", "sub"],
        assignments: [],
      }),
    ).toEqual({
      missingPickableIds: [5],
      credits: [{ subVlrPlayerId: "sub", replacesPickableId: 5 }],
      ambiguous: false,
      unassignedSubVlrIds: [],
    });
  });

  test("with nobody missing, the sub replaces nobody", () => {
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered.slice(0, 4),
        mapPlayerVlrIds: ["a", "b", "c", "d", "sub"],
        assignments: [],
      }),
    ).toEqual({
      missingPickableIds: [],
      credits: [{ subVlrPlayerId: "sub", replacesPickableId: null }],
      ambiguous: false,
      unassignedSubVlrIds: [],
    });
  });

  test("two missing and one sub need attention until the sub is assigned", () => {
    const mapPlayerVlrIds = ["a", "b", "c", "sub"];
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered,
        mapPlayerVlrIds,
        assignments: [],
      }),
    ).toEqual({
      missingPickableIds: [4, 5],
      credits: [{ subVlrPlayerId: "sub", replacesPickableId: null }],
      ambiguous: true,
      unassignedSubVlrIds: ["sub"],
    });
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered,
        mapPlayerVlrIds,
        assignments: [{ subVlrPlayerId: "sub", replacesPickableId: 4 }],
      }),
    ).toEqual({
      missingPickableIds: [4, 5],
      credits: [{ subVlrPlayerId: "sub", replacesPickableId: 4 }],
      ambiguous: true,
      unassignedSubVlrIds: [],
    });
  });

  test("an assignment to a player who isn't missing any more is ignored", () => {
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered,
        mapPlayerVlrIds: ["a", "b", "c", "sub", "sub2"],
        assignments: [{ subVlrPlayerId: "sub", replacesPickableId: 1 }],
      }),
    ).toMatchObject({
      credits: [
        { subVlrPlayerId: "sub", replacesPickableId: null },
        { subVlrPlayerId: "sub2", replacesPickableId: null },
      ],
    });
  });

  test("registered players nobody rostered are never missing, and aren't subs when they play", () => {
    expect(
      pairSubs({
        poolPlayerVlrIds: [...poolPlayerVlrIds, "bench"],
        rosteredPlayers: rostered.slice(0, 3),
        mapPlayerVlrIds: ["a", "b", "c", "d", "bench"],
        assignments: [],
      }),
    ).toEqual({
      missingPickableIds: [],
      credits: [],
      ambiguous: false,
      unassignedSubVlrIds: [],
    });
  });

  test("with only one pool player rostered, a sub standing in for them pairs automatically", () => {
    expect(
      pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers: rostered.slice(0, 1),
        mapPlayerVlrIds: ["b", "c", "d", "e", "sub"],
        assignments: [],
      }),
    ).toEqual({
      missingPickableIds: [1],
      credits: [{ subVlrPlayerId: "sub", replacesPickableId: 1 }],
      ambiguous: false,
      unassignedSubVlrIds: [],
    });
  });
});

const statLine = (stats: Partial<MapStatLine>): MapStatLine => ({
  k: 0,
  d: 0,
  a: 0,
  fk: 0,
  fd: 0,
  mk3: 0,
  mk4: 0,
  aces: 0,
  clutches: 0,
  ...stats,
});

const series = (
  bestOf: number,
  maps: [number, number][],
  completed = true,
): TeamSeries => ({
  completed,
  bestOf,
  maps: maps.map(([ownRounds, opponentRounds]) => ({
    ownRounds,
    opponentRounds,
  })),
});

describe("player points", () => {
  test("one map row follows the formula", () => {
    const row = statLine({
      k: 20,
      d: 15,
      a: 6,
      fk: 3,
      fd: 2,
      mk3: 2,
      mk4: 1,
      aces: 1,
      clutches: 2,
    });
    expect(mapRowPoints(row)).toBe(100 - 75 + 12 + 15 - 10 + 10 + 5 + 25 + 20);
  });

  test("an ace scores only as an ace", () => {
    expect(mapRowPoints(statLine({ aces: 1 }))).toBe(25);
  });

  test("the tournament's scoring config overrides the defaults", () => {
    expect(
      mapRowPoints(statLine({ k: 1, d: 1 }), scoringConfigWith({ kill: 3 })),
    ).toBe(3 - 5);
  });

  test("a sweep adds 15 once per series, only for those who played", () => {
    const sweep = series(3, [
      [13, 5],
      [13, 7],
    ]);
    const row = statLine({ k: 10 });
    expect(playerMatchPoints(sweep, [row, row])).toBe(100 + 15);
    expect(playerMatchPoints(sweep, [])).toBe(0);
    expect(
      sweepBonus(
        series(5, [
          [13, 1],
          [13, 2],
          [13, 3],
        ]),
        true,
      ),
    ).toBe(15);
    expect(
      sweepBonus(
        series(3, [
          [13, 5],
          [5, 13],
          [13, 7],
        ]),
        true,
      ),
    ).toBe(0);
    expect(sweepBonus(series(1, [[13, 5]]), true)).toBe(0);
  });

  test("a live match scores its finished maps but no sweep yet", () => {
    const live = series(
      3,
      [
        [13, 5],
        [13, 7],
      ],
      false,
    );
    expect(playerMatchPoints(live, [statLine({ k: 10 })])).toBe(50);
  });
});

describe("coach points", () => {
  test("a 2-0 earns 2 per round won plus 30 for the unplayed map", () => {
    expect(
      coachMatchPoints(
        series(3, [
          [13, 8],
          [13, 9],
        ]),
      ),
    ).toBe(82);
  });

  test("a 2-1 has no unplayed map", () => {
    expect(
      coachMatchPoints(
        series(3, [
          [13, 8],
          [11, 13],
          [14, 12],
        ]),
      ),
    ).toBe(2 * 38);
  });

  test("a Bo5 3-0 and 3-1 earn 30 per unplayed map", () => {
    expect(
      coachMatchPoints(
        series(5, [
          [13, 1],
          [13, 2],
          [13, 3],
        ]),
      ),
    ).toBe(2 * 39 + 60);
    expect(
      coachMatchPoints(
        series(5, [
          [13, 1],
          [2, 13],
          [13, 3],
          [13, 4],
        ]),
      ),
    ).toBe(2 * 41 + 30);
  });

  test("the loser gets only its rounds", () => {
    expect(
      coachMatchPoints(
        series(3, [
          [8, 13],
          [9, 13],
        ]),
      ),
    ).toBe(34);
  });

  test("a live match gives the coach 0", () => {
    expect(coachMatchPoints(series(3, [[13, 8]], false))).toBe(0);
  });
});

describe("Swiss phantom series", () => {
  const swissWins = 3;
  const played = (won: boolean, points: number): SwissSeriesResult => ({
    completed: true,
    won,
    scrapeOk: true,
    points,
  });

  test("a 3-0 team gets 2 series at the pick's average", () => {
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 100),
        played(true, 50),
        played(true, 150),
      ]),
    ).toBe(200);
  });

  test("a 3-1 team gets 1, a 3-2 team 0", () => {
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 100),
        played(false, 20),
        played(true, 60),
        played(true, 20),
      ]),
    ).toBe(50);
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 100),
        played(false, 20),
        played(false, 60),
        played(true, 20),
        played(true, 50),
      ]),
    ).toBe(0);
  });

  test("an eliminated team gets none", () => {
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 100),
        played(false, 20),
        played(false, 60),
      ]),
    ).toBe(0);
  });

  test("a sat-out series counts as 0 in the average", () => {
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 90),
        played(true, 0),
        played(true, 60),
      ]),
    ).toBe(100);
  });

  test("coaches use their own average", () => {
    const coachSeries = [
      series(3, [
        [13, 8],
        [13, 9],
      ]),
      series(3, [
        [13, 1],
        [13, 2],
      ]),
      series(3, [
        [13, 3],
        [11, 13],
        [13, 5],
      ]),
    ].map((result) => played(true, coachMatchPoints(result)));
    expect(swissPhantomPoints(swissWins, coachSeries)).toBe(
      Math.round((2 * (82 + 82 + 74)) / 3),
    );
  });

  test("only ok matches count toward the average", () => {
    expect(
      swissPhantomPoints(swissWins, [
        played(true, 100),
        played(true, 50),
        { ...played(true, 10), scrapeOk: false },
      ]),
    ).toBe(150);
  });
});

describe("rankStandings", () => {
  const standing = (
    displayName: string,
    points: number | null,
    bestPickPoints: number | null,
    draftSeat: number | null = null,
  ) => ({ displayName, points, bestPickPoints, draftSeat });

  test("ranks by points, then best single pick, then name", () => {
    expect(
      rankStandings([
        standing("Cara", 500, 200),
        standing("Bea", 500, 200),
        standing("Abe", 500, 150),
        standing("Dan", 600, 100),
      ]).map(({ displayName }) => displayName),
    ).toEqual(["Dan", "Bea", "Cara", "Abe"]);
  });

  test("before any points exist, managers keep their draft order", () => {
    expect(
      rankStandings([
        standing("Abe", null, null, 1),
        standing("Bea", null, null, 0),
      ]).map(({ displayName }) => displayName),
    ).toEqual(["Bea", "Abe"]);
  });
});
