import { eq } from "drizzle-orm";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { insertUser, loginAs, testApp } from "../test-utils.js";
import type { DiscordProfile } from "./discord.js";

const app = testApp;

describe("dev login and sessions", () => {
  test("dev login sets a session that /api/me reads", async () => {
    const user = insertUser("devuser");
    const agent = await loginAs(user.id);
    const me = await agent.get("/api/me").expect(200);
    expect(me.body).toMatchObject({ id: user.id, discordUsername: "devuser" });
    expect(me.body.firstLoginAt).toEqual(expect.any(String));
  });

  test("/api/me without a session is 401", async () => {
    await request(app).get("/api/me").expect(401);
  });

  test("a tampered session cookie is 401", async () => {
    const user = insertUser("tamperer");
    await request(app)
      .get("/api/me")
      .set("Cookie", `session=${user.id}.${Date.now() + 60_000}.forged`)
      .expect(401);
  });

  test("a removed member's next request is 401", async () => {
    const user = insertUser("soontogone");
    const agent = await loginAs(user.id);
    await agent.get("/api/me").expect(200);
    db.update(users)
      .set({ removedAt: new Date().toISOString() })
      .where(eq(users.id, user.id))
      .run();
    await agent.get("/api/me").expect(401);
  });

  test("logout clears the session", async () => {
    const agent = await loginAs(insertUser("leaver").id);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/me").expect(401);
  });
});

describe("Discord OAuth", () => {
  let discordProfile: DiscordProfile;
  const discord = setupServer(
    http.post("https://discord.com/api/oauth2/token", () =>
      HttpResponse.json({
        access_token: "discord-access-token",
        token_type: "Bearer",
        expires_in: 604800,
        refresh_token: "discord-refresh-token",
        scope: "identify",
      }),
    ),
    http.get("https://discord.com/api/users/@me", ({ request }) =>
      request.headers.get("Authorization") === "Bearer discord-access-token"
        ? HttpResponse.json(discordProfile)
        : new HttpResponse(null, { status: 401 }),
    ),
  );

  beforeAll(() => discord.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => discord.resetHandlers());
  afterAll(() => discord.close());

  async function completeOAuth() {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/discord").expect(302);
    const authorizeUrl = new URL(start.headers.location ?? "");
    expect(authorizeUrl.origin).toBe("https://discord.com");
    expect(authorizeUrl.searchParams.get("scope")).toBe("identify");
    const state = authorizeUrl.searchParams.get("state");
    const callback = await agent
      .get("/api/auth/discord/callback")
      .query({ code: "auth-code", state })
      .expect(302);
    return { agent, redirect: callback.headers.location };
  }

  test("first login binds by username, later logins by Discord id", async () => {
    const added = insertUser("friend");
    discordProfile = {
      id: "111",
      username: "Friend",
      global_name: "Friendly",
      avatar: "abc",
    };

    const first = await completeOAuth();
    expect(first.redirect).toBe("/");
    const me = await first.agent.get("/api/me").expect(200);
    expect(me.body).toMatchObject({
      id: added.id,
      displayName: "Friendly",
      avatarUrl: expect.stringContaining("/avatars/111/abc.png"),
    });

    discordProfile = {
      ...discordProfile,
      username: "renamed",
      global_name: null,
    };
    const second = await completeOAuth();
    expect(second.redirect).toBe("/");
    const meAgain = await second.agent.get("/api/me").expect(200);
    expect(meAgain.body).toMatchObject({
      id: added.id,
      displayName: "renamed",
    });
  });

  test("an unknown Discord user is sent to No access", async () => {
    discordProfile = {
      id: "222",
      username: "stranger",
      global_name: null,
      avatar: null,
    };
    const { agent, redirect } = await completeOAuth();
    expect(redirect).toBe("/login?denied=stranger");
    await agent.get("/api/me").expect(401);
  });

  test("a mismatched state is rejected", async () => {
    const callback = await request(app)
      .get("/api/auth/discord/callback")
      .query({ code: "auth-code", state: "forged" })
      .expect(302);
    expect(callback.headers.location).toBe("/login");
  });
});
