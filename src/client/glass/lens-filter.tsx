import { useMemo } from "react";
import { token } from "../theme";
import { buildLensMaps } from "./displacement-map";

const tokenNumber = (name: string) => Number.parseFloat(token(name));

const LENS_BEZEL = tokenNumber("lens-bezel");
const LENS_SCALE = tokenNumber("lens-scale");
const LENS_CHROMA = tokenNumber("lens-chroma");
const LENS_LIGHT = {
  angleDegrees: tokenNumber("lens-specular-angle"),
  opacity: tokenNumber("lens-specular-opacity"),
};
// The map peaks at half the scale at the rim, so a channel's scale differs by 2 × the wanted pixel
// offset; lens-chroma asks for about 1px × factor of fringe.
const CHROMATIC_SPREAD = 2 * LENS_CHROMA;

const ZERO_ROW = "0 0 0 0 0";
const ALPHA_ROW = "0 0 0 1 0";
const CHANNELS = [
  {
    name: "red",
    scale: LENS_SCALE + CHROMATIC_SPREAD,
    matrix: ["1 0 0 0 0", ZERO_ROW, ZERO_ROW, ALPHA_ROW].join(" "),
  },
  {
    name: "green",
    scale: LENS_SCALE,
    matrix: [ZERO_ROW, "0 1 0 0 0", ZERO_ROW, ALPHA_ROW].join(" "),
  },
  {
    name: "blue",
    scale: LENS_SCALE - CHROMATIC_SPREAD,
    matrix: [ZERO_ROW, ZERO_ROW, "0 0 1 0 0", ALPHA_ROW].join(" "),
  },
] as const;

function toDataUrl(width: number, height: number, pixels: Uint8ClampedArray) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")
    ?.putImageData(new ImageData(new Uint8ClampedArray(pixels), width), 0, 0);
  return canvas.toDataURL();
}

export function lensBackdropFilter(filterId: string): string {
  return `url(#${filterId}) saturate(160%)`;
}

// Displacing each color channel at a slightly different strength is what makes the fringe.
export default function LensFilter({
  id,
  width,
  height,
  cornerRadius,
}: {
  id: string;
  width: number;
  height: number;
  cornerRadius: number;
}) {
  // The token bezel suits large lenses; on a 30px pill it would be nearly all rim and echo the label
  // underneath, so small lenses get a proportionally thinner bezel and weaker bend.
  const bezel = Math.min(LENS_BEZEL, height / 4);
  const strength = bezel / LENS_BEZEL;
  const maps = useMemo(() => {
    const built = buildLensMaps(
      { width, height, cornerRadius, bezel },
      LENS_LIGHT,
    );
    return {
      displacement: toDataUrl(built.width, built.height, built.displacement),
      specular: toDataUrl(built.width, built.height, built.specular),
    };
  }, [width, height, cornerRadius, bezel]);

  const region = { x: 0, y: 0, width, height };
  return (
    <svg
      aria-hidden="true"
      width={0}
      height={0}
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <filter
        id={id}
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={maps.displacement}
          {...region}
          preserveAspectRatio="none"
          result="map"
        />
        {CHANNELS.map((channel) => (
          <feDisplacementMap
            key={channel.name}
            in="SourceGraphic"
            in2="map"
            scale={channel.scale * strength}
            xChannelSelector="R"
            yChannelSelector="G"
            result={`${channel.name}-shifted`}
          />
        ))}
        {CHANNELS.map((channel) => (
          <feColorMatrix
            key={channel.name}
            in={`${channel.name}-shifted`}
            type="matrix"
            values={channel.matrix}
            result={channel.name}
          />
        ))}
        <feBlend in="red" in2="green" mode="screen" result="red-green" />
        <feBlend in="red-green" in2="blue" mode="screen" result="refracted" />
        <feImage
          href={maps.specular}
          {...region}
          preserveAspectRatio="none"
          result="specular"
        />
        <feBlend in="specular" in2="refracted" mode="screen" />
      </filter>
    </svg>
  );
}
