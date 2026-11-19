import { eq } from "drizzle-orm";
import type {
  ManagerStageStanding,
  ManagerStanding,
  StandingsPick,
} from "../shared/api.js";
import { displayNameOf, type TournamentMember } from "../shared/entities.js";
import { rankStandings, sum } from "../shared/scoring.js";
import { db } from "./db/client.js";
import { teams, tournamentTeams } from "./db/schema.js";
import { seatsOf } from "./draft/seats.js";
import { coachLast, toPickable } from "./pickables.js";
import { type ScoredStage, scoreTournament } from "./points.js";
import { tournamentMembersOf } from "./tournament-members.js";

const maxOrNull = (values: number[]) =>
  values.length === 0 ? null : Math.max(...values);
const nonNull = (values: (number | null)[]) =>
  values.filter((value) => value !== null);

type TeamLogos = ReadonlyMap<number, number | null>;

function teamLogosOf(tournamentId: number): TeamLogos {
  return new Map(
    db
      .select({ id: teams.id, logoImageId: teams.logoImageId })
      .from(tournamentTeams)
      .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .all()
      .map((team) => [team.id, team.logoImageId]),
  );
}

function picksOf(
  scored: ScoredStage,
  userId: number,
  teamLogos: TeamLogos,
): StandingsPick[] {
  return scored.rosterEntries
    .filter((entry) => entry.userId === userId)
    .flatMap(({ pickableId }) => {
      const pickable = scored.pool.find(({ id }) => id === pickableId);
      if (!pickable) return [];
      return [
        {
          pickable: toPickable(pickable),
          teamLogoImageId: teamLogos.get(pickable.teamId) ?? null,
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
  teamLogos: TeamLogos,
): RankedStageStanding[] {
  const seats = seatsOf(scored.stage.id);
  const rows = members.map(({ user }) => {
    const seat = seats.find((row) => row.userId === user.id);
    const picks = picksOf(scored, user.id, teamLogos);
    const pickPoints = nonNull(picks.map(({ points }) => points));
    return {
      userId: user.id,
      displayName: displayNameOf(user),
      draftSeat: seat?.seat ?? null,
      bestPickPoints: maxOrNull(pickPoints),
      locked: Boolean(seat?.lockedAt),
      points: scored.hasPoints && picks.length > 0 ? sum(pickPoints) : null,
      picks,
    };
  });
  return rankStandings(rows).map(({ displayName: _, ...row }, index) => ({
    ...row,
    stageId: scored.stage.id,
    rank: index + 1,
  }));
}

export function standingsOf(tournamentId: number): ManagerStanding[] {
  const scores = scoreTournament(tournamentId);
  const members = tournamentMembersOf(tournamentId);
  const teamLogos = teamLogosOf(tournamentId);
  const standingsByStage = scores.stages.map((scored) =>
    stageStandingsOf(scored, members, teamLogos),
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
      locked:
        stageStandings.findLast((standing) => standing.picks.length > 0)
          ?.locked ?? false,
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

  return rankStandings(totals).map(
    ({ user, color, points, locked, stages }, index) => ({
      user,
      color,
      rank: index + 1,
      points,
      locked,
      stages,
    }),
  );
}
