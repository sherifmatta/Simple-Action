import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // No DOM environment is installed, so `.test.tsx` is deliberately absent:
    // a component test would fail on a missing document rather than be skipped.
    // Epic 6 or the first component test adds jsdom and the glob together.
    include: ["*.test.ts", "src/**/*.test.ts", "app/**/*.test.ts"],
  },
});
