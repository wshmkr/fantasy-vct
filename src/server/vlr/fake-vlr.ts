import { readFileSync } from "node:fs";
import type { Download } from "./fetch.js";

export const FIXTURE_EVENT_URL =
  "https://www.vlr.gg/event/3124/spike-series-2026-convergence-emea-dach";

export const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

function matchFixtures(vlrId: string, fixturePrefix: string) {
  return {
    [`https://www.vlr.gg/${vlrId}`]: `${fixturePrefix}-overview.html`,
    [`https://www.vlr.gg/${vlrId}/?game=all&tab=performance`]: `${fixturePrefix}-performance.html`,
  };
}

const fixtureByUrl: Record<string, string> = {
  [FIXTURE_EVENT_URL]: "event-3124.html",
  [`${FIXTURE_EVENT_URL}/playoffs`]: "event-3124-playoffs.html",
  "https://www.vlr.gg/event/matches/3124/spike-series-2026-convergence-emea-dach/?series_id=all":
    "matches-3124.html",
  "https://www.vlr.gg/team/23401/backed-by-nobody": "team-23401-no-coach.html",
  "https://www.vlr.gg/team/23640/team-international": "team-23640.html",
  "https://www.vlr.gg/player/31377/allthewaypat/?timespan=90d":
    "player-31377-photo.html",
  "https://www.vlr.gg/player/39702/ochman/?timespan=90d":
    "player-39702-default-picture.html",
  "https://www.vlr.gg/player/57984/lecadi": "coach-57984.html",
  ...matchFixtures("314896", "match-314896-bo3-2-0"),
  ...matchFixtures("314929", "match-314929-bo3-2-1-overtime"),
  ...matchFixtures("314898", "match-314898-sub"),
  ...matchFixtures("784786", "match-784786-forfeit"),
};
const EMPTY_TEAM_PAGE = `<div class="wf-module-label">players</div><div></div>`;

export function createFakeVlr() {
  const downloadedUrls: string[] = [];
  async function download(url: string): Promise<Download> {
    downloadedUrls.push(url);
    const fixtureName = fixtureByUrl[url];
    const html = fixtureName
      ? fixture(fixtureName)
      : url.includes("/team/")
        ? EMPTY_TEAM_PAGE
        : url.includes("/player/")
          ? fixture("player-39702-default-picture.html")
          : null;
    if (html) return { contentType: "text/html", bytes: Buffer.from(html) };
    return { contentType: "image/png", bytes: Buffer.from(url) };
  }
  return { download, downloadedUrls };
}
