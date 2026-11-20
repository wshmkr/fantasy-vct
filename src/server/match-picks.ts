import { inArray } from "drizzle-orm";
import type { MatchPick } from "../shared/api.js";
import type { Team } from "../shared/entities.js";
import { addStatLines, ZERO_STAT_LINE } from "../shared/scoring.js";
import { db } from "./db/client.js";
import { teams } from "./db/schema.js";
import { coachLast, toPickable } from "./pickables.js";
import type { ScoredMatch, ScoredStage } from "./points.js";

export function teamLookup(teamIds: (number | null)[]) {
  const rows = db
    .select({ id: teams.id, name: teams.name, logoImageId: teams.logoImageId })
    .from(teams)
    .where(
      inArray(
        teams.id,
        teamIds.filter((id) => id !== null),
      ),
    )
    .all();
  const teamById = new Map(rows.map((team) => [team.id, team]));
  return (teamId: number | null): Team | null =>
    (teamId === null ? undefined : teamById.get(teamId)) ?? null;
}

export function ownerOf(stage: ScoredStage | undefined, pickableId: number) {
  return (
    stage?.rosterEntries.find((entry) => entry.pickableId === pickableId)
      ?.userId ?? null
  );
}

// Missing players are listed too, since a sub's stats may be credited to them.
export function picksOf(
  scored: ScoredMatch,
  stage: ScoredStage | undefined,
  teamId: number,
): MatchPick[] {
  const missingPickableIds = new Set(
    scored.pairings
      .filter((pairing) => pairing.teamId === teamId)
      .flatMap(({ pairing }) => pairing.missingPickableIds),
  );
  return (stage?.pool ?? [])
    .filter((pickable) => pickable.teamId === teamId)
    .flatMap((pickable): MatchPick[] => {
      const ownRows = scored.statRows.filter(
        (row) => row.vlrPlayerId === pickable.vlrId,
      );
      const isCoach = pickable.kind === "coach";
      if (
        !isCoach &&
        ownRows.length === 0 &&
        !missingPickableIds.has(pickable.id)
      ) {
        return [];
      }
      return [
        {
          pickable: toPickable(pickable),
          ownerUserId: ownerOf(stage, pickable.id),
          playerStatTotals:
            isCoach || ownRows.length === 0
              ? null
              : ownRows.reduce(addStatLines, ZERO_STAT_LINE),
          points: scored.pointsByPickable.get(pickable.id) ?? 0,
        },
      ];
    })
    .sort((a, b) => coachLast(a.pickable, b.pickable));
}
