import { type Request, type Response, Router } from "express";
import type { HealthResponse } from "../shared/api.js";

const startedAt = new Date();

export const apiRouter = Router();

apiRouter.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    startedAt: startedAt.toISOString(),
  });
});
