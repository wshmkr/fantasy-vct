// @vitest-environment jsdom

import type { TeamWithPickables, Tournament } from "@shared/entities";
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
  stages: [],
  members: [],
  leaders: [],
  teamCount: 1,
  matchesPlayed: 0,
  matchesTotal: 0,
};

const sentinels: TeamWithPickables = {
  id: 2,
  name: "Sentinels",
  logoImageId: null,
  pickables: [
    {
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
      points: null,
    },
  ],
};

function stubTeamsApi(role: "commissioner" | "member") {
  const requests: { added?: unknown; removedPath?: string } = {};
  stubApi({
    "GET /api/me": () => ({ status: 200, body: makeUser({ role }) }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/tournaments/7/teams": () => ({ status: 200, body: [sentinels] }),
    "POST /api/teams/2/roster": (body) => {
      requests.added = body;
      return { status: 204 };
    },
    "DELETE /api/teams/2/roster/11": () => {
      requests.removedPath = "/api/teams/2/roster/11";
      return { status: 204 };
    },
  });
  return requests;
}

test("the commissioner pastes a VLR link to add a coach and removes a player", async () => {
  const requests = stubTeamsApi("commissioner");
  renderApp("/tournaments/7/teams");

  await userEvent.click(
    await screen.findByRole("button", { name: "Edit Sentinels roster" }),
  );
  await userEvent.click(screen.getByRole("tab", { name: "Coach" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "VLR player link" }),
    "vlr.gg/player/5/kaplan",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() =>
    expect(requests.added).toEqual({
      vlrPlayerUrl: "vlr.gg/player/5/kaplan",
      kind: "coach",
    }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Remove zekken" }));
  await waitFor(() =>
    expect(requests.removedPath).toBe("/api/teams/2/roster/11"),
  );
});

test("members don't get the roster editor", async () => {
  stubTeamsApi("member");
  renderApp("/tournaments/7/teams");

  await screen.findByRole("heading", { name: "Sentinels" });
  expect(
    screen.queryByRole("button", { name: "Edit Sentinels roster" }),
  ).toBeNull();
});
