export function seatForTurn(turnNo: number, seatCount: number): number {
  const positionInRound = turnNo % seatCount;
  const round = Math.floor(turnNo / seatCount);
  return round % 2 === 0 ? positionInRound : seatCount - 1 - positionInRound;
}
