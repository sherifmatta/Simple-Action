// Every duration in this product, and the one place the reduced-motion
// preference is read (epics.md Story 2.5 AC1-AC4; epic-2-context "The motion
// module is the single home for every duration ... and for the
// prefers-reduced-motion decision"; EXPERIENCE.md:161, 163, 223-230).
//
// Three of the four constants below have no consumer in this epic, and that
// is the point rather than an oversight. Epics 4 and 5 run in parallel and
// both import `COLLAPSE_MS`; a module grown one constant at a time gives
// whichever arrives second either an import of something unmerged or a second
// declaration of its own, which is AR-27 broken on the first day of parallel
// work. Seeded complete, there is nothing left for them to add.
//
// No `"use client"` directive, deliberately, and the same argument
// `todo-row.tsx` makes: "You do not need to add the 'use client' directive to
// every file that contains Client Components. You only need to add it to the
// files whose components you want to render directly within Server
// Components ... the components exported from such a file serve as entry
// points to the client" (Next.js `use client` reference). Nothing here is
// rendered by a Server Component — three of these exports are numbers and
// the fourth is a hook — so there is no boundary to declare, and a module
// imported from a Client Component is already in the client graph.

import { useSyncExternalStore } from "react";

/**
 * The skeleton pulse, in milliseconds.
 *
 * DESIGN.md `components.skeleton-row.pulse-duration`. `app/globals.css`
 * spells the same number into `@utility skeleton-row`, because a CSS
 * animation cannot read a TypeScript constant; `motion.test.ts` compiles the
 * stylesheet and asserts the two agree rather than trusting that they do.
 */
export const SKELETON_PULSE_MS = 1400;

/**
 * How long a departing row holds in its new Completion Status before it goes.
 *
 * EXPERIENCE.md:161 — "It holds in its new Completion Status for ~400ms so
 * the change is visibly *caused*". Under reduced motion the hold is skipped
 * and the row cuts to the end state (EXPERIENCE.md:225). Epic 4's departure
 * transition is the consumer; nothing in this epic reads it.
 */
export const DEPARTURE_HOLD_MS = 400;

/**
 * The height collapse a row leaves by, and the slide-up that closes the gap.
 *
 * EXPERIENCE.md:161, 163 — "fades and collapses its height over ~180ms", and
 * "the same collapse runs on a confirmed delete, without the 400ms hold".
 * Two epics import this one constant, which is the whole reason this module
 * is seeded now rather than when its first consumer arrives.
 */
export const COLLAPSE_MS = 180;

/**
 * The once-ever first-run swipe nudge.
 *
 * EXPERIENCE.md:163 — "the topmost row slides ~24px ... and then settles
 * back, over ~600ms". Story 5.D1 is deferred post-MVP, and `deferred-work.md`
 * records that the constant stays here so the deferral is a missing consumer
 * rather than a missing decision.
 */
export const FIRST_RUN_NUDGE_MS = 600;

/**
 * `(prefers-reduced-motion: reduce)` — written once, in this module only.
 *
 * AC2 is that there is exactly one home for this decision. The obvious
 * alternative — a `@media (prefers-reduced-motion: reduce)` block in
 * `app/globals.css`, which is what the mockup does — would suppress the
 * skeleton pulse and nothing else, because the two behaviours Epics 4 and 5
 * change are JS-timed: the departure transition skips its hold and cuts to
 * the end state, and the nudge is skipped while still spending its once-ever
 * flag (EXPERIENCE.md:223-230). CSS cannot express either. So the module
 * reads the preference and the stylesheet suppresses on the marker the module
 * produces, rather than reading the query a second time.
 */
const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCE).matches;
}

/**
 * Stillness, before the browser has been asked.
 *
 * This is the whole of the "fail toward stillness" rule. Server-rendered
 * markup carries no preference — there is no `window` to ask — and the honest
 * answer is unknown, so the snapshot reports the *safe* unknown rather than
 * the common one. A user who asked for stillness therefore never sees a frame
 * of motion; everyone else's pulse begins a few milliseconds late, once
 * hydration has re-read the query and React has re-rendered on the
 * difference.
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * `true` when the user has asked for reduced motion, and while it is unknown.
 *
 * `useSyncExternalStore` rather than an effect-plus-state pair: it subscribes
 * to the media query itself, so a preference changed mid-session re-renders
 * the consumers, and it takes the server snapshot above as a first-class
 * input rather than flashing the client value in after mount.
 *
 * Consumers never branch on a duration with this — they set a marker and let
 * the stylesheet suppress, which is what keeps every `className` in the
 * product a static string literal (AR-28, and the whole-tree scans Story 2.3
 * built).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
