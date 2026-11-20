import type {
  MatchPick,
  MatchSub,
  MatchSummary,
  MatchTeamBase,
  MatchTeamDetail,
} from "@shared/api";
import type { MatchStatus, Stage, TeamSide } from "@shared/entities";
import {
  addStatLines,
  type MapStatLine,
  seriesScoreLabel,
} from "@shared/scoring";

export interface ScheduleDay {
  key: string;
  scheduledAt: string | null;
  matches: MatchSummary[];
}

const scheduledTime = (match: MatchSummary) =>
  match.scheduledAt === null ? Infinity : Date.parse(match.scheduledAt);

export function scheduleDays(matches: MatchSummary[]): ScheduleDay[] {
  const days = new Map<string, ScheduleDay>();
  for (const match of matches.toSorted(
    (a, b) => scheduledTime(a) - scheduledTime(b),
  )) {
    const key =
      match.scheduledAt === null
        ? "unscheduled"
        : new Date(match.scheduledAt).toDateString();
    const day = days.get(key) ?? {
      key,
      scheduledAt: match.scheduledAt,
      matches: [],
    };
    day.matches.push(match);
    days.set(key, day);
  }
  return [...days.values()];
}

export function isSelectable(match: MatchSummary): boolean {
  return (
    match.status === "completed" ||
    (match.status === "live" && match.mapCount > 0)
  );
}

export function latestCompletedMatch(
  matches: MatchSummary[],
): MatchSummary | undefined {
  return matches
    .filter((match) => match.status === "completed")
    .toSorted((a, b) => scheduledTime(a) - scheduledTime(b))
    .at(-1);
}

export function defaultMatchesStageId(
  stages: Stage[],
  matches: MatchSummary[],
): number | undefined {
  return latestCompletedMatch(matches)?.stageId ?? stages[0]?.id;
}

export function formatDay(scheduledAt: string | null): string {
  if (scheduledAt === null) return "–";
  return new Date(scheduledAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatTime(scheduledAt: string | null): string {
  if (scheduledAt === null) return "–";
  return new Date(scheduledAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export const bestOfLabel = (bestOf: number) => `BO${bestOf}`;

export function winnerSide(
  team1Score: number | null,
  team2Score: number | null,
) {
  if (team1Score === null || team2Score === null || team1Score === team2Score) {
    return null;
  }
  return team1Score > team2Score ? 1 : 2;
}

interface ScoredMatchView {
  status: MatchStatus;
  forfeitWinner: TeamSide | null;
  team1: MatchTeamBase | null;
  team2: MatchTeamBase | null;
}

// Only a completed series has a winner; a live one's lead can still flip.
export function matchWinner(match: ScoredMatchView) {
  if (match.forfeitWinner !== null) return match.forfeitWinner;
  if (match.status !== "completed") return null;
  return winnerSide(match.team1?.score ?? null, match.team2?.score ?? null);
}

export const sideScoreLabel = (match: ScoredMatchView, side: TeamSide) =>
  seriesScoreLabel(
    (side === 1 ? match.team1 : match.team2)?.score ?? null,
    side,
    match.forfeitWinner,
  );

// Subs credited to the same player across maps merge into one row; unassigned ones stay per map.
export interface SubRow {
  key: string;
  handle: string;
  stats: MapStatLine;
  unassigned: MatchSub | null;
  mapName: string | null;
}

type TeamTableRow =
  | { kind: "pick"; pick: MatchPick }
  | { kind: "sub"; sub: SubRow };

function mergeSubRows(subs: MatchSub[]): SubRow[] {
  const rows = new Map<string, SubRow>();
  for (const sub of subs) {
    const key = `${sub.vlrPlayerId}:${sub.replacesPickableId}`;
    const row = rows.get(key);
    if (row) row.stats = addStatLines(row.stats, sub.stats);
    else {
      rows.set(key, {
        key,
        handle: sub.handle,
        stats: sub.stats,
        unassigned: null,
        mapName: null,
      });
    }
  }
  return [...rows.values()];
}

export function teamTableRows(
  team: MatchTeamDetail,
  mapNameOf: (mapNo: number) => string | null,
): TeamTableRow[] {
  const settledSubs = team.subs.filter((sub) => !sub.needsAssignment);
  const unassignedSubs = team.subs.filter((sub) => sub.needsAssignment);
  const subsCreditedTo = (pickableId: number | null) =>
    mergeSubRows(
      settledSubs.filter((sub) => sub.replacesPickableId === pickableId),
    ).map((sub): TeamTableRow => ({ kind: "sub", sub }));
  const unassignedRows = unassignedSubs.map(
    (sub): TeamTableRow => ({
      kind: "sub",
      sub: {
        key: `${sub.vlrPlayerId}@${sub.mapNo}`,
        handle: sub.handle,
        stats: sub.stats,
        unassigned: sub,
        mapName: unassignedSubs.some(
          (other) => other !== sub && other.vlrPlayerId === sub.vlrPlayerId,
        )
          ? mapNameOf(sub.mapNo)
          : null,
      },
    }),
  );
  return [
    ...team.picks.flatMap((pick): TeamTableRow[] => [
      { kind: "pick", pick },
      ...subsCreditedTo(pick.pickable.id),
    ]),
    ...subsCreditedTo(null),
    ...unassignedRows,
  ];
}
