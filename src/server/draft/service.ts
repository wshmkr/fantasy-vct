import { and, desc, eq } from "drizzle-orm";
import type { DraftActionBody } from "../../shared/api.js";
import {
  type DraftControl,
  hasRoomFor,
  isRosterFull,
  PICKABLE_KINDS,
  type PickableKind,
  ROSTER_LIMITS,
  type User,
} from "../../shared/entities.js";
import { seatForTurn } from "../../shared/snake.js";
import { db } from "../db/client.js";
import {
  draftActions,
  rosterEntries,
  stageManagers,
  stages,
  tournaments,
} from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { findStage, requireSetup, type StageRow } from "../stages.js";
import { tournamentMembersOf } from "../tournament-members.js";
import {
  carriedPicks,
  isStageFinished,
  previousStageOf,
  reversedSeats,
} from "./carry-over.js";
import { type DraftPoolEntry, draftPool } from "./pool.js";
import { type SeatRow, seatsMatchJoined, seatsOf } from "./seats.js";
import { notifyDraftChanged } from "./sse.js";

let random: () => number = Math.random;

export function setDraftRandom(nextRandom: () => number): void {
  random = nextRandom;
}

const turnTimers = new Map<number, ReturnType<typeof setTimeout>>();

function joinedUserIds(tournamentId: number): number[] {
  return tournamentMembersOf(tournamentId).map((member) => member.user.id);
}

function seatOnClock(stage: StageRow, seats: SeatRow[]): SeatRow | undefined {
  const seatNo = seatForTurn(stage.currentTurnNo, seats.length);
  return seats.find((seat) => seat.seat === seatNo);
}

function freshDeadline(stage: StageRow): string {
  return new Date(Date.now() + stage.pickSeconds * 1000).toISOString();
}

// Every change runs in one transaction; better-sqlite3 has a single connection,
// so plain `db` calls inside the callback are part of it.
function runDraftChange(
  stageId: number,
  change: (stage: StageRow) => void,
): void {
  db.transaction(() => change(findStage(stageId)));
  syncTurnTimer(findStage(stageId));
  notifyDraftChanged(stageId);
}

function syncTurnTimer(stage: StageRow): void {
  clearTimeout(turnTimers.get(stage.id));
  turnTimers.delete(stage.id);
  if (stage.status !== "drafting" || !stage.turnDeadline) return;
  const turnNo = stage.currentTurnNo;
  const delayMs = Math.max(0, Date.parse(stage.turnDeadline) - Date.now());
  turnTimers.set(
    stage.id,
    setTimeout(() => {
      // A throw here has no request to catch it and would take the whole server down mid-draft.
      try {
        handleTurnTimeout(stage.id, turnNo);
      } catch (error) {
        console.error(error);
      }
    }, delayMs),
  );
}

function advanceTurn(stage: StageRow): void {
  const seats = seatsOf(stage.id);
  if (seats.every((seat) => seat.lockedAt)) {
    db.update(stages)
      .set({ status: "complete", turnDeadline: null })
      .where(eq(stages.id, stage.id))
      .run();
    return;
  }
  let turnNo = stage.currentTurnNo + 1;
  while (
    seats.find((seat) => seat.seat === seatForTurn(turnNo, seats.length))
      ?.lockedAt
  ) {
    turnNo++;
  }
  db.update(stages)
    .set({ currentTurnNo: turnNo, turnDeadline: freshDeadline(stage) })
    .where(eq(stages.id, stage.id))
    .run();
}

function rosterEntryOf(stageId: number, pickableId: number) {
  return and(
    eq(rosterEntries.stageId, stageId),
    eq(rosterEntries.pickableId, pickableId),
  );
}

function seatOfUser(stageId: number, userId: number) {
  return and(
    eq(stageManagers.stageId, stageId),
    eq(stageManagers.userId, userId),
  );
}

function rosterKinds(pool: DraftPoolEntry[], userId: number): PickableKind[] {
  return pool
    .filter((entry) => entry.ownerUserId === userId)
    .map((entry) => entry.kind);
}

function requireAvailable(
  pool: DraftPoolEntry[],
  pickableId: number,
): PickableKind {
  const entry = pool.find((e) => e.pickableId === pickableId);
  if (!entry) throw new HttpError(400, "Not in pool");
  if (entry.ownerUserId !== null) throw new HttpError(400, "Already taken");
  return entry.kind;
}

function logAction(
  stage: StageRow,
  action: Omit<
    typeof draftActions.$inferInsert,
    "stageId" | "turnNoBefore" | "id" | "createdAt"
  >,
): void {
  db.insert(draftActions)
    .values({
      ...action,
      stageId: stage.id,
      turnNoBefore: stage.currentTurnNo,
    })
    .run();
}

function applyPick(
  stage: StageRow,
  userId: number,
  pickableId: number,
  auto: boolean,
): void {
  db.insert(rosterEntries)
    .values({ stageId: stage.id, userId, pickableId })
    .run();
  logAction(stage, { userId, action: "pick", pickableInId: pickableId, auto });
  advanceTurn(stage);
}

function applyLock(
  stage: StageRow,
  userId: number,
  onClock: boolean,
  auto: boolean,
): void {
  db.update(stageManagers)
    .set({ lockedAt: new Date().toISOString() })
    .where(seatOfUser(stage.id, userId))
    .run();
  logAction(stage, { userId, action: "lock", auto });
  if (onClock) advanceTurn(stage);
}

function requireStatusDrafting(stage: StageRow): void {
  if (stage.status === "paused") throw new HttpError(400, "Draft paused");
  if (stage.status !== "drafting") throw new HttpError(400, "Not drafting");
}

export function performDraftAction(
  stageId: number,
  actor: User,
  body: DraftActionBody,
): void {
  if (body.onBehalfOf !== undefined && actor.role !== "commissioner") {
    throw new HttpError(403, "Commissioner only");
  }
  const userId = body.onBehalfOf ?? actor.id;

  runDraftChange(stageId, (stage) => {
    requireStatusDrafting(stage);
    const seats = seatsOf(stage.id);
    const seat = seats.find((s) => s.userId === userId);
    if (!seat) throw new HttpError(403, "Not in draft");
    const onClock = seatOnClock(stage, seats)?.userId === userId;
    const pool = draftPool(stage.id);

    switch (body.action) {
      case "pick": {
        if (!onClock) throw new HttpError(400, "Not your turn");
        const kind = requireAvailable(pool, body.pickableId);
        if (!hasRoomFor(rosterKinds(pool, userId), kind)) {
          throw new HttpError(
            400,
            kind === "coach" ? "Coach slot full" : "Roster full",
          );
        }
        applyPick(stage, userId, body.pickableId, false);
        return;
      }
      case "swap": {
        if (!onClock) throw new HttpError(400, "Not your turn");
        const out = pool.find((e) => e.pickableId === body.pickableOutId);
        if (!out || out.ownerUserId !== userId) {
          throw new HttpError(400, "Not yours");
        }
        if (requireAvailable(pool, body.pickableInId) !== out.kind) {
          throw new HttpError(400, "Wrong kind");
        }
        // Updating in place keeps the entry's rowid, so the roster's slot order survives the swap.
        db.update(rosterEntries)
          .set({ pickableId: body.pickableInId })
          .where(rosterEntryOf(stage.id, body.pickableOutId))
          .run();
        logAction(stage, {
          userId,
          action: "swap",
          pickableInId: body.pickableInId,
          pickableOutId: body.pickableOutId,
          auto: false,
        });
        advanceTurn(stage);
        return;
      }
      case "lock": {
        if (seat.lockedAt) throw new HttpError(400, "Already locked");
        if (!isRosterFull(rosterKinds(pool, userId))) {
          throw new HttpError(400, "Roster incomplete");
        }
        applyLock(stage, userId, onClock, false);
        return;
      }
    }
  });
}

function randomLegalPickableId(
  pool: DraftPoolEntry[],
  kinds: PickableKind[],
): number | undefined {
  const candidates = pool.filter(
    (entry) => entry.ownerUserId === null && hasRoomFor(kinds, entry.kind),
  );
  return candidates[Math.floor(random() * candidates.length)]?.pickableId;
}

function handleTurnTimeout(stageId: number, turnNo: number): void {
  turnTimers.delete(stageId);
  runDraftChange(stageId, (stage) => {
    if (stage.status !== "drafting" || stage.currentTurnNo !== turnNo) return;
    const seats = seatsOf(stage.id);
    const seat = seatOnClock(stage, seats);
    if (!seat) return;
    const pool = draftPool(stage.id);
    const kinds = rosterKinds(pool, seat.userId);
    if (isRosterFull(kinds)) {
      applyLock(stage, seat.userId, true, true);
      return;
    }
    const pickableId = randomLegalPickableId(pool, kinds);
    if (pickableId !== undefined) {
      applyPick(stage, seat.userId, pickableId, true);
      return;
    }
    // Nothing legal is left (e.g. fewer coaches than managers): stop the clock instead of
    // re-firing on an expired deadline; the commissioner sorts it out.
    db.update(stages)
      .set({ turnDeadline: null })
      .where(eq(stages.id, stage.id))
      .run();
  });
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

function seatManagers(stage: StageRow, userIds: number[]): void {
  db.delete(stageManagers).where(eq(stageManagers.stageId, stage.id)).run();
  if (userIds.length === 0) return;
  db.insert(stageManagers)
    .values(
      userIds.map((userId, seat) => ({ stageId: stage.id, userId, seat })),
    )
    .run();
}

function shuffleSeats(stage: StageRow): void {
  requireSetup(stage);
  seatManagers(stage, shuffled(joinedUserIds(stage.tournamentId)));
}

function insertCarriedPicks(
  stage: StageRow,
  previous: StageRow,
  userIds: number[],
): void {
  const kept = carriedPicks(previous, stage.id).filter(
    (pick) => pick.kept && userIds.includes(pick.userId),
  );
  if (kept.length === 0) return;
  db.insert(rosterEntries)
    .values(
      kept.map(({ userId, pickableId }) => ({
        stageId: stage.id,
        userId,
        pickableId,
      })),
    )
    .run();
}

function poolCanFillRosters(stageId: number, managerCount: number): boolean {
  const pool = draftPool(stageId);
  return PICKABLE_KINDS.every(
    (kind) =>
      pool.filter((entry) => entry.kind === kind).length >=
      ROSTER_LIMITS[kind] * managerCount,
  );
}

function startDraft(stage: StageRow): void {
  requireSetup(stage);
  const userIds = joinedUserIds(stage.tournamentId);
  if (userIds.length < 2) throw new HttpError(400, "Need 2 managers");
  const previous = previousStageOf(stage);
  if (previous && !isStageFinished(previous)) {
    throw new HttpError(400, "Previous stage unfinished");
  }
  if (!poolCanFillRosters(stage.id, userIds.length)) {
    throw new HttpError(400, "Pool too small");
  }
  if (!seatsMatchJoined(seatsOf(stage.id), userIds)) {
    seatManagers(
      stage,
      (previous && reversedSeats(previous, userIds)) ?? shuffled(userIds),
    );
  }
  if (previous) insertCarriedPicks(stage, previous, userIds);
  db.update(tournaments)
    .set({ joiningOpen: false })
    .where(eq(tournaments.id, stage.tournamentId))
    .run();
  db.update(stages)
    .set({
      status: "drafting",
      currentTurnNo: 0,
      turnDeadline: freshDeadline(stage),
    })
    .where(eq(stages.id, stage.id))
    .run();
}

function pauseDraft(stage: StageRow): void {
  if (stage.status !== "drafting") throw new HttpError(400, "Not drafting");
  db.update(stages)
    .set({ status: "paused", turnDeadline: null })
    .where(eq(stages.id, stage.id))
    .run();
}

function resumeDraft(stage: StageRow): void {
  if (stage.status !== "paused") throw new HttpError(400, "Not paused");
  db.update(stages)
    .set({ status: "drafting", turnDeadline: freshDeadline(stage) })
    .where(eq(stages.id, stage.id))
    .run();
}

function undoLastAction(stage: StageRow): void {
  if (stage.status === "setup") throw new HttpError(400, "Not drafting");
  const last = db
    .select()
    .from(draftActions)
    .where(eq(draftActions.stageId, stage.id))
    .orderBy(desc(draftActions.id))
    .get();
  if (!last) throw new HttpError(400, "Nothing to undo");

  const { pickableInId, pickableOutId } = last;
  switch (last.action) {
    case "pick":
      if (pickableInId === null) break;
      db.delete(rosterEntries)
        .where(rosterEntryOf(stage.id, pickableInId))
        .run();
      break;
    case "swap":
      if (pickableInId === null || pickableOutId === null) break;
      db.update(rosterEntries)
        .set({ pickableId: pickableOutId })
        .where(rosterEntryOf(stage.id, pickableInId))
        .run();
      break;
    case "lock":
      db.update(stageManagers)
        .set({ lockedAt: null })
        .where(seatOfUser(stage.id, last.userId))
        .run();
      break;
  }
  db.delete(draftActions).where(eq(draftActions.id, last.id)).run();

  const paused = stage.status === "paused";
  db.update(stages)
    .set({
      status: paused ? "paused" : "drafting",
      currentTurnNo: last.turnNoBefore,
      turnDeadline: paused ? null : freshDeadline(stage),
    })
    .where(eq(stages.id, stage.id))
    .run();
}

const CONTROLS: Record<DraftControl, (stage: StageRow) => void> = {
  shuffle: shuffleSeats,
  start: startDraft,
  pause: pauseDraft,
  resume: resumeDraft,
  undo: undoLastAction,
};

export function runDraftControl(stageId: number, control: DraftControl): void {
  runDraftChange(stageId, CONTROLS[control]);
}
