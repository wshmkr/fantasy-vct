import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import type TestAgent from "supertest/lib/agent.js";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { DraftActionBody } from "../../shared/api.js";
import {
  type DraftSeat,
  type DraftState,
  MANAGER_COLORS,
  type PoolPickable,
  ROSTER_LIMITS,
} from "../../shared/entities.js";
import { seatForTurn } from "../../shared/snake.js";
import { db } from "../db/client.js";
import { stagePool } from "../db/schema.js";
import { setDraftRandom } from "../draft/service.js";
import {
  insertDraftStage,
  insertUser,
  loginAs,
  testApp,
} from "../test-utils.js";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const agents = new Map<number, TestAgent>();
let commissionerId: number;
let managerIds: number[];
let outsider: TestAgent;

function agentOf(userId: number): TestAgent {
  const agent = agents.get(userId);
  if (!agent) throw new Error(`no agent for ${userId}`);
  return agent;
}

const commissioner = () => agentOf(commissionerId);

beforeAll(async () => {
  setDraftRandom(seededRandom(42));
  commissionerId = insertUser("commish", "commissioner").id;
  const memberIds = Array.from(
    { length: 7 },
    (_, n) => insertUser(`member-${n}`).id,
  );
  managerIds = [commissionerId, ...memberIds];
  for (const userId of managerIds) agents.set(userId, await loginAs(userId));
  outsider = await loginAs(insertUser("outsider").id);
});

afterEach(() => {
  vi.useRealTimers();
});

async function draftState(stageId: number): Promise<DraftState> {
  return (await commissioner().get(`/api/stages/${stageId}/draft`).expect(200))
    .body;
}

function seatOnClock(state: DraftState): DraftSeat {
  const seat = state.seats.find((s) => s.seat === state.currentSeat);
  if (!seat) throw new Error("nobody on the clock");
  return seat;
}

function seatOf(state: DraftState, userId: number): DraftSeat {
  const seat = state.seats.find((s) => s.user.id === userId);
  if (!seat) throw new Error(`${userId} not seated`);
  return seat;
}

function kindsOf(state: DraftState, seat: DraftSeat) {
  return seat.rosterPickableIds.map(
    (id) => state.pool.find((p) => p.id === id)?.kind,
  );
}

function available(state: DraftState, kind: PoolPickable["kind"]) {
  return state.pool.filter((p) => p.kind === kind && p.ownerUserId === null);
}

function firstAvailable(state: DraftState, kind: PoolPickable["kind"]) {
  const pickable = available(state, kind)[0];
  if (!pickable) throw new Error(`no ${kind} left`);
  return pickable.id;
}

function legalPickFor(state: DraftState, seat: DraftSeat): number {
  const players = kindsOf(state, seat).filter((k) => k === "player").length;
  return firstAvailable(
    state,
    players < ROSTER_LIMITS.player ? "player" : "coach",
  );
}

function act(stageId: number, userId: number, body: DraftActionBody) {
  return agentOf(userId)
    .post(`/api/stages/${stageId}/draft/actions`)
    .send(body);
}

function control(stageId: number, name: string) {
  return commissioner().post(`/api/stages/${stageId}/draft/${name}`);
}

async function expectRejected(
  request: ReturnType<typeof act>,
  error: string,
  status = 400,
) {
  const res = await request;
  expect(res.status).toBe(status);
  expect(res.body.error).toBe(error);
}

async function startedStage({
  managers,
  players = managers * 5 + 4,
  coaches = managers + 2,
}: {
  managers: number;
  players?: number;
  coaches?: number;
}) {
  const fixture = insertDraftStage({
    managerIds: managerIds.slice(0, managers),
    players,
    coaches,
  });
  await control(fixture.stageId, "start").expect(204);
  return fixture;
}

async function pickForWhoeverIsOnClock(stageId: number) {
  const state = await draftState(stageId);
  const seat = seatOnClock(state);
  await act(stageId, seat.user.id, {
    action: "pick",
    pickableId: legalPickFor(state, seat),
  }).expect(204);
}

async function finishDraftPhase(stageId: number) {
  while ((await draftState(stageId)).phase === "draft") {
    await pickForWhoeverIsOnClock(stageId);
  }
}

describe("draft setup", () => {
  test("shows joined managers, then the shuffled seats", async () => {
    const { stageId } = insertDraftStage({
      managerIds: managerIds.slice(0, 4),
      players: 4,
      coaches: 1,
    });
    const before = await draftState(stageId);
    expect(before.status).toBe("setup");
    expect(before.currentSeat).toBeNull();
    expect(before.seats.map((s) => s.user.id)).toEqual(managerIds.slice(0, 4));
    expect(before.seats[1]?.color).toBe(MANAGER_COLORS[1]);

    await control(stageId, "shuffle").expect(204);
    const after = await draftState(stageId);
    expect(after.seats.map((s) => s.seat)).toEqual([0, 1, 2, 3]);
    expect(new Set(after.seats.map((s) => s.user.id))).toEqual(
      new Set(managerIds.slice(0, 4)),
    );
  });

  test("start needs two managers, closes joining and only runs once", async () => {
    const solo = insertDraftStage({
      managerIds: managerIds.slice(0, 1),
      players: 5,
      coaches: 1,
    });
    await expectRejected(control(solo.stageId, "start"), "Need 2 managers");

    const fewCoaches = insertDraftStage({
      managerIds: managerIds.slice(0, 3),
      players: 20,
      coaches: 2,
    });
    await expectRejected(
      control(fewCoaches.stageId, "start"),
      "Pool too small",
    );

    const { stageId, tournamentId } = insertDraftStage({
      managerIds: managerIds.slice(0, 3),
      players: 20,
      coaches: 4,
    });
    await agentOf(managerIds[1] as number)
      .post(`/api/stages/${stageId}/draft/start`)
      .expect(403);
    await control(stageId, "start").expect(204);
    const state = await draftState(stageId);
    expect(state).toMatchObject({
      status: "drafting",
      phase: "draft",
      round: 0,
      turnNo: 0,
      currentSeat: 0,
    });
    expect(state.turnDeadline).not.toBeNull();
    expect(
      (await commissioner().get(`/api/tournaments/${tournamentId}`)).body
        .joiningOpen,
    ).toBe(false);
    await expectRejected(control(stageId, "start"), "Draft started");
    await expectRejected(control(stageId, "shuffle"), "Draft started");
  });
});

describe("draft actions", () => {
  test("rejects picks out of turn, taken, out of pool and by non-managers", async () => {
    const { stageId, playerIds } = await startedStage({ managers: 3 });
    db.update(stagePool)
      .set({ removed: true })
      .where(
        and(
          eq(stagePool.stageId, stageId),
          eq(stagePool.pickableId, playerIds[0] as number),
        ),
      )
      .run();
    const state = await draftState(stageId);
    const first = seatOnClock(state);
    const other = state.seats.find(
      (s) => s !== first && s.user.id !== commissionerId,
    ) as DraftSeat;

    await expectRejected(
      act(stageId, other.user.id, {
        action: "pick",
        pickableId: playerIds[1] as number,
      }),
      "Not your turn",
    );
    await expectRejected(
      act(stageId, first.user.id, {
        action: "pick",
        pickableId: playerIds[0] as number,
      }),
      "Not in pool",
    );
    await expectRejected(
      outsider
        .post(`/api/stages/${stageId}/draft/actions`)
        .send({ action: "pick", pickableId: playerIds[1] }),
      "Not in draft",
      403,
    );
    await expectRejected(
      act(stageId, other.user.id, {
        action: "pick",
        pickableId: playerIds[1] as number,
        onBehalfOf: first.user.id,
      }),
      "Commissioner only",
      403,
    );

    await act(stageId, first.user.id, {
      action: "pick",
      pickableId: playerIds[1] as number,
    }).expect(204);
    const next = seatOnClock(await draftState(stageId));
    await expectRejected(
      act(stageId, next.user.id, {
        action: "pick",
        pickableId: playerIds[1] as number,
      }),
      "Already taken",
    );
  });

  test("the commissioner can act on behalf of the manager on the clock", async () => {
    const { stageId } = await startedStage({ managers: 3 });
    const state = await draftState(stageId);
    const onClock = seatOnClock(state);
    const pickableId = firstAvailable(state, "player");
    await act(stageId, commissionerId, {
      action: "pick",
      pickableId,
      onBehalfOf: onClock.user.id,
    }).expect(204);
    const after = await draftState(stageId);
    expect(seatOf(after, onClock.user.id).rosterPickableIds).toEqual([
      pickableId,
    ]);
    expect(after.recentActions[0]).toMatchObject({
      userId: onClock.user.id,
      action: "pick",
      pickableInId: pickableId,
      auto: false,
    });
  });

  test("enforces one coach and five players", async () => {
    const { stageId } = await startedStage({ managers: 2 });
    const coachFirst = seatOnClock(await draftState(stageId)).user.id;
    const rejections: string[] = [];

    while ((await draftState(stageId)).phase === "draft") {
      const state = await draftState(stageId);
      const seat = seatOnClock(state);
      const kinds = kindsOf(state, seat);
      const players = kinds.filter((k) => k === "player").length;

      if (seat.user.id === coachFirst && kinds.length === 1) {
        const res = await act(stageId, seat.user.id, {
          action: "pick",
          pickableId: firstAvailable(state, "coach"),
        });
        rejections.push(res.body.error);
      }
      if (seat.user.id !== coachFirst && players === ROSTER_LIMITS.player) {
        const res = await act(stageId, seat.user.id, {
          action: "pick",
          pickableId: firstAvailable(state, "player"),
        });
        rejections.push(res.body.error);
      }
      const wantsCoach =
        seat.user.id === coachFirst
          ? kinds.length === 0
          : players === ROSTER_LIMITS.player;
      await act(stageId, seat.user.id, {
        action: "pick",
        pickableId: firstAvailable(state, wantsCoach ? "coach" : "player"),
      }).expect(204);
    }
    expect(rejections).toEqual(["Coach slot full", "Roster full"]);
  });

  test("rejects actions in the wrong phase, while paused and before the start", async () => {
    const { stageId: setupStageId, playerIds } = insertDraftStage({
      managerIds: managerIds.slice(0, 2),
      players: 12,
      coaches: 2,
    });
    await expectRejected(
      act(setupStageId, commissionerId, {
        action: "pick",
        pickableId: playerIds[0] as number,
      }),
      "Not drafting",
    );

    const { stageId } = await startedStage({ managers: 2 });
    const state = await draftState(stageId);
    const onClock = seatOnClock(state);
    await expectRejected(
      act(stageId, onClock.user.id, { action: "lock" }),
      "Wrong phase",
    );
    await expectRejected(
      act(stageId, onClock.user.id, {
        action: "swap",
        pickableOutId: firstAvailable(state, "player"),
        pickableInId: firstAvailable(state, "player"),
      }),
      "Wrong phase",
    );

    await control(stageId, "pause").expect(204);
    expect(await draftState(stageId)).toMatchObject({
      status: "paused",
      turnDeadline: null,
    });
    await expectRejected(
      act(stageId, onClock.user.id, {
        action: "pick",
        pickableId: firstAvailable(state, "player"),
      }),
      "Draft paused",
    );
    await control(stageId, "resume").expect(204);
    expect((await draftState(stageId)).turnDeadline).not.toBeNull();

    await finishDraftPhase(stageId);
    const swapState = await draftState(stageId);
    expect(swapState).toMatchObject({ phase: "swap", round: 6 });
    await expectRejected(
      act(stageId, seatOnClock(swapState).user.id, {
        action: "pick",
        pickableId: firstAvailable(swapState, "player"),
      }),
      "Wrong phase",
    );
  });

  test("swaps keep the kind, release the old pick and keep the slot", async () => {
    const { stageId } = await startedStage({ managers: 2 });
    await finishDraftPhase(stageId);
    const state = await draftState(stageId);
    const swapper = seatOnClock(state);
    const other = state.seats.find((s) => s !== swapper) as DraftSeat;
    const [releasedPlayer] = swapper.rosterPickableIds;
    const coachId = swapper.rosterPickableIds.find(
      (id) => state.pool.find((p) => p.id === id)?.kind === "coach",
    ) as number;
    const freePlayer = firstAvailable(state, "player");

    await expectRejected(
      act(stageId, swapper.user.id, {
        action: "swap",
        pickableOutId: coachId,
        pickableInId: freePlayer,
      }),
      "Wrong kind",
    );
    await expectRejected(
      act(stageId, swapper.user.id, {
        action: "swap",
        pickableOutId: other.rosterPickableIds[0] as number,
        pickableInId: freePlayer,
      }),
      "Not yours",
    );
    await expectRejected(
      act(stageId, swapper.user.id, {
        action: "swap",
        pickableOutId: releasedPlayer as number,
        pickableInId: other.rosterPickableIds[0] as number,
      }),
      "Already taken",
    );
    await act(stageId, swapper.user.id, {
      action: "swap",
      pickableOutId: releasedPlayer as number,
      pickableInId: freePlayer,
    }).expect(204);

    const after = await draftState(stageId);
    expect(seatOf(after, swapper.user.id).rosterPickableIds[0]).toBe(
      freePlayer,
    );
    expect(after.pool.find((p) => p.id === releasedPlayer)?.ownerUserId).toBe(
      null,
    );
    const nextUp = seatOnClock(after);
    expect(nextUp.user.id).toBe(other.user.id);
    await act(stageId, other.user.id, {
      action: "swap",
      pickableOutId: other.rosterPickableIds[0] as number,
      pickableInId: releasedPlayer as number,
    }).expect(204);
  });

  test("locks out of turn, skips locked seats and completes when all are locked", async () => {
    const { stageId } = await startedStage({ managers: 3 });
    await finishDraftPhase(stageId);
    const state = await draftState(stageId);
    const onClock = seatOnClock(state);
    const early = state.seats.find((s) => s !== onClock) as DraftSeat;

    await act(stageId, early.user.id, { action: "lock" }).expect(204);
    const afterEarly = await draftState(stageId);
    expect(afterEarly.turnNo).toBe(state.turnNo);
    expect(seatOf(afterEarly, early.user.id).locked).toBe(true);
    await expectRejected(
      act(stageId, early.user.id, { action: "lock" }),
      "Already locked",
    );

    const seen: number[] = [];
    for (let turn = 0; turn < 6; turn++) {
      const current = await draftState(stageId);
      const seat = seatOnClock(current);
      seen.push(seat.user.id);
      const releasedPlayer = seat.rosterPickableIds[0] as number;
      await act(stageId, seat.user.id, {
        action: "swap",
        pickableOutId: releasedPlayer,
        pickableInId: firstAvailable(current, "player"),
      }).expect(204);
    }
    expect(seen).not.toContain(early.user.id);

    for (const seat of (await draftState(stageId)).seats) {
      if (seat.user.id === early.user.id) continue;
      await act(stageId, seat.user.id, { action: "lock" }).expect(204);
    }
    const done = await draftState(stageId);
    expect(done).toMatchObject({
      status: "complete",
      turnDeadline: null,
      currentSeat: null,
    });
    expect(done.seats.every((s) => s.locked)).toBe(true);
    await expectRejected(
      act(stageId, early.user.id, { action: "lock" }),
      "Not drafting",
    );
  });
});

describe("undo", () => {
  test("reverses a pick, a swap and a final lock", async () => {
    const { stageId } = await startedStage({ managers: 2 });
    await expectRejected(control(stageId, "undo"), "Nothing to undo");

    await pickForWhoeverIsOnClock(stageId);
    await control(stageId, "undo").expect(204);
    const afterPickUndo = await draftState(stageId);
    expect(afterPickUndo.turnNo).toBe(0);
    expect(
      afterPickUndo.seats.every((s) => s.rosterPickableIds.length === 0),
    ).toBe(true);
    expect(afterPickUndo.recentActions).toEqual([]);

    await finishDraftPhase(stageId);
    const beforeSwap = await draftState(stageId);
    const swapper = seatOnClock(beforeSwap);
    await act(stageId, swapper.user.id, {
      action: "swap",
      pickableOutId: swapper.rosterPickableIds[0] as number,
      pickableInId: firstAvailable(beforeSwap, "player"),
    }).expect(204);
    await control(stageId, "undo").expect(204);
    const afterSwapUndo = await draftState(stageId);
    expect(afterSwapUndo.turnNo).toBe(beforeSwap.turnNo);
    expect(afterSwapUndo.seats).toEqual(beforeSwap.seats);

    for (const seat of afterSwapUndo.seats) {
      await act(stageId, seat.user.id, { action: "lock" }).expect(204);
    }
    expect((await draftState(stageId)).status).toBe("complete");
    await control(stageId, "undo").expect(204);
    const reopened = await draftState(stageId);
    expect(reopened.status).toBe("drafting");
    expect(reopened.turnDeadline).not.toBeNull();
    expect(reopened.seats.filter((s) => !s.locked)).toHaveLength(1);
  });
});

describe("turn timer", () => {
  test("autopicks only legal choices, then locks everyone to complete", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const managers = 8;
    const fixture = insertDraftStage({
      managerIds: managerIds.slice(0, managers),
      players: 44,
      coaches: 10,
    });
    const removedIds = [
      ...fixture.playerIds.slice(0, 2),
      ...fixture.coachIds.slice(0, 1),
    ];
    for (const pickableId of removedIds) {
      db.update(stagePool)
        .set({ removed: true })
        .where(
          and(
            eq(stagePool.stageId, fixture.stageId),
            eq(stagePool.pickableId, pickableId),
          ),
        )
        .run();
    }
    await control(fixture.stageId, "start").expect(204);
    const { pickSeconds } = await draftState(fixture.stageId);

    await control(fixture.stageId, "pause").expect(204);
    vi.advanceTimersByTime(pickSeconds * 1000 * 2);
    expect((await draftState(fixture.stageId)).turnNo).toBe(0);
    await control(fixture.stageId, "resume").expect(204);

    for (let turn = 0; turn < managers * 6; turn++) {
      vi.advanceTimersByTime(pickSeconds * 1000);
    }
    const drafted = await draftState(fixture.stageId);
    expect(drafted.phase).toBe("swap");
    for (const seat of drafted.seats) {
      const kinds = kindsOf(drafted, seat);
      expect(kinds.filter((k) => k === "player")).toHaveLength(5);
      expect(kinds.filter((k) => k === "coach")).toHaveLength(1);
      for (const id of seat.rosterPickableIds) {
        expect(removedIds).not.toContain(id);
      }
    }

    for (let turn = 0; turn < managers; turn++) {
      vi.advanceTimersByTime(pickSeconds * 1000);
    }
    const done = await draftState(fixture.stageId);
    expect(done.status).toBe("complete");
    expect(
      done.recentActions
        .slice(0, managers)
        .every((a) => a.action === "lock" && a.auto),
    ).toBe(true);
  });
});

describe("scripted 8-manager draft over HTTP", () => {
  test("joins, drafts 48 picks in snake order, swaps and locks to complete", async () => {
    const { stageId, tournamentId } = insertDraftStage({
      managerIds: [],
      players: 48,
      coaches: 10,
    });
    for (const [n, userId] of managerIds.entries()) {
      await agentOf(userId)
        .post(`/api/tournaments/${tournamentId}/members`)
        .send({ color: MANAGER_COLORS[n] })
        .expect(204);
    }
    await control(stageId, "shuffle").expect(204);
    const seated = await draftState(stageId);
    await control(stageId, "start").expect(204);
    expect((await draftState(stageId)).seats).toEqual(seated.seats);
    await outsider
      .post(`/api/tournaments/${tournamentId}/members`)
      .send({ color: MANAGER_COLORS[9] })
      .expect(400);

    const seatsOnClock: number[] = [];
    for (let pick = 0; pick < 48; pick++) {
      const state = await draftState(stageId);
      seatsOnClock.push(state.currentSeat as number);
      await pickForWhoeverIsOnClock(stageId);
    }
    expect(seatsOnClock).toEqual(
      Array.from({ length: 48 }, (_, turnNo) => seatForTurn(turnNo, 8)),
    );

    const swapState = await draftState(stageId);
    expect(swapState.phase).toBe("swap");
    const swapper = seatOnClock(swapState);
    await act(stageId, swapper.user.id, {
      action: "swap",
      pickableOutId: swapper.rosterPickableIds[0] as number,
      pickableInId: firstAvailable(swapState, "player"),
    }).expect(204);

    let state = await draftState(stageId);
    while (state.status === "drafting") {
      await act(stageId, seatOnClock(state).user.id, {
        action: "lock",
      }).expect(204);
      state = await draftState(stageId);
    }
    expect(state.status).toBe("complete");
    expect(state.seats.every((s) => s.rosterPickableIds.length === 6)).toBe(
      true,
    );
  });
});

describe("draft stream", () => {
  test("sends `changed` after a state change", async () => {
    const { stageId } = insertDraftStage({
      managerIds: managerIds.slice(0, 2),
      players: 12,
      coaches: 2,
    });
    const server = testApp.listen(0);
    const { port } = server.address() as AddressInfo;
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/dev`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: commissionerId }),
    });
    const cookie = login.headers.getSetCookie().join("; ");
    const controller = new AbortController();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/stages/${stageId}/draft/stream`,
        { headers: { cookie }, signal: controller.signal },
      );
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      await reader.read();
      await control(stageId, "start").expect(204);
      const { value } = await reader.read();
      expect(decoder.decode(value)).toContain("event: changed");
    } finally {
      controller.abort();
      server.close();
    }
  });
});
