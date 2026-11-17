import { eq } from "drizzle-orm";
import { Router } from "express";
import { requireUser } from "../auth/access.js";
import { db } from "../db/client.js";
import { images } from "../db/schema.js";
import { HttpError } from "../error-handler.js";

export const imagesRouter = Router();

imagesRouter.get("/images/:imageId", requireUser, (req, res) => {
  const image = db
    .select({ contentType: images.contentType, bytes: images.bytes })
    .from(images)
    .where(eq(images.id, Number(req.params.imageId)))
    .get();
  if (!image) throw new HttpError(404, "Not found");
  res
    .type(image.contentType)
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .send(image.bytes);
});
