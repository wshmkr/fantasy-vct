import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parsePlayerPage, playerFormUrl } from "./player.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

test("reads the photo, top agents and form of a player with a photo", () => {
  expect(parsePlayerPage(fixture("player-31377-photo.html"))).toEqual({
    handle: "allthewayPat",
    photoUrl: "https://owcdn.net/img/6acd26a4ae18d.png",
    topAgents: [
      {
        name: "Harbor",
        iconUrl: "https://www.vlr.gg/img/vlr/game/agents/harbor.png",
      },
      {
        name: "Brimstone",
        iconUrl: "https://www.vlr.gg/img/vlr/game/agents/brimstone.png",
      },
      {
        name: "Omen",
        iconUrl: "https://www.vlr.gg/img/vlr/game/agents/omen.png",
      },
    ],
    form: { rating: 0.83, acs: 133.4, kd: 0.73, rounds: 147 },
  });
});

test("weights form by rounds over all agents, keeping the top 3 by usage", () => {
  const player = parsePlayerPage(fixture("player-39702-default-picture.html"));
  expect(player.photoUrl).toBe("https://www.vlr.gg/img/base/ph/sil.png");
  expect(player.topAgents.map((agent) => agent.name)).toEqual([
    "Neon",
    "Raze",
    "Chamber",
  ]);
  // Neon 104 rnd @1.31/261.7, Raze 60 @1.42/276.3, Chamber 36 @1.16/238.3, Hush 34 @1.29/263.4; K 224, D 153.
  expect(player.form).toEqual({
    rating: 1.31,
    acs: 262.1,
    kd: 1.46,
    rounds: 234,
  });
});

test("a coach page has a picture but no agents or form", () => {
  expect(parsePlayerPage(fixture("coach-57984.html"))).toEqual({
    handle: "Lecadi",
    photoUrl: "https://www.vlr.gg/img/base/ph/sil.png",
    topAgents: [],
    form: null,
  });
});

test("form comes from the 90-day window", () => {
  expect(playerFormUrl("https://www.vlr.gg/player/31377/allthewaypat")).toBe(
    "https://www.vlr.gg/player/31377/allthewaypat/?timespan=90d",
  );
});
