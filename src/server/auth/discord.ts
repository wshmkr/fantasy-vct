import { Discord, generateState } from "arctic";
import { and, eq, isNull } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { env } from "../env.js";
import { recordLogin, type UserRow } from "./access.js";
import { baseCookieOptions, readCookie, setSessionCookie } from "./session.js";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

function avatarUrl(profile: DiscordProfile): string | null {
  return profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
    : null;
}

function findAllowedUser(profile: DiscordProfile): UserRow | undefined {
  const boundUser = db
    .select()
    .from(users)
    .where(eq(users.discordId, profile.id))
    .get();
  if (boundUser) return boundUser;
  return db
    .select()
    .from(users)
    .where(
      and(
        eq(users.discordUsername, profile.username.toLowerCase()),
        isNull(users.discordId),
      ),
    )
    .get();
}

function bindDiscordUser(profile: DiscordProfile): number | null {
  const user = findAllowedUser(profile);
  if (!user || user.removedAt) return null;
  recordLogin(user.id, {
    discordId: profile.id,
    displayName: profile.global_name ?? profile.username,
    avatarUrl: avatarUrl(profile),
  });
  return user.id;
}

async function fetchDiscordProfile(
  accessToken: string,
): Promise<DiscordProfile> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Discord profile ${response.status}`);
  return (await response.json()) as DiscordProfile;
}

export function createDiscordRouter(clientId: string, clientSecret: string) {
  const discord = new Discord(
    clientId,
    clientSecret,
    new URL("/api/auth/discord/callback", env.BASE_URL).toString(),
  );
  const router = Router();

  router.get("/auth/discord", (_req: Request, res: Response) => {
    const state = generateState();
    res.cookie(STATE_COOKIE, state, {
      ...baseCookieOptions,
      maxAge: STATE_MAX_AGE_MS,
    });
    res.redirect(
      discord.createAuthorizationURL(state, null, ["identify"]).toString(),
    );
  });

  router.get("/auth/discord/callback", async (req: Request, res: Response) => {
    const { code, state } = req.query;
    const expectedState = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, baseCookieOptions);
    if (typeof code !== "string" || !expectedState || state !== expectedState) {
      console.warn(
        `Discord login: ${expectedState ? "state mismatch" : "no state cookie"}`,
      );
      res.redirect("/login");
      return;
    }

    let profile: DiscordProfile;
    try {
      const tokens = await discord.validateAuthorizationCode(code, null);
      profile = await fetchDiscordProfile(tokens.accessToken());
    } catch (error) {
      // A refreshed callback reuses a spent code; send them back to try again.
      console.warn("Discord login: code exchange failed", error);
      res.redirect("/login");
      return;
    }
    const userId = bindDiscordUser(profile);
    if (userId === null) {
      console.warn(`Discord login: ${profile.username} isn't a member`);
      res.redirect(`/login?denied=${encodeURIComponent(profile.username)}`);
      return;
    }
    setSessionCookie(res, userId);
    res.redirect("/");
  });

  return router;
}
