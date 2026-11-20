import type { TeamSide } from "./entities.js";

const ROUNDS_TO_WIN_MAP = 13;
const OVERTIME_WIN_MARGIN = 2;

export function isFinishedMap(team1Rounds: number, team2Rounds: number) {
  return (
    Math.max(team1Rounds, team2Rounds) >= ROUNDS_TO_WIN_MAP &&
    Math.abs(team1Rounds - team2Rounds) >= OVERTIME_WIN_MARGIN
  );
}

export interface RosteredPlayer {
  pickableId: number;
  vlrPlayerId: string;
}

interface SubAssignment {
  subVlrPlayerId: string;
  replacesPickableId: number | null;
}

export interface MapSubPairing {
  missingPickableIds: number[];
  credits: SubAssignment[];
  ambiguous: boolean;
  unassignedSubVlrIds: string[];
}

// One team on one map. An unrostered pool player who plays scores for nobody and is never a sub.
export function pairSubs({
  poolPlayerVlrIds,
  rosteredPlayers,
  mapPlayerVlrIds,
  assignments,
}: {
  poolPlayerVlrIds: string[];
  rosteredPlayers: RosteredPlayer[];
  mapPlayerVlrIds: string[];
  assignments: SubAssignment[];
}): MapSubPairing {
  const missingPickableIds = rosteredPlayers
    .filter((player) => !mapPlayerVlrIds.includes(player.vlrPlayerId))
    .map((player) => player.pickableId);
  const subVlrIds = mapPlayerVlrIds.filter(
    (id) => !poolPlayerVlrIds.includes(id),
  );
  const autoPaired = missingPickableIds.length === 1 && subVlrIds.length === 1;
  const ambiguous =
    missingPickableIds.length > 0 && subVlrIds.length > 0 && !autoPaired;
  // A stored choice only holds while its player is still missing, so roster swaps or rescrapes re-raise the alert.
  const assignmentOf = (subVlrPlayerId: string) =>
    assignments.find(
      (assignment) =>
        assignment.subVlrPlayerId === subVlrPlayerId &&
        (assignment.replacesPickableId === null ||
          missingPickableIds.includes(assignment.replacesPickableId)),
    );
  const unassignedSubVlrIds = ambiguous
    ? subVlrIds.filter((subVlrPlayerId) => !assignmentOf(subVlrPlayerId))
    : [];
  const creditedPickableId = (subVlrPlayerId: string) => {
    if (missingPickableIds.length === 0) return null;
    if (autoPaired) return missingPickableIds[0] ?? null;
    return assignmentOf(subVlrPlayerId)?.replacesPickableId ?? null;
  };

  return {
    missingPickableIds,
    credits: subVlrIds.map((subVlrPlayerId) => ({
      subVlrPlayerId,
      replacesPickableId: creditedPickableId(subVlrPlayerId),
    })),
    ambiguous,
    unassignedSubVlrIds,
  };
}

export interface ScoringConfig {
  kill: number;
  death: number;
  assist: number;
  firstKill: number;
  firstDeath: number;
  threeKillRound: number;
  fourKillRound: number;
  ace: number;
  clutch: number;
  sweep: number;
  coachRoundWon: number;
  coachUnplayedMap: number;
  forfeitWin: number;
}

const DEFAULT_SCORING: ScoringConfig = {
  kill: 5,
  death: -5,
  assist: 2,
  firstKill: 5,
  firstDeath: -5,
  threeKillRound: 5,
  fourKillRound: 5,
  ace: 25,
  clutch: 10,
  sweep: 15,
  coachRoundWon: 2,
  coachUnplayedMap: 30,
  forfeitWin: 80,
};

export function scoringConfigWith(
  overrides: Partial<ScoringConfig>,
): ScoringConfig {
  return { ...DEFAULT_SCORING, ...overrides };
}

export const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

const MAP_STAT_KEYS = [
  "k",
  "d",
  "a",
  "fk",
  "fd",
  "mk3",
  "mk4",
  "aces",
  "clutches",
] as const;

export type MapStatLine = Record<(typeof MAP_STAT_KEYS)[number], number>;

export const ZERO_STAT_LINE = Object.fromEntries(
  MAP_STAT_KEYS.map((key) => [key, 0]),
) as MapStatLine;

export function addStatLines(
  total: MapStatLine,
  row: MapStatLine,
): MapStatLine {
  return Object.fromEntries(
    MAP_STAT_KEYS.map((key) => [key, total[key] + row[key]]),
  ) as MapStatLine;
}

export function mapRowPoints(
  row: MapStatLine,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  return (
    config.kill * row.k +
    config.death * row.d +
    config.assist * row.a +
    config.firstKill * row.fk +
    config.firstDeath * row.fd +
    config.threeKillRound * row.mk3 +
    config.fourKillRound * row.mk4 +
    config.ace * row.aces +
    config.clutch * row.clutches
  );
}

interface MapResult {
  ownRounds: number;
  opponentRounds: number;
}

// One team's side of a series; only saved (finished) maps are listed.
export interface TeamSeries {
  completed: boolean;
  bestOf: number;
  maps: MapResult[];
}

function mapsWonAndLost({ maps }: TeamSeries) {
  const won = maps.filter((map) => map.ownRounds > map.opponentRounds).length;
  return { won, lost: maps.length - won };
}

function wonSeries(series: TeamSeries): boolean {
  const mapsToWin = Math.floor(series.bestOf / 2) + 1;
  return series.completed && mapsWonAndLost(series).won === mapsToWin;
}

// Only a Bo3 2-0 or a Bo5 3-0 is a sweep; a Bo1 win isn't (PLAN §1.1).
const MIN_SWEEP_BEST_OF = 3;

function isSweep(series: TeamSeries): boolean {
  return (
    series.bestOf >= MIN_SWEEP_BEST_OF &&
    wonSeries(series) &&
    mapsWonAndLost(series).lost === 0
  );
}

export function sweepBonus(
  series: TeamSeries,
  playedAMap: boolean,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  return playedAMap && isSweep(series) ? config.sweep : 0;
}

// Rows are the player's own map rows plus those of every sub credited to them.
export function playerMatchPoints(
  series: TeamSeries,
  rows: MapStatLine[],
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  const statPoints = sum(rows.map((row) => mapRowPoints(row, config)));
  return statPoints + sweepBonus(series, rows.length > 0, config);
}

export function coachMatchPoints(
  series: TeamSeries,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  if (!series.completed) return 0;
  const roundsWon = sum(series.maps.map((map) => map.ownRounds));
  const unplayedMaps = series.bestOf - series.maps.length;
  return (
    config.coachRoundWon * roundsWon +
    (wonSeries(series) ? config.coachUnplayedMap * unplayedMaps : 0)
  );
}

// A forfeit's series score means nothing, so its sides read W and FF.
export function seriesScoreLabel(
  score: number | null,
  side: TeamSide,
  forfeitWinner: TeamSide | null,
): number | string | null {
  if (forfeitWinner === null) return score;
  return forfeitWinner === side ? "W" : "FF";
}

interface RankableStanding {
  points: number | null;
  bestPickPoints: number | null;
  displayName: string;
  draftSeat: number | null;
}

// Without points yet, managers keep their draft order.
export function rankStandings<Standing extends RankableStanding>(
  standings: Standing[],
): Standing[] {
  const hasPoints = standings.some((standing) => standing.points !== null);
  return [...standings].sort((a, b) =>
    hasPoints
      ? Number(a.points === null) - Number(b.points === null) ||
        (b.points ?? 0) - (a.points ?? 0) ||
        (b.bestPickPoints ?? 0) - (a.bestPickPoints ?? 0) ||
        a.displayName.localeCompare(b.displayName)
      : (a.draftSeat ?? Number.MAX_SAFE_INTEGER) -
          (b.draftSeat ?? Number.MAX_SAFE_INTEGER) ||
        a.displayName.localeCompare(b.displayName),
  );
}
