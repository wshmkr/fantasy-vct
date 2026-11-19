import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { tournaments } from "./db/schema.js";
import { HttpError } from "./error-handler.js";

export type TournamentRow = typeof tournaments.$inferSelect;

export function findTournament(tournamentId: unknown): TournamentRow {
  const row = db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, Number(tournamentId)))
    .get();
  if (!row) throw new HttpError(404, "Not found");
  return row;
}
