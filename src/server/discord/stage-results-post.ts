import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { stages } from "../db/schema.js";
import {
  type ScoredStage,
  scoreTournament,
  type TournamentScores,
} from "../points.js";
import type { StageRow } from "../stages.js";
import { standingsOf } from "../standings.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ACCENT_COLOR,
  appUrl,
  BLANK_LINE,
  type ConnectedTournament,
  column,
  EMPTY_COLUMN,
  isScored,
  managerLabels,
  type NamedPick,
  namedPickOf,
  pickName,
  teamBadges,
  withEmoji,
} from "./format.js";

const TOP_PLAYER_COUNT = 10;

interface RankedManager {
  rank: number;
  manager: string;
  points: number | null;
}

export interface TopPlayer {
  pick: NamedPick;
  teamEmoji: string | null;
  points: number;
  // Everyone who drafted the pick; empty when nobody did.
  managers: string[];
}

export interface StageResultsPost {
  roleId: string;
  tournamentName: string;
  stageName: string;
  rostersUrl: string;
  stageStandings: RankedManager[];
  // Present only once the whole tournament is over; the post then becomes the final results.
  tournamentStandings:
    | (RankedManager & { stagePoints: number | null })[]
    | null;
  // The stage's best picks, or the whole tournament's in the final results.
  topPlayers: TopPlayer[];
}

const pointsOf = (points: number | null) => `**${points ?? 0}**`;

// At most three inline fields share a row, so the final post folds the last stage into a column.
function standingsColumns(post: StageResultsPost) {
  if (post.tournamentStandings) {
    return [
      column(
        "Tournament",
        post.tournamentStandings.map(
          ({ rank, manager }) => `${rank}. ${manager}`,
        ),
      ),
      column(
        "Total",
        post.tournamentStandings.map(({ points }) => pointsOf(points)),
      ),
      column(
        post.stageName,
        post.tournamentStandings.map(
          ({ stagePoints }) => `${stagePoints ?? 0}`,
        ),
      ),
    ];
  }
  return [
    column(
      post.stageName,
      post.stageStandings.map(({ rank, manager }) => `${rank}. ${manager}`),
    ),
    column(
      "Pts",
      post.stageStandings.map(({ points }) => pointsOf(points)),
    ),
    EMPTY_COLUMN,
  ];
}

function topPlayerColumns(topPlayers: TopPlayer[]) {
  if (topPlayers.length === 0) return [];
  return [
    column(
      `Top ${topPlayers.length} players`,
      topPlayers.map(
        ({ pick, teamEmoji }, index) =>
          `${index + 1}. ${withEmoji(teamEmoji, pickName(pick))}`,
      ),
    ),
    column(
      "Pts",
      topPlayers.map(({ points }) => pointsOf(points)),
    ),
    column(
      "Manager",
      // Undrafted picks leave the cell blank, but the line must stay so the rows line up.
      topPlayers.map(({ managers }) => managers.join(", ") || BLANK_LINE),
    ),
  ];
}

export function stageResultsMessage(post: StageResultsPost): DiscordMessage {
  const isFinal = post.tournamentStandings !== null;
  const [leader] = post.tournamentStandings ?? post.stageStandings;
  const headline = leader
    ? isFinal
      ? `🏆 ${leader.manager} wins the tournament with ${pointsOf(leader.points)} points`
      : `${leader.manager} ends ${post.stageName} with ${pointsOf(leader.points)} points`
    : null;
  return {
    content: `<@&${post.roleId}>`,
    embeds: [
      {
        title: isFinal ? "Final results" : `${post.stageName} results`,
        url: post.rostersUrl,
        description: headline ?? undefined,
        color: ACCENT_COLOR,
        fields: [
          ...standingsColumns(post),
          ...topPlayerColumns(post.topPlayers),
        ],
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: { roles: [post.roleId] },
  };
}

function topPlayersOf(
  scoredStages: ScoredStage[],
  pointsOfPickable: (pickableId: number) => number | null,
  managerOf: (userId: number) => string,
): TopPlayer[] {
  const pickables = new Map(
    scoredStages.flatMap(({ pool }) => pool.map((pick) => [pick.id, pick])),
  );
  const best = [...pickables.values()]
    .flatMap((pickable) => {
      const points = pointsOfPickable(pickable.id);
      return points === null ? [] : [{ pickable, points }];
    })
    .sort((a, b) => b.points - a.points)
    .slice(0, TOP_PLAYER_COUNT);
  const badgeOf = teamBadges(best.map(({ pickable }) => pickable.teamId));
  return best.map(({ pickable, points }) => ({
    pick: namedPickOf(pickable),
    teamEmoji: badgeOf(pickable.teamId).emoji,
    points,
    managers: [
      ...new Set(
        scoredStages.flatMap(({ rosterEntries }) =>
          rosterEntries
            .filter(({ pickableId }) => pickableId === pickable.id)
            .map(({ userId }) => userId),
        ),
      ),
    ].map(managerOf),
  }));
}

export function stageResultsPostOf(
  tournament: ConnectedTournament,
  scores: TournamentScores,
  stage: StageRow,
  isFinal: boolean,
): StageResultsPost {
  const standings = standingsOf(tournament.id, scores);
  const managerOf = managerLabels(tournament.id);
  const scoredStage = scores.stages.find(
    (scored) => scored.stage.id === stage.id,
  );
  return {
    roleId: tournament.discordRoleId,
    tournamentName: tournament.name,
    stageName: stage.name,
    rostersUrl: appUrl(tournament.id, "rosters"),
    stageStandings: standings
      .flatMap(({ user, stages: byStage }) => {
        const row = byStage.find(({ stageId }) => stageId === stage.id);
        return row
          ? [
              {
                rank: row.rank,
                manager: managerOf(user.id),
                points: row.points,
              },
            ]
          : [];
      })
      .sort((a, b) => a.rank - b.rank),
    tournamentStandings: isFinal
      ? standings.map(({ user, rank, points, stages: byStage }) => ({
          rank,
          manager: managerOf(user.id),
          points,
          stagePoints:
            byStage.find(({ stageId }) => stageId === stage.id)?.points ?? null,
        }))
      : null,
    topPlayers: isFinal
      ? topPlayersOf(scores.stages, scores.tournamentPoints, managerOf)
      : topPlayersOf(
          scoredStage ? [scoredStage] : [],
          (pickableId) => scoredStage?.pointsByPickable.get(pickableId) ?? null,
          managerOf,
        ),
  };
}

// A drafted stage is over once every one of its matches is completed and scored.
function dueStageResults(tournamentId: number) {
  const unposted = db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.tournamentId, tournamentId),
        eq(stages.status, "complete"),
        isNull(stages.discordResultsPostedAt),
      ),
    )
    .orderBy(asc(stages.position))
    .all();
  if (unposted.length === 0) return null;
  const scores = scoreTournament(tournamentId);
  const scoredMatches = scores.matches.map(({ match }) => match);
  const tournamentIsOver =
    scoredMatches.length > 0 && scoredMatches.every(isScored);
  const lastStageId = scores.stages.at(-1)?.stage.id;
  const due = unposted.filter((stage) => {
    const stageMatches = scores.matches
      .filter(({ stageId }) => stageId === stage.id)
      .map(({ match }) => match);
    return stageMatches.length > 0 && stageMatches.every(isScored);
  });
  // Only the last stage, once every match is scored, becomes the final results.
  return { scores, due, finalStageId: tournamentIsOver ? lastStageId : null };
}

const markResultsPosted = (stageId: number) =>
  db
    .update(stages)
    .set({ discordResultsPostedAt: new Date().toISOString() })
    .where(eq(stages.id, stageId))
    .run();

export function skipStageResultsBacklog(tournamentId: number) {
  for (const stage of dueStageResults(tournamentId)?.due ?? []) {
    markResultsPosted(stage.id);
  }
}

export async function postStageResults(tournament: ConnectedTournament) {
  const results = dueStageResults(tournament.id);
  if (!results) return;
  for (const stage of results.due) {
    await discord.postMessage(
      tournament.discordChannelId,
      stageResultsMessage(
        stageResultsPostOf(
          tournament,
          results.scores,
          stage,
          stage.id === results.finalStageId,
        ),
      ),
    );
    markResultsPosted(stage.id);
  }
}
