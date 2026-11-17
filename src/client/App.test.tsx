// @vitest-environment jsdom

import { APP_PRODUCT_NAME } from "@shared/branding";
import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { makeUser, renderApp, stubApi } from "./test-utils";

describe("App shell", () => {
  test("a logged-in user sees the site logo and the home page", async () => {
    stubApi({ "GET /api/me": () => ({ status: 200, body: makeUser() }) });
    renderApp("/");
    expect(
      await screen.findByRole("heading", { name: "Tournaments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `${APP_PRODUCT_NAME} home` }),
    ).toHaveAttribute("href", "/");
  });

  test("an unauthenticated user is sent to the Discord login", async () => {
    stubApi({ "GET /api/me": () => ({ status: 401 }) });
    renderApp("/");
    expect(
      await screen.findByRole("link", { name: "Log in with Discord" }),
    ).toHaveAttribute("href", "/api/auth/discord");
  });
});
