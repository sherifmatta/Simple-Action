// The sticky block's live height, published as a custom property (epics.md
// Story 6.2; UX-DR21, EXPERIENCE.md:198; epic-6-context "Sticky-block offset
// must be measured live, not hard-coded").
//
// This is the one construction Epic 6 permits, and the reason it could not be
// built earlier is the reason it has to be measured rather than written down:
// the block's height is the sum of whatever occupies it, and its occupants
// arrived across three epics. Story 3.2 put the input in, Story 2.6 the error
// banner region, Story 4.3 the filter tabs — and the banner region is not even
// a fixed contributor, because it is empty until something fails and then it
// is not. A constant would have been wrong the moment a mutation failed.
//
// `sticky-top-block.test.ts:141` fails any `h-`/`min-h-`/`max-h-` class on the
// block precisely so that a constant cannot become a second source of truth
// for this number. This module is the first source; there is no second.
//
// It writes `--sticky-block-height` onto `document.documentElement` rather
// than exporting the number, and `app/globals.css` reads it back through
// `var(--sticky-block-height, 0px)` in two places — `scroll-padding-top` on
// the root and the `scroll-clear-sticky` recipe on the row's focusable
// descendants. Going through CSS rather than through props is what keeps the
// value out of React's render path: nothing re-renders when the banner opens,
// the browser simply scrolls to a different place on the next focus.
//
// Deliberately *not* an `@theme` entry. `app/globals.test.ts:170,180,190`
// assert exactly 21 `--color-*`, 4 `--radius-*` and 14 `--spacing-*` custom
// properties against DESIGN.md, and an entry here would fail a done story's
// completeness guard — correctly, because this is a runtime measurement and
// not a design token. It is written at runtime and it is removed on cleanup.
//
// No `"use client"` directive, the same argument `pointer.ts` makes one file
// over: this exports a hook, not a component, and a module imported by a
// Client Component is already in the client graph.
//
// The two names it shares with the block and the stylesheet come from
// `sticky-block-contract.ts` rather than being declared here, because the
// Server Component on the other side of them cannot import this file at all —
// see that module's note.

import { useLayoutEffect } from "react";

import {
  STICKY_BLOCK_HEIGHT_PROPERTY,
  STICKY_TOP_BLOCK_ID,
} from "./sticky-block-contract";

/**
 * Measure the block and publish its height, keeping it current.
 *
 * `useLayoutEffect` rather than `useEffect`: the property is read by the
 * browser's scrolling, and a frame in which it is unset is a frame in which a
 * focused control can land under the block. Measuring before paint closes
 * that window.
 *
 * One subscription, not two. Everything that can change this number changes
 * the block's own box — the banner opening, the tabs wrapping at 320px, an
 * orientation change relaying the whole column — and `ResizeObserver` fires on
 * exactly that. A `visualViewport` listener was here first, justified by a
 * phone's address bar; it was removed because the address bar changes the
 * viewport's height without changing the block's box, and a block whose box
 * has not changed has no new height to publish. Nothing could be written that
 * would fail if the listener were deleted, which is the test that settled it.
 *
 * SSR- and absence-safe like `pointer.ts`: nothing touches `window` at module
 * scope, and a missing element removes the property rather than throwing, so
 * both offsets fall back to the declared `0px` and the page stays scrollable
 * if this never runs at all.
 */
export function useStickyBlockOffset(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;

    function measure(): void {
      const block = document.getElementById(STICKY_TOP_BLOCK_ID);

      // Absence is a real state, not a guard against one. The block is a
      // Server Component inside a card that renders on every route, but this
      // hook's own test mounts without it, and an unmounted block whose stale
      // height stayed published would scroll every focus to an offset that no
      // longer corresponds to anything on screen.
      if (block === null) {
        root.style.removeProperty(STICKY_BLOCK_HEIGHT_PROPERTY);
        return;
      }

      // `getBoundingClientRect()` rather than `offsetHeight`: the latter is
      // rounded to an integer by the platform, and the block's height is the
      // sum of a 10px inset, a 10px gap and three fractional occupants, so
      // the rounding lands under the true height about as often as over it.
      // Under is the direction that hurts — it is the direction that leaves a
      // focused control partly covered, which is the one thing UX-DR21 asks
      // this number to prevent. Rounding up spends at most a pixel of scroll.
      const height = Math.ceil(block.getBoundingClientRect().height);

      root.style.setProperty(STICKY_BLOCK_HEIGHT_PROPERTY, `${height}px`);
    }

    measure();

    const block = document.getElementById(STICKY_TOP_BLOCK_ID);

    // `ResizeObserver` is absent in jsdom and in older browsers. The feature
    // test is what lets the unit test stub it, and what keeps a browser
    // without it on the measured-once path rather than on the crash path.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer !== null && block !== null) observer.observe(block);

    return () => {
      observer?.disconnect();

      // The property goes with the hook. Leaving it behind would publish a
      // measurement of a block that is no longer mounted.
      root.style.removeProperty(STICKY_BLOCK_HEIGHT_PROPERTY);
    };
  }, []);
}
