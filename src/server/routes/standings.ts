import { type Response, Router } from "express";
import type {
  ManagerStageStanding,
  StandingsPick,
  StandingsResponse,
} from "../../shared/api.js";
import { displayNameOf, type TournamentMember } from "../../shared/entities.js";
import { rankStandings, sum } from "../../shared/scoring.js";
import { requireUser } from "../auth/access.js";
import { seatsOf } from "../draft/seats.js";
import { coachLast, toPickable } from "../pickables.js";
import { type ScoredStage, scoreTournament } from "../points.js";
import { tournamentMembersOf } from "../tournament-members.js";

const maxOrNull = (values: number[]) =>
  values.length === 0 ? null : Math.max(...values);
const nonNull = (values: (number | null)[]) =>
  values.filter((value) => value !== null);

function picksOf(scored: ScoredStage, userId: number): StandingsPick[] {
  return scored.rosterEntries
    .filter((entry) => entry.userId === userId)
    .flatMap(({ pickableId }) => {
      const pickable = scored.pool.find(({ id }) => id === pickableId);
      if (!pickable) return [];
      return [
        {
          pickable: toPickable(pickable),
          points: scored.pointsByPickable.get(pickableId) ?? null,
        },
      ];
    })
    .sort((a, b) => coachLast(a.pickable, b.pickable));
}

interface RankedStageStanding extends ManagerStageStanding {
  userId: number;
  draftSeat: number | null;
  bestPickPoints: number | null;
}

function stageStandingsOf(
  scored: ScoredStage,
  members: TournamentMember[],
): RankedStageStanding[] {
  const seats = seatsOf(scored.stage.id);
  const rows = members.map(({ user }) => {
    const seat = seats.find((row) => row.userId === user.id);
    const picks = picksOf(scored, user.id);
    const pickPoints = nonNull(picks.map(({ points }) => points));
    return {
      userId: user.id,
      displayName: displayNameOf(user),
      draftSeat: seat?.seat ?? null,
      bestPickPoints: maxOrNull(pickPoints),
      locked: Boolean(seat?.lockedAt),
      points: scored.hasPoints ? sum(pickPoints) : null,
      picks,
    };
  });
  return rankStandings(rows).map(({ displayName: _, ...row }, index) => ({
    ...row,
    stageId: scored.stage.id,
    rank: index + 1,
  }));
}

export const standingsRouter = Router();

standingsRouter.get(
  "/tournaments/:tournamentId/standings",
  requireUser,
  (req, res: Response<StandingsResponse>) => {
    const tournamentId = Number(req.params.tournamentId);
    const scores = scoreTournament(tournamentId);
    const members = tournamentMembersOf(tournamentId);
    const standingsByStage = scores.stages.map((scored) =>
      stageStandingsOf(scored, members),
    );
    const hasPoints = scores.stages.some((scored) => scored.hasPoints);

    const totals = members.map(({ user, color }) => {
      const stageStandings = standingsByStage.flatMap((standings) =>
        standings.filter((standing) => standing.userId === user.id),
      );
      return {
        user,
        color,
        displayName: displayNameOf(user),
        draftSeat: stageStandings[0]?.draftSeat ?? null,
        bestPickPoints: maxOrNull(
          nonNull(stageStandings.map((standing) => standing.bestPickPoints)),
        ),
        points: hasPoints
          ? sum(nonNull(stageStandings.map(({ points }) => points)))
          : null,
        stages: stageStandings.map(
          ({ stageId, rank, locked, points, picks }) => ({
            stageId,
            rank,
            locked,
            points,
            picks,
          }),
        ),
      };
    });

    res.json({
      managers: rankStandings(totals).map(
        ({ user, color, points, stages }, index) => ({
          user,
          color,
          rank: index + 1,
          points,
          stages,
        }),
      ),
    });
  },
);
