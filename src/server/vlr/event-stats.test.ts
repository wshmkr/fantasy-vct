import { describe, expect, test } from "vitest";
import { eventStatsUrl, parseEventStatsPage } from "./event-stats.js";
import { fixture } from "./fake-vlr.js";

describe("event stats page", () => {
  test("reads each player's rating, ACS, KAST and ADR by VLR id", () => {
    const stats = parseEventStatsPage(fixture("event-stats-2760.html"));

    expect(stats.size).toBe(60);
    expect(stats.get("10307")).toEqual({
      rating: 1.41,
      acs: 268,
      kast: 76,
      adr: 169.1,
    });
  });

  test("filters by every stage key", () => {
    expect(eventStatsUrl("2760", ["5359", "5546"])).toBe(
      "https://www.vlr.gg/event/stats/2760?stage%5B%5D=5359&stage%5B%5D=5546",
    );
  });
});
