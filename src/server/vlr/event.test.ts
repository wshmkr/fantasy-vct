import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  eventEndDate,
  parseEventPage,
  parseEventTeams,
  vlrEventIdFromUrl,
} from "./event.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseEventPage", () => {
  const event = parseEventPage(fixture("event-3124.html"));

  test("reads the name, logo and the all-stages matches link", () => {
    expect(event.name).toBe("Spike Series 2026: Convergence EMEA - DACH");
    expect(event.logoUrl).toBe("https://owcdn.net/img/6addd595dc0f2.png");
    expect(event.matchesUrl).toBe(
      "https://www.vlr.gg/event/matches/3124/spike-series-2026-convergence-emea-dach/?series_id=all",
    );
  });

  test("reads the end date from the header", () => {
    expect(event.endsOn).toBe("2026-12-18");
  });

  test("lists the teams of the shown stage with ids, links and logos", () => {
    expect(event.teams).toHaveLength(16);
    expect(event.teams[0]).toMatchObject({
      vlrId: "21243",
      name: "FRG",
      vlrUrl: "https://www.vlr.gg/team/21243/frg",
      logoUrl: "https://owcdn.net/img/68c8779494594.png",
    });
    expect(event.teams.find((team) => team.vlrId === "20489")?.logoUrl).toBe(
      "https://www.vlr.gg/img/vlr/tmp/vlr.png",
    );
  });

  test("reads each team's registered players", () => {
    const frg = event.teams[0];
    expect(frg?.registeredPlayers).toHaveLength(5);
    expect(frg?.registeredPlayers[4]).toEqual({
      vlrId: "65601",
      handle: "Benni Benzon",
      vlrUrl: "https://www.vlr.gg/player/65601/benni-benzon",
    });
  });

  test("links the other stage tabs", () => {
    expect(event.otherStagePageUrls).toEqual([
      "https://www.vlr.gg/event/3124/spike-series-2026-convergence-emea-dach/playoffs",
    ]);
  });
});

test("a stage tab whose teams are still TBD lists no teams", () => {
  expect(parseEventTeams(fixture("event-3124-playoffs.html"))).toEqual([]);
});

test("vlrEventIdFromUrl reads the id from an event link", () => {
  expect(
    vlrEventIdFromUrl(
      "https://www.vlr.gg/event/3124/spike-series-2026-convergence-emea-dach",
    ),
  ).toBe("3124");
  expect(() => vlrEventIdFromUrl("https://www.vlr.gg/team/2")).toThrow();
});

test("eventEndDate reads the last day of VLR's date ranges", () => {
  expect(eventEndDate("Nov 20 – Dec 6, 2026")).toBe("2026-12-06");
  expect(eventEndDate("Dec 1–6, 2026")).toBe("2026-12-06");
  expect(eventEndDate("Dec 28, 2026 – Jan 5, 2027")).toBe("2027-01-05");
  expect(eventEndDate("TBD")).toBeNull();
});
