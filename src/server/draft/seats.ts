import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { stageManagers } from "../db/schema.js";

export type SeatRow = typeof stageManagers.$inferSelect;

export function seatsOf(stageId: number): SeatRow[] {
  return db
    .select()
    .from(stageManagers)
    .where(eq(stageManagers.stageId, stageId))
    .orderBy(asc(stageManagers.seat))
    .all();
}

export function seatsMatchJoined(seats: SeatRow[], userIds: number[]): boolean {
  return (
    seats.length === userIds.length &&
    seats.every((seat) => userIds.includes(seat.userId))
  );
}
