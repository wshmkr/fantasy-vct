import { expect, test } from "vitest";
import tokens from "../../docs/design-system/tokens.json";
import { hasTournamentEnded, MANAGER_COLORS } from "./entities.js";

test("MANAGER_COLORS matches the manager tokens in the design system", () => {
  const managerTokenNames = tokens.color.tokens
    .map(({ name }) => name)
    .filter((name) => name.startsWith("manager-"));
  expect([...MANAGER_COLORS].sort()).toEqual(managerTokenNames.sort());
});

test("a tournament ends only after every match and VLR's end date have passed", () => {
  const done = ["completed", "completed"] as const;
  const at = (iso: string) => new Date(iso);
  expect(
    hasTournamentEnded([...done], "2026-12-06", at("2026-11-23T00:00Z")),
  ).toBe(false);
  expect(
    hasTournamentEnded([...done], "2026-12-06", at("2026-12-08T00:00Z")),
  ).toBe(true);
  expect(
    hasTournamentEnded(
      ["completed", "upcoming"],
      "2026-12-06",
      at("2027-01-01T00:00Z"),
    ),
  ).toBe(false);
  expect(hasTournamentEnded([...done], null, at("2026-11-23T00:00Z"))).toBe(
    true,
  );
});
