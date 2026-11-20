import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { MatchPick } from "../../shared/api.js";
import { displayNameOf } from "../../shared/entities.js";
import type { MapStatLine } from "../../shared/scoring.js";
import { db } from "../db/client.js";
import {
  matches,
  pickables,
  rosterEntries,
  stages,
  teams,
  tournamentMembers,
  tournaments,
  users,
} from "../db/schema.js";
import { seatsOf } from "../draft/seats.js";
import { env } from "../env.js";
import { picksOf, teamLookup } from "../match-picks.js";
import { scoreTournament } from "../points.js";
import { standingsOf } from "../standings.js";
import {
  type DiscordMessage,
  discord,
  isDiscordBotConfigured,
} from "./client.js";
import { ensureTeamEmojis } from "./team-emojis.js";

const ACCENT_COLOR = 0xff7a1a;

export interface PostedPick {
  handle: string;
  isCoach: boolean;
  stats: MapStatLine | null;
  points: number;
  // A Discord mention when the manager has logged in with Discord, else their name.
  owner: string | null;
}

export interface PostedTeam {
  name: string;
  emoji: string | null;
  score: number | null;
  picks: PostedPick[];
}

export interface PostedStanding {
  rank: number;
  manager: string;
  points: number | null;
  matchPoints: number;
}

export interface MatchPost {
  roleId: string;
  tournamentName: string;
  stageName: string | null;
  matchesUrl: string;
  maps: { mapName: string; team1Rounds: number; team2Rounds: number }[];
  team1: PostedTeam;
  team2: PostedTeam;
  standings: PostedStanding[];
}

const withEmoji = (emoji: string | null, text: string) =>
  emoji ? `${emoji} ${text}` : text;

function pickLine(
  { handle, isCoach, stats, points, owner }: PostedPick,
  teamEmoji: string | null,
) {
  const performance = isCoach
    ? "coach"
    : stats
      ? `${stats.k}/${stats.d}/${stats.a}`
      : "didn't play";
  const ownedBy = owner ? ` · ${owner}` : "";
  return withEmoji(
    teamEmoji,
    `**${handle}** ${performance} · **${points}** pts${ownedBy}`,
  );
}

function standingLine({ rank, manager, points, matchPoints }: PostedStanding) {
  const gained = matchPoints === 0 ? "" : ` (+${matchPoints})`;
  return `${rank}. ${manager} · **${points ?? 0}**${gained}`;
}

export function matchPostMessage(post: MatchPost): DiscordMessage {
  const result = `${post.team1.name} ${post.team1.score ?? 0}–${post.team2.score ?? 0} ${post.team2.name}`;
  const mapScores = post.maps.map(
    (map) => `${map.mapName} ${map.team1Rounds}–${map.team2Rounds}`,
  );
  const teamFields = [post.team1, post.team2].map((team) => ({
    name: team.name,
    value:
      team.picks
        .toSorted((a, b) => b.points - a.points)
        .map((pick) => pickLine(pick, team.emoji))
        .join("\n") || "—",
  }));
  const standingsFields =
    post.standings.length === 0
      ? []
      : [
          {
            name: "Standings",
            value: post.standings.map(standingLine).join("\n"),
          },
        ];
  return {
    content: `<@&${post.roleId}> ${result} is final`,
    embeds: [
      {
        title: result,
        url: post.matchesUrl,
        description: [post.stageName, ...mapScores]
          .filter((part) => part !== null)
          .join(" · "),
        color: ACCENT_COLOR,
        fields: [...teamFields, ...standingsFields],
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: { roles: [post.roleId] },
  };
}

export interface DraftPick {
  handle: string;
  isCoach: boolean;
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
function draftPickLine({ handle, isCoach, teamLabel, teamEmoji }: DraftPick) {
  const pick = `**${handle}**${isCoach ? " (coach)" : ""}`;
  return teamEmoji ? `${teamEmoji} ${pick}` : `${pick} · ${teamLabel}`;
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
    content: `<@&${post.roleId}> The ${post.stageName} draft is done. Here are the teams:`,
    embeds: [
      {
        title: `${post.stageName} teams`,
        url: post.rostersUrl,
        color: ACCENT_COLOR,
        // Mentions only render in field values, so the manager leads the value.
        fields: post.managers.map(({ manager, picks }, index) => ({
          name: `${ordinal(index + 1)} pick`,
          value: [manager, ...picks.map(draftPickLine)].join("\n"),
          inline: true,
        })),
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: { roles: [post.roleId] },
  };
}

// Mentions in embeds render as @name without pinging anyone.
function managerLabels(tournamentId: number): (userId: number) => string {
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

type TournamentRow = typeof tournaments.$inferSelect;
type StageRow = typeof stages.$inferSelect;

// Managers in draft order, each with their picks in the order they made them.
export function draftPostOf(
  tournament: TournamentRow & { discordRoleId: string },
  stage: StageRow,
): DraftPost {
  const managerOf = managerLabels(tournament.id);
  const picks = db
    .select({
      userId: rosterEntries.userId,
      handle: pickables.handle,
      kind: pickables.kind,
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
    rostersUrl: `${env.BASE_URL}/tournaments/${tournament.id}/rosters`,
    managers: seatsOf(stage.id).map(({ userId }) => ({
      manager: managerOf(userId),
      picks: picks
        .filter((pick) => pick.userId === userId)
        .map(({ handle, kind, teamName, teamTag, teamEmoji }) => ({
          handle,
          isCoach: kind === "coach",
          teamLabel: teamTag ?? teamName,
          teamEmoji,
        })),
    })),
  };
}

export function matchPostsOf(
  tournament: TournamentRow & { discordRoleId: string },
  matchIds: number[],
): { matchId: number; post: MatchPost }[] {
  const scores = scoreTournament(tournament.id);
  const standings = standingsOf(tournament.id);
  const managerOf = managerLabels(tournament.id);
  return matchIds.flatMap((matchId) => {
    const scored = scores.matches.find(({ match }) => match.id === matchId);
    if (!scored) return [];
    const { match } = scored;
    const stage = scores.stages.find(
      (candidate) => candidate.stage.id === scored.stageId,
    );
    const teamOf = teamLookup([match.team1Id, match.team2Id]);
    const emojiOf = (teamId: number | null) =>
      teamId === null
        ? null
        : (db
            .select({ emoji: teams.discordEmoji })
            .from(teams)
            .where(eq(teams.id, teamId))
            .get()?.emoji ?? null);
    const allPicks: MatchPick[] = [];
    const postedTeamOf = (teamId: number | null, score: number | null) => {
      const picks = teamId === null ? [] : picksOf(scored, stage, teamId);
      allPicks.push(...picks);
      return {
        name: teamOf(teamId)?.name ?? "TBD",
        emoji: emojiOf(teamId),
        score,
        picks: picks.map((pick) => ({
          handle: pick.pickable.handle,
          isCoach: pick.pickable.kind === "coach",
          stats: pick.playerStatTotals,
          points: pick.points,
          owner: pick.ownerUserId === null ? null : managerOf(pick.ownerUserId),
        })),
      };
    };
    const team1 = postedTeamOf(match.team1Id, match.score1);
    const team2 = postedTeamOf(match.team2Id, match.score2);
    const matchPointsOf = (userId: number) =>
      allPicks
        .filter((pick) => pick.ownerUserId === userId)
        .reduce((total, pick) => total + pick.points, 0);
    return [
      {
        matchId,
        post: {
          roleId: tournament.discordRoleId,
          tournamentName: tournament.name,
          stageName: stage?.stage.name ?? null,
          matchesUrl: `${env.BASE_URL}/tournaments/${tournament.id}/matches`,
          maps: scored.maps,
          team1,
          team2,
          standings: standings.map(({ user, rank, points }) => ({
            rank,
            manager: managerOf(user.id),
            points,
            matchPoints: matchPointsOf(user.id),
          })),
        },
      },
    ];
  });
}

let posting = false;

async function postDraftResults(
  tournament: TournamentRow & {
    discordChannelId: string;
    discordRoleId: string;
  },
) {
  const completedStages = db
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
  for (const stage of completedStages) {
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

async function postMatchResults(
  tournament: TournamentRow & {
    discordChannelId: string;
    discordRoleId: string;
  },
) {
  const unpostedIds = db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournament.id),
        eq(matches.status, "completed"),
        eq(matches.scrapeStatus, "ok"),
        isNull(matches.discordPostedAt),
      ),
    )
    .all()
    .map(({ id }) => id);
  if (unpostedIds.length === 0) return;
  for (const { matchId, post } of matchPostsOf(tournament, unpostedIds)) {
    await discord.postMessage(
      tournament.discordChannelId,
      matchPostMessage(post),
    );
    db.update(matches)
      .set({ discordPostedAt: new Date().toISOString() })
      .where(eq(matches.id, matchId))
      .run();
  }
}

// Runs after every sync. A post that fails stays unposted and is retried on the next run.
export async function postDiscordUpdates(): Promise<void> {
  if (posting || !isDiscordBotConfigured()) return;
  posting = true;
  try {
    const connected = db
      .select()
      .from(tournaments)
      .where(
        and(
          isNotNull(tournaments.discordChannelId),
          isNotNull(tournaments.discordRoleId),
        ),
      )
      .all();
    for (const tournament of connected) {
      const { discordChannelId, discordRoleId } = tournament;
      if (!discordChannelId || !discordRoleId) continue;
      const connectedTournament = {
        ...tournament,
        discordChannelId,
        discordRoleId,
      };
      await ensureTeamEmojis(tournament.id);
      await postDraftResults(connectedTournament);
      await postMatchResults(connectedTournament);
    }
  } catch (error) {
    console.error(error);
  } finally {
    posting = false;
  }
}
