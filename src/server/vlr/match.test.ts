import { describe, expect, test } from "vitest";
import { fixture } from "./fake-vlr.js";
import { parseMatchPages } from "./match.js";

const parseFixture = (overview: string, performance: string) =>
  parseMatchPages(fixture(overview), fixture(performance));

describe("parseMatchPages", () => {
  test("reads a Bo3 2-0 with the real best-of, team ids and per-map stats", () => {
    const page = parseFixture(
      "match-314896-bo3-2-0-overview.html",
      "match-314896-bo3-2-0-performance.html",
    );
    expect(page).toMatchObject({
      team1VlrId: "11001",
      team2VlrId: "106",
      bestOf: 3,
      status: "completed",
      score1: 2,
      score2: 0,
    });
    expect(
      page.finishedMaps.map(({ players, ...map }) => ({
        ...map,
        players: players.length,
      })),
    ).toEqual([
      {
        mapNo: 1,
        mapName: "Lotus",
        team1Rounds: 13,
        team2Rounds: 11,
        players: 10,
      },
      {
        mapNo: 2,
        mapName: "Icebox",
        team1Rounds: 13,
        team2Rounds: 6,
        players: 10,
      },
    ]);
    expect(page.finishedMaps[0]?.players).toContainEqual({
      vlrPlayerId: "849",
      handle: "POISED",
      side: 2,
      k: 27,
      d: 14,
      a: 2,
      fk: 4,
      fd: 1,
      mk3: 4,
      mk4: 0,
      aces: 0,
      clutches: 2,
      rating: 1.63,
      acs: 288,
      kast: 83,
      adr: 191,
    });
  });

  test("reads a 2-1 with overtime maps, multi-kills and clutches per map", () => {
    const page = parseFixture(
      "match-314929-bo3-2-1-overtime-overview.html",
      "match-314929-bo3-2-1-overtime-performance.html",
    );
    expect(page).toMatchObject({
      team1VlrId: "15011",
      team2VlrId: "14822",
      score1: 1,
      score2: 2,
    });
    expect(
      page.finishedMaps.map((map) => [map.team1Rounds, map.team2Rounds]),
    ).toEqual([
      [13, 9],
      [13, 15],
      [12, 14],
    ]);
    const andersin = (mapNo: number) =>
      page.finishedMaps[mapNo - 1]?.players.find(
        (player) => player.handle === "Andersin",
      );
    expect(andersin(1)).toMatchObject({ mk3: 3, clutches: 1, fd: 9 });
    expect(andersin(2)).toMatchObject({ mk3: 2, clutches: 3, fd: 3 });
    expect(
      page.finishedMaps[0]?.players.find(
        (player) => player.handle === "mummAy",
      ),
    ).toMatchObject({ mk3: 1, mk4: 1 });
  });

  test("keeps a sub's own VLR id and team", () => {
    const page = parseFixture(
      "match-314898-sub-overview.html",
      "match-314898-sub-performance.html",
    );
    expect(page.team2VlrId).toBe("14822");
    for (const map of page.finishedMaps) {
      expect(map.players).toContainEqual(
        expect.objectContaining({
          vlrPlayerId: "3227",
          handle: "ScrewFace",
          side: 2,
        }),
      );
      expect(map.players.map((player) => player.handle)).not.toContain("Lear");
    }
  });

  test("drops the map in progress of a live match", () => {
    const page = parseFixture(
      "match-314929-live-overview.html",
      "match-314929-bo3-2-1-overtime-performance.html",
    );
    expect(page).toMatchObject({ status: "live", score1: 1, score2: 1 });
    expect(page.finishedMaps.map((map) => map.mapName)).toEqual([
      "Lotus",
      "Bind",
    ]);
  });

  test("a forfeit is final with no maps, won by the side that didn't forfeit", () => {
    const page = parseFixture(
      "match-784786-forfeit-overview.html",
      "match-784786-forfeit-performance.html",
    );
    expect(page).toMatchObject({
      team1VlrId: "18054",
      team2VlrId: "23727",
      bestOf: 3,
      status: "completed",
      forfeitWinner: 2,
      finishedMaps: [],
    });
  });
});
