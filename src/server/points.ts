import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  coachMatchPoints,
  type MapSubPairing,
  pairSubs,
  playerMatchPoints,
  type ScoringConfig,
  scoringConfigWith,
  sum,
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
  // Players with stat rows (their own or a credited sub's), coaches whose team played, and
  // everyone on a forfeit's teams. A benched player's 0 doesn't count as taking part.
  participantIds: Set<number>;
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

const teamIdsOf = (match: MatchRow) =>
  [match.team1Id, match.team2Id].filter((id) => id !== null);

const forfeitWinnerTeamId = (match: MatchRow) =>
  match.forfeitWinner === 1 ? match.team1Id : match.team2Id;

const hasResult = ({ match, maps }: ScoredMatch) =>
  maps.length > 0 || match.forfeitWinner !== null;

// A forfeit scores every pickable of the winning team alike: no stats, sweep or coach formula.
function pickableMatchPoints(
  pickable: PickableRow,
  match: MatchRow,
  rows: MatchRows,
  pairings: TeamMapPairing[],
  config: ScoringConfig,
): number {
  if (match.forfeitWinner !== null) {
    return forfeitWinnerTeamId(match) === pickable.teamId
      ? config.forfeitWin
      : 0;
  }
  const series = teamSeriesOf(match, rows.maps, pickable.teamId);
  return pickable.kind === "coach"
    ? coachMatchPoints(series, config)
    : playerMatchPoints(
        series,
        scoredRowsOf(pickable, rows.statRows, pairings),
        config,
      );
}

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
  const participantIds = new Set<number>();
  for (const pickable of rosters?.pool ?? []) {
    if (!teamIdsOf(match).includes(pickable.teamId)) continue;
    pointsByPickable.set(
      pickable.id,
      pickableMatchPoints(pickable, match, rows, pairings, config),
    );
    const tookPart =
      match.forfeitWinner !== null ||
      (pickable.kind === "coach"
        ? rows.maps.length > 0
        : scoredRowsOf(pickable, rows.statRows, pairings).length > 0);
    if (tookPart) participantIds.add(pickable.id);
  }
  return {
    match,
    stageId: rosters?.stage.id ?? null,
    maps: rows.maps,
    statRows: rows.statRows,
    pairings,
    pointsByPickable,
    participantIds,
    needsAttention:
      match.scrapeStatus === "failed" ||
      pairings.some(({ pairing }) => pairing.unassignedSubVlrIds.length > 0),
  };
}

function stagePointsOf(
  pickable: PickableRow,
  stageMatches: ScoredMatch[],
): number | null {
  const teamMatches = stageMatches.filter(({ match }) =>
    teamIdsOf(match).includes(pickable.teamId),
  );
  if (!teamMatches.some(hasResult)) return null;
  return sum(
    teamMatches.map(
      ({ pointsByPickable }) => pointsByPickable.get(pickable.id) ?? 0,
    ),
  );
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
      hasPoints: stageMatches.some(hasResult),
      pointsByPickable: new Map(
        pool.map((pickable) => [
          pickable.id,
          stagePointsOf(pickable, stageMatches),
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
