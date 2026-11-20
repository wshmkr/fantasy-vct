import { and, eq, isNull } from "drizzle-orm";
import { type MapStatLine, seriesScoreLabel } from "../../shared/scoring.js";
import { db } from "../db/client.js";
import { matches } from "../db/schema.js";
import { picksOf } from "../match-picks.js";
import {
  type ScoredMatch,
  scoreTournament,
  type TournamentScores,
} from "../points.js";
import { standingsOf } from "../standings.js";
import { matchOverviewUrl } from "../vlr/match.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ACCENT_COLOR,
  type ConnectedTournament,
  column,
  managerLabels,
  type NamedPick,
  namedPickOf,
  PING_NOBODY,
  pickName,
  teamBadges,
  withEmoji,
} from "./format.js";

export interface PostedPick extends NamedPick {
  stats: MapStatLine | null;
  points: number;
  // A Discord mention when the manager has logged in with Discord, else their name.
  owner: string | null;
}

export interface PostedTeam {
  name: string;
  heading: string;
  roundsByMap: number[];
  score: number | string | null;
  picks: PostedPick[];
}

export interface PostedStanding {
  rank: number;
  manager: string;
  points: number | null;
  matchPoints: number;
}

export interface MatchPost {
  tournamentName: string;
  stageName: string | null;
  vlrMatchUrl: string;
  forfeit: boolean;
  maps: { mapName: string; team1Rounds: number; team2Rounds: number }[];
  team1: PostedTeam;
  team2: PostedTeam;
  standings: PostedStanding[];
}

const bold = (rounds: number, won: boolean) =>
  won ? `**${rounds}**` : `${rounds}`;

function mapScore({
  mapName,
  team1Rounds,
  team2Rounds,
}: MatchPost["maps"][number]) {
  const team1Won = team1Rounds > team2Rounds;
  return `${mapName} ${bold(team1Rounds, team1Won)}–${bold(team2Rounds, !team1Won)}`;
}

// A coach has no K/D/A, so their line shows the rounds their team won on each map.
function performance({ isCoach, stats }: PostedPick, roundsByMap: number[]) {
  if (roundsByMap.length === 0) return "—";
  if (isCoach) return roundsByMap.join("/");
  return stats ? `${stats.k}/${stats.d}/${stats.a}` : "DNP";
}

// Discord embeds have no tables, and at most three inline fields share a row, so a team's
// picks become three columns kept to one line per cell so the rows line up.
function teamColumns(team: PostedTeam) {
  const picks = team.picks.toSorted(
    (a, b) => Number(a.isCoach) - Number(b.isCoach) || b.points - a.points,
  );
  return [
    column(team.heading, picks.map(pickName)),
    column(
      "K/D/A",
      picks.map((pick) => performance(pick, team.roundsByMap)),
    ),
    column(
      "Pts · Manager",
      picks.map((pick) =>
        pick.owner
          ? `**${pick.points}** · ${pick.owner}`
          : `**${pick.points}**`,
      ),
    ),
  ];
}

function standingsColumns(standings: PostedStanding[]) {
  if (standings.length === 0) return [];
  return [
    column(
      "Standings",
      standings.map(({ rank, manager }) => `${rank}. ${manager}`),
    ),
    column(
      "Total",
      standings.map(
        ({ points, matchPoints }) =>
          `**${points ?? 0}**${matchPoints === 0 ? "" : ` (+${matchPoints})`}`,
      ),
    ),
  ];
}

export function matchPostMessage(post: MatchPost): DiscordMessage {
  return {
    embeds: [
      {
        title: `${post.team1.name} ${post.team1.score ?? 0}–${post.team2.score ?? 0} ${post.team2.name}`,
        url: post.vlrMatchUrl,
        description: [
          post.stageName,
          ...(post.forfeit ? ["Forfeit"] : post.maps.map(mapScore)),
        ]
          .filter((part) => part !== null)
          .join(" · "),
        color: ACCENT_COLOR,
        fields: [
          ...teamColumns(post.team1),
          ...teamColumns(post.team2),
          ...standingsColumns(post.standings),
        ],
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: PING_NOBODY,
  };
}

export function matchPostOf(
  tournament: ConnectedTournament,
  scores: TournamentScores,
  scored: ScoredMatch,
): MatchPost {
  const { match } = scored;
  const stage = scores.stages.find(
    (candidate) => candidate.stage.id === scored.stageId,
  );
  const managerOf = managerLabels(tournament.id);
  const badgeOf = teamBadges([match.team1Id, match.team2Id]);
  const picksByTeam = [match.team1Id, match.team2Id].map((teamId) =>
    teamId === null ? [] : picksOf(scored, stage, teamId),
  );
  const postedTeamOf = (index: 0 | 1): PostedTeam => {
    const teamId = index === 0 ? match.team1Id : match.team2Id;
    const badge = badgeOf(teamId);
    return {
      name: badge.name,
      heading: withEmoji(badge.emoji, badge.label),
      roundsByMap: scored.maps.map((map) =>
        index === 0 ? map.team1Rounds : map.team2Rounds,
      ),
      score: seriesScoreLabel(
        index === 0 ? match.score1 : match.score2,
        index === 0 ? 1 : 2,
        match.forfeitWinner,
      ),
      picks: (picksByTeam[index] ?? []).map((pick) => ({
        ...namedPickOf(pick.pickable),
        stats: pick.playerStatTotals,
        points: pick.points,
        owner: pick.ownerUserId === null ? null : managerOf(pick.ownerUserId),
      })),
    };
  };
  const matchPointsOf = (userId: number) =>
    picksByTeam
      .flat()
      .filter((pick) => pick.ownerUserId === userId)
      .reduce((total, pick) => total + pick.points, 0);
  return {
    tournamentName: tournament.name,
    stageName: stage?.stage.name ?? null,
    vlrMatchUrl: matchOverviewUrl(match.vlrId),
    forfeit: match.forfeitWinner !== null,
    maps: scored.maps,
    team1: postedTeamOf(0),
    team2: postedTeamOf(1),
    standings: standingsOf(tournament.id, scores).map(
      ({ user, rank, points }) => ({
        rank,
        manager: managerOf(user.id),
        points,
        matchPoints: matchPointsOf(user.id),
      }),
    ),
  };
}

const resultIsDue = (tournamentId: number) =>
  and(
    eq(matches.tournamentId, tournamentId),
    eq(matches.status, "completed"),
    eq(matches.scrapeStatus, "ok"),
    isNull(matches.discordPostedAt),
  );

export function skipMatchResultsBacklog(tournamentId: number) {
  db.update(matches)
    .set({ discordPostedAt: new Date().toISOString() })
    .where(resultIsDue(tournamentId))
    .run();
}

export async function postMatchResults(tournament: ConnectedTournament) {
  const dueIds = new Set(
    db
      .select({ id: matches.id })
      .from(matches)
      .where(resultIsDue(tournament.id))
      .all()
      .map(({ id }) => id),
  );
  if (dueIds.size === 0) return;
  const scores = scoreTournament(tournament.id);
  for (const scored of scores.matches) {
    if (!dueIds.has(scored.match.id)) continue;
    await discord.postMessage(
      tournament.discordChannelId,
      matchPostMessage(matchPostOf(tournament, scores, scored)),
    );
    db.update(matches)
      .set({ discordPostedAt: new Date().toISOString() })
      .where(eq(matches.id, scored.match.id))
      .run();
  }
}
