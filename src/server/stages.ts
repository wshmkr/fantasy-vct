import { and, count, eq, inArray } from "drizzle-orm";
import type { Stage } from "../shared/entities.js";
import { db } from "./db/client.js";
import { matches, stagePool, type stages } from "./db/schema.js";

type StageRow = typeof stages.$inferSelect;

export function toStage(row: StageRow): Stage {
  const matchCount =
    row.vlrStageKeysJson.length === 0
      ? 0
      : (db
          .select({ matches: count() })
          .from(matches)
          .where(
            and(
              eq(matches.tournamentId, row.tournamentId),
              inArray(matches.stageKey, row.vlrStageKeysJson),
            ),
          )
          .get()?.matches ?? 0);
  const poolSize =
    db
      .select({ pickables: count() })
      .from(stagePool)
      .where(and(eq(stagePool.stageId, row.id), eq(stagePool.removed, false)))
      .get()?.pickables ?? 0;
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    name: row.name,
    position: row.position,
    status: row.status,
    pickSeconds: row.pickSeconds,
    matchCount,
    poolSize,
  };
}
