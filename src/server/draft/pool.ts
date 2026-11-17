import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { stagePool } from "../db/schema.js";

export function draftablePickableIds(stageId: number): number[] {
  return db
    .select({ pickableId: stagePool.pickableId })
    .from(stagePool)
    .where(and(eq(stagePool.stageId, stageId), eq(stagePool.removed, false)))
    .all()
    .map((entry) => entry.pickableId);
}
