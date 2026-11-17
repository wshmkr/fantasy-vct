import { asc, isNull } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { devLoginBodySchema } from "../../shared/api.js";
import type { User } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { HttpError } from "../error-handler.js";
import { findActiveUser, recordLogin, toUser } from "./access.js";
import { setSessionCookie } from "./session.js";

export const devLoginRouter = Router();

devLoginRouter.get("/auth/dev/users", (_req, res: Response<User[]>) => {
  const rows = db
    .select()
    .from(users)
    .where(isNull(users.removedAt))
    .orderBy(asc(users.id))
    .all();
  res.json(rows.map(toUser));
});

devLoginRouter.post("/auth/dev", (req: Request, res: Response<User>) => {
  const body = devLoginBodySchema.safeParse(req.body);
  const user = body.success ? findActiveUser(body.data.userId) : undefined;
  if (!user) throw new HttpError(404, "Unknown user");
  setSessionCookie(res, user.id);
  res.json(toUser(recordLogin(user.id)));
});
