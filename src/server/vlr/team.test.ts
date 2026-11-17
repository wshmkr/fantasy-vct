import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseTeamPage } from "./team.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

test("reads the active players and the head coach, skipping other staff", () => {
  const team = parseTeamPage(fixture("team-23640.html"));
  expect(team.players.map((player) => player.handle)).toEqual([
    "allthewayPat",
    "Ochman",
    "vertual",
    "Suzuya",
    "Aleksey",
    "shjin",
  ]);
  expect(team.players[0]).toEqual({
    vlrId: "31377",
    handle: "allthewayPat",
    vlrUrl: "https://www.vlr.gg/player/31377/allthewaypat",
  });
  expect(team.headCoach).toEqual({
    vlrId: "57984",
    handle: "Lecadi",
    vlrUrl: "https://www.vlr.gg/player/57984/lecadi",
  });
});

test("a team without staff has no head coach", () => {
  const team = parseTeamPage(fixture("team-23401-no-coach.html"));
  expect(team.players).toHaveLength(5);
  expect(team.headCoach).toBeNull();
});

test("players marked inactive are excluded", () => {
  const html = fixture("team-23640.html").replace(
    /(team-roster-item-name-role">\s*)Sub/,
    "$1Inactive",
  );
  const handles = parseTeamPage(html).players.map((player) => player.handle);
  expect(handles).toHaveLength(5);
  expect(handles).not.toContain("shjin");
});
