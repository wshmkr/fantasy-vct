import { count, desc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createDb, type Db } from "./db/client.js";
import {
  matches,
  matchMaps,
  playerMapStats,
  rawPages,
  stages,
  teams,
  tournaments,
} from "./db/schema.js";
import {
  isDue,
  isSyncRunning,
  scrapeMatch,
  syncDueMatches,
  syncTournament,
} from "./sync.js";
import { createFakeVlr, FIXTURE_EVENT_URL, fixture } from "./vlr/fake-vlr.js";
import type { Downloader } from "./vlr/fetch.js";
import { importEvent, reimportTournament } from "./vlr/import.js";
import { matchOverviewUrl } from "./vlr/match.js";

const SCHEDULED_AT = "2024-03-20T20:00:00.000Z";
const minutesAfterStart = (minutes: number) =>
  new Date(Date.parse(SCHEDULED_AT) + minutes * 60_000);

describe("isDue", () => {
  const pending = {
    scheduledAt: SCHEDULED_AT,
    status: "upcoming",
    scrapeStatus: "pending",
    checkedAt: null,
  } as const;

  test("not before the scheduled time, due at it", () => {
    expect(isDue(pending, minutesAfterStart(-1))).toBe(false);
    expect(isDue(pending, minutesAfterStart(0))).toBe(true);
  });

  test("due early once VLR shows the match live", () => {
    expect(isDue({ ...pending, status: "live" }, minutesAfterStart(-30))).toBe(
      true,
    );
  });

  test("not again within 15 minutes of the last check", () => {
    const checked = {
      ...pending,
      checkedAt: minutesAfterStart(0).toISOString(),
    };
    expect(isDue(checked, minutesAfterStart(14))).toBe(false);
    expect(isDue(checked, minutesAfterStart(15))).toBe(true);
  });

  test("failed stays due for a day after kickoff, ok never is", () => {
    const failed = { ...pending, scrapeStatus: "failed" } as const;
    expect(isDue(failed, minutesAfterStart(60))).toBe(true);
    expect(isDue(failed, minutesAfterStart(23 * 60))).toBe(true);
    expect(isDue(failed, minutesAfterStart(24 * 60))).toBe(false);
    expect(
      isDue({ ...pending, scrapeStatus: "ok" }, minutesAfterStart(60)),
    ).toBe(false);
  });
});

describe("scraping matches", () => {
  const now = () => minutesAfterStart(120);
  let db: Db;
  let fakeVlr: ReturnType<typeof createFakeVlr>;
  let teamIdByVlrId: Map<string, number>;
  let tournamentId: number;

  const insertMatch = (
    vlrId: string,
    values: Partial<typeof matches.$inferInsert> = {},
  ) =>
    db
      .insert(matches)
      .values({
        tournamentId,
        vlrId,
        stageKey: "3696",
        bestOf: 5,
        scheduledAt: SCHEDULED_AT,
        status: "completed",
        ...values,
      })
      .returning()
      .get();
  const matchRow = (id: number) =>
    db.select().from(matches).where(eq(matches.id, id)).get();
  const countOf = (
    table: typeof matchMaps | typeof playerMapStats,
    matchId: number,
  ) =>
    db
      .select({ rows: count() })
      .from(table)
      .where(eq(table.matchId, matchId))
      .get()?.rows;
  const withOverview =
    (vlrId: string, html: string): Downloader =>
    (url) =>
      url === matchOverviewUrl(vlrId)
        ? Promise.resolve({
            contentType: "text/html",
            bytes: Buffer.from(html),
          })
        : fakeVlr.download(url);

  beforeEach(() => {
    db = createDb(":memory:");
    fakeVlr = createFakeVlr();
    tournamentId = db
      .insert(tournaments)
      .values({
        name: "Split 1",
        vlrEventUrl: "https://www.vlr.gg/event/1971",
        vlrEventId: "1971",
      })
      .returning()
      .get().id;
    teamIdByVlrId = new Map(
      ["11001", "106", "15011", "14822", "5038"].map((vlrId) => [
        vlrId,
        db.insert(teams).values({ vlrId, name: vlrId }).returning().get().id,
      ]),
    );
  });

  test("a completed match saves every map, corrects best-of and teams, and turns ok", async () => {
    const match = insertMatch("314896");

    await scrapeMatch(match.id, { db, download: fakeVlr.download, now });

    expect(matchRow(match.id)).toMatchObject({
      bestOf: 3,
      team1Id: teamIdByVlrId.get("11001"),
      team2Id: teamIdByVlrId.get("106"),
      score1: 2,
      score2: 0,
      scrapeStatus: "ok",
      scrapeError: null,
      scrapedAt: now().toISOString(),
      checkedAt: now().toISOString(),
    });
    expect(
      db
        .select()
        .from(rawPages)
        .where(eq(rawPages.url, matchOverviewUrl("314896")))
        .get(),
    ).toBeDefined();
    expect(
      db.select().from(matchMaps).where(eq(matchMaps.matchId, match.id)).all(),
    ).toEqual([
      {
        matchId: match.id,
        mapNo: 1,
        mapName: "Lotus",
        team1Rounds: 13,
        team2Rounds: 11,
      },
      {
        matchId: match.id,
        mapNo: 2,
        mapName: "Icebox",
        team1Rounds: 13,
        team2Rounds: 6,
      },
    ]);
    expect(
      db
        .select()
        .from(playerMapStats)
        .where(eq(playerMapStats.vlrPlayerId, "849"))
        .all(),
    ).toContainEqual({
      matchId: match.id,
      mapNo: 1,
      vlrPlayerId: "849",
      handle: "POISED",
      teamId: teamIdByVlrId.get("106"),
      k: 27,
      d: 14,
      a: 2,
      fk: 4,
      fd: 1,
      mk3: 4,
      mk4: 0,
      aces: 0,
      clutches: 2,
    });
  });

  test("a corrupted page saves only failed and the error, keeping earlier rows", async () => {
    const match = insertMatch("314896");
    await scrapeMatch(match.id, { db, download: fakeVlr.download, now });
    db.update(matches)
      .set({ scrapeStatus: "pending" })
      .where(eq(matches.id, match.id))
      .run();
    const before = matchRow(match.id);
    const negativeKills = fixture("match-314896-bo3-2-0-overview.html").replace(
      'data-col="kills"><span class="side mod-both">25<',
      'data-col="kills"><span class="side mod-both">-25<',
    );
    const later = () => minutesAfterStart(180);

    await scrapeMatch(match.id, {
      db,
      download: withOverview("314896", negativeKills),
      now: later,
    });

    expect(matchRow(match.id)).toEqual({
      ...before,
      scrapeStatus: "failed",
      scrapeError: "Not a count: -25",
      checkedAt: later().toISOString(),
    });
    expect(countOf(matchMaps, match.id)).toBe(2);
    expect(countOf(playerMapStats, match.id)).toBe(20);
  });

  test("a live match saves only its finished maps and stays pending", async () => {
    const match = insertMatch("314929", { status: "live" });

    await scrapeMatch(match.id, {
      db,
      download: withOverview(
        "314929",
        fixture("match-314929-live-overview.html"),
      ),
      now,
    });

    expect(matchRow(match.id)).toMatchObject({
      status: "live",
      score1: 1,
      score2: 1,
      scrapeStatus: "pending",
      scrapedAt: now().toISOString(),
    });
    expect(countOf(matchMaps, match.id)).toBe(2);
    expect(countOf(playerMapStats, match.id)).toBe(20);
  });

  test("a sync run scrapes due matches, never ok ones, and is idempotent", async () => {
    const twoNil = insertMatch("314896");
    const overtime = insertMatch("314929");
    const withSub = insertMatch("314898");
    const alreadyOk = insertMatch("1", { scrapeStatus: "ok" });
    const options = { db, download: fakeVlr.download, now };

    await syncDueMatches(options);

    for (const match of [twoNil, overtime, withSub]) {
      expect(matchRow(match.id)?.scrapeStatus).toBe("ok");
    }
    expect(countOf(matchMaps, overtime.id)).toBe(3);
    expect(matchRow(alreadyOk.id)).toEqual(alreadyOk);
    expect(fakeVlr.downloadedUrls).not.toContain(matchOverviewUrl("1"));

    const rowsAfterFirstRun = db.select().from(playerMapStats).all();
    fakeVlr.downloadedUrls.length = 0;
    await syncDueMatches(options);
    expect(fakeVlr.downloadedUrls).toEqual([]);

    db.update(matches).set({ scrapeStatus: "pending", checkedAt: null }).run();
    db.update(matches)
      .set({ scrapeStatus: "ok" })
      .where(eq(matches.id, alreadyOk.id))
      .run();
    await syncDueMatches(options);
    expect(db.select().from(playerMapStats).all()).toEqual(rowsAfterFirstRun);
  });

  test("a failed schedule refresh still scrapes the tournament's due matches", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const due = insertMatch("314896");
    insertMatch("2", { status: "upcoming", scheduledAt: null });

    await syncDueMatches({ db, download: fakeVlr.download, now });

    expect(consoleError).toHaveBeenCalled();
    expect(matchRow(due.id)?.scrapeStatus).toBe("ok");
    consoleError.mockRestore();
  });

  test("two overlapping runs don't both scrape", async () => {
    insertMatch("314896");
    const options = { db, download: fakeVlr.download, now };

    const firstRun = syncDueMatches(options);
    expect(isSyncRunning()).toBe(true);
    await Promise.all([firstRun, syncDueMatches(options)]);

    expect(isSyncRunning()).toBe(false);
    expect(fakeVlr.downloadedUrls).toHaveLength(2);
  });
});

describe("syncTournament", () => {
  test("refreshes the schedule, then scrapes every started match that isn't ok", async () => {
    const db = createDb(":memory:");
    const fakeVlr = createFakeVlr();
    const tournamentId = await importEvent(FIXTURE_EVENT_URL, {
      db,
      download: fakeVlr.download,
    });
    const scraped = db
      .select()
      .from(matches)
      .where(eq(matches.status, "completed"))
      .get();
    if (!scraped) throw new Error("no completed match");
    db.update(matches)
      .set({
        scrapeStatus: "ok",
        scrapedAt: "2026-11-01T00:00:00.000Z",
        bestOf: 5,
        team1Id: null,
      })
      .where(eq(matches.id, scraped.id))
      .run();
    fakeVlr.downloadedUrls.length = 0;
    const now = new Date("2026-11-19T00:00:00.000Z");

    await syncTournament(tournamentId, {
      db,
      download: fakeVlr.download,
      now: () => now,
    });

    expect(fakeVlr.downloadedUrls[0]).toContain("/event/matches/3124/");
    expect(
      db.select().from(matches).where(eq(matches.id, scraped.id)).get(),
    ).toMatchObject({ bestOf: 5, team1Id: null, checkedAt: null });
    const others = db
      .select()
      .from(matches)
      .all()
      .filter((match) => match.id !== scraped.id);
    const startedOnVlr = others.filter((match) => match.status !== "upcoming");
    const notYetScheduled = others.filter(
      (match) =>
        match.status === "upcoming" &&
        (match.scheduledAt === null ||
          Date.parse(match.scheduledAt) > now.getTime()),
    );
    expect(startedOnVlr.length).toBeGreaterThan(0);
    expect(notYetScheduled.length).toBeGreaterThan(0);
    expect(startedOnVlr.every((match) => match.scrapeStatus === "failed")).toBe(
      true,
    );
    expect(notYetScheduled.every((match) => match.checkedAt === null)).toBe(
      true,
    );
  });

  test("a stage VLR adds later is created by the sync, and a re-import keeps it", async () => {
    const db = createDb(":memory:");
    const fakeVlr = createFakeVlr();
    const tournamentId = await importEvent(FIXTURE_EVENT_URL, {
      db,
      download: fakeVlr.download,
    });
    const newest = db
      .select()
      .from(stages)
      .orderBy(desc(stages.position))
      .get();
    if (!newest) throw new Error("no stage");
    db.delete(matches)
      .where(inArray(matches.stageKey, newest.vlrStageKeysJson))
      .run();
    db.delete(stages).where(eq(stages.id, newest.id)).run();
    const options = {
      db,
      download: fakeVlr.download,
      now: () => new Date("2020-01-01T00:00:00.000Z"),
    };

    await syncTournament(tournamentId, options);
    await reimportTournament(tournamentId, options);

    expect(
      db
        .select({ keys: stages.vlrStageKeysJson })
        .from(stages)
        .where(eq(stages.name, newest.name))
        .all(),
    ).toEqual([{ keys: newest.vlrStageKeysJson }]);
  });
});
