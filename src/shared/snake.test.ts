import { describe, expect, test } from "vitest";
import {
  DRAFT_ROUNDS,
  phaseForTurn,
  roundForTurn,
  seatForTurn,
} from "./snake.js";

const SEAT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

function seatsForTurns(
  firstTurn: number,
  turnCount: number,
  seatCount: number,
) {
  return Array.from({ length: turnCount }, (_, offset) =>
    seatForTurn(firstTurn + offset, seatCount),
  );
}

describe.each(SEAT_COUNTS)("snake with %i seats", (seatCount) => {
  const ascending = Array.from({ length: seatCount }, (_, seat) => seat);
  const descending = [...ascending].reverse();

  test("goes forward, then back, then forward", () => {
    expect(seatsForTurns(0, seatCount * 3, seatCount)).toEqual([
      ...ascending,
      ...descending,
      ...ascending,
    ]);
  });

  test("rounds change exactly at multiples of the seat count", () => {
    expect(roundForTurn(seatCount - 1, seatCount)).toBe(0);
    expect(roundForTurn(seatCount, seatCount)).toBe(1);
    expect(roundForTurn(2 * seatCount - 1, seatCount)).toBe(1);
    expect(roundForTurn(2 * seatCount, seatCount)).toBe(2);
  });

  test("the last seat of a round also opens the next", () => {
    expect(seatForTurn(seatCount - 1, seatCount)).toBe(seatCount - 1);
    expect(seatForTurn(seatCount, seatCount)).toBe(seatCount - 1);
    expect(seatForTurn(2 * seatCount - 1, seatCount)).toBe(0);
    expect(seatForTurn(2 * seatCount, seatCount)).toBe(0);
  });

  test("every seat gets one turn per draft round", () => {
    const draftSeats = seatsForTurns(0, seatCount * DRAFT_ROUNDS, seatCount);
    for (const seat of ascending) {
      expect(draftSeats.filter((s) => s === seat)).toHaveLength(DRAFT_ROUNDS);
    }
  });

  test("switches from draft to swap after round 6", () => {
    const firstSwapTurn = seatCount * DRAFT_ROUNDS;
    expect(phaseForTurn(0, seatCount)).toBe("draft");
    expect(phaseForTurn(firstSwapTurn - 1, seatCount)).toBe("draft");
    expect(phaseForTurn(firstSwapTurn, seatCount)).toBe("swap");
    expect(phaseForTurn(firstSwapTurn * 3, seatCount)).toBe("swap");
  });

  test("the swap phase keeps snaking", () => {
    const firstSwapTurn = seatCount * DRAFT_ROUNDS;
    expect(seatsForTurns(firstSwapTurn, seatCount * 2, seatCount)).toEqual([
      ...ascending,
      ...descending,
    ]);
  });
});
