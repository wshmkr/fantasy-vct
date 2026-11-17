import { expect, test } from "vitest";
import {
  buildLensMaps,
  refractionStrength,
  squircleHeight,
} from "./displacement-map";

const shape = { width: 80, height: 30, cornerRadius: 8, bezel: 14 };
const light = { angleDegrees: -60, opacity: 0.4 };

function shiftAt(maps: ReturnType<typeof buildLensMaps>, x: number, y: number) {
  const offset = (y * maps.width + x) * 4;
  return {
    x: (maps.displacement[offset] ?? 0) - 128,
    y: (maps.displacement[offset + 1] ?? 0) - 128,
  };
}

function highlightAt(
  maps: ReturnType<typeof buildLensMaps>,
  x: number,
  y: number,
) {
  return maps.specular[(y * maps.width + x) * 4 + 3] ?? 0;
}

test("the squircle bezel rises from the edge to a flat top", () => {
  expect(squircleHeight(0)).toBe(0);
  expect(squircleHeight(1)).toBe(1);
  expect(squircleHeight(0.5)).toBeGreaterThan(0.9);
});

test("refraction is strongest at the outer edge and fades to nothing inward", () => {
  expect(refractionStrength(0)).toBeGreaterThan(0.95);
  expect(refractionStrength(0.3)).toBeLessThan(refractionStrength(0.1));
  expect(refractionStrength(0.9)).toBeLessThan(0.05);
  expect(refractionStrength(1)).toBe(0);
});

test("the flat center leaves the backdrop unshifted", () => {
  const maps = buildLensMaps(shape, light);
  expect(shiftAt(maps, 40, 15)).toEqual({ x: 0, y: 0 });
});

test("the bezel samples from further inside the lens", () => {
  const maps = buildLensMaps(shape, light);
  expect(shiftAt(maps, 0, 15).x).toBeGreaterThan(64);
  expect(shiftAt(maps, 79, 15).x).toBeLessThan(-64);
  expect(shiftAt(maps, 40, 0).y).toBeGreaterThan(64);
  expect(shiftAt(maps, 40, 29).y).toBeLessThan(-64);
});

test("the quadrants mirror each other", () => {
  const maps = buildLensMaps(shape, light);
  for (const [x, y] of [
    [3, 4],
    [10, 2],
    [1, 12],
  ] as const) {
    const topLeft = shiftAt(maps, x, y);
    expect(shiftAt(maps, 79 - x, y)).toEqual({
      x: 0 - topLeft.x,
      y: topLeft.y,
    });
    expect(shiftAt(maps, x, 29 - y)).toEqual({
      x: topLeft.x,
      y: 0 - topLeft.y,
    });
  }
});

test("the specular rim lights the top edge and leaves the center clear", () => {
  const maps = buildLensMaps(shape, light);
  expect(highlightAt(maps, 40, 0)).toBeGreaterThan(0);
  expect(highlightAt(maps, 40, 15)).toBe(0);
  expect(highlightAt(maps, 40, 0)).toBeLessThanOrEqual(255 * light.opacity);
});
