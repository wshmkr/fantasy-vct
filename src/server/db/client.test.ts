import { describe, expect, test } from "vitest";
import { createDb } from "./client.js";
import { images, pickables, teams } from "./schema.js";

describe("createDb", () => {
  test("migrates a fresh database with foreign keys on", () => {
    const db = createDb(":memory:");
    const tableNames = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all();
    expect(tableNames).toEqual(
      expect.arrayContaining(["users", "stages", "roster_entries", "matches"]),
    );
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  test("round-trips JSON and boolean columns", () => {
    const db = createDb(":memory:");
    const image = db
      .insert(images)
      .values({
        sourceUrl: "https://example.test/default.png",
        contentType: "image/png",
        bytes: Buffer.from([1]),
      })
      .returning()
      .get();
    const team = db
      .insert(teams)
      .values({ vlrId: "2", name: "Sentinels" })
      .returning()
      .get();
    const coach = db
      .insert(pickables)
      .values({
        kind: "coach",
        handle: "Sentinels Coach",
        teamId: team.id,
        isPlaceholder: true,
        photoImageId: image.id,
      })
      .returning()
      .get();

    expect(coach.isPlaceholder).toBe(true);
    expect(coach.topAgentsJson).toEqual([]);
    expect(image.fetchedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });
});
