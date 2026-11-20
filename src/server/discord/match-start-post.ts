import { and, eq, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches } from "../db/schema.js";
import {
  type ScoredMatch,
  scoreTournament,
  type TournamentScores,
} from "../points.js";
import { matchOverviewUrl } from "../vlr/match.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ACCENT_COLOR,
  type ConnectedTournament,
  column,
  discordTime,
  managerLabels,
  PING_NOBODY,
  rosterLines,
  teamBadges,
  withEmoji,
} from "./format.js";

export interface StartingTeam {
  name: string;
  heading: string;
  // Every player and the coach, with the manager of each drafted pick.
  lines: string[];
}

export interface MatchStartPost {
  tournamentName: string;
  stageName: string | null;
  bestOf: number;
  scheduledAt: string;
  vlrMatchUrl: string;
  team1: StartingTeam;
  team2: StartingTeam;
}

// The two rosters side by side; Discord gives two inline fields half the width each.
export function matchStartMessage(post: MatchStartPost): DiscordMessage {
  return {
    embeds: [
      {
        title: `${post.team1.name} vs ${post.team2.name}`,
        url: post.vlrMatchUrl,
        description: [
          post.stageName,
          `Bo${post.bestOf}`,
          `starts ${discordTime(post.scheduledAt, "R")}`,
        ]
          .filter((part) => part !== null)
          .join(" · "),
        color: ACCENT_COLOR,
        fields: [post.team1, post.team2].map((team) =>
          column(team.heading, team.lines),
        ),
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: PING_NOBODY,
  };
}

export function matchStartPostOf(
  tournament: ConnectedTournament,
  scores: TournamentScores,
  scored: ScoredMatch,
): MatchStartPost {
  const { match } = scored;
  const stage = scores.stages.find(
    (candidate) => candidate.stage.id === scored.stageId,
  );
  const managerOf = managerLabels(tournament.id);
  const badgeOf = teamBadges([match.team1Id, match.team2Id]);
  const startingTeamOf = (teamId: number | null): StartingTeam => {
    const badge = badgeOf(teamId);
    return {
      name: badge.name,
      heading: withEmoji(badge.emoji, badge.label),
      lines: rosterLines(stage, teamId, managerOf),
    };
  };
  return {
    tournamentName: tournament.name,
    stageName: stage?.stage.name ?? null,
    bestOf: match.bestOf,
    scheduledAt: match.scheduledAt ?? "",
    vlrMatchUrl: matchOverviewUrl(match.vlrId),
    team1: startingTeamOf(match.team1Id),
    team2: startingTeamOf(match.team2Id),
  };
}

const startIsDue = (tournamentId: number, now: Date) =>
  and(
    eq(matches.tournamentId, tournamentId),
    lte(matches.scheduledAt, now.toISOString()),
    ne(matches.status, "completed"),
    isNotNull(matches.team1Id),
    isNotNull(matches.team2Id),
    isNull(matches.discordStartPostedAt),
  );

export function skipMatchStartsBacklog(tournamentId: number, now: Date) {
  db.update(matches)
    .set({ discordStartPostedAt: now.toISOString() })
    .where(startIsDue(tournamentId, now))
    .run();
}

// Posted at the scheduled time; VLR's times can slip, so it says "starts", not "live".
export async function postMatchStarts(
  tournament: ConnectedTournament,
  now: Date,
) {
  const dueIds = new Set(
    db
      .select({ id: matches.id })
      .from(matches)
      .where(startIsDue(tournament.id, now))
      .all()
      .map(({ id }) => id),
  );
  if (dueIds.size === 0) return;
  const scores = scoreTournament(tournament.id);
  for (const scored of scores.matches) {
    if (!dueIds.has(scored.match.id)) continue;
    await discord.postMessage(
      tournament.discordChannelId,
      matchStartMessage(matchStartPostOf(tournament, scores, scored)),
    );
    db.update(matches)
      .set({ discordStartPostedAt: new Date().toISOString() })
      .where(eq(matches.id, scored.match.id))
      .run();
  }
}
