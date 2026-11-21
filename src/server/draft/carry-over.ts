import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches, rosterEntries, stagePool, stages } from "../db/schema.js";
import { countStageMatches, type StageRow } from "../stages.js";
import { seatsMatchJoined, seatsOf } from "./seats.js";

export interface CarriedPick {
  userId: number;
  pickableId: number;
  kept: boolean;
}

export function previousStageOf(stage: StageRow): StageRow | undefined {
  return db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.tournamentId, stage.tournamentId),
        lt(stages.position, stage.position),
      ),
    )
    .orderBy(desc(stages.position))
    .get();
}

// A pick is kept only if its team made the next stage's pool; the rest were eliminated.
export function carriedPicks(
  previous: StageRow,
  nextStageId: number,
): CarriedPick[] {
  return (
    db
      .select({
        userId: rosterEntries.userId,
        pickableId: rosterEntries.pickableId,
        poolPickableId: stagePool.pickableId,
      })
      .from(rosterEntries)
      .leftJoin(
        stagePool,
        and(
          eq(stagePool.stageId, nextStageId),
          eq(stagePool.pickableId, rosterEntries.pickableId),
          eq(stagePool.removed, false),
        ),
      )
      .where(eq(rosterEntries.stageId, previous.id))
      // rowid is insertion order, and swaps update in place, so slots stay put.
      .orderBy(sql`${rosterEntries}.rowid`)
      .all()
      .map(({ userId, pickableId, poolPickableId }) => ({
        userId,
        pickableId,
        kept: poolPickableId !== null,
      }))
  );
}

// Eliminations are only known once every match of the stage has been played.
export function isStageFinished(stage: StageRow): boolean {
  return (
    stage.status === "complete" &&
    countStageMatches(stage, ne(matches.status, "completed")) === 0
  );
}

// Reversed, so whoever picked last in the previous stage picks first now.
export function reversedSeats(
  previous: StageRow,
  userIds: number[],
): number[] | undefined {
  const seats = seatsOf(previous.id);
  if (!seatsMatchJoined(seats, userIds)) return undefined;
  return seats.map((seat) => seat.userId).reverse();
}
