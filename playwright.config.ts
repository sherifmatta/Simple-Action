import { defineConfig, devices } from "@playwright/test";

// Epic 6's end-to-end harness (spec-6-1, AR-31). Playwright with route
// interception, because the optimistic layer is where this product's
// complexity is concentrated and its four revert paths, its add-during-load
// race and its retry idempotency cannot be observed any other way.
//
// Two projects, both Chromium, and no WebKit or Firefox project anywhere.
// That is not an oversight and not a cost saving: `identity-cookie.ts` sets
// `secure: true` on `client_identity`, and Chromium is the engine that stores
// a Secure cookie delivered over `http://localhost`. WebKit and Firefox may
// drop it, so every request after the first would answer `401` — a wall of
// failures that reads as a product defect and is nothing of the kind. A
// third-engine project belongs behind HTTPS, not here.
//
// The split between the two projects is the device, not the test.
// `usePointerCapability()` (src/client/device/pointer.ts) latches on the first
// definite answer to the fine-pointer media query, so the add input's
// autofocus and the delete control's hover reveal are properties of the
// context a journey runs in rather than of anything a test can arrange.
// EXPERIENCE.md writes UJ-1 and UJ-3 as phone journeys and UJ-2 as a laptop
// one; these projects make that literal.
//
// (This file is inside the surface `motion.test.ts` scans, so the durations
// and the media query it discusses are named by their constants rather than
// written out — a copied number in a comment is the stale copy that scan
// exists to prevent.)
export default defineConfig({
  testDir: "e2e",
  // Each test builds its own fixtures through the UI under its own Client
  // Identity, so no two tests share a row and parallelism is safe.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  // A generous per-test ceiling: several tests hold a request open on purpose,
  // and the departure animation alone is DEPARTURE_HOLD_MS followed by
  // COLLAPSE_MS (src/client/motion/motion.ts).
  timeout: 60_000,
  expect: {
    // Comfortably above the sum of those two, so a web-first assertion
    // outlasts the departure it is waiting on. `waitForTimeout` appears
    // nowhere in this suite.
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      // A laptop: the pointer capability settles as fine, so the add input
      // autofocuses and the delete control is revealed by hover.
      name: "pointer",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // A phone: touch events, a coarse pointer, no autofocus, and the swipe
      // as the only pointer-driven route to the delete control.
      name: "touch",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // A production build, as Next.js's own Playwright guide recommends
  // (node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md):
  // "We recommend running your tests against your production code to more
  // closely resemble how your application will behave." `next dev` compiles
  // routes on demand, which turns the first request of every journey into a
  // several-second wait that no amount of assertion timeout makes honest.
  //
  // `npm run build` chains lint and typecheck ahead of `next build`, so this
  // command is also the gate that stops a broken tree from being measured.
  webServer: {
    command: "npm run build && npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // A cold `next build` on a clean checkout, plus the two gates in front of
    // it. Five minutes is slack, not an expectation.
    timeout: 300_000,
  },
});
