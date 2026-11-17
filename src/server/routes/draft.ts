import { type Response, Router } from "express";
import { z } from "zod";
import { draftActionBodySchema } from "../../shared/api.js";
import { DRAFT_CONTROLS, type DraftState } from "../../shared/entities.js";
import { requireCommissioner, requireUser } from "../auth/access.js";
import { performDraftAction, runDraftControl } from "../draft/service.js";
import { openDraftStream } from "../draft/sse.js";
import { readDraftState } from "../draft/state.js";
import { HttpError } from "../error-handler.js";
import { findStage } from "../stages.js";

const draftControlSchema = z.enum(DRAFT_CONTROLS);

export const draftRouter = Router();

draftRouter.get(
  "/stages/:stageId/draft",
  requireUser,
  (req, res: Response<DraftState>) => {
    res.json(readDraftState(Number(req.params.stageId)));
  },
);

draftRouter.get("/stages/:stageId/draft/stream", requireUser, (req, res) => {
  const stage = findStage(Number(req.params.stageId));
  openDraftStream(stage.id, req, res);
});

draftRouter.post("/stages/:stageId/draft/actions", requireUser, (req, res) => {
  const body = draftActionBodySchema.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Invalid action");
  performDraftAction(Number(req.params.stageId), res.locals.user, body.data);
  res.status(204).end();
});

draftRouter.post(
  "/stages/:stageId/draft/:control",
  requireCommissioner,
  (req, res) => {
    const control = draftControlSchema.safeParse(req.params.control);
    if (!control.success) throw new HttpError(404, "Not found");
    runDraftControl(Number(req.params.stageId), control.data);
    res.status(204).end();
  },
);
