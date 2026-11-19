import { type Response, Router } from "express";
import type { StandingsResponse } from "../../shared/api.js";
import { requireUser } from "../auth/access.js";
import { standingsOf } from "../standings.js";

export const standingsRouter = Router();

standingsRouter.get(
  "/tournaments/:tournamentId/standings",
  requireUser,
  (req, res: Response<StandingsResponse>) => {
    res.json({ managers: standingsOf(Number(req.params.tournamentId)) });
  },
);
