import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { MatchPick } from "../../shared/api.js";
import { displayNameOf } from "../../shared/entities.js";
import type { MapStatLine } from "../../shared/scoring.js";
import { db } from "../db/client.js";
import { matches, tournaments } from "../db/schema.js";
import { env } from "../env.js";
import { picksOf, teamLookup } from "../match-picks.js";
import { scoreTournament } from "../points.js";
import { standingsOf } from "../standings.js";
import {
  type DiscordMessage,
  discord,
  isDiscordBotConfigured,
} from "./client.js";

const ACCENT_COLOR = 0xff7a1a;

export interface PostedPick {
  handle: string;
  isCoach: boolean;
  stats: MapStatLine | null;
  points: number;
  ownerName: string | null;
}

export interface PostedTeam {
  name: string;
  score: number | null;
  picks: PostedPick[];
}

export interface PostedStanding {
  rank: number;
  displayName: string;
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

function pickLine({ handle, isCoach, stats, points, ownerName }: PostedPick) {
  const performance = isCoach
    ? "coach"
    : stats
      ? `${stats.k}/${stats.d}/${stats.a}`
      : "didn't play";
  const owner = ownerName ? ` · ${ownerName}` : "";
  return `**${handle}** ${performance} · **${points}** pts${owner}`;
}

function standingLine({
  rank,
  displayName,
  points,
  matchPoints,
}: PostedStanding) {
  const gained = matchPoints === 0 ? "" : ` (+${matchPoints})`;
  return `${rank}. ${displayName} · **${points ?? 0}**${gained}`;
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
        .map(pickLine)
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

type TournamentRow = typeof tournaments.$inferSelect;

function matchPostsOf(
  tournament: TournamentRow & { discordRoleId: string },
  matchIds: number[],
): { matchId: number; post: MatchPost }[] {
  const scores = scoreTournament(tournament.id);
  const standings = standingsOf(tournament.id);
  const nameOfUser = new Map(
    standings.map(({ user }) => [user.id, displayNameOf(user)]),
  );
  return matchIds.flatMap((matchId) => {
    const scored = scores.matches.find(({ match }) => match.id === matchId);
    if (!scored) return [];
    const { match } = scored;
    const stage = scores.stages.find(
      (candidate) => candidate.stage.id === scored.stageId,
    );
    const teamOf = teamLookup([match.team1Id, match.team2Id]);
    const allPicks: MatchPick[] = [];
    const postedTeamOf = (teamId: number | null, score: number | null) => {
      const picks = teamId === null ? [] : picksOf(scored, stage, teamId);
      allPicks.push(...picks);
      return {
        name: teamOf(teamId)?.name ?? "TBD",
        score,
        picks: picks.map((pick) => ({
          handle: pick.pickable.handle,
          isCoach: pick.pickable.kind === "coach",
          stats: pick.playerStatTotals,
          points: pick.points,
          ownerName:
            pick.ownerUserId === null
              ? null
              : (nameOfUser.get(pick.ownerUserId) ?? null),
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
            displayName: displayNameOf(user),
            points,
            matchPoints: matchPointsOf(user.id),
          })),
        },
      },
    ];
  });
}

let posting = false;

// Runs after every sync. A post that fails stays unposted and is retried on the next run.
export async function postFinishedMatches(): Promise<void> {
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
      if (unpostedIds.length === 0) continue;
      for (const { matchId, post } of matchPostsOf(
        { ...tournament, discordRoleId },
        unpostedIds,
      )) {
        await discord.postMessage(discordChannelId, matchPostMessage(post));
        db.update(matches)
          .set({ discordPostedAt: new Date().toISOString() })
          .where(eq(matches.id, matchId))
          .run();
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    posting = false;
  }
}
