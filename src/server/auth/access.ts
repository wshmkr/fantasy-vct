import { eq, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import type { User } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { readSessionUserId } from "./session.js";

declare global {
  namespace Express {
    interface Locals {
      user: User;
    }
  }
}

export type UserRow = typeof users.$inferSelect;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    role: row.role,
    discordUsername: row.discordUsername,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    firstLoginAt: row.firstLoginAt,
  };
}

export function findActiveUser(userId: number): UserRow | undefined {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  return row && !row.removedAt ? row : undefined;
}

export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = readSessionUserId(req);
  const row = userId === null ? undefined : findActiveUser(userId);
  if (!row) throw new HttpError(401, "Not logged in");
  res.locals.user = toUser(row);
  next();
}

export function requireCommissioner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireUser(req, res, () => {
    if (res.locals.user.role !== "commissioner") {
      throw new HttpError(403, "Commissioner only");
    }
    next();
  });
}

export function upsertCommissioner(discordUsername: string): void {
  db.insert(users)
    .values({
      discordUsername,
      role: "commissioner",
    })
    .onConflictDoUpdate({
      target: users.discordUsername,
      set: { role: "commissioner", removedAt: null },
    })
    .run();
}

export function recordLogin(
  userId: number,
  profile: Partial<
    Pick<UserRow, "discordId" | "displayName" | "avatarUrl">
  > = {},
): UserRow {
  return db
    .update(users)
    .set({
      ...profile,
      firstLoginAt: sql`coalesce(${users.firstLoginAt}, ${new Date().toISOString()})`,
    })
    .where(eq(users.id, userId))
    .returning()
    .get() as UserRow;
}
