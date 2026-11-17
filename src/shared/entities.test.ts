import { expect, test } from "vitest";
import tokens from "../../docs/design-system/tokens.json";
import { MANAGER_COLORS } from "./entities.js";

test("MANAGER_COLORS matches the manager tokens in the design system", () => {
  const managerTokenNames = tokens.color.tokens
    .map(({ name }) => name)
    .filter((name) => name.startsWith("manager-"));
  expect([...MANAGER_COLORS].sort()).toEqual(managerTokenNames.sort());
});
