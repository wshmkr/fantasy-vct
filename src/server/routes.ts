import { type Request, type Response, Router } from "express";
import type { HealthResponse } from "../shared/api.js";
import type { User } from "../shared/entities.js";
import { requireUser } from "./auth/access.js";
import { devLoginRouter } from "./auth/dev-login.js";
import { createDiscordRouter } from "./auth/discord.js";
import { clearSessionCookie } from "./auth/session.js";
import { env } from "./env.js";
import { draftRouter } from "./routes/draft.js";
import { imagesRouter } from "./routes/images.js";
import { importsRouter } from "./routes/imports.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { matchesRouter } from "./routes/matches.js";
import { membersRouter } from "./routes/members.js";
import { rostersRouter } from "./routes/rosters.js";
import { stagesRouter } from "./routes/stages.js";
import { standingsRouter } from "./routes/standings.js";
import { tournamentsRouter } from "./routes/tournaments.js";

const startedAt = new Date();

export const apiRouter = Router();

apiRouter.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    startedAt: startedAt.toISOString(),
  });
});

if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
  apiRouter.use(
    createDiscordRouter(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET),
  );
}
if (env.DEV_LOGIN) {
  apiRouter.use(devLoginRouter);
}

apiRouter.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

apiRouter.get("/me", requireUser, (_req, res: Response<User>) => {
  res.json(res.locals.user);
});

apiRouter.use(membersRouter);
apiRouter.use(tournamentsRouter);
apiRouter.use(rostersRouter);
apiRouter.use(stagesRouter);
apiRouter.use(draftRouter);
apiRouter.use(matchesRouter);
apiRouter.use(standingsRouter);
apiRouter.use(leaderboardRouter);
apiRouter.use(importsRouter);
apiRouter.use(imagesRouter);
