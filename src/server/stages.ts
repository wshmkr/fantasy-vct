import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import type { Stage } from "../shared/entities.js";
import { db } from "./db/client.js";
import { matches, stagePool, stages } from "./db/schema.js";
import { HttpError } from "./error-handler.js";

export type StageRow = typeof stages.$inferSelect;

export function findStage(stageId: number): StageRow {
  const row = db.select().from(stages).where(eq(stages.id, stageId)).get();
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

export function requireSetup(stage: StageRow): StageRow {
  if (stage.status !== "setup") throw new HttpError(400, "Draft started");
  return stage;
}

export function countStageMatches(row: StageRow, where?: SQL): number {
  if (row.vlrStageKeysJson.length === 0) return 0;
  return (
    db
      .select({ matches: count() })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, row.tournamentId),
          inArray(matches.stageKey, row.vlrStageKeysJson),
          where,
        ),
      )
      .get()?.matches ?? 0
  );
}

export function toStage(row: StageRow): Stage {
  const matchCount = countStageMatches(row);
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
