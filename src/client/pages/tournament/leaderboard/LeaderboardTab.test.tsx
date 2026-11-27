// @vitest-environment jsdom

import type { LeaderboardResponse, LeaderboardRow } from "@shared/api";
import type { Tournament } from "@shared/entities";
import { scoringConfigWith, ZERO_STAT_LINE } from "@shared/scoring";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../../../test-utils";

const owner = makeUser({ id: 3, displayName: "Jamie" });

const tournament: Tournament = {
  id: 7,
  name: "Champions",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: false,
  discordChannelId: null,
  status: "live",
  stages: [],
  members: [{ user: owner, color: "manager-red" }],
  leaders: [],
  teamCount: 2,
  matchesPlayed: 1,
  matchesTotal: 2,
};

function makeRow(
  id: number,
  handle: string,
  overrides: Partial<LeaderboardRow> = {},
): LeaderboardRow {
  return {
    pickable: {
      id,
      kind: "player",
      handle,
      teamId: 2,
      isPlaceholder: false,
      vlrUrl: null,
      photoImageId: 1,
      topAgents: [],
      formRating: null,
      formAcs: null,
      formKd: null,
      formRounds: null,
    },
    team: { id: 2, name: "Sentinels", logoImageId: null },
    ownerUserIds: [],
    maps: 2,
    rounds: 43,
    points: 120,
    bestMatchPoints: 70,
    bonus: 15,
    stats: { ...ZERO_STAT_LINE, k: 45, d: 29 },
    rating: 1.24,
    acs: 262,
    kast: 79,
    adr: 176,
    subHandles: [],
    roundsWon: 0,
    unplayedBonus: 0,
    ...overrides,
  };
}

const leaderboard: LeaderboardResponse = {
  scoring: scoringConfigWith({}),
  scopes: [
    {
      stageId: null,
      rows: [
        makeRow(1, "zekken", {
          ownerUserIds: [owner.id],
          subHandles: ["Zellsis"],
        }),
        makeRow(2, "johnqt", { points: 90 }),
        makeRow(3, "Kaplan", {
          pickable: { ...makeRow(3, "Kaplan").pickable, kind: "coach" },
          roundsWon: 26,
          unplayedBonus: 30,
          bonus: 0,
          points: 82,
        }),
      ],
    },
  ],
};

const rowHandles = () =>
  screen.getAllByRole("row").map((row) => row.getAttribute("aria-label"));

test("ranks players by PTS, filters by manager and switches to coach columns", async () => {
  stubApi({
    "GET /api/me": () => ({ status: 200, body: makeUser() }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/tournaments/7/leaderboard": () => ({
      status: 200,
      body: leaderboard,
    }),
  });
  renderApp("/tournaments/7/leaderboard");

  expect(await screen.findByRole("row", { name: "zekken" })).toBeDefined();
  expect(rowHandles()).toEqual(["zekken", "johnqt"]);
  const zekken = screen.getByRole("row", { name: "zekken" });
  expect(within(zekken).getByText("1.55")).toBeDefined();
  expect(within(zekken).getByText("79%")).toBeDefined();
  expect(
    within(zekken).getByRole("img", { name: "Subs: Zellsis" }),
  ).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Jamie" }));
  expect(rowHandles()).toEqual(["zekken"]);
  await userEvent.click(screen.getByRole("button", { name: "Undrafted" }));
  expect(rowHandles()).toEqual(["zekken", "johnqt"]);

  await userEvent.click(screen.getByRole("button", { name: "ACS" }));
  await userEvent.click(screen.getByRole("tab", { name: "Coaches" }));
  expect(screen.getByRole("button", { name: "UNPLAYED BONUS" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "ACS" })).toBeNull();
});
