// @vitest-environment jsdom

import type { DraftState, PoolPickable, Tournament } from "@shared/entities";
import { screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { makeUser, renderApp, stubApi } from "../../test-utils";

const me = makeUser({ id: 1 });
const rival = makeUser({ id: 2, discordUsername: "amyy", displayName: "Amy" });

const stage = {
  tournamentId: 7,
  status: "complete" as const,
  pickSeconds: 90,
  matchCount: 24,
  poolSize: 8,
};
const tournament: Tournament = {
  id: 7,
  name: "Challengers NA",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: false,
  status: "live",
  stages: [
    { ...stage, id: 3, name: "Stage 1", position: 0 },
    { ...stage, id: 4, name: "Playoffs", position: 1, status: "setup" },
  ],
  members: [],
  teamCount: 1,
  matchesPlayed: 0,
  matchesTotal: 24,
};

const roster: PoolPickable[] = [21, 22, 23, 24, 25, 26].map((id) => ({
  id,
  kind: id === 26 ? "coach" : "player",
  handle: `p${id}`,
  teamId: 1,
  isPlaceholder: false,
  vlrUrl: null,
  photoImageId: 1,
  topAgents: [],
  formRating: null,
  formAcs: null,
  formKd: null,
  formRounds: null,
  points: null,
  ownerUserId: me.id,
}));

const draft: DraftState = {
  stageId: 3,
  status: "complete",
  phase: "swap",
  round: 6,
  turnNo: 60,
  pickSeconds: 90,
  seats: [
    {
      seat: 0,
      user: me,
      color: "manager-blue",
      locked: true,
      rosterPickableIds: roster.map((p) => p.id),
    },
    {
      seat: 1,
      user: rival,
      color: "manager-rose",
      locked: false,
      rosterPickableIds: [],
    },
  ],
  pool: roster,
  teams: [{ id: 1, name: "Sentinels", logoImageId: null }],
  currentSeat: null,
  turnDeadline: null,
  serverNow: "2026-01-01T00:00:00.000Z",
  recentActions: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});

test("each manager's card shows their roster in seat order, locked ones marked", async () => {
  stubApi({
    "GET /api/me": () => ({ status: 200, body: me }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/stages/3/draft": () => ({ status: 200, body: draft }),
  });
  renderApp("/tournaments/7/rosters");

  const myCard = await screen.findByRole("region", { name: "Stephen" });
  const rivalCard = screen.getByRole("region", { name: "Amy" });

  expect(
    screen
      .getAllByRole("region")
      .map((card) => card.getAttribute("aria-label")),
  ).toEqual(["Stephen", "Amy"]);
  for (const pickable of roster) {
    expect(within(myCard).getByText(pickable.handle)).toBeInTheDocument();
  }
  expect(within(myCard).getByRole("img", { name: "Locked" })).toBeTruthy();
  expect(within(rivalCard).queryByRole("img", { name: "Locked" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Stage 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
