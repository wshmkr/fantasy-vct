import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { displayNameOf } from "../../shared/entities.js";
import { db } from "../db/client.js";
import {
  type matches,
  type pickables,
  teams,
  tournamentMembers,
  users,
} from "../db/schema.js";
import { env } from "../env.js";
import { ownerOf } from "../match-picks.js";
import { coachLast } from "../pickables.js";
import type { ScoredStage } from "../points.js";
import type { TournamentRow } from "../tournaments.js";
import type { DiscordMessage } from "./client.js";

export const ACCENT_COLOR = 0xff7a1a;
export const ALERT_COLOR = 0xf87171;
// A blank line Discord won't collapse, to space out rows of fields.
export const BLANK_LINE = "​";
// An empty inline field, to end a row of fewer than three columns.
export const EMPTY_COLUMN = {
  name: BLANK_LINE,
  value: BLANK_LINE,
  inline: true,
};
export const PING_NOBODY: DiscordMessage["allowed_mentions"] = { parse: [] };

export type ConnectedTournament = TournamentRow & {
  discordChannelId: string;
  discordRoleId: string;
};

export const link = (text: string, url: string | null) =>
  url ? `[${text}](${url})` : text;

export const withEmoji = (emoji: string | null, text: string) =>
  emoji ? `${emoji} ${text}` : text;

export const column = (name: string, lines: string[], empty = "—") => ({
  name,
  value: lines.join("\n") || empty,
  inline: true,
});

// Mentions render as pills taller than a text line, so columns holding them drift out of line
// with their neighbours. A table with mentions keeps each row on one full-width line instead.
export const rows = (name: string, lines: string[], empty = "—") => ({
  ...column(name, lines, empty),
  inline: false,
});

// A field value holds 1024 characters, so ranked lists skip the VLR links.
export const unlinked = (pick: NamedPick): NamedPick => ({
  ...pick,
  vlrUrl: null,
});

export const signed = (points: number) =>
  points > 0 ? `+${points}` : `${points}`;

// Renders in each reader's own time zone.
export const discordTime = (isoTime: string, style: "t" | "R") =>
  `<t:${Math.floor(Date.parse(isoTime) / 1000)}:${style}>`;

export const appUrl = (tournamentId: number, tab: "rosters" | "matches") =>
  `${env.BASE_URL}/tournaments/${tournamentId}/${tab}`;

export const isScored = (match: typeof matches.$inferSelect) =>
  match.status === "completed" && match.scrapeStatus === "ok";

export interface NamedPick {
  handle: string;
  vlrUrl: string | null;
  isCoach: boolean;
  isPlaceholder: boolean;
}

export const namedPickOf = (
  pickable: Pick<
    typeof pickables.$inferSelect,
    "handle" | "vlrUrl" | "kind" | "isPlaceholder"
  >,
): NamedPick => ({
  handle: pickable.handle,
  vlrUrl: pickable.vlrUrl,
  isCoach: pickable.kind === "coach",
  isPlaceholder: pickable.isPlaceholder,
});

// The logo or team heading already names a placeholder's team, so it's just "Coach".
export function pickName({
  handle,
  vlrUrl,
  isCoach,
  isPlaceholder,
}: NamedPick) {
  if (isPlaceholder) return "Coach";
  return `${link(`**${handle}**`, vlrUrl)}${isCoach ? " (C)" : ""}`;
}

// Mentions in embeds render as @name without pinging anyone.
export function managerLabels(
  tournamentId: number,
): (userId: number) => string {
  const labelOfUser = new Map(
    db
      .select({
        id: users.id,
        discordId: users.discordId,
        displayName: users.displayName,
        discordUsername: users.discordUsername,
      })
      .from(tournamentMembers)
      .innerJoin(users, eq(users.id, tournamentMembers.userId))
      .where(eq(tournamentMembers.tournamentId, tournamentId))
      .all()
      .map((user) => [
        user.id,
        user.discordId ? `<@${user.discordId}>` : displayNameOf(user),
      ]),
  );
  return (userId) => labelOfUser.get(userId) ?? "?";
}

export interface TeamBadge {
  name: string;
  // VLR's short tag, or the name when VLR has none.
  label: string;
  emoji: string | null;
}

// One query for every team a post mentions.
export function teamBadges(
  teamIds: (number | null)[],
): (teamId: number | null) => TeamBadge {
  const ids = teamIds.filter((id) => id !== null);
  const badgeById = new Map(
    (ids.length === 0
      ? []
      : db
          .select({
            id: teams.id,
            name: teams.name,
            tag: teams.tag,
            emoji: teams.discordEmoji,
          })
          .from(teams)
          .where(inArray(teams.id, ids))
          .all()
    ).map(({ id, name, tag, emoji }) => [
      id,
      { name, label: tag ?? name, emoji },
    ]),
  );
  return (teamId) =>
    (teamId === null ? undefined : badgeById.get(teamId)) ?? {
      name: "TBD",
      label: "TBD",
      emoji: null,
    };
}

export function commissionerDiscordId(): string | null {
  return (
    db
      .select({ discordId: users.discordId })
      .from(users)
      .where(and(eq(users.role, "commissioner"), isNotNull(users.discordId)))
      .get()?.discordId ?? null
  );
}

// A team's whole roster in a stage, players then coach, each with its manager if drafted:
// "**Xeppaa** · @starlights", or just the name.
export function rosterLines(
  stage: ScoredStage | undefined,
  teamId: number | null,
  managerOf: (userId: number) => string,
): string[] {
  if (teamId === null) return [];
  return (stage?.pool ?? [])
    .filter((pickable) => pickable.teamId === teamId)
    .sort(coachLast)
    .map((pickable) => {
      const userId = ownerOf(stage, pickable.id);
      const name = pickName(namedPickOf(pickable));
      return userId === null ? name : `${name} · ${managerOf(userId)}`;
    });
}
