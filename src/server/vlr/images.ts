import { eq } from "drizzle-orm";
import { images } from "../db/schema.js";
import { absoluteVlrUrl, type VlrSource } from "./fetch.js";

export const DEFAULT_PLAYER_PICTURE_URL = absoluteVlrUrl(
  "/img/base/ph/sil.png",
);

export async function storeImage(
  { db, download }: VlrSource,
  href: string,
): Promise<number> {
  const sourceUrl = absoluteVlrUrl(href);
  const existing = db
    .select({ id: images.id })
    .from(images)
    .where(eq(images.sourceUrl, sourceUrl))
    .get();
  if (existing) return existing.id;
  const { contentType, bytes } = await download(sourceUrl);
  return db
    .insert(images)
    .values({ sourceUrl, contentType, bytes })
    .returning({ id: images.id })
    .get().id;
}
