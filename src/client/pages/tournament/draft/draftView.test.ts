import type { PoolPickable } from "@shared/entities";
import { describe, expect, test } from "vitest";
import {
  availablePool,
  defaultPoolSort,
  formatClock,
  nextPoolSort,
  type PoolFilter,
  secondsLeft,
} from "./draftView";

function pickable(
  id: number,
  handle: string,
  overrides: Partial<PoolPickable> = {},
): PoolPickable {
  return {
    id,
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
    points: null,
    ownerUserId: null,
    ...overrides,
  };
}

const teamNames = new Map([
  [1, "Sentinels"],
  [2, "NRG"],
]);
const allPlayers: PoolFilter = {
  search: "",
  kind: "player",
  teamIds: new Set(),
};

const pool = [
  pickable(1, "zekken", { formRating: 1.1 }),
  pickable(2, "bang", { formRating: null }),
  pickable(3, "Ethan", { teamId: 2, formRating: 1.3 }),
  pickable(4, "johnqt", { formRating: 1.2, ownerUserId: 9 }),
  pickable(5, "kaplan", { kind: "coach" }),
  pickable(6, "Asuna", { teamId: 2, formRating: null }),
];
const handles = (list: PoolPickable[]) => list.map((p) => p.handle);
const RATING_SORT = defaultPoolSort(pool);

describe("availablePool", () => {
  test("hides owned pickables and other kinds, sorts by rating with nulls last", () => {
    expect(
      handles(availablePool(pool, teamNames, allPlayers, RATING_SORT)),
    ).toEqual(["Ethan", "zekken", "Asuna", "bang"]);
  });

  test("keeps nulls last when ascending", () => {
    const ascending = nextPoolSort(RATING_SORT, "formRating");
    expect(
      handles(availablePool(pool, teamNames, allPlayers, ascending)),
    ).toEqual(["zekken", "Ethan", "Asuna", "bang"]);
  });

  test("sorts by name A to Z, ignoring case", () => {
    const byName = nextPoolSort(RATING_SORT, "handle");
    expect(byName.descending).toBe(false);
    expect(handles(availablePool(pool, teamNames, allPlayers, byName))).toEqual(
      ["Asuna", "bang", "Ethan", "zekken"],
    );
  });

  test("searches handles and team names, and filters by team", () => {
    const search = (text: string) =>
      handles(
        availablePool(
          pool,
          teamNames,
          { ...allPlayers, search: text },
          RATING_SORT,
        ),
      );
    expect(search("ZEK")).toEqual(["zekken"]);
    expect(search("nrg")).toEqual(["Ethan", "Asuna"]);
    expect(
      handles(
        availablePool(
          pool,
          teamNames,
          { ...allPlayers, teamIds: new Set([1]) },
          RATING_SORT,
        ),
      ),
    ).toEqual(["zekken", "bang"]);
  });

  test("defaults to points once any exist, with nulls last", () => {
    const scoredPool = [
      pickable(1, "zekken", { points: 120 }),
      pickable(2, "bang", { points: -15 }),
      pickable(3, "Ethan", { teamId: 2, formRating: 1.3 }),
      pickable(4, "Asuna", { teamId: 2, points: 310 }),
    ];
    const sort = defaultPoolSort(scoredPool);
    expect(sort).toEqual({ key: "points", descending: true });
    expect(
      handles(availablePool(scoredPool, teamNames, allPlayers, sort)),
    ).toEqual(["Asuna", "zekken", "bang", "Ethan"]);
    expect(
      handles(
        availablePool(
          scoredPool,
          teamNames,
          allPlayers,
          nextPoolSort(sort, "points"),
        ),
      ),
    ).toEqual(["bang", "zekken", "Asuna", "Ethan"]);
  });

  test("shows coaches for the coach kind", () => {
    expect(
      handles(
        availablePool(
          pool,
          teamNames,
          { ...allPlayers, kind: "coach" },
          RATING_SORT,
        ),
      ),
    ).toEqual(["kaplan"]);
  });
});

describe("countdown", () => {
  test("counts against server time, not the local clock", () => {
    const receivedAt = 1_000_000;
    const left = secondsLeft(
      "2026-01-01T00:00:30.000Z",
      "2026-01-01T00:00:00.000Z",
      receivedAt,
      receivedAt + 12_500,
    );
    expect(left).toBe(18);
  });

  test("stops at zero and formats minutes", () => {
    expect(
      secondsLeft("2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z", 0, 0),
    ).toBe(0);
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(7)).toBe("0:07");
  });
});
