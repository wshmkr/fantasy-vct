import Box from "@mui/material/Box";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import LensFilter, { lensBackdropFilter } from "../glass/lens-filter";

export interface LensRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SPRING_STIFFNESS = 400;
const SPRING_DAMPING = 30;
const MAX_STRETCH = 0.12;
const STRETCH_PER_VELOCITY = 1 / 4000;
const SETTLE_DISTANCE = 0.3;
const SETTLE_VELOCITY = 4;
const MAX_FRAME_SECONDS = 1 / 30;

const LENS_RIM =
  "inset 1px 1px 0 var(--pane-highlight), inset 0 0 0 1px var(--pane-edge)";
const PILL_SHADOW = "0 4px 12px #00000066";

type NavigatorWithBrands = Navigator & {
  userAgentData?: { brands: { brand: string }[] };
};

// Only Chromium renders SVG filters inside backdrop-filter; others parse url() there but draw nothing.
function detectLensSupport(): boolean {
  const brands = (navigator as NavigatorWithBrands).userAgentData?.brands ?? [];
  return (
    brands.some(({ brand }) => brand === "Chromium") &&
    CSS.supports("backdrop-filter", "url(#lens)") &&
    !window.matchMedia("(prefers-reduced-transparency: reduce)").matches
  );
}

const isLensSupported = detectLensSupport();

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isSameRect(a: LensRect, b: LensRect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function useLensRect<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [rect, setRect] = useState<LensRect | null>(null);
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>("[data-lens-target]");
    const next = target
      ? {
          left: target.offsetLeft,
          top: target.offsetTop,
          width: target.offsetWidth,
          height: target.offsetHeight,
        }
      : {
          left: 0,
          top: 0,
          width: container.offsetWidth,
          height: container.offsetHeight,
        };
    setRect((current) =>
      current && isSameRect(current, next) ? current : next,
    );
  }, []);
  useLayoutEffect(measure);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);
  return { containerRef, rect };
}

interface SpringState {
  left: number;
  width: number;
  leftVelocity: number;
  widthVelocity: number;
}

function paint(lens: HTMLElement, spring: SpringState, rect: LensRect) {
  const stretch = Math.min(
    Math.abs(spring.leftVelocity) * STRETCH_PER_VELOCITY,
    MAX_STRETCH,
  );
  const visualWidth = spring.width * (1 + stretch);
  const shift = spring.left + spring.width / 2 - rect.width / 2;
  lens.style.transform = `translateX(${shift}px) scale(${visualWidth / rect.width}, ${1 - stretch / 2})`;
}

// In Chromium the lens sits above its siblings so it can refract them; the fallback pill sits beneath.
// The map is built for the target size, not the animated one, so it never rebuilds mid-slide.
export default function LiquidLens({
  rect,
  cornerRadius,
}: {
  rect: LensRect | null;
  cornerRadius: number | "pill";
}) {
  const filterId = `lens${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lensRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<SpringState | null>(null);

  useLayoutEffect(() => {
    const lens = lensRef.current;
    if (!lens || !rect) return;
    const spring = springRef.current;
    if (!spring || prefersReducedMotion()) {
      springRef.current = {
        left: rect.left,
        width: rect.width,
        leftVelocity: 0,
        widthVelocity: 0,
      };
      paint(lens, springRef.current, rect);
      return;
    }
    let frame = 0;
    let previousTime = performance.now();
    const step = (time: number) => {
      // The first rAF timestamp can predate performance.now() taken in the effect.
      const seconds = Math.min(
        Math.max(0, (time - previousTime) / 1000),
        MAX_FRAME_SECONDS,
      );
      previousTime = time;
      spring.leftVelocity +=
        (SPRING_STIFFNESS * (rect.left - spring.left) -
          SPRING_DAMPING * spring.leftVelocity) *
        seconds;
      spring.widthVelocity +=
        (SPRING_STIFFNESS * (rect.width - spring.width) -
          SPRING_DAMPING * spring.widthVelocity) *
        seconds;
      spring.left += spring.leftVelocity * seconds;
      spring.width += spring.widthVelocity * seconds;
      const isSettled =
        Math.abs(rect.left - spring.left) < SETTLE_DISTANCE &&
        Math.abs(rect.width - spring.width) < SETTLE_DISTANCE &&
        Math.abs(spring.leftVelocity) < SETTLE_VELOCITY &&
        Math.abs(spring.widthVelocity) < SETTLE_VELOCITY;
      if (isSettled) {
        Object.assign(spring, {
          left: rect.left,
          width: rect.width,
          leftVelocity: 0,
          widthVelocity: 0,
        });
      } else {
        frame = requestAnimationFrame(step);
      }
      paint(lens, spring, rect);
    };
    paint(lens, spring, rect);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [rect]);

  if (!rect) return null;
  const radius = cornerRadius === "pill" ? rect.height / 2 : cornerRadius;
  return (
    <>
      {isLensSupported && (
        <LensFilter
          id={filterId}
          width={Math.round(rect.width)}
          height={Math.round(rect.height)}
          cornerRadius={radius}
        />
      )}
      <Box
        ref={lensRef}
        aria-hidden
        sx={[
          {
            position: "absolute",
            left: 0,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            borderRadius: `${radius}px`,
            pointerEvents: "none",
          },
          isLensSupported
            ? {
                zIndex: 2,
                bgcolor: "var(--pane)",
                // An outer shadow would grow the box Chromium maps the filter onto and misalign the map.
                boxShadow: LENS_RIM,
                backdropFilter: lensBackdropFilter(filterId),
              }
            : {
                zIndex: 0,
                bgcolor: "var(--pane-hover)",
                boxShadow: `${LENS_RIM}, ${PILL_SHADOW}`,
              },
        ]}
      />
    </>
  );
}
