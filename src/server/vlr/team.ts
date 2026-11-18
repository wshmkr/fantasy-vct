import * as cheerio from "cheerio";
import { type ParsedPerson, personFromHref } from "./event.js";

export interface ParsedTeamPage {
  players: ParsedPerson[];
  headCoach: ParsedPerson | null;
}

// Subs are left out of the draft pool; substitutions get handled later from match data.
const benchedRoles = ["sub", "inactive"];

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
        const person = personFromHref(
          href,
          $(item)
            .find(".team-roster-item-name-alias")
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .trim(),
        );
        if (section === "players" && !benchedRoles.includes(role)) {
          players.push(person);
        } else if (section === "staff" && role === "head coach") {
          headCoach ??= person;
        }
      });
  });

  return { players, headCoach };
}
