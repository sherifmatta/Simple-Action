import { fileURLToPath } from "node:url";
// `loadEnv` is Vite's, re-exported nowhere by `vitest/config`; Vite is already
// present as Vitest's own dependency, so this adds none.
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // The repository tests query the live Neon branch, so the test process needs
  // `DATABASE_URL`. Vitest reads no `.env` of its own — Next.js loads it for
  // `next dev` and `next build`, and nothing loads it here. A value already in
  // `process.env` (CI, a shell export) wins over the file.
  //
  // `loadEnv`'s third argument is a *prefix*, matched with `startsWith`, not an
  // allow-list: `"DATABASE_URL"` would also let a sibling such as Neon's own
  // `DATABASE_URL_UNPOOLED` through. Picking the one key out below is what
  // keeps every other variable in `.env` out of the test process. The guard
  // matters too — passing `undefined` would land the string `"undefined"` in
  // `process.env`, which is truthy, and the client's clear failure would become
  // a connection error instead.
  const { DATABASE_URL } = loadEnv(mode, process.cwd(), "DATABASE_URL");

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      // `node` stays the default: the repository, contract, lint-fixture and
      // markup-scan suites are the overwhelming majority and none of them wants
      // a document. A test that needs one opts in per file with
      // `// @vitest-environment jsdom`, which keeps the DOM where it is
      // actually used rather than paying for it everywhere.
      environment: "node",
      // `.test.tsx` is included now that jsdom is installed. The epic context
      // makes the first component test the one that adds both, so that a render
      // test proves the live regions and the query provider survive a real
      // mount rather than only `renderToStaticMarkup`.
      include: [
        "*.test.ts",
        "*.test.tsx",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "app/**/*.test.ts",
        "app/**/*.test.tsx",
        "scripts/**/*.test.ts",
      ],
      env: DATABASE_URL ? { DATABASE_URL } : {},
      // Vitest's defaults are 5s per test and 10s per hook. A Neon branch that
      // has auto-suspended takes several seconds to wake on the first query,
      // which would make the live rows flaky rather than failing. Epics 2-5
      // inherit this ceiling along with the live-test pattern.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  };
});
