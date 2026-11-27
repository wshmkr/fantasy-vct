import { type Response, Router } from "express";
import type { LeaderboardResponse } from "../../shared/api.js";
import { requireUser } from "../auth/access.js";
import { leaderboardOf } from "../leaderboard.js";

export const leaderboardRouter = Router();

leaderboardRouter.get(
  "/tournaments/:tournamentId/leaderboard",
  requireUser,
  (req, res: Response<LeaderboardResponse>) => {
    res.json(leaderboardOf(Number(req.params.tournamentId)));
  },
);
