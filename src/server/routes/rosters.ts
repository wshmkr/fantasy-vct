import { eq } from "drizzle-orm";
import { Router } from "express";
import { addRosterEntryBodySchema } from "../../shared/api.js";
import { requireCommissioner } from "../auth/access.js";
import { db } from "../db/client.js";
import { teams } from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { addToRoster, removeFromRoster } from "../rosters.js";

function findTeamId(teamId: unknown): number {
  const team = db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, Number(teamId)))
    .get();
  if (!team) throw new HttpError(404, "Team not found");
  return team.id;
}

export const rostersRouter = Router();

rostersRouter.post(
  "/teams/:teamId/roster",
  requireCommissioner,
  async (req, res) => {
    const body = addRosterEntryBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Not a VLR player link");
    const teamId = findTeamId(req.params.teamId);
    await addToRoster(teamId, body.data.vlrPlayerUrl, body.data.kind);
    res.status(204).end();
  },
);

rostersRouter.delete(
  "/teams/:teamId/roster/:pickableId",
  requireCommissioner,
  (req, res) => {
    removeFromRoster(
      findTeamId(req.params.teamId),
      Number(req.params.pickableId),
    );
    res.status(204).end();
  },
);
