import type { MatchesResponse, MatchSummary } from "@shared/api";
import { expect, test } from "vitest";
import { liveRefetchInterval } from "./matches";

const now = Date.parse("2026-03-19T17:50:00.000Z");
const minutes = (count: number) => count * 60_000;

function matchesWith(...overrides: Partial<MatchSummary>[]): MatchesResponse {
  return {
    syncRunning: false,
    matches: overrides.map((override, index) => ({
      id: index + 1,
      stageId: 3,
      bestOf: 3,
      scheduledAt: new Date(now + minutes(10)).toISOString(),
      status: "upcoming",
      scrapeStatus: "pending",
      forfeitWinner: null,
      needsAttention: false,
      mapCount: 0,
      team1: null,
      team2: null,
      ...override,
    })),
  };
}

test("live or due matches poll every minute", () => {
  expect(liveRefetchInterval(matchesWith({ status: "live" }), now)).toBe(
    minutes(1),
  );
  const due = { scheduledAt: new Date(now - minutes(5)).toISOString() };
  expect(liveRefetchInterval(matchesWith(due), now)).toBe(minutes(1));
});

test("before kickoff, waits for the soonest match, clamped to 1 min–1 h", () => {
  expect(liveRefetchInterval(matchesWith({}), now)).toBe(minutes(10));
  const soon = { scheduledAt: new Date(now + 5_000).toISOString() };
  expect(liveRefetchInterval(matchesWith(soon), now)).toBe(minutes(1));
  const later = { scheduledAt: new Date(now + minutes(300)).toISOString() };
  expect(liveRefetchInterval(matchesWith(later), now)).toBe(minutes(60));
});

test("stops polling once every match is scraped or unscheduled", () => {
  expect(
    liveRefetchInterval(
      matchesWith(
        { status: "completed", scrapeStatus: "ok" },
        { scheduledAt: null },
      ),
      now,
    ),
  ).toBe(false);
  expect(liveRefetchInterval(undefined, now)).toBe(false);
});

test("a match still unscraped a day after kickoff stops the polling", () => {
  const stuck = {
    status: "completed",
    scrapeStatus: "failed",
    scheduledAt: new Date(now - minutes(24 * 60)).toISOString(),
  } as const;
  expect(liveRefetchInterval(matchesWith(stuck), now)).toBe(false);
});
