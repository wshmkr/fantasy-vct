import * as cheerio from "cheerio";
import { vlrIdFromHref } from "./event.js";
import { absoluteVlrUrl } from "./fetch.js";

export interface EventPlayerStats {
  rating: number | null;
  acs: number | null;
  kast: number | null;
  adr: number | null;
}

// Stage keys filter VLR's stats to those stages; the order must stay stable since the URL is the cache key.
export const eventStatsUrl = (vlrEventId: string, stageKeys: string[]) =>
  absoluteVlrUrl(
    `/event/stats/${vlrEventId}?${stageKeys.map((key) => `stage%5B%5D=${key}`).join("&")}`,
  );

function toOptionalNumber(text: string): number | null {
  const value = Number.parseFloat(text.replace("%", ""));
  return Number.isNaN(value) ? null : value;
}

// Keyed by VLR player id; VLR lists every player with a round in the selected stages.
export function parseEventStatsPage(
  html: string,
): Map<string, EventPlayerStats> {
  const $ = cheerio.load(html);
  const statsByPlayer = new Map<string, EventPlayerStats>();
  $("#st-table tbody tr").each((_, row) => {
    const href = $(row).find("td.mod-player a").attr("href");
    if (!href) return;
    const stat = (column: string) =>
      toOptionalNumber($(row).find(`td[data-col="${column}"]`).text().trim());
    statsByPlayer.set(vlrIdFromHref(href), {
      rating: stat("rating"),
      acs: stat("acs"),
      kast: stat("kast"),
      adr: stat("adr"),
    });
  });
  return statsByPlayer;
}

export interface EventStatsScope {
  // Null is the whole tournament.
  stageId: number | null;
  url: string;
}

// Stages without VLR keys (made by hand) have no stats page.
export function eventStatsScopesOf(
  vlrEventId: string,
  stagesInOrder: { id: number; vlrStageKeysJson: string[] }[],
): EventStatsScope[] {
  const allKeys = stagesInOrder.flatMap((stage) => stage.vlrStageKeysJson);
  if (allKeys.length === 0) return [];
  return [
    { stageId: null, url: eventStatsUrl(vlrEventId, allKeys) },
    ...stagesInOrder.flatMap((stage) =>
      stage.vlrStageKeysJson.length === 0
        ? []
        : [
            {
              stageId: stage.id,
              url: eventStatsUrl(vlrEventId, stage.vlrStageKeysJson),
            },
          ],
    ),
  ];
}
