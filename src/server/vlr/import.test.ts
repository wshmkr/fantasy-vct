import { and, count, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, test } from "vitest";
import { createDb, type Db } from "../db/client.js";
import {
  images,
  matches,
  pickables,
  stagePool,
  stages,
  teams,
  tournamentTeams,
} from "../db/schema.js";
import { createFakeVlr, FIXTURE_EVENT_URL } from "./fake-vlr.js";
import { DEFAULT_PLAYER_PICTURE_URL } from "./images.js";
import { importEvent, reimportTournament } from "./import.js";

const EVENT_URL = FIXTURE_EVENT_URL;
const PICKABLE_COUNT = 91 + 16;

let fakeVlr: ReturnType<typeof createFakeVlr>["download"];
let downloadedUrls: string[];

function countRows(db: Db, table: SQLiteTable, where?: SQL) {
  return db.select({ rows: count() }).from(table).where(where).get()?.rows;
}

function rowCounts(db: Db) {
  return {
    teams: countRows(db, teams),
    tournamentTeams: countRows(db, tournamentTeams),
    pickables: countRows(db, pickables),
    images: countRows(db, images),
    stages: countRows(db, stages),
    stagePool: countRows(db, stagePool),
    matches: countRows(db, matches),
  };
}

describe("importEvent", () => {
  let db: Db;
  let tournamentId: number;

  beforeEach(async () => {
    db = createDb(":memory:");
    ({ download: fakeVlr, downloadedUrls } = createFakeVlr());
    tournamentId = await importEvent(EVENT_URL, { db, download: fakeVlr });
  });

  test("saves teams, rosters, the schedule and one stage per VLR stage", () => {
    expect(rowCounts(db)).toMatchObject({
      teams: 16,
      tournamentTeams: 16,
      pickables: PICKABLE_COUNT,
      stages: 2,
      matches: 70,
    });
    expect(
      db
        .select({ name: stages.name, position: stages.position })
        .from(stages)
        .orderBy(stages.position)
        .all(),
    ).toEqual([
      { name: "Group Stage", position: 0 },
      { name: "Playoffs", position: 1 },
    ]);
    const tbdMatches = db
      .select()
      .from(matches)
      .where(eq(matches.stageKey, "6021"))
      .all();
    expect(tbdMatches).toHaveLength(14);
    expect(tbdMatches.every((match) => match.team1Id === null)).toBe(true);
  });

  test("rosters are the players registered on the event page", () => {
    const team = db.select().from(teams).where(eq(teams.vlrId, "21243")).get();
    const handles = db
      .select({ handle: pickables.handle })
      .from(pickables)
      .where(
        and(eq(pickables.teamId, team?.id ?? 0), eq(pickables.kind, "player")),
      )
      .all()
      .map((player) => player.handle);
    expect(handles.sort()).toEqual(
      ["fate", "gurbby", "Demonn", "Paco", "Benni Benzon"].sort(),
    );
  });

  test("falls back to the team page when the event page lists no players", async () => {
    const withoutRegisteredPlayers = async (url: string) => {
      const download = await fakeVlr(url);
      if (url !== EVENT_URL) return download;
      const html = download.bytes
        .toString()
        .replaceAll(
          /<a href="\/player\/[^"]*"[^>]*event-team-players-item[^>]*>/g,
          "<a>",
        );
      return { ...download, bytes: Buffer.from(html) };
    };
    const freshDb = createDb(":memory:");
    await importEvent(EVENT_URL, {
      db: freshDb,
      download: withoutRegisteredPlayers,
    });
    expect(countRows(freshDb, pickables, eq(pickables.kind, "player"))).toBe(
      10,
    );
  });

  test("stores a player's photo, top agents and form", () => {
    const player = db
      .select()
      .from(pickables)
      .where(eq(pickables.vlrId, "31377"))
      .get();
    expect(player).toMatchObject({
      kind: "player",
      handle: "allthewayPat",
      vlrUrl: "https://www.vlr.gg/player/31377/allthewaypat",
      formRating: 0.83,
      formAcs: 133.4,
      formKd: 0.73,
      formRounds: 147,
    });
    expect(player?.topAgentsJson.map((agent) => agent.name)).toEqual([
      "Harbor",
      "Brimstone",
      "Omen",
    ]);
  });

  test("gives a coachless team one placeholder coach with the default picture", () => {
    const team = db.select().from(teams).where(eq(teams.vlrId, "23401")).get();
    const coaches = db
      .select()
      .from(pickables)
      .where(
        and(eq(pickables.teamId, team?.id ?? 0), eq(pickables.kind, "coach")),
      )
      .all();
    const defaultPicture = db
      .select()
      .from(images)
      .where(eq(images.sourceUrl, DEFAULT_PLAYER_PICTURE_URL))
      .get();
    expect(coaches).toEqual([
      expect.objectContaining({
        handle: "Backed by Nobody Coach",
        isPlaceholder: true,
        vlrId: null,
        vlrUrl: null,
        photoImageId: defaultPicture?.id,
      }),
    ]);
  });

  test("keeps the real head coach, with a photo only", () => {
    const coach = db
      .select()
      .from(pickables)
      .where(eq(pickables.vlrId, "57984"))
      .get();
    expect(coach).toMatchObject({
      kind: "coach",
      handle: "Lecadi",
      isPlaceholder: false,
      topAgentsJson: [],
      formRating: null,
    });
  });

  test("downloads the default picture once and shares it", () => {
    const defaultPictureDownloads = downloadedUrls.filter(
      (url) => url === DEFAULT_PLAYER_PICTURE_URL,
    );
    expect(defaultPictureDownloads).toHaveLength(1);
    const ochman = db
      .select()
      .from(pickables)
      .where(eq(pickables.vlrId, "39702"))
      .get();
    const placeholder = db
      .select()
      .from(pickables)
      .where(eq(pickables.handle, "Backed by Nobody Coach"))
      .get();
    expect(ochman?.photoImageId).toBe(placeholder?.photoImageId);
  });

  test("seeds each stage's pool with the rosters of its teams", () => {
    const poolSizes = db
      .select({ stageId: stagePool.stageId })
      .from(stagePool)
      .all()
      .reduce(
        (sizes, row) =>
          sizes.set(row.stageId, (sizes.get(row.stageId) ?? 0) + 1),
        new Map<number, number>(),
      );
    expect([...poolSizes.values()]).toEqual([PICKABLE_COUNT, PICKABLE_COUNT]);
  });

  test("importing again is idempotent and uses the cache", async () => {
    const before = rowCounts(db);
    downloadedUrls.length = 0;

    expect(await importEvent(EVENT_URL, { db, download: fakeVlr })).toBe(
      tournamentId,
    );

    expect(rowCounts(db)).toEqual(before);
    expect(downloadedUrls).toEqual([]);
  });

  test("re-import refetches pages and changes nothing that didn't change", async () => {
    const before = rowCounts(db);
    downloadedUrls.length = 0;

    await reimportTournament(tournamentId, { db, download: fakeVlr });

    expect(rowCounts(db)).toEqual(before);
    expect(downloadedUrls).toContain(EVENT_URL);
  });

  test("a stage the commissioner deleted stays deleted on re-import", async () => {
    const [groupStage] = db
      .select()
      .from(stages)
      .orderBy(stages.position)
      .all();
    if (!groupStage) throw new Error("stages missing");
    db.delete(stages).where(eq(stages.id, groupStage.id)).run();

    await reimportTournament(tournamentId, { db, download: fakeVlr });

    expect(db.select({ name: stages.name }).from(stages).all()).toEqual([
      { name: "Playoffs" },
    ]);
  });

  test("re-import leaves started stages and removed pool picks alone", async () => {
    const [groupStage, playoffs] = db
      .select()
      .from(stages)
      .orderBy(stages.position)
      .all();
    if (!groupStage || !playoffs) throw new Error("stages missing");
    db.update(stages)
      .set({ status: "drafting" })
      .where(eq(stages.id, groupStage.id))
      .run();
    db.delete(stagePool).where(eq(stagePool.stageId, groupStage.id)).run();
    db.update(stagePool)
      .set({ removed: true })
      .where(eq(stagePool.stageId, playoffs.id))
      .run();

    await reimportTournament(tournamentId, {
      db,
      download: fakeVlr,
      refresh: true,
    });

    expect(countRows(db, stagePool, eq(stagePool.stageId, groupStage.id))).toBe(
      0,
    );
    expect(
      countRows(
        db,
        stagePool,
        and(eq(stagePool.stageId, playoffs.id), eq(stagePool.removed, true)),
      ),
    ).toBe(PICKABLE_COUNT);
  });
});
