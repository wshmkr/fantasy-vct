import { and, asc, desc, eq } from "drizzle-orm";
import { type Response, Router } from "express";
import {
  updatePoolEntryBodySchema,
  updateStageBodySchema,
} from "../../shared/api.js";
import type { StagePoolTeam } from "../../shared/entities.js";
import { requireCommissioner } from "../auth/access.js";
import { db } from "../db/client.js";
import { pickables, stagePool, stages, teams } from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { toPickable } from "../pickables.js";

type StageRow = typeof stages.$inferSelect;

function findSetupStage(stageId: unknown): StageRow {
  const row = db
    .select()
    .from(stages)
    .where(eq(stages.id, Number(stageId)))
    .get();
  if (!row) throw new HttpError(404, "Not found");
  if (row.status !== "setup") throw new HttpError(400, "Draft started");
  return row;
}

export const stagesRouter = Router();

stagesRouter.patch("/stages/:stageId", requireCommissioner, (req, res) => {
  const body = updateStageBodySchema.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Invalid stage");
  const stage = findSetupStage(req.params.stageId);
  db.update(stages).set(body.data).where(eq(stages.id, stage.id)).run();
  res.status(204).end();
});

stagesRouter.delete("/stages/:stageId", requireCommissioner, (req, res) => {
  const stage = findSetupStage(req.params.stageId);
  db.delete(stages).where(eq(stages.id, stage.id)).run();
  res.status(204).end();
});

stagesRouter.get(
  "/stages/:stageId/pool",
  requireCommissioner,
  (req, res: Response<StagePoolTeam[]>) => {
    const stageId = Number(req.params.stageId);
    const rows = db
      .select({ team: teams, pickable: pickables, removed: stagePool.removed })
      .from(stagePool)
      .innerJoin(pickables, eq(pickables.id, stagePool.pickableId))
      .innerJoin(teams, eq(teams.id, pickables.teamId))
      .where(eq(stagePool.stageId, stageId))
      .orderBy(asc(teams.name), desc(pickables.kind), asc(pickables.id))
      .all();

    const poolTeams = new Map<number, StagePoolTeam>();
    for (const { team, pickable, removed } of rows) {
      const poolTeam = poolTeams.get(team.id) ?? {
        id: team.id,
        name: team.name,
        logoImageId: team.logoImageId,
        pool: [],
      };
      poolTeam.pool.push({ ...toPickable(pickable), removed });
      poolTeams.set(team.id, poolTeam);
    }
    res.json([...poolTeams.values()]);
  },
);

stagesRouter.patch(
  "/stages/:stageId/pool/:pickableId",
  requireCommissioner,
  (req, res) => {
    const body = updatePoolEntryBodySchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Invalid entry");
    const stage = findSetupStage(req.params.stageId);
    const updated = db
      .update(stagePool)
      .set({ removed: body.data.removed })
      .where(
        and(
          eq(stagePool.stageId, stage.id),
          eq(stagePool.pickableId, Number(req.params.pickableId)),
        ),
      )
      .returning()
      .get();
    if (!updated) throw new HttpError(404, "Not found");
    res.status(204).end();
  },
);
