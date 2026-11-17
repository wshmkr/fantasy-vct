// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../test-utils";

describe("Members", () => {
  test("the commissioner adds and removes members", async () => {
    const commissioner = makeUser({ role: "commissioner" });
    const pending = makeUser({
      id: 2,
      discordUsername: "jamesk",
      displayName: null,
      firstLoginAt: null,
    });
    const fetchMock = stubApi({
      "GET /api/me": () => ({ status: 200, body: commissioner }),
      "GET /api/members": () => ({
        status: 200,
        body: [commissioner, pending],
      }),
      "POST /api/members": () => ({
        status: 409,
        body: { error: "Already added" },
      }),
      "DELETE /api/members/2": () => ({ status: 204 }),
    });
    renderApp("/members");

    expect(await screen.findByText("@jamesk")).toBeInTheDocument();
    expect(screen.getByLabelText("Commissioner")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove stephen" }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Discord username" }),
      "jamesk",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Already added")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove jamesk" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/members/2",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  test("a member sees no member list", async () => {
    const fetchMock = stubApi({
      "GET /api/me": () => ({ status: 200, body: makeUser() }),
    });
    renderApp("/members");
    expect(
      await screen.findByRole("heading", { name: "Members" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/members",
      expect.anything(),
    );
  });
});
