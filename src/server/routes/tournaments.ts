import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import {
  createTournamentBodySchema,
  type ImportStarted,
  managerColorBodySchema,
  updateTournamentBodySchema,
} from "../../shared/api.js";
import {
  MAX_MANAGERS,
  type MatchStatus,
  type StageStatus,
  type TeamWithPickables,
  type Tournament,
  type TournamentStatus,
} from "../../shared/entities.js";
import { requireCommissioner, requireUser } from "../auth/access.js";
import { db } from "../db/client.js";
import {
  matches,
  pickables,
  stages,
  teams,
  tournamentMembers,
  tournaments,
  tournamentTeams,
} from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { toPickable } from "../pickables.js";
import { toStage } from "../stages.js";
import { syncTournament } from "../sync.js";
import { tournamentMembersOf } from "../tournament-members.js";
import { importEvent, reimportTournament } from "../vlr/import.js";
import { startImportJob } from "./imports.js";

type TournamentRow = typeof tournaments.$inferSelect;

function deriveTournamentStatus(
  stageStatuses: StageStatus[],
  matchStatuses: MatchStatus[],
): TournamentStatus {
  if (stageStatuses.some((s) => s === "drafting" || s === "paused")) {
    return "drafting";
  }
  if (
    matchStatuses.length > 0 &&
    matchStatuses.every((s) => s === "completed")
  ) {
    return "ended";
  }
  if (matchStatuses.some((s) => s !== "upcoming")) return "live";
  return "upcoming";
}

function toTournament(row: TournamentRow): Tournament {
  const stageRows = db
    .select()
    .from(stages)
    .where(eq(stages.tournamentId, row.id))
    .orderBy(asc(stages.position))
    .all();
  const matchStatuses = db
    .select({ status: matches.status })
    .from(matches)
    .where(eq(matches.tournamentId, row.id))
    .all()
    .map((match) => match.status);
  const teamCount =
    db
      .select({ teams: count() })
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, row.id))
      .get()?.teams ?? 0;

  return {
    id: row.id,
    name: row.name,
    vlrEventUrl: row.vlrEventUrl,
    logoImageId: row.logoImageId,
    joiningOpen: row.joiningOpen,
    status: deriveTournamentStatus(
      stageRows.map((stage) => stage.status),
      matchStatuses,
    ),
    stages: stageRows.map(toStage),
    members: tournamentMembersOf(row.id),
    teamCount,
    matchesPlayed: matchStatuses.filter((s) => s === "completed").length,
    matchesTotal: matchStatuses.length,
  };
}

function findTournament(tournamentId: unknown): TournamentRow {
  const row = db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, Number(tournamentId)))
    .get();
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

function requireNoDraftStarted(tournamentId: number) {
  const started = db
    .select({ id: stages.id })
    .from(stages)
    .where(
      and(eq(stages.tournamentId, tournamentId), ne(stages.status, "setup")),
    )
    .get();
  if (started) throw new HttpError(400, "Draft started");
}

const STATUS_ORDER: Record<TournamentStatus, number> = {
  live: 0,
  drafting: 0,
  upcoming: 1,
  ended: 2,
};

export const tournamentsRouter = Router();

tournamentsRouter.get(
  "/tournaments",
  requireUser,
  (_req, res: Response<Tournament[]>) => {
    const rows = db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id))
      .all();
    const list = rows.map(toTournament);
    list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    res.json(list);
  },
);

tournamentsRouter.post(
  "/tournaments",
  requireCommissioner,
  (req: Request, res: Response<ImportStarted>) => {
    const body = createTournamentBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid VLR link");
    const { vlrEventUrl } = body.data;
    res
      .status(202)
      .json(
        startImportJob((onProgress) =>
          importEvent(vlrEventUrl, { onProgress }),
        ),
      );
  },
);

tournamentsRouter.get(
  "/tournaments/:tournamentId",
  requireUser,
  (req, res: Response<Tournament>) => {
    res.json(toTournament(findTournament(req.params.tournamentId)));
  },
);

tournamentsRouter.patch(
  "/tournaments/:tournamentId",
  requireCommissioner,
  (req, res) => {
    const tournament = findTournament(req.params.tournamentId);
    const body = updateTournamentBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid settings");
    const { joiningOpen, pickSeconds } = body.data;

    if (joiningOpen !== undefined) {
      requireNoDraftStarted(tournament.id);
      db.update(tournaments)
        .set({ joiningOpen })
        .where(eq(tournaments.id, tournament.id))
        .run();
    }
    if (pickSeconds !== undefined) {
      db.update(stages)
        .set({ pickSeconds })
        .where(
          and(
            eq(stages.tournamentId, tournament.id),
            eq(stages.status, "setup"),
          ),
        )
        .run();
    }
    res.status(204).end();
  },
);

tournamentsRouter.post(
  "/tournaments/:tournamentId/reimport",
  requireCommissioner,
  (req, res: Response<ImportStarted>) => {
    const { id } = findTournament(req.params.tournamentId);
    res.status(202).json(
      startImportJob(async (onProgress) => {
        await reimportTournament(id, { onProgress });
        return id;
      }),
    );
  },
);

tournamentsRouter.post(
  "/tournaments/:tournamentId/sync",
  requireCommissioner,
  (req, res) => {
    const { id } = findTournament(req.params.tournamentId);
    syncTournament(id).catch((error: unknown) => console.error(error));
    res.status(202).end();
  },
);

tournamentsRouter.get(
  "/tournaments/:tournamentId/teams",
  requireUser,
  (req, res: Response<TeamWithPickables[]>) => {
    const { id } = findTournament(req.params.tournamentId);
    const teamRows = db
      .select({
        id: teams.id,
        name: teams.name,
        logoImageId: teams.logoImageId,
      })
      .from(tournamentTeams)
      .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
      .where(eq(tournamentTeams.tournamentId, id))
      .orderBy(asc(teams.name))
      .all();
    const pickableRows = db
      .select({ pickable: pickables })
      .from(tournamentTeams)
      .innerJoin(pickables, eq(pickables.teamId, tournamentTeams.teamId))
      .where(eq(tournamentTeams.tournamentId, id))
      .orderBy(desc(pickables.kind), asc(pickables.id))
      .all()
      .map(({ pickable }) => toPickable(pickable));
    res.json(
      teamRows.map((team) => ({
        ...team,
        pickables: pickableRows.filter((p) => p.teamId === team.id),
      })),
    );
  },
);

tournamentsRouter.post(
  "/tournaments/:tournamentId/members",
  requireUser,
  (req, res) => {
    const body = managerColorBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid color");
    const { color } = body.data;
    const userId = res.locals.user.id;
    const tournament = findTournament(req.params.tournamentId);

    db.transaction((tx) => {
      if (!tournament.joiningOpen) throw new HttpError(400, "Joining closed");
      const members = tx
        .select()
        .from(tournamentMembers)
        .where(eq(tournamentMembers.tournamentId, tournament.id))
        .all();
      if (members.some((member) => member.userId === userId)) {
        throw new HttpError(400, "Already joined");
      }
      if (members.length >= MAX_MANAGERS) {
        throw new HttpError(400, "Tournament full");
      }
      if (members.some((member) => member.color === color)) {
        throw new HttpError(400, "Color taken");
      }
      tx.insert(tournamentMembers)
        .values({ tournamentId: tournament.id, userId, color })
        .run();
    });
    res.status(204).end();
  },
);

tournamentsRouter.patch(
  "/tournaments/:tournamentId/members/me",
  requireUser,
  (req, res) => {
    const tournament = findTournament(req.params.tournamentId);
    const body = managerColorBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid color");
    const { color } = body.data;

    db.transaction((tx) => {
      const holder = tx
        .select({ userId: tournamentMembers.userId })
        .from(tournamentMembers)
        .where(
          and(
            eq(tournamentMembers.tournamentId, tournament.id),
            eq(tournamentMembers.color, color),
          ),
        )
        .get();
      if (holder && holder.userId !== res.locals.user.id) {
        throw new HttpError(400, "Color taken");
      }
      const updated = tx
        .update(tournamentMembers)
        .set({ color })
        .where(
          and(
            eq(tournamentMembers.tournamentId, tournament.id),
            eq(tournamentMembers.userId, res.locals.user.id),
          ),
        )
        .returning()
        .get();
      if (!updated) throw new HttpError(404, "Not joined");
    });
    res.status(204).end();
  },
);

tournamentsRouter.delete(
  "/tournaments/:tournamentId/members/:userId",
  requireCommissioner,
  (req, res: Response) => {
    const tournament = findTournament(req.params.tournamentId);
    requireNoDraftStarted(tournament.id);
    db.delete(tournamentMembers)
      .where(
        and(
          eq(tournamentMembers.tournamentId, tournament.id),
          eq(tournamentMembers.userId, Number(req.params.userId)),
        ),
      )
      .run();
    res.status(204).end();
  },
);
