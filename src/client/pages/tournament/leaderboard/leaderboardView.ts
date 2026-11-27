import type { LeaderboardRow } from "@shared/api";
import type { PickableKind } from "@shared/entities";
import { type MapStatLine, ratio, type ScoringConfig } from "@shared/scoring";
import type { SortColumn, TableSort } from "../../../components/SortHeader";

type CountKey = keyof MapStatLine;

export type LeaderboardColumnKey =
  | "owners"
  | "maps"
  | "pickable"
  | "points"
  | "rating"
  | "acs"
  | "kd"
  | "adr"
  | "kpr"
  | "fkfd"
  | "kast"
  | CountKey
  | "bonus"
  | "roundsWon"
  | "unplayedBonus";

export type LeaderboardSort = TableSort<LeaderboardColumnKey>;

export const DEFAULT_LEADERBOARD_SORT: LeaderboardSort = {
  key: "points",
  descending: true,
};

const COUNT_COLUMNS: SortColumn<CountKey>[] = [
  { key: "k", label: "K" },
  { key: "d", label: "D" },
  { key: "a", label: "A" },
  { key: "fk", label: "FK" },
  { key: "fd", label: "FD" },
  { key: "mk3", label: "3K" },
  { key: "mk4", label: "4K" },
  { key: "aces", label: "ACE" },
  { key: "clutches", label: "CL" },
];

export const LEADERBOARD_COLUMNS: Record<
  PickableKind,
  SortColumn<LeaderboardColumnKey>[]
> = {
  player: [
    { key: "owners", label: "OWNERS", alignLeft: true },
    { key: "maps", label: "MAPS" },
    { key: "pickable", label: "PRO", alignLeft: true },
    { key: "points", label: "PTS" },
    { key: "rating", label: "R" },
    { key: "acs", label: "ACS" },
    { key: "kd", label: "K/D" },
    { key: "adr", label: "ADR" },
    { key: "kpr", label: "KPR" },
    { key: "fkfd", label: "FK:FD" },
    { key: "kast", label: "KAST" },
    ...COUNT_COLUMNS,
    { key: "bonus", label: "BONUS" },
  ],
  coach: [
    { key: "owners", label: "OWNERS", alignLeft: true },
    { key: "maps", label: "MAPS" },
    { key: "pickable", label: "COACH", alignLeft: true },
    { key: "points", label: "PTS" },
    { key: "roundsWon", label: "ROUNDS WON" },
    { key: "unplayedBonus", label: "UNPLAYED BONUS" },
    { key: "bonus", label: "BONUS" },
  ],
};

const COUNT_KEYS = new Set<LeaderboardColumnKey>(
  COUNT_COLUMNS.map(({ key }) => key),
);
const isCountKey = (key: LeaderboardColumnKey): key is CountKey =>
  COUNT_KEYS.has(key);

const TEXT_KEYS = new Set<LeaderboardColumnKey>(["owners", "pickable"]);

export function nextLeaderboardSort(
  current: LeaderboardSort,
  key: LeaderboardColumnKey,
): LeaderboardSort {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: !TEXT_KEYS.has(key) };
}

// A row whose team has no result shows – everywhere; ratios and averages need rounds.
export function columnValue(
  row: LeaderboardRow,
  key: LeaderboardColumnKey,
  ownerName: (userId: number) => string,
): number | string | null {
  if (key === "pickable") return row.pickable.handle;
  if (key === "owners") {
    const [firstOwner] = row.ownerUserIds;
    return firstOwner === undefined ? null : ownerName(firstOwner);
  }
  if (row.points === null) return null;
  if (isCountKey(key)) return row.stats[key];
  const hasRounds = row.rounds > 0;
  switch (key) {
    case "kd":
      return hasRounds ? ratio(row.stats.k, row.stats.d) : null;
    case "kpr":
      return hasRounds ? ratio(row.stats.k, row.rounds) : null;
    case "fkfd":
      return hasRounds ? ratio(row.stats.fk, row.stats.fd) : null;
    default:
      return row[key];
  }
}

const compareHandles = (a: LeaderboardRow, b: LeaderboardRow) =>
  a.pickable.handle.localeCompare(b.pickable.handle, undefined, {
    sensitivity: "base",
  });

function compareValues(
  a: number | string | null,
  b: number | string | null,
  descending: boolean,
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order =
    typeof a === "string" || typeof b === "string"
      ? String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
      : a - b;
  return descending ? -order : order;
}

export interface LeaderboardFilter {
  kind: PickableKind;
  search: string;
  teamIds: ReadonlySet<number>;
  ownerUserIds: ReadonlySet<number>;
  undrafted: boolean;
}

function matchesOwners(row: LeaderboardRow, filter: LeaderboardFilter) {
  if (filter.ownerUserIds.size === 0 && !filter.undrafted) return true;
  if (filter.undrafted && row.ownerUserIds.length === 0) return true;
  return row.ownerUserIds.some((userId) => filter.ownerUserIds.has(userId));
}

export function leaderboardRows(
  rows: LeaderboardRow[],
  filter: LeaderboardFilter,
  sort: LeaderboardSort,
  ownerName: (userId: number) => string,
): LeaderboardRow[] {
  const needle = filter.search.trim().toLowerCase();
  return rows
    .filter(
      (row) =>
        row.pickable.kind === filter.kind &&
        (filter.teamIds.size === 0 || filter.teamIds.has(row.team.id)) &&
        matchesOwners(row, filter) &&
        [row.pickable.handle, row.team.name].some((name) =>
          name.toLowerCase().includes(needle),
        ),
    )
    .sort(
      (a, b) =>
        compareValues(
          columnValue(a, sort.key, ownerName),
          columnValue(b, sort.key, ownerName),
          sort.descending,
        ) ||
        compareValues(a.bestMatchPoints, b.bestMatchPoints, true) ||
        compareHandles(a, b),
    );
}

const TWO_DECIMAL_KEYS = new Set<LeaderboardColumnKey>([
  "rating",
  "kd",
  "kpr",
  "fkfd",
]);

const formatSigned = (value: number) => {
  const magnitude = Math.abs(value).toLocaleString("en-US");
  return value < 0 ? `−${magnitude}` : magnitude;
};

export function formatColumnValue(
  key: LeaderboardColumnKey,
  value: number | string | null,
): string {
  if (value === null) return "–";
  if (typeof value === "string") return value;
  if (TWO_DECIMAL_KEYS.has(key)) return value.toFixed(2);
  if (key === "kast") return `${Math.round(value)}%`;
  return formatSigned(Math.round(value));
}

const POINTS_PER_COUNT: Partial<
  Record<LeaderboardColumnKey, (scoring: ScoringConfig) => number>
> = {
  k: (scoring) => scoring.kill,
  d: (scoring) => scoring.death,
  a: (scoring) => scoring.assist,
  fk: (scoring) => scoring.firstKill,
  fd: (scoring) => scoring.firstDeath,
  mk3: (scoring) => scoring.threeKillRound,
  mk4: (scoring) => scoring.fourKillRound,
  aces: (scoring) => scoring.ace,
  clutches: (scoring) => scoring.clutch,
  roundsWon: (scoring) => scoring.coachRoundWon,
};

// The points a count cell is worth, shown in its tooltip; null for cells that aren't counts.
export function countPoints(
  key: LeaderboardColumnKey,
  value: number | string | null,
  scoring: ScoringConfig,
): string | null {
  const pointsPer = POINTS_PER_COUNT[key];
  if (!pointsPer || typeof value !== "number") return null;
  return `${formatSigned(value * pointsPer(scoring))} pts`;
}
