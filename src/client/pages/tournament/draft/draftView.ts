import {
  type DraftSeat,
  type DraftState,
  type PickableKind,
  type PoolPickable,
  ROSTER_LIMITS,
} from "@shared/entities";

export const PLAYER_SLOTS = Array.from(
  { length: ROSTER_LIMITS.player },
  (_, slot) => slot,
);

export function draftLookups(draft: DraftState): {
  pickablesById: ReadonlyMap<number, PoolPickable>;
  teamLogos: ReadonlyMap<number, number | null>;
} {
  return {
    pickablesById: new Map(draft.pool.map((p) => [p.id, p])),
    teamLogos: new Map(draft.teams.map((t) => [t.id, t.logoImageId])),
  };
}

export function splitRoster<Item>(
  roster: Item[],
  kindOf: (item: Item) => PickableKind,
) {
  return {
    players: roster.filter((item) => kindOf(item) === "player"),
    coach: roster.find((item) => kindOf(item) === "coach"),
  };
}

export function seatRoster(
  seat: DraftSeat,
  pickablesById: ReadonlyMap<number, PoolPickable>,
) {
  const roster = seat.rosterPickableIds.flatMap(
    (id) => pickablesById.get(id) ?? [],
  );
  return splitRoster(roster, (pickable) => pickable.kind);
}

export type PoolSortKey =
  | "handle"
  | "points"
  | "formRating"
  | "formAcs"
  | "formKd";

export interface PoolSort {
  key: PoolSortKey;
  descending: boolean;
}

export function defaultPoolSort(pool: PoolPickable[]): PoolSort {
  const hasPoints = pool.some((pickable) => pickable.points !== null);
  return { key: hasPoints ? "points" : "formRating", descending: true };
}

export interface PoolFilter {
  search: string;
  kind: PickableKind;
  teamIds: ReadonlySet<number>;
}

export function nextPoolSort(current: PoolSort, key: PoolSortKey): PoolSort {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: key !== "handle" };
}

function compareByHandle(a: PoolPickable, b: PoolPickable): number {
  return a.handle.localeCompare(b.handle, undefined, { sensitivity: "base" });
}

function comparePickables({ key, descending }: PoolSort) {
  return (a: PoolPickable, b: PoolPickable): number => {
    if (key === "handle") {
      return descending ? compareByHandle(b, a) : compareByHandle(a, b);
    }
    const valueA = a[key];
    const valueB = b[key];
    if (valueA === valueB) return compareByHandle(a, b);
    if (valueA === null) return 1;
    if (valueB === null) return -1;
    return descending ? valueB - valueA : valueA - valueB;
  };
}

export function availablePool(
  pool: PoolPickable[],
  teamNames: ReadonlyMap<number, string>,
  filter: PoolFilter,
  sort: PoolSort,
): PoolPickable[] {
  const needle = filter.search.trim().toLowerCase();
  const matchesSearch = (pickable: PoolPickable) =>
    [pickable.handle, teamNames.get(pickable.teamId) ?? ""].some((name) =>
      name.toLowerCase().includes(needle),
    );
  return pool
    .filter(
      (pickable) =>
        pickable.ownerUserId === null &&
        pickable.kind === filter.kind &&
        (filter.teamIds.size === 0 || filter.teamIds.has(pickable.teamId)) &&
        matchesSearch(pickable),
    )
    .sort(comparePickables(sort));
}

export function secondsLeft(
  turnDeadline: string,
  serverNow: string,
  receivedAt: number,
  now: number,
): number {
  const serverTimeNow = Date.parse(serverNow) + (now - receivedAt);
  return Math.max(
    0,
    Math.ceil((Date.parse(turnDeadline) - serverTimeNow) / 1000),
  );
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
