export interface LensShape {
  width: number;
  height: number;
  cornerRadius: number;
  bezel: number;
}

export interface LensLight {
  angleDegrees: number;
  opacity: number;
}

export interface LensMaps {
  width: number;
  height: number;
  displacement: Uint8ClampedArray;
  specular: Uint8ClampedArray;
}

const REFRACTIVE_INDEX = 1.5;
const NEUTRAL_CHANNEL = 128;
const SPECULAR_RIM_WIDTH = 2.5;
// Below this the squircle's slope is effectively vertical; clamping keeps atan finite.
const MIN_BEZEL_POSITION = 1e-4;

export function squircleHeight(bezelPosition: number): number {
  return (1 - (1 - bezelPosition) ** 4) ** 0.25;
}

function squircleSlope(bezelPosition: number): number {
  const position = Math.max(bezelPosition, MIN_BEZEL_POSITION);
  return (1 - position) ** 3 * (1 - (1 - position) ** 4) ** -0.75;
}

function refractionShift(incidence: number): number {
  const refracted = Math.asin(Math.sin(incidence) / REFRACTIVE_INDEX);
  return Math.tan(incidence - refracted);
}

const EDGE_SHIFT = refractionShift(Math.PI / 2);

export function refractionStrength(bezelPosition: number): number {
  if (bezelPosition >= 1) return 0;
  return refractionShift(Math.atan(squircleSlope(bezelPosition))) / EDGE_SHIFT;
}

interface EdgeProbe {
  inset: number;
  outwardX: number;
  outwardY: number;
}

function probeTopLeftQuadrant(
  x: number,
  y: number,
  cornerRadius: number,
): EdgeProbe {
  if (x < cornerRadius && y < cornerRadius) {
    const fromCenterX = x - cornerRadius;
    const fromCenterY = y - cornerRadius;
    const distance = Math.hypot(fromCenterX, fromCenterY);
    if (distance === 0)
      return { inset: cornerRadius, outwardX: 0, outwardY: 0 };
    return {
      inset: cornerRadius - distance,
      outwardX: fromCenterX / distance,
      outwardY: fromCenterY / distance,
    };
  }
  return x <= y
    ? { inset: x, outwardX: -1, outwardY: 0 }
    : { inset: y, outwardX: 0, outwardY: -1 };
}

// The token angle reads like a compass (0 = up, clockwise), so -60 lights the top-left rim.
function lightVector(angleDegrees: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

// feDisplacementMap reads R as x and G as y with 128 meaning no shift. The shape is symmetric,
// so only the top-left quadrant is computed and mirrored.
export function buildLensMaps(shape: LensShape, light: LensLight): LensMaps {
  const width = Math.max(1, Math.round(shape.width));
  const height = Math.max(1, Math.round(shape.height));
  const cornerRadius = Math.min(shape.cornerRadius, width / 2, height / 2);
  const displacement = new Uint8ClampedArray(width * height * 4);
  const specular = new Uint8ClampedArray(width * height * 4);
  const lightDirection = lightVector(light.angleDegrees);

  const writePixel = (
    x: number,
    y: number,
    shiftX: number,
    shiftY: number,
    highlight: number,
  ) => {
    const offset = (y * width + x) * 4;
    displacement[offset] = NEUTRAL_CHANNEL + shiftX * 127;
    displacement[offset + 1] = NEUTRAL_CHANNEL + shiftY * 127;
    displacement[offset + 2] = NEUTRAL_CHANNEL;
    displacement[offset + 3] = 255;
    specular[offset] = 255;
    specular[offset + 1] = 255;
    specular[offset + 2] = 255;
    specular[offset + 3] = highlight * 255;
  };

  for (let y = 0; y < Math.ceil(height / 2); y++) {
    for (let x = 0; x < Math.ceil(width / 2); x++) {
      const probe = probeTopLeftQuadrant(x + 0.5, y + 0.5, cornerRadius);
      const isOnBezel = probe.inset >= 0 && probe.inset < shape.bezel;
      const strength = isOnBezel
        ? refractionStrength(probe.inset / shape.bezel)
        : 0;
      // Sampling from further inside makes the rim magnify, like the edge of a convex lens.
      const shiftX = -probe.outwardX * strength;
      const shiftY = -probe.outwardY * strength;
      const facing = (outwardX: number, outwardY: number) =>
        probe.inset < 0
          ? 0
          : Math.max(0, 1 - probe.inset / SPECULAR_RIM_WIDTH) *
            Math.abs(
              outwardX * lightDirection.x + outwardY * lightDirection.y,
            ) *
            light.opacity;
      const mirrorX = width - 1 - x;
      const mirrorY = height - 1 - y;
      const { outwardX, outwardY } = probe;
      writePixel(x, y, shiftX, shiftY, facing(outwardX, outwardY));
      writePixel(mirrorX, y, -shiftX, shiftY, facing(-outwardX, outwardY));
      writePixel(x, mirrorY, shiftX, -shiftY, facing(outwardX, -outwardY));
      writePixel(
        mirrorX,
        mirrorY,
        -shiftX,
        -shiftY,
        facing(-outwardX, -outwardY),
      );
    }
  }
  return { width, height, displacement, specular };
}
