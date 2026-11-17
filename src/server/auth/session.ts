import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { env } from "../env.js";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.BASE_URL.startsWith("https://"),
  path: "/",
};

function sign(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const pair of req.headers.cookie?.split(";") ?? []) {
    const separatorIndex = pair.indexOf("=");
    if (pair.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, userId: number): void {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `${userId}.${expiresAt}`;
  res.cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    ...baseCookieOptions,
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions);
}

export function readSessionUserId(req: Request): number | null {
  const [userId, expiresAt, signature] =
    readCookie(req, SESSION_COOKIE)?.split(".") ?? [];
  if (!userId || !expiresAt || !signature) return null;
  if (!signaturesMatch(sign(`${userId}.${expiresAt}`), signature)) return null;
  if (Number(expiresAt) < Date.now()) return null;
  return Number(userId);
}
