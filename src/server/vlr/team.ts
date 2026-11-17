import * as cheerio from "cheerio";
import { vlrIdFromHref } from "./event.js";
import { absoluteVlrUrl } from "./fetch.js";

export interface ParsedPerson {
  vlrId: string;
  handle: string;
  vlrUrl: string;
}

export interface ParsedTeamPage {
  players: ParsedPerson[];
  headCoach: ParsedPerson | null;
}

export function parseTeamPage(html: string): ParsedTeamPage {
  const $ = cheerio.load(html);
  const players: ParsedPerson[] = [];
  let headCoach: ParsedPerson | null = null;

  $(".wf-module-label").each((_, label) => {
    const section = $(label).text().trim().toLowerCase();
    if (section !== "players" && section !== "staff") return;
    $(label)
      .next()
      .find(".team-roster-item")
      .each((_, item) => {
        const link = $(item).find("a[href^='/player/']");
        const href = link.attr("href");
        if (!href) return;
        const role = $(item)
          .find(".team-roster-item-name-role")
          .text()
          .trim()
          .toLowerCase();
        const person = {
          vlrId: vlrIdFromHref(href),
          handle: $(item)
            .find(".team-roster-item-name-alias")
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .trim(),
          vlrUrl: absoluteVlrUrl(href),
        };
        if (section === "players" && !role.includes("inactive")) {
          players.push(person);
        } else if (section === "staff" && role === "head coach") {
          headCoach ??= person;
        }
      });
  });

  return { players, headCoach };
}
