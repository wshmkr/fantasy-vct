import { and, eq, inArray } from "drizzle-orm";
import type {
  LeaderboardResponse,
  LeaderboardRow,
  LeaderboardScope,
} from "../shared/api.js";
import {
  addStatLines,
  coachMatchPoints,
  type MapStatLine,
  mapRowPoints,
  type RoundsWeightedValue,
  roundsWeightedAverage,
  type ScoringConfig,
  sum,
  ZERO_STAT_LINE,
} from "../shared/scoring.js";
import { db } from "./db/client.js";
import { type pickables, stagePool } from "./db/schema.js";
import { teamLookup } from "./match-picks.js";
import { toPickable } from "./pickables.js";
import {
  hasResult,
  type ScoredMatch,
  type ScoredStage,
  scoredRowsOf,
  scoreTournament,
  teamIdsOf,
  teamSeriesOf,
} from "./points.js";

type PickableRow = typeof pickables.$inferSelect;

const AVERAGE_KEYS = ["rating", "acs", "kast", "adr"] as const;
type AverageKey = (typeof AVERAGE_KEYS)[number];

// Averages keep their per-map values so Total can re-weight across stages.
interface Tally {
  pickable: PickableRow;
  ownerUserIds: number[];
  maps: number;
  rounds: number;
  points: number | null;
  bestMatchPoints: number | null;
  bonus: number;
  stats: MapStatLine;
  averages: Record<AverageKey, RoundsWeightedValue[]>;
  subHandles: string[];
  roundsWon: number;
  unplayedBonus: number;
}

const unique = <Value>(values: Value[]) => [...new Set(values)];

const maxOrNull = (values: (number | null)[]) => {
  const known = values.filter((value) => value !== null);
  return known.length === 0 ? null : Math.max(...known);
};

function emptyTally(pickable: PickableRow, stage: ScoredStage): Tally {
  return {
    pickable,
    ownerUserIds: stage.rosterEntries
      .filter((entry) => entry.pickableId === pickable.id)
      .map((entry) => entry.userId),
    maps: 0,
    rounds: 0,
    points: stage.pointsByPickable.get(pickable.id) ?? null,
    bestMatchPoints: null,
    bonus: 0,
    stats: ZERO_STAT_LINE,
    averages: { rating: [], acs: [], kast: [], adr: [] },
    subHandles: [],
    roundsWon: 0,
    unplayedBonus: 0,
  };
}

function addPlayerMatch(
  tally: Tally,
  scored: ScoredMatch,
  matchPoints: number,
  config: ScoringConfig,
) {
  const { pickable } = tally;
  const rows = scoredRowsOf(pickable, scored.statRows, scored.pairings);
  for (const row of rows) {
    const map = scored.maps.find(({ mapNo }) => mapNo === row.mapNo);
    const rounds = map ? map.team1Rounds + map.team2Rounds : 0;
    tally.maps += 1;
    tally.rounds += rounds;
    tally.stats = addStatLines(tally.stats, row);
    for (const key of AVERAGE_KEYS) {
      tally.averages[key].push({ value: row[key], rounds });
    }
    if (row.vlrPlayerId !== pickable.vlrId) {
      tally.subHandles = unique([...tally.subHandles, row.handle]);
    }
  }
  tally.bonus +=
    matchPoints - sum(rows.map((row) => mapRowPoints(row, config)));
}

// Counts only completed series, like coach points, so a live series never shows maps PTS doesn't include.
function addCoachMatch(
  tally: Tally,
  { match, maps }: ScoredMatch,
  matchPoints: number,
  config: ScoringConfig,
) {
  if (match.forfeitWinner !== null) {
    tally.bonus += matchPoints;
    return;
  }
  if (match.status !== "completed") return;
  const series = teamSeriesOf(match, maps, tally.pickable.teamId);
  const roundsWon = sum(series.maps.map((map) => map.ownRounds));
  const coachPoints = coachMatchPoints(series, config);
  tally.maps += maps.length;
  tally.roundsWon += roundsWon;
  tally.unplayedBonus += coachPoints - config.coachRoundWon * roundsWon;
  tally.bonus += matchPoints - coachPoints;
}

function stageTallies(
  stage: ScoredStage,
  stageMatches: ScoredMatch[],
  removedPickableIds: Set<number>,
  config: ScoringConfig,
): Tally[] {
  return stage.pool
    .filter((pickable) => !removedPickableIds.has(pickable.id))
    .map((pickable) => {
      const tally = emptyTally(pickable, stage);
      for (const scored of stageMatches) {
        if (!teamIdsOf(scored.match).includes(pickable.teamId)) continue;
        const matchPoints = scored.pointsByPickable.get(pickable.id) ?? 0;
        if (hasResult(scored)) {
          tally.bestMatchPoints = maxOrNull([
            tally.bestMatchPoints,
            matchPoints,
          ]);
        }
        if (pickable.kind === "player") {
          addPlayerMatch(tally, scored, matchPoints, config);
        } else {
          addCoachMatch(tally, scored, matchPoints, config);
        }
      }
      return tally;
    });
}

function combineTallies(total: Tally, stage: Tally): Tally {
  const points = [total.points, stage.points].filter((value) => value !== null);
  return {
    pickable: total.pickable,
    ownerUserIds: unique([...total.ownerUserIds, ...stage.ownerUserIds]),
    maps: total.maps + stage.maps,
    rounds: total.rounds + stage.rounds,
    points: points.length === 0 ? null : sum(points),
    bestMatchPoints: maxOrNull([total.bestMatchPoints, stage.bestMatchPoints]),
    bonus: total.bonus + stage.bonus,
    stats: addStatLines(total.stats, stage.stats),
    averages: {
      rating: [...total.averages.rating, ...stage.averages.rating],
      acs: [...total.averages.acs, ...stage.averages.acs],
      kast: [...total.averages.kast, ...stage.averages.kast],
      adr: [...total.averages.adr, ...stage.averages.adr],
    },
    subHandles: unique([...total.subHandles, ...stage.subHandles]),
    roundsWon: total.roundsWon + stage.roundsWon,
    unplayedBonus: total.unplayedBonus + stage.unplayedBonus,
  };
}

function totalTallies(tallyLists: Tally[][]): Tally[] {
  const byPickableId = new Map<number, Tally>();
  for (const tally of tallyLists.flat()) {
    const total = byPickableId.get(tally.pickable.id);
    byPickableId.set(
      tally.pickable.id,
      total ? combineTallies(total, tally) : tally,
    );
  }
  return [...byPickableId.values()];
}

function removedPickableIdsByStage(stageIds: number[]) {
  const removed = db
    .select({ stageId: stagePool.stageId, pickableId: stagePool.pickableId })
    .from(stagePool)
    .where(
      and(inArray(stagePool.stageId, stageIds), eq(stagePool.removed, true)),
    )
    .all();
  return (stageId: number) =>
    new Set(
      removed
        .filter((entry) => entry.stageId === stageId)
        .map((entry) => entry.pickableId),
    );
}

export function leaderboardOf(tournamentId: number): LeaderboardResponse {
  const scores = scoreTournament(tournamentId);
  const removedFrom = removedPickableIdsByStage(
    scores.stages.map(({ stage }) => stage.id),
  );
  const tallyLists = scores.stages.map((scored) =>
    stageTallies(
      scored,
      scores.matches.filter(({ stageId }) => stageId === scored.stage.id),
      removedFrom(scored.stage.id),
      scores.config,
    ),
  );
  const totals = totalTallies(tallyLists);
  const teamOf = teamLookup(totals.map(({ pickable }) => pickable.teamId));

  const toRow = ({ pickable, averages, ...tally }: Tally): LeaderboardRow[] => {
    const team = teamOf(pickable.teamId);
    if (!team) return [];
    return [
      {
        ...tally,
        pickable: toPickable(pickable),
        team,
        rating: roundsWeightedAverage(averages.rating),
        acs: roundsWeightedAverage(averages.acs),
        kast: roundsWeightedAverage(averages.kast),
        adr: roundsWeightedAverage(averages.adr),
      },
    ];
  };
  const scopes: LeaderboardScope[] = [
    { stageId: null, rows: totals.flatMap(toRow) },
    ...scores.stages.map(({ stage }, index) => ({
      stageId: stage.id,
      rows: (tallyLists[index] ?? []).flatMap(toRow),
    })),
  ];
  return { scoring: scores.config, scopes };
}
