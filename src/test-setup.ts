import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Pages chain a few stubbed requests before rendering; 1s isn't enough when the full suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks the layout APIs the liquid lens measures with; stub them so components mount.
if (typeof window !== "undefined") {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
}
