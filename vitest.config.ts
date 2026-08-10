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
  },
});
