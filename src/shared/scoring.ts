const ROUNDS_TO_WIN_MAP = 13;
const OVERTIME_WIN_MARGIN = 2;

export function isFinishedMap(team1Rounds: number, team2Rounds: number) {
  return (
    Math.max(team1Rounds, team2Rounds) >= ROUNDS_TO_WIN_MAP &&
    Math.abs(team1Rounds - team2Rounds) >= OVERTIME_WIN_MARGIN
  );
}

export interface RosteredPlayer {
  pickableId: number;
  vlrPlayerId: string;
}

export interface SubAssignment {
  subVlrPlayerId: string;
  replacesPickableId: number | null;
}

export interface MapSubPairing {
  missingPickableIds: number[];
  credits: SubAssignment[];
  needsAttention: boolean;
}

// One team on one map. An unrostered pool player who plays scores for nobody and is never a sub.
export function pairSubs({
  poolPlayerVlrIds,
  rosteredPlayers,
  mapPlayerVlrIds,
  assignments,
}: {
  poolPlayerVlrIds: string[];
  rosteredPlayers: RosteredPlayer[];
  mapPlayerVlrIds: string[];
  assignments: SubAssignment[];
}): MapSubPairing {
  const missingPickableIds = rosteredPlayers
    .filter((player) => !mapPlayerVlrIds.includes(player.vlrPlayerId))
    .map((player) => player.pickableId);
  const subVlrIds = mapPlayerVlrIds.filter(
    (id) => !poolPlayerVlrIds.includes(id),
  );
  const autoPaired = missingPickableIds.length === 1 && subVlrIds.length === 1;
  const assignmentOf = (subVlrPlayerId: string) =>
    assignments.find(
      (assignment) => assignment.subVlrPlayerId === subVlrPlayerId,
    );
  const creditedPickableId = (subVlrPlayerId: string) => {
    if (missingPickableIds.length === 0) return null;
    if (autoPaired) return missingPickableIds[0] ?? null;
    return assignmentOf(subVlrPlayerId)?.replacesPickableId ?? null;
  };

  return {
    missingPickableIds,
    credits: subVlrIds.map((subVlrPlayerId) => ({
      subVlrPlayerId,
      replacesPickableId: creditedPickableId(subVlrPlayerId),
    })),
    needsAttention:
      missingPickableIds.length > 0 &&
      !autoPaired &&
      subVlrIds.some((subVlrPlayerId) => !assignmentOf(subVlrPlayerId)),
  };
}
