import { and, eq, isNull } from "drizzle-orm";
import { displayNameOf } from "../../shared/entities.js";
import { db } from "../db/client.js";
import {
  matches,
  tournamentMembers,
  tournaments,
  users,
} from "../db/schema.js";
import { findTournament } from "../tournaments.js";
import { discord } from "./client.js";

// Discord's limit on role names.
const MAX_ROLE_NAME_LENGTH = 100;

interface ManagerAccount {
  displayName: string;
  discordUserId: string | null;
}

function managerAccountsOf(tournamentId: number): ManagerAccount[] {
  return db
    .select({
      displayName: users.displayName,
      discordUsername: users.discordUsername,
      discordUserId: users.discordId,
    })
    .from(tournamentMembers)
    .innerJoin(users, eq(users.id, tournamentMembers.userId))
    .where(eq(tournamentMembers.tournamentId, tournamentId))
    .all()
    .map((row) => ({
      displayName: displayNameOf(row),
      discordUserId: row.discordUserId,
    }));
}

export interface DiscordConnection {
  managersWithoutRole: string[];
}

export async function connectDiscordChannel(
  tournamentId: number,
  channelId: string,
): Promise<DiscordConnection> {
  const tournament = findTournament(tournamentId);
  const guildId = await discord.guildIdOfChannel(channelId);
  const roleId =
    tournament.discordGuildId === guildId && tournament.discordRoleId
      ? tournament.discordRoleId
      : await discord.createRole(
          guildId,
          tournament.name.slice(0, MAX_ROLE_NAME_LENGTH),
        );
  db.update(tournaments)
    .set({
      discordChannelId: channelId,
      discordGuildId: guildId,
      discordRoleId: roleId,
    })
    .where(eq(tournaments.id, tournamentId))
    .run();
  // Matches that ended before the channel was connected aren't news any more.
  db.update(matches)
    .set({ discordPostedAt: new Date().toISOString() })
    .where(
      and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.status, "completed"),
        eq(matches.scrapeStatus, "ok"),
        isNull(matches.discordPostedAt),
      ),
    )
    .run();

  const managersWithoutRole: string[] = [];
  for (const manager of managerAccountsOf(tournamentId)) {
    try {
      if (!manager.discordUserId) throw new Error("never logged in");
      await discord.addMemberRole(guildId, manager.discordUserId, roleId);
    } catch (error) {
      console.error(error);
      managersWithoutRole.push(manager.displayName);
    }
  }
  return { managersWithoutRole };
}

// Joining or leaving shouldn't fail because Discord did, so errors are only logged.
export async function syncManagerRole(
  tournamentId: number,
  userId: number,
  isManager: boolean,
): Promise<void> {
  try {
    const { discordGuildId, discordRoleId } = findTournament(tournamentId);
    const discordUserId = db
      .select({ discordId: users.discordId })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.discordId;
    if (!discordGuildId || !discordRoleId || !discordUserId) return;
    await (isManager ? discord.addMemberRole : discord.removeMemberRole)(
      discordGuildId,
      discordUserId,
      discordRoleId,
    );
  } catch (error) {
    console.error(error);
  }
}
