import type { LeaderboardRow } from "@shared/api";
import { scoringConfigWith, ZERO_STAT_LINE } from "@shared/scoring";
import { describe, expect, test } from "vitest";
import {
  columnValue,
  countPoints,
  DEFAULT_LEADERBOARD_SORT,
  formatColumnValue,
  type LeaderboardFilter,
  leaderboardRows,
  nextLeaderboardSort,
} from "./leaderboardView";

function makeRow(
  handle: string,
  overrides: Partial<LeaderboardRow> = {},
): LeaderboardRow {
  return {
    pickable: {
      id: handle.length,
      kind: "player",
      handle,
      teamId: 1,
      isPlaceholder: false,
      vlrUrl: null,
      photoImageId: 1,
      topAgents: [],
      formRating: null,
      formAcs: null,
      formKd: null,
      formRounds: null,
    },
    team: { id: 1, name: "Sentinels", logoImageId: null },
    ownerUserIds: [],
    maps: 2,
    rounds: 40,
    points: 100,
    bestMatchPoints: 60,
    bonus: 0,
    stats: { ...ZERO_STAT_LINE, k: 30, d: 20, fk: 3, fd: 0 },
    rating: 1.1,
    acs: 230,
    kast: 74,
    adr: 150,
    subHandles: [],
    roundsWon: 0,
    unplayedBonus: 0,
    ...overrides,
  };
}

const DEFAULT_SCORING = scoringConfigWith({});
const NO_FILTER: LeaderboardFilter = {
  kind: "player",
  search: "",
  teamIds: new Set(),
  ownerUserIds: new Set(),
  undrafted: false,
};
const ownerName = (userId: number) => `Manager ${userId}`;
const handlesOf = (rows: LeaderboardRow[]) =>
  rows.map((row) => row.pickable.handle);

describe("leaderboardRows", () => {
  const aspas = makeRow("aspas", { points: 200, ownerUserIds: [1] });
  const tenz = makeRow("TenZ", {
    points: 150,
    bestMatchPoints: 90,
    ownerUserIds: [2, 1],
  });
  const zekken = makeRow("zekken", { points: 150, bestMatchPoints: 80 });
  const benched = makeRow("benched", {
    points: null,
    maps: 0,
    rounds: 0,
    team: { id: 2, name: "LOUD", logoImageId: null },
  });
  const rows = [benched, zekken, tenz, aspas];

  test("defaults to PTS, highest first, ties by best match, without points last", () => {
    expect(
      handlesOf(
        leaderboardRows(rows, NO_FILTER, DEFAULT_LEADERBOARD_SORT, ownerName),
      ),
    ).toEqual(["aspas", "TenZ", "zekken", "benched"]);
  });

  test("a header click sorts that column, still with nulls last", () => {
    const byPointsAscending = nextLeaderboardSort(
      DEFAULT_LEADERBOARD_SORT,
      "points",
    );
    expect(
      handlesOf(leaderboardRows(rows, NO_FILTER, byPointsAscending, ownerName)),
    ).toEqual(["TenZ", "zekken", "aspas", "benched"]);
    expect(nextLeaderboardSort(DEFAULT_LEADERBOARD_SORT, "pickable")).toEqual({
      key: "pickable",
      descending: false,
    });
  });

  test("manager, undrafted, team and search filters combine", () => {
    const filtered = (filter: Partial<LeaderboardFilter>) =>
      handlesOf(
        leaderboardRows(
          rows,
          { ...NO_FILTER, ...filter },
          DEFAULT_LEADERBOARD_SORT,
          ownerName,
        ),
      );
    expect(filtered({ ownerUserIds: new Set([2]) })).toEqual(["TenZ"]);
    expect(filtered({ ownerUserIds: new Set([1]) })).toEqual(["aspas", "TenZ"]);
    expect(filtered({ undrafted: true })).toEqual(["zekken", "benched"]);
    expect(filtered({ ownerUserIds: new Set([2]), undrafted: true })).toEqual([
      "TenZ",
      "zekken",
      "benched",
    ]);
    expect(filtered({ teamIds: new Set([2]) })).toEqual(["benched"]);
    expect(filtered({ search: "loud" })).toEqual(["benched"]);
    expect(filtered({ search: "ten", undrafted: true })).toEqual([]);
    expect(filtered({ kind: "coach" })).toEqual([]);
  });
});

describe("columns", () => {
  test("ratios come from totals, a zero denominator counts as 1", () => {
    const row = makeRow("aspas");
    expect(formatColumnValue("kd", columnValue(row, "kd", ownerName))).toBe(
      "1.50",
    );
    expect(formatColumnValue("kpr", columnValue(row, "kpr", ownerName))).toBe(
      "0.75",
    );
    expect(formatColumnValue("fkfd", columnValue(row, "fkfd", ownerName))).toBe(
      "3.00",
    );
  });

  test("formats rates, percents and missing values", () => {
    expect(formatColumnValue("rating", 1.1)).toBe("1.10");
    expect(formatColumnValue("acs", 229.6)).toBe("230");
    expect(formatColumnValue("kast", 73.6)).toBe("74%");
    expect(formatColumnValue("points", -12)).toBe("−12");
    expect(formatColumnValue("kd", null)).toBe("–");
  });

  test("a team without a result shows – in every stat; forfeit-only rows lack rates", () => {
    const unplayed = makeRow("benched", { points: null });
    expect(columnValue(unplayed, "k", ownerName)).toBeNull();
    const forfeitOnly = makeRow("forfeit", { maps: 0, rounds: 0, points: 80 });
    expect(columnValue(forfeitOnly, "kd", ownerName)).toBeNull();
    expect(columnValue(forfeitOnly, "k", ownerName)).toBe(30);
  });

  test("count tooltips use the tournament's own scoring", () => {
    expect(countPoints("k", 30, DEFAULT_SCORING)).toBe("150 pts");
    expect(countPoints("k", 30, { ...DEFAULT_SCORING, kill: 6 })).toBe(
      "180 pts",
    );
    expect(countPoints("d", 20, DEFAULT_SCORING)).toBe("−100 pts");
    expect(countPoints("acs", 230, DEFAULT_SCORING)).toBeNull();
  });
});
