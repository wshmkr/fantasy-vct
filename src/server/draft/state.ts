import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type {
  DraftSeat,
  DraftState,
  DroppedPickable,
  Team,
} from "../../shared/entities.js";
import { seatForTurn } from "../../shared/snake.js";
import { db } from "../db/client.js";
import { draftActions, pickables, stagePool, teams } from "../db/schema.js";
import { toPickable, toScoredPickable } from "../pickables.js";
import { scoreTournament, type TournamentScores } from "../points.js";
import { findStage, type StageRow } from "../stages.js";
import { tournamentMembersOf } from "../tournament-members.js";
import {
  type CarriedPick,
  carriedPicks,
  previousStageOf,
  reversedSeats,
} from "./carry-over.js";
import { seatsMatchJoined, seatsOf } from "./seats.js";

const RECENT_ACTION_COUNT = 10;

function groupByUser<Item extends { userId: number }, Value>(
  items: Item[],
  toValue: (item: Item) => Value | undefined,
): Map<number, Value[]> {
  const byUser = new Map<number, Value[]>();
  for (const item of items) {
    const value = toValue(item);
    if (value === undefined) continue;
    byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), value]);
  }
  return byUser;
}

function droppedPickablesOf(
  picks: CarriedPick[],
): Map<number, DroppedPickable[]> {
  const pickableIds = picks.map((pick) => pick.pickableId);
  if (pickableIds.length === 0) return new Map();
  const byId = new Map(
    db
      .select({ pickable: pickables, teamLogoImageId: teams.logoImageId })
      .from(pickables)
      .innerJoin(teams, eq(teams.id, pickables.teamId))
      .where(inArray(pickables.id, pickableIds))
      .all()
      .map(({ pickable, teamLogoImageId }) => [
        pickable.id,
        { ...toPickable(pickable), teamLogoImageId },
      ]),
  );
  return groupByUser(picks, (pick) => byId.get(pick.pickableId));
}

// Before the start, a later stage previews the carry-over as if it were already its rosters.
function rostersOf(
  stage: StageRow,
  previous: StageRow | undefined,
  scores: TournamentScores,
) {
  const toPickableId = (entry: { pickableId: number }) => entry.pickableId;
  if (stage.status !== "setup" || !previous) {
    const entries =
      scores.stages.find((scored) => scored.stage.id === stage.id)
        ?.rosterEntries ?? [];
    return { rosters: groupByUser(entries, toPickableId), dropped: new Map() };
  }
  const picks = carriedPicks(previous, stage.id);
  return {
    rosters: groupByUser(
      picks.filter((pick) => pick.kept),
      toPickableId,
    ),
    dropped: droppedPickablesOf(picks.filter((pick) => !pick.kept)),
  };
}

export function readDraftState(stageId: number): DraftState {
  const stage = findStage(stageId);
  const members = tournamentMembersOf(stage.tournamentId);
  const membersById = new Map(members.map((m) => [m.user.id, m]));
  const scores = scoreTournament(stage.tournamentId);
  const previous =
    stage.status === "setup" ? previousStageOf(stage) : undefined;
  const { rosters, dropped } = rostersOf(stage, previous, scores);
  const rosterOwners = new Map(
    [...rosters].flatMap(([userId, pickableIds]) =>
      pickableIds.map((pickableId) => [pickableId, userId] as const),
    ),
  );

  const seatRows = seatsOf(stage.id);
  const joined = members.map((member) => member.user.id);
  const seatedUsers =
    stage.status === "setup" && !seatsMatchJoined(seatRows, joined)
      ? ((previous && reversedSeats(previous, joined)) ?? joined).map(
          (userId, seat) => ({ userId, seat, lockedAt: null }),
        )
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
          droppedPickables: dropped.get(userId) ?? [],
        },
      ];
    },
  );

  const poolRows = db
    .select({
      pickable: pickables,
      team: { id: teams.id, name: teams.name, logoImageId: teams.logoImageId },
    })
    .from(stagePool)
    .innerJoin(pickables, eq(pickables.id, stagePool.pickableId))
    .innerJoin(teams, eq(teams.id, pickables.teamId))
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
    turnNo: stage.currentTurnNo,
    pickSeconds: stage.pickSeconds,
    seats,
    pool: poolRows.map(({ pickable }) => ({
      ...toScoredPickable(pickable, scores),
      ownerUserId: rosterOwners.get(pickable.id) ?? null,
    })),
    teams: [...poolTeams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    currentSeat: onClock ? seatForTurn(stage.currentTurnNo, seatCount) : null,
    turnDeadline: stage.turnDeadline,
    serverNow: new Date().toISOString(),
    recentActions,
  };
}
