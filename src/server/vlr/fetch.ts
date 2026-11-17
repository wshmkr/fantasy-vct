import { setTimeout } from "node:timers/promises";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { rawPages } from "../db/schema.js";

const VLR_BASE_URL = "https://www.vlr.gg";
const USER_AGENT = "fantasy-vct-bot/0.1";
const MIN_REQUEST_INTERVAL_MS = 3000;

export interface Download {
  contentType: string;
  bytes: Buffer;
}

export type Downloader = (url: string) => Promise<Download>;

export interface VlrSource {
  db: Db;
  download: Downloader;
  refresh: boolean;
}

export function absoluteVlrUrl(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  return new URL(href, VLR_BASE_URL).toString();
}

async function httpDownload(url: string): Promise<Download> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`VLR ${response.status} for ${url}`);
  return {
    contentType: response.headers.get("content-type") ?? "",
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

export function createThrottledDownloader({
  download = httpDownload,
  sleep = setTimeout,
  now = Date.now,
  minIntervalMs = MIN_REQUEST_INTERVAL_MS,
}: {
  download?: Downloader;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
} = {}): Downloader {
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  return (url) => {
    const result = queue.then(async () => {
      const waitMs = lastRequestAt + minIntervalMs - now();
      if (waitMs > 0) await sleep(waitMs);
      try {
        return await download(url);
      } finally {
        lastRequestAt = now();
      }
    });
    queue = result.catch(() => undefined);
    return result;
  };
}

// One queue for the whole process, so concurrent imports still respect VLR's pace (PLAN §2.5).
export const vlrDownloader = createThrottledDownloader();

export async function fetchPage(
  { db, download, refresh }: VlrSource,
  url: string,
): Promise<string> {
  if (!refresh) {
    const cached = db
      .select({ html: rawPages.html })
      .from(rawPages)
      .where(eq(rawPages.url, url))
      .get();
    if (cached) return cached.html;
  }
  const html = (await download(url)).bytes.toString("utf8");
  const fetchedAt = new Date().toISOString();
  db.insert(rawPages)
    .values({ url, html, fetchedAt })
    .onConflictDoUpdate({ target: rawPages.url, set: { html, fetchedAt } })
    .run();
  return html;
}
