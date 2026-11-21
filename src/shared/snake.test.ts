import { describe, expect, test } from "vitest";
import { seatForTurn } from "./snake.js";

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

  test("the last seat of a round also opens the next", () => {
    expect(seatForTurn(seatCount - 1, seatCount)).toBe(seatCount - 1);
    expect(seatForTurn(seatCount, seatCount)).toBe(seatCount - 1);
    expect(seatForTurn(2 * seatCount - 1, seatCount)).toBe(0);
    expect(seatForTurn(2 * seatCount, seatCount)).toBe(0);
  });

  test("every seat gets one turn per round", () => {
    const rounds = 6;
    const turns = seatsForTurns(0, seatCount * rounds, seatCount);
    for (const seat of ascending) {
      expect(turns.filter((s) => s === seat)).toHaveLength(rounds);
    }
  });
});
