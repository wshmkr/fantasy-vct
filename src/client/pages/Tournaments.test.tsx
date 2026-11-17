// @vitest-environment jsdom

import type { Tournament } from "@shared/entities";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../test-utils";

const me = makeUser({ id: 1 });
const otherManager = makeUser({ id: 2, displayName: "Amy" });

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 7,
    name: "Challengers NA Stage 1",
    vlrEventUrl: "https://www.vlr.gg/event/1/x",
    logoImageId: null,
    joiningOpen: true,
    status: "live",
    stages: [],
    members: [{ user: otherManager, color: "manager-red" }],
    teamCount: 16,
    matchesPlayed: 18,
    matchesTotal: 32,
    ...overrides,
  };
}

describe("Tournaments", () => {
  test("a member joins with a free color", async () => {
    let joinedColor: unknown;
    stubApi({
      "GET /api/me": () => ({ status: 200, body: me }),
      "GET /api/tournaments": () => ({
        status: 200,
        body: [makeTournament()],
      }),
      "POST /api/tournaments/7/members": (body) => {
        joinedColor = body;
        return { status: 204 };
      },
    });
    renderApp("/");

    const card = await screen.findByRole("article");
    expect(within(card).getByText("18/32")).toBeInTheDocument();
    expect(within(card).getByText("1/8")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New tournament" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Join" }));
    expect(screen.getByRole("button", { name: "red" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "blue deep" }));

    await waitFor(() =>
      expect(joinedColor).toEqual({ color: "manager-blue-deep" }),
    );
  });

  test("no Join once joined or closed", async () => {
    stubApi({
      "GET /api/me": () => ({ status: 200, body: me }),
      "GET /api/tournaments": () => ({
        status: 200,
        body: [
          makeTournament({
            id: 1,
            members: [{ user: me, color: "manager-red" }],
          }),
          makeTournament({ id: 2, joiningOpen: false }),
        ],
      }),
    });
    renderApp("/");
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Join" }),
    ).not.toBeInTheDocument();
  });
});
