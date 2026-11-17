import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { addMemberBodySchema } from "../../shared/api.js";
import type { User } from "../../shared/entities.js";
import { requireCommissioner, toUser } from "../auth/access.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { HttpError } from "../error-handler.js";

export const membersRouter = Router();

membersRouter.use("/members", requireCommissioner);

membersRouter.get("/members", (_req, res: Response<User[]>) => {
  const rows = db
    .select()
    .from(users)
    .where(isNull(users.removedAt))
    .orderBy(asc(users.role), asc(users.addedAt), asc(users.id))
    .all();
  res.json(rows.map(toUser));
});

membersRouter.post("/members", (req: Request, res: Response<User>) => {
  const body = addMemberBodySchema.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Invalid username");
  const { discordUsername } = body.data;

  const addedOrRestored = db
    .insert(users)
    .values({ discordUsername })
    .onConflictDoUpdate({
      target: users.discordUsername,
      set: { removedAt: null },
      setWhere: isNotNull(users.removedAt),
    })
    .returning()
    .get();
  if (!addedOrRestored) throw new HttpError(409, "Already added");
  res.status(201).json(toUser(addedOrRestored));
});

membersRouter.delete("/members/:userId", (req: Request, res: Response) => {
  const removed = db
    .update(users)
    .set({ removedAt: new Date().toISOString() })
    .where(
      and(
        eq(users.id, Number(req.params.userId)),
        eq(users.role, "member"),
        isNull(users.removedAt),
      ),
    )
    .returning()
    .get();
  if (!removed) throw new HttpError(404, "Not found");
  res.status(204).end();
});
