import * as cheerio from "cheerio";
import { absoluteVlrUrl } from "./fetch.js";

export interface ParsedPerson {
  vlrId: string;
  handle: string;
  vlrUrl: string;
}

export interface ParsedEventTeam {
  vlrId: string;
  name: string;
  vlrUrl: string;
  logoUrl: string | null;
  registeredPlayers: ParsedPerson[];
}

export interface ParsedEventPage {
  name: string;
  logoUrl: string | null;
  teams: ParsedEventTeam[];
  matchesUrl: string;
  otherStagePageUrls: string[];
  endsOn: string | null;
}

export function vlrEventIdFromUrl(url: string): string {
  const match = /vlr\.gg\/event\/(\d+)/.exec(url);
  if (!match?.[1]) throw new Error("Not a VLR event URL");
  return match[1];
}

export function vlrIdFromHref(href: string): string {
  const match = /^\/\w+\/(\d+)/.exec(href);
  if (!match?.[1]) throw new Error(`No VLR id in ${href}`);
  return match[1];
}

export function personFromHref(href: string, handle: string): ParsedPerson {
  return { vlrId: vlrIdFromHref(href), handle, vlrUrl: absoluteVlrUrl(href) };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// VLR writes ranges like "Nov 20 – Dec 6, 2026" or "Dec 1–6, 2026"; returns "YYYY-MM-DD".
export function eventEndDate(dates: string): string | null {
  const end = /(?:([A-Z][a-z]{2})[a-z]*\s+)?(\d{1,2}),\s*(\d{4})\s*$/.exec(
    dates,
  );
  if (!end) return null;
  const [, endMonth, day, year] = end;
  const month =
    endMonth ?? [...dates.matchAll(/([A-Z][a-z]{2})[a-z]*\s+\d/g)].at(-1)?.[1];
  const monthIndex = MONTHS.indexOf(month ?? "");
  if (monthIndex < 0) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day?.padStart(2, "0")}`;
}

export function parseEventPage(html: string): ParsedEventPage {
  const $ = cheerio.load(html);
  const logoSrc = $(".event-header-thumb img").attr("src");
  const matchesHref = $('a.wf-nav-item[href^="/event/matches/"]').attr("href");
  if (!matchesHref) throw new Error("Event page has no matches link");
  const matchesUrl = new URL(absoluteVlrUrl(matchesHref));
  matchesUrl.searchParams.set("series_id", "all");
  const datesValue = $(".event-header-main-meta > div")
    .filter((_, item) => $(item).find(".label").text().trim() === "Dates")
    .find(".value")
    .text();

  return {
    name: $(".event-header-main-title").text().trim(),
    logoUrl: logoSrc ? absoluteVlrUrl(logoSrc) : null,
    teams: teamsOnPage($),
    matchesUrl: matchesUrl.toString(),
    otherStagePageUrls: $(".wf-subnav a.wf-subnav-item:not(.mod-active)")
      .map((_, link) => absoluteVlrUrl($(link).attr("href") ?? ""))
      .get(),
    endsOn: eventEndDate(datesValue.trim()),
  };
}

// Each stage tab of the event page lists only that stage's teams; TBD slots have no link.
export function parseEventTeams(html: string): ParsedEventTeam[] {
  return teamsOnPage(cheerio.load(html));
}

function teamsOnPage($: cheerio.CheerioAPI): ParsedEventTeam[] {
  return $(".event-team")
    .map((_, card) => {
      const nameLink = $(card).find("a.event-team-name[href]");
      const href = nameLink.attr("href");
      if (!href) return null;
      const logoSrc = $(card)
        .find("img.event-team-players-mask-team")
        .attr("src");
      return {
        vlrId: vlrIdFromHref(href),
        name: nameLink.text().trim(),
        vlrUrl: absoluteVlrUrl(href),
        logoUrl: logoSrc ? absoluteVlrUrl(logoSrc) : null,
        registeredPlayers: $(card)
          .find("a.event-team-players-item[href^='/player/']")
          .map((_, link) =>
            personFromHref($(link).attr("href") ?? "", $(link).text().trim()),
          )
          .get(),
      };
    })
    .get();
}
