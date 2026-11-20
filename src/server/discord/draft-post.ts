import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { pickables, rosterEntries, stages, teams } from "../db/schema.js";
import { seatsOf } from "../draft/seats.js";
import { coachLast } from "../pickables.js";
import type { StageRow } from "../stages.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ACCENT_COLOR,
  appUrl,
  BLANK_LINE,
  type ConnectedTournament,
  managerLabels,
  type NamedPick,
  namedPickOf,
  pickName,
} from "./format.js";

export interface DraftPick extends NamedPick {
  teamLabel: string;
  teamEmoji: string | null;
}

export interface DraftPost {
  roleId: string;
  tournamentName: string;
  stageName: string;
  rostersUrl: string;
  managers: { manager: string; picks: DraftPick[] }[];
}

// The logo emoji stands in for the team; the text label is the fallback.
function draftPickLine(pick: DraftPick) {
  const name = pickName(pick);
  return pick.teamEmoji
    ? `${pick.teamEmoji} ${name}`
    : `${name} · ${pick.teamLabel}`;
}

const ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"];

function ordinal(n: number) {
  const lastTwo = n % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? "th" : (ORDINAL_SUFFIXES[n % 10] ?? "th");
  return `${n}${suffix}`;
}

export function draftPostMessage(post: DraftPost): DiscordMessage {
  return {
    content: `<@&${post.roleId}>`,
    embeds: [
      {
        title: `${post.stageName} teams`,
        url: post.rostersUrl,
        color: ACCENT_COLOR,
        // Mentions only render in field values, so the manager leads the value.
        fields: post.managers.map(({ manager, picks }, index) => ({
          name: `${ordinal(index + 1)} pick`,
          value: [manager, ...picks.map(draftPickLine), BLANK_LINE].join("\n"),
          inline: true,
        })),
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: { roles: [post.roleId] },
  };
}

// Managers in draft order, each with their players in the order they were drafted, then the coach.
export function draftPostOf(
  tournament: ConnectedTournament,
  stage: StageRow,
): DraftPost {
  const managerOf = managerLabels(tournament.id);
  const picks = db
    .select({
      userId: rosterEntries.userId,
      handle: pickables.handle,
      vlrUrl: pickables.vlrUrl,
      kind: pickables.kind,
      isPlaceholder: pickables.isPlaceholder,
      teamName: teams.name,
      teamTag: teams.tag,
      teamEmoji: teams.discordEmoji,
    })
    .from(rosterEntries)
    .innerJoin(pickables, eq(pickables.id, rosterEntries.pickableId))
    .innerJoin(teams, eq(teams.id, pickables.teamId))
    .where(eq(rosterEntries.stageId, stage.id))
    // rowid is insertion order, and swaps update in place, so slots stay put.
    .orderBy(sql`${rosterEntries}.rowid`)
    .all();
  return {
    roleId: tournament.discordRoleId,
    tournamentName: tournament.name,
    stageName: stage.name,
    rostersUrl: appUrl(tournament.id, "rosters"),
    managers: seatsOf(stage.id).map(({ userId }) => ({
      manager: managerOf(userId),
      picks: picks
        .filter((pick) => pick.userId === userId)
        .sort(coachLast)
        .map((pick) => ({
          ...namedPickOf(pick),
          teamLabel: pick.teamTag ?? pick.teamName,
          teamEmoji: pick.teamEmoji,
        })),
    })),
  };
}

export async function postDraftResults(tournament: ConnectedTournament) {
  const draftedStages = db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.tournamentId, tournament.id),
        eq(stages.status, "complete"),
        isNull(stages.discordPostedAt),
      ),
    )
    .orderBy(asc(stages.position))
    .all();
  for (const stage of draftedStages) {
    await discord.postMessage(
      tournament.discordChannelId,
      draftPostMessage(draftPostOf(tournament, stage)),
    );
    db.update(stages)
      .set({ discordPostedAt: new Date().toISOString() })
      .where(eq(stages.id, stage.id))
      .run();
  }
}
