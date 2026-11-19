import { and, asc, desc, eq } from "drizzle-orm";
import type { DraftSeat, DraftState, Team } from "../../shared/entities.js";
import { phaseForTurn, roundForTurn, seatForTurn } from "../../shared/snake.js";
import { db } from "../db/client.js";
import {
  draftActions,
  pickables,
  rosterEntries,
  stagePool,
  teams,
} from "../db/schema.js";
import { toScoredPickable } from "../pickables.js";
import { scoreTournament, type TournamentScores } from "../points.js";
import { findStage } from "../stages.js";
import { tournamentMembersOf } from "../tournament-members.js";
import { seatsMatchJoined, seatsOf } from "./seats.js";

const RECENT_ACTION_COUNT = 10;

function rosterPickableIdsByUser(
  scores: TournamentScores,
  stageId: number,
): Map<number, number[]> {
  const entries =
    scores.stages.find(({ stage }) => stage.id === stageId)?.rosterEntries ??
    [];
  const byUser = new Map<number, number[]>();
  for (const { userId, pickableId } of entries) {
    byUser.set(userId, [...(byUser.get(userId) ?? []), pickableId]);
  }
  return byUser;
}

export function readDraftState(stageId: number): DraftState {
  const stage = findStage(stageId);
  const members = tournamentMembersOf(stage.tournamentId);
  const membersById = new Map(members.map((m) => [m.user.id, m]));
  const scores = scoreTournament(stage.tournamentId);
  const rosters = rosterPickableIdsByUser(scores, stage.id);

  const seatRows = seatsOf(stage.id);
  const joined = members.map((member) => member.user.id);
  const seatedUsers =
    stage.status === "setup" && !seatsMatchJoined(seatRows, joined)
      ? joined.map((userId, seat) => ({ userId, seat, lockedAt: null }))
      : seatRows;
  const seats: DraftSeat[] = seatedUsers.flatMap(
    ({ userId, seat, lockedAt }) => {
      const member = membersById.get(userId);
      if (!member) return [];
      return [
        {
          seat,
          ...member,
          locked: lockedAt !== null,
          rosterPickableIds: rosters.get(userId) ?? [],
        },
      ];
    },
  );

  const poolRows = db
    .select({
      pickable: pickables,
      team: { id: teams.id, name: teams.name, logoImageId: teams.logoImageId },
      ownerUserId: rosterEntries.userId,
    })
    .from(stagePool)
    .innerJoin(pickables, eq(pickables.id, stagePool.pickableId))
    .innerJoin(teams, eq(teams.id, pickables.teamId))
    .leftJoin(
      rosterEntries,
      and(
        eq(rosterEntries.stageId, stagePool.stageId),
        eq(rosterEntries.pickableId, stagePool.pickableId),
      ),
    )
    .where(and(eq(stagePool.stageId, stage.id), eq(stagePool.removed, false)))
    .orderBy(asc(pickables.id))
    .all();
  const poolTeams = new Map<number, Team>();
  for (const { team } of poolRows) {
    poolTeams.set(team.id, team);
  }

  const recentActions = db
    .select()
    .from(draftActions)
    .where(eq(draftActions.stageId, stage.id))
    .orderBy(desc(draftActions.id))
    .limit(RECENT_ACTION_COUNT)
    .all()
    .map((action) => ({
      id: action.id,
      userId: action.userId,
      action: action.action,
      pickableInId: action.pickableInId,
      pickableOutId: action.pickableOutId,
      auto: action.auto,
      createdAt: action.createdAt,
    }));

  const seatCount = seats.length;
  const onClock =
    seatCount > 0 && (stage.status === "drafting" || stage.status === "paused");
  return {
    stageId: stage.id,
    status: stage.status,
    phase:
      seatCount > 0 ? phaseForTurn(stage.currentTurnNo, seatCount) : "draft",
    round: seatCount > 0 ? roundForTurn(stage.currentTurnNo, seatCount) : 0,
    turnNo: stage.currentTurnNo,
    pickSeconds: stage.pickSeconds,
    seats,
    pool: poolRows.map(({ pickable, ownerUserId }) => ({
      ...toScoredPickable(pickable, scores),
      ownerUserId,
    })),
    teams: [...poolTeams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    currentSeat: onClock ? seatForTurn(stage.currentTurnNo, seatCount) : null,
    turnDeadline: stage.turnDeadline,
    serverNow: new Date().toISOString(),
    recentActions,
  };
}
