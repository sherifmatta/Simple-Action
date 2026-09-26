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
      // The responsive audit is about narrow viewports and drives its own
      // sizes; running it at a laptop's default as well would measure the
      // same widths twice and report the second run as if it were evidence.
      testIgnore: /audit-responsive\.spec\.ts/,
    },
    {
      // A phone: touch events, a coarse pointer, no autofocus, and the swipe
      // as the only pointer-driven route to the delete control.
      name: "touch",
      use: { ...devices["Pixel 5"] },
    },
    {
      // The reflow floor (Story 6.2 AC7, AC8).
      //
      // 320 CSS px is not a device — it is WCAG 1.4.10's threshold, and AC7
      // is that criterion written in product language: content must reflow to
      // 320px without a horizontal scrollbar. No document in this project
      // names a smallest supported viewport, so the criterion's own number is
      // the one that binds.
      //
      // The `touch` project above cannot stand in for it. A Pixel 5 is 393px
      // wide, so running the reflow and long-text criteria there would prove
      // them on a screen 73px wider than the one they are about — and 320px
      // is exactly where the filter tabs and a 500-character Todo are most
      // likely to break.
      //
      // Chromium with touch, like the other two: the identity cookie is
      // `secure`, which rules the other engines out of this suite entirely.
      name: "narrow",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
        // Touch without `isMobile`. The capability is what the product reads
        // (`pointer.ts` asks `(pointer: fine)`), and `isMobile` additionally
        // turns on a mobile viewport emulation that makes
        // `setViewportSize()` — which the width sweep below depends on —
        // behave inconsistently.
        isMobile: false,
        hasTouch: true,
      },
      // Only the responsive audit. The rest of the suite already runs on two
      // projects, and re-running all of it at 320px would treble the suite's
      // wall-clock to re-prove journeys that are not about width.
      testMatch: /audit-responsive\.spec\.ts/,
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
