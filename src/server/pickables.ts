import type { Pickable } from "../shared/entities.js";
import type { pickables } from "./db/schema.js";

export function toPickable(row: typeof pickables.$inferSelect): Pickable {
  return {
    id: row.id,
    kind: row.kind,
    handle: row.handle,
    teamId: row.teamId,
    isPlaceholder: row.isPlaceholder,
    vlrUrl: row.vlrUrl,
    photoImageId: row.photoImageId,
    topAgents: row.topAgentsJson,
    formRating: row.formRating,
    formAcs: row.formAcs,
    formKd: row.formKd,
    formRounds: row.formRounds,
  };
}
