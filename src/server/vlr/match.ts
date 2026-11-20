import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { MatchStatus } from "../../shared/entities.js";
import { isFinishedMap, type MapStatLine } from "../../shared/scoring.js";
import { vlrIdFromHref } from "./event.js";
import { absoluteVlrUrl } from "./fetch.js";

type TeamSide = 1 | 2;

export interface ParsedPlayerMapStats extends MapStatLine {
  vlrPlayerId: string;
  handle: string;
  side: TeamSide;
}

export interface ParsedMap {
  mapNo: number;
  mapName: string;
  team1Rounds: number;
  team2Rounds: number;
  players: ParsedPlayerMapStats[];
}

export interface ParsedMatchPage {
  team1VlrId: string;
  team2VlrId: string;
  bestOf: number;
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
  forfeitWinner: TeamSide | null;
  finishedMaps: ParsedMap[];
}

type MultiKillsAndClutches = Pick<
  ParsedPlayerMapStats,
  "mk3" | "mk4" | "aces" | "clutches"
>;

const CLUTCH_COLUMNS = ["1v1", "1v2", "1v3", "1v4", "1v5"];

export const matchOverviewUrl = (vlrId: string) => absoluteVlrUrl(`/${vlrId}`);

// The all-maps performance tab still holds a separate table per map.
export const matchPerformanceUrl = (vlrId: string) =>
  absoluteVlrUrl(`/${vlrId}/?game=all&tab=performance`);

// VLR nests popups and labels inside these elements; only the element's own text is the value.
function ownText(element: cheerio.Cheerio<AnyNode>): string {
  return element.clone().children().remove().end().text().trim();
}

// VLR shows "forfeited by <team>" where a played match says "final".
const isForfeitNote = (note: string) => note.startsWith("forfeited by");

function toCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const count = Number(trimmed);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Not a count: ${trimmed}`);
  }
  return count;
}

function matchStatusOf(note: string): MatchStatus {
  if (note === "final" || isForfeitNote(note)) return "completed";
  if (note === "live") return "live";
  return "upcoming";
}

export function parseMatchPages(
  overviewHtml: string,
  performanceHtml: string,
): ParsedMatchPage {
  const $ = cheerio.load(overviewHtml);
  const performance = parsePerformancePage(performanceHtml);

  const teamVlrId = (side: TeamSide) => {
    const href = $(`.match-header-link.mod-${side}`).attr("href");
    if (!href) throw new Error("Match page has no teams");
    return vlrIdFromHref(href);
  };
  const [statusNote = "", formatNote = ""] = $(".match-header-vs-note")
    .map((_, note) => $(note).text().trim().toLowerCase())
    .get();
  const bestOf = /bo(\d)/.exec(formatNote)?.[1];
  if (!bestOf) throw new Error("Match page has no best-of");
  const status = matchStatusOf(statusNote);
  const scoreSpans = $(".match-header-vs .sp-hide span").not(
    ".match-header-vs-score-colon",
  );
  const [score1 = null, score2 = null] =
    status === "upcoming"
      ? []
      : scoreSpans.map((_, score) => toCount($(score).text())).get();
  const forfeitWinner: TeamSide | null = isForfeitNote(statusNote)
    ? scoreSpans.last().hasClass("match-header-vs-score-winner")
      ? 2
      : 1
    : null;

  const finishedMaps: ParsedMap[] = [];
  // Maps played before a forfeit don't score.
  if (forfeitWinner === null) {
    $(".vm-stats-gamesnav-item")
      .not('[data-game-id="all"]')
      .each((index, navItem) => {
        const gameId = $(navItem).attr("data-game-id");
        const game = $(`.vm-stats-game[data-game-id="${gameId}"]`);
        if (game.length === 0) return;
        const header = game.find(".vm-stats-game-header");
        const team1Rounds = toCount(header.find(".team .score").first().text());
        const team2Rounds = toCount(
          header.find(".team.mod-right .score").text(),
        );
        if (!isFinishedMap(team1Rounds, team2Rounds)) return;

        const mapPerformance = performance.get(gameId ?? "");
        const players = game
          .find(".ovw-table")
          .toArray()
          .flatMap((table, tableIndex) =>
            $(table)
              .find(".ovw-row")
              .not(".mod-head")
              .map((_, row): ParsedPlayerMapStats => {
                const link = $(row).find(".ovw-player a");
                const handle = link.find(".ovw-player-name").text().trim();
                const stat = (column: string) =>
                  toCount(
                    $(row)
                      .find(`[data-col="${column}"] .side.mod-both`)
                      .first()
                      .text(),
                  );
                const highlights = mapPerformance?.get(handle);
                if (!highlights) {
                  throw new Error(`No performance stats for ${handle}`);
                }
                return {
                  vlrPlayerId: vlrIdFromHref(link.attr("href") ?? ""),
                  handle,
                  side: tableIndex === 0 ? 1 : 2,
                  k: stat("kills"),
                  d: stat("deaths"),
                  a: stat("assists"),
                  fk: stat("fb"),
                  fd: stat("fd"),
                  ...highlights,
                };
              })
              .get(),
          );

        finishedMaps.push({
          mapNo: index + 1,
          mapName: ownText(header.find(".map-name > span").first()),
          team1Rounds,
          team2Rounds,
          players,
        });
      });
  }

  return {
    team1VlrId: teamVlrId(1),
    team2VlrId: teamVlrId(2),
    bestOf: Number(bestOf),
    status,
    score1,
    score2,
    forfeitWinner,
    finishedMaps,
  };
}

function parsePerformancePage(
  html: string,
): Map<string, Map<string, MultiKillsAndClutches>> {
  const $ = cheerio.load(html);
  const byGameId = new Map<string, Map<string, MultiKillsAndClutches>>();
  $(".vm-stats-game").each((_, game) => {
    const table = $(game).find("table.mod-adv-stats");
    const columns = table
      .find("tr")
      .first()
      .find("th")
      .map((_, th) => $(th).text().trim())
      .get();
    const byHandle = new Map<string, MultiKillsAndClutches>();
    table
      .find("tr")
      .slice(1)
      .each((_, row) => {
        const cells = $(row).children("td");
        const count = (column: string) => {
          const columnIndex = columns.indexOf(column);
          if (columnIndex === -1) throw new Error(`No ${column} column`);
          return toCount(
            ownText(cells.eq(columnIndex).find(".stats-sq").first()),
          );
        };
        const handle = ownText(cells.first().find(".team > div").first());
        byHandle.set(handle, {
          mk3: count("3K"),
          mk4: count("4K"),
          aces: count("5K"),
          clutches: CLUTCH_COLUMNS.reduce(
            (sum, column) => sum + count(column),
            0,
          ),
        });
      });
    byGameId.set($(game).attr("data-game-id") ?? "", byHandle);
  });
  return byGameId;
}
