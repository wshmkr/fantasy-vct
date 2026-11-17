import type { DraftPhase } from "./entities.js";

export const DRAFT_ROUNDS = 6;

export function roundForTurn(turnNo: number, seatCount: number): number {
  return Math.floor(turnNo / seatCount);
}

export function seatForTurn(turnNo: number, seatCount: number): number {
  const positionInRound = turnNo % seatCount;
  return roundForTurn(turnNo, seatCount) % 2 === 0
    ? positionInRound
    : seatCount - 1 - positionInRound;
}

export function phaseForTurn(turnNo: number, seatCount: number): DraftPhase {
  return roundForTurn(turnNo, seatCount) < DRAFT_ROUNDS ? "draft" : "swap";
}
