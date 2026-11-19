// @vitest-environment jsdom

import type {
  MatchDetail,
  MatchesResponse,
  MatchSummary,
  SubAssignmentsBody,
} from "@shared/api";
import type { Pickable, Tournament } from "@shared/entities";
import { ZERO_STAT_LINE } from "@shared/scoring";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../../../test-utils";

const commissioner = makeUser({ id: 1, role: "commissioner" });
const member = makeUser({ id: 2, discordUsername: "amyy", displayName: "Amy" });

const tournament: Tournament = {
  id: 7,
  name: "Challengers NA",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: false,
  status: "live",
  stages: [
    {
      id: 3,
      tournamentId: 7,
      name: "Stage 1",
      position: 0,
      status: "complete",
      pickSeconds: 90,
      matchCount: 3,
      poolSize: 12,
    },
  ],
  members: [{ user: member, color: "manager-rose" }],
  teamCount: 2,
  matchesPlayed: 2,
  matchesTotal: 3,
  leaders: [],
};

const sentinels = { id: 1, name: "Sentinels", logoImageId: null };
const g2 = { id: 2, name: "G2 Esports", logoImageId: null };

function summary(
  id: number,
  scheduledAt: string,
  overrides: Partial<MatchSummary> = {},
): MatchSummary {
  return {
    id,
    stageId: 3,
    bestOf: 3,
    scheduledAt,
    status: "completed",
    scrapeStatus: "ok",
    needsAttention: false,
    mapCount: 2,
    team1: { ...sentinels, score: 2, ownerUserIds: [member.id] },
    team2: { ...g2, score: 0, ownerUserIds: [] },
    ...overrides,
  };
}

const matches: MatchesResponse = {
  syncRunning: false,
  matches: [
    summary(1, "2026-03-19T18:00:00.000Z"),
    summary(2, "2026-03-19T21:00:00.000Z", { needsAttention: true }),
    summary(3, "2026-03-21T18:00:00.000Z", {
      status: "upcoming",
      scrapeStatus: "pending",
      mapCount: 0,
    }),
  ],
};

function pickable(id: number, handle: string): Pickable {
  return {
    id,
    kind: "player",
    handle,
    teamId: sentinels.id,
    isPlaceholder: false,
    vlrUrl: null,
    photoImageId: 1,
    topAgents: [],
    formRating: null,
    formAcs: null,
    formKd: null,
    formRounds: null,
  };
}

const detail: MatchDetail = {
  id: 2,
  stageId: 3,
  bestOf: 3,
  scheduledAt: "2026-03-19T21:00:00.000Z",
  status: "completed",
  scrapeStatus: "ok",
  maps: [{ mapNo: 1, mapName: "Ascent", team1Rounds: 13, team2Rounds: 8 }],
  team1: {
    ...sentinels,
    score: 2,
    picks: [
      {
        pickable: pickable(11, "zekken"),
        ownerUserId: member.id,
        playerStatTotals: { ...ZERO_STAT_LINE, k: 21 },
        points: 105,
      },
      {
        pickable: pickable(12, "johnqt"),
        ownerUserId: null,
        playerStatTotals: ZERO_STAT_LINE,
        points: 0,
      },
    ],
    subs: [
      {
        mapNo: 1,
        vlrPlayerId: "99",
        handle: "Zellsis",
        stats: { ...ZERO_STAT_LINE, k: 17 },
        replacesPickableId: null,
        needsAssignment: true,
        missingPickableIds: [12],
      },
    ],
  },
  team2: { ...g2, score: 0, picks: [], subs: [] },
};

function stubMatchesApi(me: typeof commissioner) {
  const assignments: SubAssignmentsBody[] = [];
  const fetchMock = stubApi({
    "GET /api/me": () => ({ status: 200, body: me }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/tournaments/7/matches": () => ({ status: 200, body: matches }),
    "GET /api/matches/2": () => ({ status: 200, body: detail }),
    "POST /api/tournaments/7/sync": () => ({ status: 202 }),
    "PUT /api/matches/2/subs": (body) => {
      assignments.push(body as SubAssignmentsBody);
      return { status: 204 };
    },
  });
  return { assignments, fetchMock };
}

test("the schedule is grouped by day and selects the latest completed match", async () => {
  stubMatchesApi(member);
  renderApp("/tournaments/7/matches");

  const schedule = await screen.findByRole("region", { name: "Schedule" });
  const days = within(schedule).getAllByRole("group");
  expect(days.map((day) => within(day).getAllByRole("button").length)).toEqual([
    2, 1,
  ]);

  const rows = within(schedule).getAllByRole("button");
  expect(rows[1]).toHaveAttribute("aria-pressed", "true");
  expect(rows[2]).toBeDisabled();
  const panel = await screen.findByRole("region", { name: "Match detail" });
  expect(await within(panel).findByText("zekken")).toBeInTheDocument();
  expect(within(panel).getByText("105")).toBeInTheDocument();
});

test("members see no sync, alerts or sub selects", async () => {
  stubMatchesApi(member);
  renderApp("/tournaments/7/matches");

  await screen.findByText("Zellsis");
  expect(screen.queryByRole("button", { name: "Sync results" })).toBeNull();
  expect(screen.queryByRole("img", { name: "Assign subs" })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("the commissioner syncs and assigns a sub", async () => {
  const { assignments, fetchMock } = stubMatchesApi(commissioner);
  renderApp("/tournaments/7/matches");

  expect(
    await screen.findByRole("img", { name: "Assign subs" }),
  ).toBeInTheDocument();
  await userEvent.selectOptions(
    await screen.findByRole("combobox", { name: "Zellsis replaces" }),
    "johnqt",
  );
  await waitFor(() =>
    expect(assignments).toEqual([
      {
        assignments: [
          { mapNo: 1, subVlrPlayerId: "99", replacesPickableId: 12 },
        ],
      },
    ]),
  );

  await userEvent.click(screen.getByRole("button", { name: "Sync results" }));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/tournaments/7/sync",
    expect.objectContaining({ method: "POST" }),
  );
});
