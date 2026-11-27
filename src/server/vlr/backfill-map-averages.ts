import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { matches, playerMapStats, rawPages } from "../db/schema.js";
import {
  matchOverviewUrl,
  matchPerformanceUrl,
  type ParsedMatchPage,
  parseMatchPages,
} from "./match.js";

export interface BackfillResult {
  filledRows: number;
  skippedMatchIds: number[];
}

function parseSavedPages(
  overviewHtml: string | undefined,
  performanceHtml: string | undefined,
): ParsedMatchPage | null {
  if (!overviewHtml || !performanceHtml) return null;
  try {
    return parseMatchPages(overviewHtml, performanceHtml);
  } catch {
    return null;
  }
}

// Re-reads saved match pages only, so it never contacts VLR.
export function backfillMapAverages(db: Db): BackfillResult {
  const scrapedMatchIds = db
    .selectDistinct({ matchId: playerMapStats.matchId })
    .from(playerMapStats)
    .all()
    .map(({ matchId }) => matchId);
  const scrapedMatches = db
    .select({ id: matches.id, vlrId: matches.vlrId })
    .from(matches)
    .where(inArray(matches.id, scrapedMatchIds))
    .all();
  const savedHtml = (url: string) =>
    db
      .select({ html: rawPages.html })
      .from(rawPages)
      .where(eq(rawPages.url, url))
      .get()?.html;

  let filledRows = 0;
  const skippedMatchIds: number[] = [];
  for (const match of scrapedMatches) {
    const page = parseSavedPages(
      savedHtml(matchOverviewUrl(match.vlrId)),
      savedHtml(matchPerformanceUrl(match.vlrId)),
    );
    if (!page) {
      skippedMatchIds.push(match.id);
      continue;
    }
    db.transaction((tx) => {
      for (const map of page.finishedMaps) {
        for (const { vlrPlayerId, rating, acs, kast, adr } of map.players) {
          filledRows += tx
            .update(playerMapStats)
            .set({ rating, acs, kast, adr })
            .where(
              and(
                eq(playerMapStats.matchId, match.id),
                eq(playerMapStats.mapNo, map.mapNo),
                eq(playerMapStats.vlrPlayerId, vlrPlayerId),
              ),
            )
            .run().changes;
        }
      }
    });
  }
  return { filledRows, skippedMatchIds };
}
