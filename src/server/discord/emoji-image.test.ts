import sharp from "sharp";
import { expect, test } from "vitest";
import { emojiImageOf } from "./emoji-image.js";

function squareLogo(color: { r: number; g: number; b: number }) {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function pixelAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return { size: info.width, rgba: [...data.subarray(offset, offset + 4)] };
}

test("a bright logo fills the emoji with nothing behind it", async () => {
  const emoji = await emojiImageOf(
    await squareLogo({ r: 30, g: 160, b: 230 }),
    "lightDisc",
  );
  expect(await pixelAt(emoji, 2, 64)).toEqual({
    size: 128,
    rgba: [30, 160, 230, 255],
  });
});

test("a black logo shrinks onto the backdrop so it shows on dark Discord", async () => {
  const emoji = await emojiImageOf(
    await squareLogo({ r: 0, g: 0, b: 0 }),
    "lightDisc",
  );
  expect(await pixelAt(emoji, 64, 64)).toEqual({
    size: 128,
    rgba: [0, 0, 0, 255],
  });
  expect((await pixelAt(emoji, 8, 64)).rgba).toEqual([233, 233, 236, 255]);
});
