import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest's esbuild transform must compile JSX itself: apps/web/tsconfig
  // says `jsx: "preserve"` (Next compiles it in `next build`), which would
  // leave raw JSX in test bundles and fail at import time.
  esbuild: { jsx: "automatic" },
  test: {
    // .tsx included so a UI test can never be silently uncollected. UI tests
    // under apps/*/test declare `// @vitest-environment jsdom` per file; the
    // package tests stay in node. A UI test missing the docblock fails
    // loudly (no DOM), never silently.
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "apps/*/test/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    /**
     * The first test in each file pays for the whole deterministic close:
     * buildDataset() over 1,500 units, runClose() across 21 rules, then the
     * evidence graph. Under vitest's default 5s that lands close enough to
     * the boundary that the first test in a jsdom file fails on a loaded
     * machine and passes on an idle one — a flake that reads as a
     * regression. The work is real, so the budget is real.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
