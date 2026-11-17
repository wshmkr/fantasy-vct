import { and, asc, eq } from "drizzle-orm";
import type { PickableKind } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { pickables, rosterEntries, stagePool } from "../db/schema.js";

export interface DraftPoolEntry {
  pickableId: number;
  kind: PickableKind;
  ownerUserId: number | null;
}

export function draftPool(stageId: number): DraftPoolEntry[] {
  return db
    .select({
      pickableId: stagePool.pickableId,
      kind: pickables.kind,
      ownerUserId: rosterEntries.userId,
    })
    .from(stagePool)
    .innerJoin(pickables, eq(pickables.id, stagePool.pickableId))
    .leftJoin(
      rosterEntries,
      and(
        eq(rosterEntries.stageId, stagePool.stageId),
        eq(rosterEntries.pickableId, stagePool.pickableId),
      ),
    )
    .where(and(eq(stagePool.stageId, stageId), eq(stagePool.removed, false)))
    .orderBy(asc(stagePool.pickableId))
    .all();
}
