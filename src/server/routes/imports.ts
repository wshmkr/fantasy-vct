import { randomUUID } from "node:crypto";
import { type Response, Router } from "express";
import type { ImportStarted } from "../../shared/api.js";
import type { ImportJob, ImportProgress } from "../../shared/entities.js";
import { requireCommissioner } from "../auth/access.js";
import { env } from "../env.js";
import { HttpError } from "../error-handler.js";

// In memory on purpose: after a restart mid-import, the commissioner just imports again.
const importJobs = new Map<string, ImportJob>();

export function startImportJob(
  runImport: (
    onProgress: (progress: ImportProgress) => void,
  ) => Promise<number>,
): ImportStarted {
  const importId = randomUUID();
  const job: ImportJob = { progress: {}, tournamentId: null, error: null };
  importJobs.set(importId, job);
  runImport(({ phase, done, total }) => {
    job.progress[phase] = { done, total };
  }).then(
    (tournamentId) => {
      job.tournamentId = tournamentId;
    },
    (error: unknown) => {
      if (env.NODE_ENV !== "test") console.error(error);
      job.error = "Import failed";
    },
  );
  return { importId };
}

export const importsRouter = Router();

importsRouter.get(
  "/imports/:importId",
  requireCommissioner,
  (req, res: Response<ImportJob>) => {
    const job = importJobs.get(String(req.params.importId));
    if (!job) throw new HttpError(404, "Not found");
    res.json(job);
  },
);
