import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseMatchesPage } from "./matches.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseMatchesPage", () => {
  const schedule = parseMatchesPage(fixture("matches-3124.html"));
  const matchById = (vlrId: string) =>
    schedule.matches.find((match) => match.vlrId === vlrId);

  test("lists the stages in the order they're played, keyed by series id", () => {
    expect(schedule.stages).toEqual([
      { key: "6020", name: "Group Stage" },
      { key: "6021", name: "Playoffs" },
    ]);
  });

  test("includes every match, upcoming and TBD ones too", () => {
    expect(schedule.matches).toHaveLength(70);
    const statuses = schedule.matches.map((match) => match.status);
    const countOf = (status: string) =>
      statuses.filter((matchStatus) => matchStatus === status).length;
    expect(countOf("completed")).toBe(34);
    expect(countOf("live")).toBe(1);
    expect(countOf("upcoming")).toBe(35);
  });

  test("reads a completed match", () => {
    expect(matchById("772807")).toEqual({
      vlrId: "772807",
      stageKey: "6020",
      team1Name: "Backed by Nobody",
      team2Name: "Enisorail",
      bestOf: 3,
      scheduledAt: "2026-10-19T16:00:00.000Z",
      status: "completed",
      score1: 1,
      score2: 2,
    });
  });

  test("reads an upcoming match after the switch to standard time", () => {
    expect(matchById("772844")).toMatchObject({
      team1Name: "BERG",
      team2Name: "Glacial Guardians",
      scheduledAt: "2026-11-17T18:00:00.000Z",
      status: "upcoming",
      score1: null,
      score2: null,
    });
  });

  test("a match without a time yet has no scheduled time", () => {
    expect(matchById("772829")).toMatchObject({
      team1Name: "Team International",
      scheduledAt: null,
      status: "upcoming",
    });
  });

  test("playoff matches with undecided teams have null teams", () => {
    const playoffs = schedule.matches.filter(
      (match) => match.stageKey === "6021",
    );
    expect(playoffs).toHaveLength(14);
    expect(playoffs[0]).toMatchObject({
      team1Name: null,
      team2Name: null,
      bestOf: 3,
      status: "upcoming",
    });
  });
});
