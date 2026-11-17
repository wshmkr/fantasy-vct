import * as cheerio from "cheerio";
import { absoluteVlrUrl } from "./fetch.js";

export interface ParsedEventTeam {
  vlrId: string;
  name: string;
  vlrUrl: string;
  logoUrl: string | null;
}

export interface ParsedEventPage {
  name: string;
  logoUrl: string | null;
  teams: ParsedEventTeam[];
  matchesUrl: string;
  otherStagePageUrls: string[];
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

export function parseEventPage(html: string): ParsedEventPage {
  const $ = cheerio.load(html);
  const logoSrc = $(".event-header-thumb img").attr("src");
  const matchesHref = $('a.wf-nav-item[href^="/event/matches/"]').attr("href");
  if (!matchesHref) throw new Error("Event page has no matches link");
  const matchesUrl = new URL(absoluteVlrUrl(matchesHref));
  matchesUrl.searchParams.set("series_id", "all");

  return {
    name: $(".event-header-main-title").text().trim(),
    logoUrl: logoSrc ? absoluteVlrUrl(logoSrc) : null,
    teams: teamsOnPage($),
    matchesUrl: matchesUrl.toString(),
    otherStagePageUrls: $(".wf-subnav a.wf-subnav-item:not(.mod-active)")
      .map((_, link) => absoluteVlrUrl($(link).attr("href") ?? ""))
      .get(),
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
      };
    })
    .get();
}
