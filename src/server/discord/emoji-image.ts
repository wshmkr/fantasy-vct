import sharp from "sharp";

const EMOJI_SIZE = 128;
// A dark logo shrinks a little so the backdrop shows around it.
const LOGO_ON_BACKDROP_SIZE = 100;
// A pixel this dark (WCAG relative luminance, 0–1) disappears on Discord's dark theme…
const NEAR_BLACK_LUMINANCE = 0.05;
// …and a logo needs a backdrop once this share of its visible pixels are that dark.
const DARK_LOGO_SHARE = 0.5;

export const BACKDROPS = {
  orangeGlow: `<svg xmlns="http://www.w3.org/2000/svg" width="${EMOJI_SIZE}" height="${EMOJI_SIZE}">
    <defs><radialGradient id="glow">
      <stop offset="60%" stop-color="#ff7a1a"/>
      <stop offset="100%" stop-color="#ff7a1a" stop-opacity="0"/>
    </radialGradient></defs>
    <circle cx="64" cy="64" r="64" fill="url(#glow)"/>
  </svg>`,
  lightDisc: `<svg xmlns="http://www.w3.org/2000/svg" width="${EMOJI_SIZE}" height="${EMOJI_SIZE}">
    <circle cx="64" cy="64" r="63" fill="#e9e9ec"/>
  </svg>`,
} as const;

export type Backdrop = keyof typeof BACKDROPS;

const linear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

async function nearBlackShare(png: Buffer): Promise<number> {
  const { data } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let nearBlack = 0;
  let visible = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = (data[i + 3] ?? 0) / 255;
    const luminance =
      0.2126 * linear(data[i] ?? 0) +
      0.7152 * linear(data[i + 1] ?? 0) +
      0.0722 * linear(data[i + 2] ?? 0);
    visible += alpha;
    if (luminance < NEAR_BLACK_LUMINANCE) nearBlack += alpha;
  }
  return visible === 0 ? 0 : nearBlack / visible;
}

// Discord can't put anything behind an emoji, so dark logos get their backdrop baked in.
export async function emojiImageOf(
  logo: Buffer,
  backdrop: Backdrop,
): Promise<Buffer> {
  const fitTo = (size: number) =>
    sharp(logo)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  const fullSize = await fitTo(EMOJI_SIZE);
  const isDark = (await nearBlackShare(fullSize)) >= DARK_LOGO_SHARE;
  if (!isDark) return fullSize;
  return sharp({
    create: {
      width: EMOJI_SIZE,
      height: EMOJI_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: Buffer.from(BACKDROPS[backdrop]) },
      { input: await fitTo(LOGO_ON_BACKDROP_SIZE), gravity: "center" },
    ])
    .png()
    .toBuffer();
}
