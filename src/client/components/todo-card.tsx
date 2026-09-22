// The card (epics.md Story 2.3 AC1/AC3/AC4/AC5; DESIGN.md:103-109, 339-352,
// 398-400).
//
// One column, one card, capped at `{spacing.card-max-width}` and centred on
// the ground; below that width `p-margin-phone` on the page's `<main>` is what
// leaves 18px of ground on each side. The card recipe itself is unchanged from
// Story 1.7 — it moved here, to the component home AR-20 names, because from
// this story on it has interior structure and a page is not where that belongs.
//
// The scroll model is as much about what is absent as what is here (AC3, AC4;
// DESIGN.md:358, EXPERIENCE.md:51). The card has no fixed height and no inner
// scroll region: it grows downward and the page body is the one scrolling
// element in the product. Once the list is long the card's lower edge simply
// leaves the viewport, and nothing is added to cue that there is more below —
// no fade, no inner shadow, no region-local scrollbar. The page's own
// scrollbar is the cue. `todo-card.test.ts` walls both by scanning every
// source that can produce markup or CSS, because an absence has no call site
// to test.
//
// The children are in DESIGN.md's fixed order and never reorder: add input →
// error banner region → filter tabs → list. The first three live inside
// `<StickyTopBlock>`; the list region is the second child here. Nothing sits
// above the input — no wordmark, no title bar, no greeting (AC7). The product
// name appears in the browser tab title only, which `app/layout.tsx`'s
// `metadata` owns.

import { StickyTopBlock } from "./sticky-top-block";

export function TodoCard() {
  return (
    <div className="mx-auto max-w-card-max-width rounded-lg bg-card px-gutter py-6 shadow-card">
      <StickyTopBlock />
      {/*
        The list region. Empty in this story — Story 2.6's skeleton rows,
        Story 2.4's real rows and Story 2.8's empty state all render into this
        element, and Story 2.9 names it for assistive technology. It exists now
        so the order above is structural rather than a convention each of those
        stories has to re-observe.
      */}
      <div />
    </div>
  );
}
