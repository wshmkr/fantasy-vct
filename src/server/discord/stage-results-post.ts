import { and, asc, eq, isNull } from "drizzle-orm";
import type { PickableKind } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { stages } from "../db/schema.js";
import {
  type ScoredMatch,
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
  isScored,
  managerLabels,
  rows,
  teamBadges,
  withEmoji,
} from "./format.js";

const LISTED_COUNT = { player: 10, coach: 3 } as const;

interface RankedManager {
  rank: number;
  manager: string;
  points: number | null;
}

export interface RankedPick {
  // The handle, or the team's name for a placeholder coach. The headings already say which
  // lists hold coaches, and a field holds only 1024 characters, so there's no (C) or VLR link.
  name: string;
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
  // The stage's best and worst picks, or the whole tournament's in the final results.
  players: TopAndBottom;
  coaches: TopAndBottom;
}

export interface TopAndBottom {
  top: RankedPick[];
  // Worst first.
  bottom: RankedPick[];
}

const pointsOf = (points: number | null) => `**${points ?? 0}**`;

function standingsRows(post: StageResultsPost) {
  if (post.tournamentStandings) {
    return rows(
      "Tournament",
      post.tournamentStandings.map(
        ({ rank, manager, points, stagePoints }) =>
          `${rank}. ${manager} · ${pointsOf(points)} (${post.stageName} ${stagePoints ?? 0})`,
      ),
    );
  }
  return rows(
    post.stageName,
    post.stageStandings.map(
      ({ rank, manager, points }) =>
        `${rank}. ${manager} · ${pointsOf(points)}`,
    ),
  );
}

// "1. :team: **aspas** · **120** · @manager"
function rankedColumn(name: string, picks: RankedPick[]) {
  return column(
    name,
    picks.map(({ name: pickName, teamEmoji, points, managers }, index) =>
      [
        `${index + 1}. ${withEmoji(teamEmoji, `**${pickName}**`)}`,
        pointsOf(points),
        ...(managers.length > 0 ? [managers.join(", ")] : []),
      ].join(" · "),
    ),
  );
}

const kindLabel = { player: "players", coach: "coaches" } as const;

// Top and bottom sit side by side. The two lists don't share rows, so mentions can't misalign them.
function topAndBottomColumns(
  kind: PickableKind,
  { top, bottom }: TopAndBottom,
  { newRow = false } = {},
) {
  if (top.length === 0) return [];
  return [
    // At most three columns share a row; a blank full-width field starts a new one.
    ...(newRow ? [{ name: BLANK_LINE, value: BLANK_LINE }] : []),
    rankedColumn(`Top ${top.length} ${kindLabel[kind]}`, top),
    rankedColumn(`Bottom ${bottom.length} ${kindLabel[kind]}`, bottom),
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
          standingsRows(post),
          ...topAndBottomColumns("player", post.players),
          ...topAndBottomColumns("coach", post.coaches, { newRow: true }),
        ],
        footer: { text: post.tournamentName },
      },
    ],
    allowed_mentions: { roles: [post.roleId] },
  };
}

export interface RankingScope {
  scoredStages: ScoredStage[];
  scoredMatches: ScoredMatch[];
  pointsOfPickable: (pickableId: number) => number | null;
}

// Players who never took the map would crowd the bottom with zeros, so only those who played rank.
export function rankedPicksOf(
  { scoredStages, scoredMatches, pointsOfPickable }: RankingScope,
  managerOf: (userId: number) => string,
): Record<PickableKind, TopAndBottom> {
  const playedVlrIds = new Set(
    scoredMatches.flatMap(({ statRows }) =>
      statRows.map((row) => row.vlrPlayerId),
    ),
  );
  const pickables = new Map(
    scoredStages.flatMap(({ pool }) => pool.map((pick) => [pick.id, pick])),
  );
  const scored = [...pickables.values()]
    .flatMap((pickable) => {
      const points = pointsOfPickable(pickable.id);
      return points === null ? [] : [{ pickable, points }];
    })
    .sort((a, b) => b.points - a.points);
  const badgeOf = teamBadges(scored.map(({ pickable }) => pickable.teamId));
  const ranked = ({ pickable, points }: (typeof scored)[number]) => ({
    name: pickable.isPlaceholder
      ? badgeOf(pickable.teamId).name
      : pickable.handle,
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
  });
  const topAndBottom = (kind: PickableKind): TopAndBottom => {
    const ofKind = scored.filter(
      ({ pickable }) =>
        pickable.kind === kind &&
        (kind === "coach" || playedVlrIds.has(pickable.vlrId ?? "")),
    );
    const count = LISTED_COUNT[kind];
    return {
      top: ofKind.slice(0, count).map(ranked),
      // Starts after the top list, so a small pool never lists a pick twice.
      bottom: ofKind
        .slice(Math.max(count, ofKind.length - count))
        .reverse()
        .map(ranked),
    };
  };
  return { player: topAndBottom("player"), coach: topAndBottom("coach") };
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
  const ranked = rankedPicksOf(
    isFinal
      ? {
          scoredStages: scores.stages,
          scoredMatches: scores.matches,
          pointsOfPickable: scores.tournamentPoints,
        }
      : {
          scoredStages: scoredStage ? [scoredStage] : [],
          scoredMatches: scores.matches.filter(
            ({ stageId }) => stageId === stage.id,
          ),
          pointsOfPickable: (pickableId) =>
            scoredStage?.pointsByPickable.get(pickableId) ?? null,
        },
    managerOf,
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
    players: ranked.player,
    coaches: ranked.coach,
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
