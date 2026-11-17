// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "../test-utils";

describe("Login", () => {
  test("dev login lists users and logs in as the clicked one", async () => {
    const amy = makeUser({ id: 3, displayName: "Amy" });
    let loggedIn = false;
    const fetchMock = stubApi({
      "GET /api/me": () =>
        loggedIn ? { status: 200, body: amy } : { status: 401 },
      "GET /api/auth/dev/users": () => ({
        status: 200,
        body: [makeUser({ id: 1, displayName: "Stephen" }), amy],
      }),
      "POST /api/auth/dev": () => {
        loggedIn = true;
        return { status: 200, body: amy };
      },
    });
    renderApp("/login");

    await userEvent.click(
      await screen.findByRole("button", { name: "Log in as Amy" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Tournaments" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/dev",
      expect.objectContaining({ body: JSON.stringify({ userId: 3 }) }),
    );
  });

  test("a rejected Discord user sees No access", async () => {
    stubApi({ "GET /api/me": () => ({ status: 401 }) });
    renderApp("/login?denied=stranger");
    expect(await screen.findByText("No access")).toBeInTheDocument();
    expect(screen.getByText("@stranger")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Log in with Discord" }),
    ).not.toBeInTheDocument();
  });
});
