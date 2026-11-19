import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  coachMatchPoints,
  type MapSubPairing,
  pairSubs,
  playerMatchPoints,
  type ScoringConfig,
  scoringConfigWith,
  sum,
  swissPhantomPoints,
  type TeamSeries,
} from "../shared/scoring.js";
import { db } from "./db/client.js";
import {
  matches,
  matchMaps,
  pickables,
  playerMapStats,
  rosterEntries,
  stagePool,
  stages,
  subAssignments,
} from "./db/schema.js";
import type { StageRow } from "./stages.js";
import { findTournament } from "./tournaments.js";

type MatchRow = typeof matches.$inferSelect;
type MatchMapRow = typeof matchMaps.$inferSelect;
type StatRow = typeof playerMapStats.$inferSelect;
type SubAssignmentRow = typeof subAssignments.$inferSelect;
type PickableRow = typeof pickables.$inferSelect;

interface RosterEntry {
  userId: number;
  pickableId: number;
}

interface TeamMapPairing {
  mapNo: number;
  teamId: number;
  pairing: MapSubPairing;
}

interface StageRosters {
  stage: StageRow;
  pool: PickableRow[];
  rosterEntries: RosterEntry[];
  rosteredPickableIds: Set<number>;
}

interface MatchRows {
  maps: MatchMapRow[];
  statRows: StatRow[];
  assignments: SubAssignmentRow[];
}

export interface ScoredMatch {
  match: MatchRow;
  stageId: number | null;
  maps: MatchMapRow[];
  statRows: StatRow[];
  pairings: TeamMapPairing[];
  pointsByPickable: Map<number, number>;
  needsAttention: boolean;
}

export interface ScoredStage {
  stage: StageRow;
  pool: PickableRow[];
  rosterEntries: RosterEntry[];
  hasPoints: boolean;
  pointsByPickable: Map<number, number | null>;
}

export interface TournamentScores {
  stages: ScoredStage[];
  matches: ScoredMatch[];
  tournamentPoints: (pickableId: number) => number | null;
}

function groupByMatchId<Row extends { matchId: number }>(
  rows: Row[],
): Map<number, Row[]> {
  const byMatchId = new Map<number, Row[]>();
  for (const row of rows) {
    byMatchId.set(row.matchId, [...(byMatchId.get(row.matchId) ?? []), row]);
  }
  return byMatchId;
}

function teamSeriesOf(
  match: MatchRow,
  maps: MatchMapRow[],
  teamId: number,
): TeamSeries {
  const isTeam1 = match.team1Id === teamId;
  return {
    completed: match.status === "completed",
    bestOf: match.bestOf,
    maps: maps.map((map) => ({
      ownRounds: isTeam1 ? map.team1Rounds : map.team2Rounds,
      opponentRounds: isTeam1 ? map.team2Rounds : map.team1Rounds,
    })),
  };
}

// Uses the series score, not saved maps, so a Swiss win counts even when its scrape failed.
function wonMatch(match: MatchRow, teamId: number): boolean {
  const [own, opponent] =
    match.team1Id === teamId
      ? [match.score1, match.score2]
      : [match.score2, match.score1];
  return (own ?? 0) > (opponent ?? 0);
}

const teamIdsOf = (match: MatchRow) =>
  [match.team1Id, match.team2Id].filter((id) => id !== null);

function pairTeamMaps(
  match: MatchRow,
  { maps, statRows, assignments }: MatchRows,
  {
    pool,
    rosteredPickableIds,
  }: Pick<StageRosters, "pool" | "rosteredPickableIds">,
): TeamMapPairing[] {
  return teamIdsOf(match).flatMap((teamId) => {
    const poolPlayers = pool.filter(
      (pickable) => pickable.teamId === teamId && pickable.kind === "player",
    );
    const poolPlayerVlrIds = poolPlayers.flatMap((player) =>
      player.vlrId === null ? [] : [player.vlrId],
    );
    const rosteredPlayers = poolPlayers.flatMap((player) =>
      player.vlrId !== null && rosteredPickableIds.has(player.id)
        ? [{ pickableId: player.id, vlrPlayerId: player.vlrId }]
        : [],
    );
    return maps.map(({ mapNo }) => ({
      mapNo,
      teamId,
      pairing: pairSubs({
        poolPlayerVlrIds,
        rosteredPlayers,
        mapPlayerVlrIds: statRows
          .filter((row) => row.mapNo === mapNo && row.teamId === teamId)
          .map((row) => row.vlrPlayerId),
        assignments: assignments.filter(
          (assignment) => assignment.mapNo === mapNo,
        ),
      }),
    }));
  });
}

function scoredRowsOf(
  pickable: PickableRow,
  statRows: StatRow[],
  pairings: TeamMapPairing[],
): StatRow[] {
  const creditedSubRows = pairings.flatMap(({ mapNo, pairing }) =>
    pairing.credits
      .filter((credit) => credit.replacesPickableId === pickable.id)
      .flatMap((credit) =>
        statRows.filter(
          (row) =>
            row.mapNo === mapNo && row.vlrPlayerId === credit.subVlrPlayerId,
        ),
      ),
  );
  return [
    ...statRows.filter((row) => row.vlrPlayerId === pickable.vlrId),
    ...creditedSubRows,
  ];
}

const UNSTAGED = { pool: [], rosteredPickableIds: new Set<number>() };

function scoreMatch(
  match: MatchRow,
  rows: MatchRows,
  rosters: StageRosters | undefined,
  config: ScoringConfig,
): ScoredMatch {
  const pairings = pairTeamMaps(match, rows, rosters ?? UNSTAGED);
  const pointsByPickable = new Map<number, number>();
  for (const pickable of rosters?.pool ?? []) {
    if (!teamIdsOf(match).includes(pickable.teamId)) continue;
    const series = teamSeriesOf(match, rows.maps, pickable.teamId);
    pointsByPickable.set(
      pickable.id,
      pickable.kind === "coach"
        ? coachMatchPoints(series, config)
        : playerMatchPoints(
            series,
            scoredRowsOf(pickable, rows.statRows, pairings),
            config,
          ),
    );
  }
  return {
    match,
    stageId: rosters?.stage.id ?? null,
    maps: rows.maps,
    statRows: rows.statRows,
    pairings,
    pointsByPickable,
    needsAttention:
      match.scrapeStatus === "failed" ||
      pairings.some(({ pairing }) => pairing.unassignedSubVlrIds.length > 0),
  };
}

function stagePointsOf(
  pickable: PickableRow,
  stage: StageRow,
  stageMatches: ScoredMatch[],
): number | null {
  const teamMatches = stageMatches.filter(({ match }) =>
    teamIdsOf(match).includes(pickable.teamId),
  );
  if (!teamMatches.some(({ maps }) => maps.length > 0)) return null;
  const teamSeries = teamMatches.map(({ match, pointsByPickable }) => ({
    completed: match.status === "completed",
    won: wonMatch(match, pickable.teamId),
    scrapeOk: match.scrapeStatus === "ok",
    points: pointsByPickable.get(pickable.id) ?? 0,
  }));
  const phantomPoints =
    stage.format === "swiss" && stage.swissWins !== null
      ? swissPhantomPoints(stage.swissWins, teamSeries)
      : 0;
  return sum(teamSeries.map((series) => series.points)) + phantomPoints;
}

// Everything is computed on read from one load of the tournament; nothing stores a point total.
export function scoreTournament(tournamentId: number): TournamentScores {
  const config = scoringConfigWith(findTournament(tournamentId).scoringJson);

  const stageRows = db
    .select()
    .from(stages)
    .where(eq(stages.tournamentId, tournamentId))
    .orderBy(asc(stages.position))
    .all();
  const stageIds = stageRows.map((stage) => stage.id);
  const matchRows = db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .orderBy(
      sql`${matches.scheduledAt} is null`,
      asc(matches.scheduledAt),
      asc(matches.id),
    )
    .all();
  const matchIds = matchRows.map((match) => match.id);
  const mapsByMatchId = groupByMatchId(
    db
      .select()
      .from(matchMaps)
      .where(inArray(matchMaps.matchId, matchIds))
      .orderBy(asc(matchMaps.mapNo))
      .all(),
  );
  const statRowsByMatchId = groupByMatchId(
    db
      .select()
      .from(playerMapStats)
      .where(inArray(playerMapStats.matchId, matchIds))
      .all(),
  );
  const assignmentsByMatchId = groupByMatchId(
    db
      .select()
      .from(subAssignments)
      .where(inArray(subAssignments.matchId, matchIds))
      .all(),
  );
  // Removed pool entries stay in: a removed player who plays is still not a sub.
  const poolRows = db
    .select({ stageId: stagePool.stageId, pickable: pickables })
    .from(stagePool)
    .innerJoin(pickables, eq(pickables.id, stagePool.pickableId))
    .where(inArray(stagePool.stageId, stageIds))
    .orderBy(asc(pickables.id))
    .all();
  const rosterRows = db
    .select({
      stageId: rosterEntries.stageId,
      userId: rosterEntries.userId,
      pickableId: rosterEntries.pickableId,
    })
    .from(rosterEntries)
    .where(inArray(rosterEntries.stageId, stageIds))
    // rowid is insertion order, and swaps update in place, so slots stay put.
    .orderBy(sql`rowid`)
    .all();

  const stageRosters: StageRosters[] = stageRows.map((stage) => {
    const stageRosterEntries = rosterRows.filter(
      (row) => row.stageId === stage.id,
    );
    return {
      stage,
      pool: poolRows
        .filter((row) => row.stageId === stage.id)
        .map((row) => row.pickable),
      rosterEntries: stageRosterEntries,
      rosteredPickableIds: new Set(
        stageRosterEntries.map((row) => row.pickableId),
      ),
    };
  });

  const scoredMatches = matchRows.map((match) =>
    scoreMatch(
      match,
      {
        maps: mapsByMatchId.get(match.id) ?? [],
        statRows: statRowsByMatchId.get(match.id) ?? [],
        assignments: assignmentsByMatchId.get(match.id) ?? [],
      },
      stageRosters.find(({ stage }) =>
        stage.vlrStageKeysJson.includes(match.stageKey),
      ),
      config,
    ),
  );

  const scoredStages = stageRosters.map(({ stage, pool, rosterEntries }) => {
    const stageMatches = scoredMatches.filter(
      (scored) => scored.stageId === stage.id,
    );
    return {
      stage,
      pool,
      rosterEntries,
      hasPoints: stageMatches.some(({ maps }) => maps.length > 0),
      pointsByPickable: new Map(
        pool.map((pickable) => [
          pickable.id,
          stagePointsOf(pickable, stage, stageMatches),
        ]),
      ),
    };
  });

  return {
    stages: scoredStages,
    matches: scoredMatches,
    tournamentPoints: (pickableId) => {
      const stagePoints = scoredStages.flatMap(({ pointsByPickable }) => {
        const points = pointsByPickable.get(pickableId);
        return points === null || points === undefined ? [] : [points];
      });
      return stagePoints.length === 0 ? null : sum(stagePoints);
    },
  };
}
