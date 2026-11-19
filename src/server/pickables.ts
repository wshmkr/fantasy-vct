import type {
  Pickable,
  PickableKind,
  ScoredPickable,
} from "../shared/entities.js";
import type { pickables } from "./db/schema.js";
import type { TournamentScores } from "./points.js";

type PickableRow = typeof pickables.$inferSelect;

export function toPickable(row: PickableRow): Pickable {
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

export function toScoredPickable(
  row: PickableRow,
  scores: TournamentScores,
): ScoredPickable {
  return { ...toPickable(row), points: scores.tournamentPoints(row.id) };
}

export function coachLast(
  a: { kind: PickableKind },
  b: { kind: PickableKind },
): number {
  return Number(a.kind === "coach") - Number(b.kind === "coach");
}
