import * as cheerio from "cheerio";
import type { MatchStatus } from "../../shared/entities.js";
import { absoluteVlrUrl } from "./fetch.js";

// VLR's own value for "every stage"; used as the key of an event without a stage list.
export const ALL_STAGES_KEY = "all";
const DEFAULT_BEST_OF = 3;
// The matches page renders times without a zone, in US Eastern for anonymous visitors.
const VLR_PAGE_TIME_ZONE = "America/New_York";

export interface ParsedStage {
  key: string;
  name: string;
}

export interface ParsedMatch {
  vlrId: string;
  stageKey: string;
  team1Name: string | null;
  team2Name: string | null;
  bestOf: number;
  scheduledAt: string | null;
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
}

export interface ParsedSchedule {
  stages: ParsedStage[];
  matches: ParsedMatch[];
}

const MATCH_STATUS_BY_LABEL: Record<string, MatchStatus> = {
  completed: "completed",
  live: "live",
};

export function parseMatchesPage(html: string): ParsedSchedule {
  const $ = cheerio.load(html);
  // VLR lists the newest stage first; stages are numbered in the order they're played.
  const stages = $('.zx-dropdown[data-group="series"] a.opt')
    .map((_, link) => ({
      key: new URL(absoluteVlrUrl($(link).attr("href") ?? "")).searchParams.get(
        "series_id",
      ),
      name: $(link).text().trim(),
    }))
    .get()
    .filter((stage): stage is ParsedStage => Boolean(stage.key))
    .reverse();
  const stageKeyByName = new Map(
    stages.map((stage) => [stage.name, stage.key]),
  );

  const matches = $("a.match-item")
    .map((_, item): ParsedMatch => {
      const match = $(item);
      const vlrId = /^\/(\d+)\//.exec(match.attr("href") ?? "")?.[1];
      if (!vlrId) throw new Error("Match without a VLR id");
      const stageName = match
        .find(".match-item-event")
        .clone()
        .children(".match-item-event-series")
        .remove()
        .end()
        .text()
        .trim();
      const [team1Name = null, team2Name = null] = match
        .find(".match-item-vs-team-name .text-of")
        .map((_, name) => $(name).text().trim())
        .get()
        .map((name) => (name === "TBD" ? null : name));
      const status =
        MATCH_STATUS_BY_LABEL[
          match.find(".ml-status").text().trim().toLowerCase()
        ] ?? "upcoming";
      const [score1 = null, score2 = null] =
        status === "upcoming"
          ? [null, null]
          : match
              .find(".match-item-vs-team-score")
              .map((_, score) => Number.parseInt($(score).text().trim(), 10))
              .get()
              .map((score) => (Number.isNaN(score) ? null : score));
      const dateLabel = match.closest(".wf-card").prev(".wf-label").text();
      const timeLabel = match.find(".match-item-time").text().trim();

      return {
        vlrId,
        stageKey: stageKeyByName.get(stageName) ?? ALL_STAGES_KEY,
        team1Name,
        team2Name,
        bestOf: bestOfFromScore(status, score1, score2),
        scheduledAt: easternTimeToIso(dateLabel, timeLabel),
        status,
        score1,
        score2,
      };
    })
    .get();

  return { stages, matches };
}

// The matches list doesn't show the series format; a finished series reveals it, the rest assume Bo3.
function bestOfFromScore(
  status: MatchStatus,
  score1: number | null,
  score2: number | null,
): number {
  const winningScore = Math.max(score1 ?? 0, score2 ?? 0);
  if (status !== "completed" || winningScore === 0) return DEFAULT_BEST_OF;
  return winningScore * 2 - 1;
}

function easternTimeToIso(dateLabel: string, timeLabel: string): string | null {
  const date = /([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(dateLabel);
  const time = /(\d{1,2}):(\d{2}) (AM|PM)/.exec(timeLabel);
  if (!date || !time) return null;
  const [, monthName, day, year] = date;
  const [, hour12, minute, meridiem] = time;
  const month = new Date(`${monthName} 1, 2000`).getMonth();
  const hour = (Number(hour12) % 12) + (meridiem === "PM" ? 12 : 0);
  const wallClockAsUtc = Date.UTC(
    Number(year),
    month,
    Number(day),
    hour,
    Number(minute),
  );
  // The offset depends on the instant we're solving for, so refine once to land on the right side of a DST change.
  const firstGuess = wallClockAsUtc - timeZoneOffsetMs(wallClockAsUtc);
  return new Date(wallClockAsUtc - timeZoneOffsetMs(firstGuess)).toISOString();
}

const pageTimeZoneOffsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: VLR_PAGE_TIME_ZONE,
  timeZoneName: "longOffset",
});

function timeZoneOffsetMs(instant: number): number {
  const offsetLabel = pageTimeZoneOffsetFormat
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetLabel ?? "");
  if (!offset) return 0;
  const [, sign, hours, minutes] = offset;
  return (
    (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000
  );
}
