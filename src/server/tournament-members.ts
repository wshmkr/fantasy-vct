import { asc, eq } from "drizzle-orm";
import type { TournamentMember } from "../shared/entities.js";
import { toUser } from "./auth/access.js";
import { db } from "./db/client.js";
import { tournamentMembers, users } from "./db/schema.js";

export function tournamentMembersOf(tournamentId: number): TournamentMember[] {
  return db
    .select({ user: users, color: tournamentMembers.color })
    .from(tournamentMembers)
    .innerJoin(users, eq(users.id, tournamentMembers.userId))
    .where(eq(tournamentMembers.tournamentId, tournamentId))
    .orderBy(asc(tournamentMembers.joinedAt))
    .all()
    .map(({ user, color }) => ({ user: toUser(user), color }));
}
