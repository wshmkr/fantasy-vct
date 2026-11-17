// @vitest-environment jsdom

import type { Pickable, StagePoolTeam, Tournament } from "@shared/entities";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../../test-utils";

const tournament: Tournament = {
  id: 7,
  name: "Challengers NA",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: true,
  status: "upcoming",
  stages: [
    {
      id: 3,
      tournamentId: 7,
      name: "Stage 1",
      position: 0,
      status: "setup",
      pickSeconds: 90,
      matchCount: 24,
      poolSize: 1,
    },
  ],
  members: [],
  teamCount: 1,
  matchesPlayed: 0,
  matchesTotal: 24,
};

const zekken: Pickable = {
  id: 11,
  kind: "player",
  handle: "zekken",
  teamId: 2,
  isPlaceholder: false,
  vlrUrl: "https://www.vlr.gg/player/1/zekken",
  photoImageId: 1,
  topAgents: [],
  formRating: null,
  formAcs: null,
  formKd: null,
  formRounds: null,
};

const pool: StagePoolTeam[] = [
  {
    id: 2,
    name: "Sentinels",
    logoImageId: null,
    pool: [{ ...zekken, removed: false }],
  },
];

test("clicking a pool chip removes it", async () => {
  let toggleBody: unknown;
  stubApi({
    "GET /api/me": () => ({
      status: 200,
      body: makeUser({ role: "commissioner" }),
    }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/stages/3/pool": () => ({ status: 200, body: pool }),
    "PATCH /api/stages/3/pool/11": (body) => {
      toggleBody = body;
      return { status: 204 };
    },
  });
  renderApp("/tournaments/7/settings");

  await userEvent.click(
    await screen.findByRole("button", { name: "Remove zekken" }),
  );
  await waitFor(() => expect(toggleBody).toEqual({ removed: true }));
});
