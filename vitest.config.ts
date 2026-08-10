import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .tsx included so a UI test can never be silently uncollected. Stage 05
    // must add the browser environment/deps it needs; this glob only ensures
    // a misnamed or unsupported test fails loudly instead of disappearing.
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "apps/*/test/**/*.test.{ts,tsx}",
    ],
    environment: "node",
  },
});
