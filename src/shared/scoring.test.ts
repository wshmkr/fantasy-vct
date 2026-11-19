import { describe, expect, test } from "vitest";
import { isFinishedMap, pairSubs, type RosteredPlayer } from "./scoring.js";

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
      needsAttention: false,
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
      needsAttention: false,
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
      needsAttention: true,
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
      needsAttention: false,
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
    ).toEqual({ missingPickableIds: [], credits: [], needsAttention: false });
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
      needsAttention: false,
    });
  });
});
