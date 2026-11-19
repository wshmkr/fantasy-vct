import { eq, inArray } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import {
  type MatchDetail,
  type MatchesResponse,
  type MatchHeader,
  type MatchPick,
  type MatchSub,
  type MatchTeamDetail,
  subAssignmentsBodySchema,
} from "../../shared/api.js";
import type { Team } from "../../shared/entities.js";
import { addStatLines, ZERO_STAT_LINE } from "../../shared/scoring.js";
import { requireCommissioner, requireUser } from "../auth/access.js";
import { db } from "../db/client.js";
import { matches, subAssignments, teams } from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { coachLast, toPickable } from "../pickables.js";
import {
  type ScoredMatch,
  type ScoredStage,
  scoreTournament,
} from "../points.js";
import { isSyncRunning } from "../sync.js";

type MatchRow = typeof matches.$inferSelect;

function teamLookup(teamIds: (number | null)[]) {
  const rows = db
    .select({ id: teams.id, name: teams.name, logoImageId: teams.logoImageId })
    .from(teams)
    .where(
      inArray(
        teams.id,
        teamIds.filter((id) => id !== null),
      ),
    )
    .all();
  const teamById = new Map(rows.map((team) => [team.id, team]));
  return (teamId: number | null): Team | null =>
    (teamId === null ? undefined : teamById.get(teamId)) ?? null;
}

function findMatch(matchId: unknown): MatchRow {
  const match = db
    .select()
    .from(matches)
    .where(eq(matches.id, Number(matchId)))
    .get();
  if (!match) throw new HttpError(404, "Not found");
  return match;
}

function matchHeaderOf(match: MatchRow, stageId: number | null): MatchHeader {
  return {
    id: match.id,
    stageId,
    bestOf: match.bestOf,
    scheduledAt: match.scheduledAt,
    status: match.status,
    scrapeStatus: match.scrapeStatus,
  };
}

function ownerOf(stage: ScoredStage | undefined, pickableId: number) {
  return (
    stage?.rosterEntries.find((entry) => entry.pickableId === pickableId)
      ?.userId ?? null
  );
}

function ownerUserIdsOf(stage: ScoredStage | undefined, teamId: number) {
  const owners = (stage?.rosterEntries ?? []).flatMap(
    ({ userId, pickableId }) =>
      stage?.pool.find((pickable) => pickable.id === pickableId)?.teamId ===
      teamId
        ? [userId]
        : [],
  );
  return [...new Set(owners)];
}

function findScoredMatch(matchId: unknown) {
  const match = findMatch(matchId);
  const scores = scoreTournament(match.tournamentId);
  const scored = scores.matches.find(
    (candidate) => candidate.match.id === match.id,
  );
  if (!scored) throw new HttpError(404, "Not found");
  return {
    scored,
    stage: scores.stages.find(({ stage }) => stage.id === scored.stageId),
  };
}

function subsOf(scored: ScoredMatch, teamId: number): MatchSub[] {
  return scored.pairings
    .filter((pairing) => pairing.teamId === teamId)
    .flatMap(({ mapNo, pairing }) =>
      pairing.credits.flatMap(({ subVlrPlayerId, replacesPickableId }) => {
        const row = scored.statRows.find(
          (candidate) =>
            candidate.mapNo === mapNo &&
            candidate.vlrPlayerId === subVlrPlayerId,
        );
        if (!row) return [];
        return [
          {
            mapNo,
            vlrPlayerId: subVlrPlayerId,
            handle: row.handle,
            stats: addStatLines(ZERO_STAT_LINE, row),
            replacesPickableId,
            needsAssignment:
              pairing.unassignedSubVlrIds.includes(subVlrPlayerId),
            missingPickableIds: pairing.ambiguous
              ? pairing.missingPickableIds
              : [],
          },
        ];
      }),
    );
}

// Missing players are listed too, since a sub's stats may be credited to them.
function picksOf(
  scored: ScoredMatch,
  stage: ScoredStage | undefined,
  teamId: number,
): MatchPick[] {
  const missingPickableIds = new Set(
    scored.pairings
      .filter((pairing) => pairing.teamId === teamId)
      .flatMap(({ pairing }) => pairing.missingPickableIds),
  );
  return (stage?.pool ?? [])
    .filter((pickable) => pickable.teamId === teamId)
    .flatMap((pickable): MatchPick[] => {
      const ownRows = scored.statRows.filter(
        (row) => row.vlrPlayerId === pickable.vlrId,
      );
      const isCoach = pickable.kind === "coach";
      if (
        !isCoach &&
        ownRows.length === 0 &&
        !missingPickableIds.has(pickable.id)
      ) {
        return [];
      }
      return [
        {
          pickable: toPickable(pickable),
          ownerUserId: ownerOf(stage, pickable.id),
          playerStatTotals: isCoach
            ? null
            : ownRows.reduce(addStatLines, ZERO_STAT_LINE),
          points: scored.pointsByPickable.get(pickable.id) ?? 0,
        },
      ];
    })
    .sort((a, b) => coachLast(a.pickable, b.pickable));
}

export const matchesRouter = Router();

matchesRouter.get(
  "/tournaments/:tournamentId/matches",
  requireUser,
  (req, res: Response<MatchesResponse>) => {
    const scores = scoreTournament(Number(req.params.tournamentId));
    const teamOf = teamLookup(
      scores.matches.flatMap(({ match }) => [match.team1Id, match.team2Id]),
    );
    res.json({
      syncRunning: isSyncRunning(),
      matches: scores.matches.map(
        ({ match, stageId, maps, needsAttention }) => {
          const stage = scores.stages.find(({ stage }) => stage.id === stageId);
          const summaryOf = (teamId: number | null, score: number | null) => {
            const team = teamOf(teamId);
            return (
              team && {
                ...team,
                score,
                ownerUserIds: ownerUserIdsOf(stage, team.id),
              }
            );
          };
          return {
            ...matchHeaderOf(match, stageId),
            needsAttention,
            mapCount: maps.length,
            team1: summaryOf(match.team1Id, match.score1),
            team2: summaryOf(match.team2Id, match.score2),
          };
        },
      ),
    });
  },
);

matchesRouter.get(
  "/matches/:matchId",
  requireUser,
  (req, res: Response<MatchDetail>) => {
    const { scored, stage } = findScoredMatch(req.params.matchId);
    const { match } = scored;
    const teamOf = teamLookup([match.team1Id, match.team2Id]);
    const detailOf = (
      teamId: number | null,
      score: number | null,
    ): MatchTeamDetail | null => {
      const team = teamOf(teamId);
      return (
        team && {
          ...team,
          score,
          picks: picksOf(scored, stage, team.id),
          subs: subsOf(scored, team.id),
        }
      );
    };
    res.json({
      ...matchHeaderOf(match, scored.stageId),
      maps: scored.maps.map(({ mapNo, mapName, team1Rounds, team2Rounds }) => ({
        mapNo,
        mapName,
        team1Rounds,
        team2Rounds,
      })),
      team1: detailOf(match.team1Id, match.score1),
      team2: detailOf(match.team2Id, match.score2),
    });
  },
);

matchesRouter.put(
  "/matches/:matchId/subs",
  requireCommissioner,
  (req: Request, res: Response) => {
    const body = subAssignmentsBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid assignments");
    const match = findMatch(req.params.matchId);
    db.transaction((tx) => {
      for (const assignment of body.data.assignments) {
        tx.insert(subAssignments)
          .values({ matchId: match.id, ...assignment })
          .onConflictDoUpdate({
            target: [
              subAssignments.matchId,
              subAssignments.mapNo,
              subAssignments.subVlrPlayerId,
            ],
            set: { replacesPickableId: assignment.replacesPickableId },
          })
          .run();
      }
    });
    res.status(204).end();
  },
);
