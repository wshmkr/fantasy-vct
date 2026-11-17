import * as cheerio from "cheerio";
import { absoluteVlrUrl } from "./fetch.js";
import { DEFAULT_PLAYER_PICTURE_URL } from "./images.js";

const TOP_AGENT_COUNT = 3;
// The player page defaults to 60 days; 90 days is the form window (PLAN §1.2).
const FORM_TIMESPAN = "90d";

export interface ParsedAgent {
  name: string;
  iconUrl: string;
}

export interface FormStats {
  rating: number;
  acs: number;
  kd: number;
  rounds: number;
}

export interface ParsedPlayerPage {
  photoUrl: string;
  topAgents: ParsedAgent[];
  form: FormStats | null;
}

export function playerFormUrl(vlrUrl: string): string {
  return `${vlrUrl}/?timespan=${FORM_TIMESPAN}`;
}

interface AgentRow {
  agent: ParsedAgent;
  mapsPlayed: number;
  rounds: number;
  rating: number;
  acs: number;
  kills: number;
  deaths: number;
}

export function parsePlayerPage(html: string): ParsedPlayerPage {
  const $ = cheerio.load(html);
  const photoSrc =
    $(".player-header .wf-avatar img").attr("src") ??
    DEFAULT_PLAYER_PICTURE_URL;

  // Staff pages have no agents table at all.
  const rows = $("#st-table").length ? parseAgentRows($) : [];

  return {
    photoUrl: absoluteVlrUrl(photoSrc),
    topAgents: rows
      .toSorted((a, b) => b.mapsPlayed - a.mapsPlayed)
      .slice(0, TOP_AGENT_COUNT)
      .map((row) => row.agent),
    form: formFromRows(rows),
  };
}

function parseAgentRows($: cheerio.CheerioAPI): AgentRow[] {
  const columnByTitle = new Map(
    $("#st-table thead th")
      .toArray()
      .map((header, index) => [$(header).attr("title") ?? "", index] as const),
  );
  const column = (title: string) => {
    const index = columnByTitle.get(title);
    if (index === undefined) throw new Error(`No "${title}" column`);
    return index;
  };
  const roundsColumn = column("Rounds played");
  const ratingColumn = column("Rating");
  const acsColumn = column("Average combat score");
  const killsColumn = column("Total kills");
  const deathsColumn = column("Total deaths");
  const usageColumn = column("Usage: (maps played) pick rate");

  return $("#st-table tbody tr")
    .map((_, row): AgentRow => {
      const cells = $(row).children("td");
      const number = (index: number) =>
        Number.parseFloat(cells.eq(index).text().replace(/[(),]/g, "")) || 0;
      const icon = cells.find("img");
      const slug = icon.attr("alt") ?? "";
      return {
        agent: {
          name: slug.charAt(0).toUpperCase() + slug.slice(1),
          iconUrl: absoluteVlrUrl(icon.attr("src") ?? ""),
        },
        mapsPlayed: number(usageColumn),
        rounds: number(roundsColumn),
        rating: number(ratingColumn),
        acs: number(acsColumn),
        kills: number(killsColumn),
        deaths: number(deathsColumn),
      };
    })
    .get();
}

function formFromRows(rows: AgentRow[]): FormStats | null {
  const rounds = sum(rows, (row) => row.rounds);
  if (rounds === 0) return null;
  const deaths = sum(rows, (row) => row.deaths);
  const kills = sum(rows, (row) => row.kills);
  return {
    rating: round(sum(rows, (row) => row.rating * row.rounds) / rounds, 2),
    acs: round(sum(rows, (row) => row.acs * row.rounds) / rounds, 1),
    kd: round(deaths === 0 ? kills : kills / deaths, 2),
    rounds,
  };
}

function sum(rows: AgentRow[], value: (row: AgentRow) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
