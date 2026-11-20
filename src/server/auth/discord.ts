import { randomBytes } from "node:crypto";
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

// Plain fetch on purpose: cheerio installs undici 7 as fetch's global dispatcher, and it rejects
// the hand-set Content-Length header that OAuth libraries like arctic add.
async function exchangeCodeForAccessToken(
  code: string,
  { clientId, clientSecret, redirectUri }: DiscordClient,
): Promise<string> {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) throw new Error(`Discord token ${response.status}`);
  const { access_token } = (await response.json()) as { access_token: string };
  return access_token;
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

interface DiscordClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createDiscordRouter(clientId: string, clientSecret: string) {
  const discord: DiscordClient = {
    clientId,
    clientSecret,
    redirectUri: new URL("/api/auth/discord/callback", env.BASE_URL).toString(),
  };
  const router = Router();

  router.get("/auth/discord", (_req: Request, res: Response) => {
    const state = randomBytes(32).toString("base64url");
    res.cookie(STATE_COOKIE, state, {
      ...baseCookieOptions,
      maxAge: STATE_MAX_AGE_MS,
    });
    const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: discord.redirectUri,
      scope: "identify",
      state,
    }).toString();
    res.redirect(authorizeUrl.toString());
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
      const accessToken = await exchangeCodeForAccessToken(code, discord);
      profile = await fetchDiscordProfile(accessToken);
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
