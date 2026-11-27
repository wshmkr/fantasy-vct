import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { matches, playerMapStats, teams, tournaments } from "../db/schema.js";
import { scrapeMatch } from "../sync.js";
import { backfillMapAverages } from "./backfill-map-averages.js";
import { createFakeVlr } from "./fake-vlr.js";

const now = () => new Date("2024-03-20T22:00:00.000Z");

describe("backfillMapAverages", () => {
  let db: Db;
  let tournamentId: number;

  const insertMatch = (vlrId: string) =>
    db
      .insert(matches)
      .values({
        tournamentId,
        vlrId,
        stageKey: "3696",
        bestOf: 3,
        scheduledAt: "2024-03-20T20:00:00.000Z",
        status: "completed",
      })
      .returning()
      .get();
  const poisedOnMap1 = (matchId: number) =>
    db
      .select()
      .from(playerMapStats)
      .where(eq(playerMapStats.matchId, matchId))
      .all()
      .find((row) => row.mapNo === 1 && row.vlrPlayerId === "849");

  beforeEach(() => {
    db = createDb(":memory:");
    tournamentId = db
      .insert(tournaments)
      .values({ name: "Split 1", vlrEventUrl: "x", vlrEventId: "1971" })
      .returning()
      .get().id;
    for (const vlrId of ["11001", "106"]) {
      db.insert(teams).values({ vlrId, name: vlrId }).run();
    }
  });

  test("fills the averages from saved pages, changing nothing else", async () => {
    const match = insertMatch("314896");
    await scrapeMatch(match.id, {
      db,
      download: createFakeVlr().download,
      now,
    });
    db.update(playerMapStats)
      .set({ rating: null, acs: null, kast: null, adr: null })
      .run();
    const before = poisedOnMap1(match.id);

    const result = backfillMapAverages(db);

    expect(result).toEqual({ filledRows: 20, skippedMatchIds: [] });
    expect(poisedOnMap1(match.id)).toEqual({
      ...before,
      rating: 1.63,
      acs: 288,
      kast: 83,
      adr: 191,
    });
    expect(backfillMapAverages(db).filledRows).toBe(20);
    expect(poisedOnMap1(match.id)).toMatchObject({ acs: 288 });
  });

  test("skips a match whose pages aren't saved", () => {
    const match = insertMatch("999999");
    const teamId = db.select().from(teams).get()?.id ?? 0;
    db.insert(playerMapStats)
      .values({
        matchId: match.id,
        mapNo: 1,
        vlrPlayerId: "849",
        handle: "POISED",
        teamId,
        k: 1,
        d: 1,
        a: 1,
        fk: 0,
        fd: 0,
        mk3: 0,
        mk4: 0,
        aces: 0,
        clutches: 0,
      })
      .run();

    expect(backfillMapAverages(db)).toEqual({
      filledRows: 0,
      skippedMatchIds: [match.id],
    });
    expect(poisedOnMap1(match.id)).toMatchObject({ acs: null, k: 1 });
  });
});
