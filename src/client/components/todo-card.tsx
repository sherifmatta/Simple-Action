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

import { FilterViewProvider } from "@/client/todos/filter-view-context";

import { StickyTopBlock } from "./sticky-top-block";
import { TodoList } from "./todo-list";

export function TodoCard() {
  return (
    <div className="mx-auto max-w-card-max-width rounded-lg bg-card px-gutter py-6 shadow-card">
      {/*
        The Filter View's one owner, wrapping both occupants because both read
        it: the tabs are inside the block above and the rows are inside the
        region below, and this is their nearest common ancestor. It is not in
        `providers.tsx` because the shell holds infrastructure — the query
        cache, the error slot, the announcer — and a Filter View is not
        infrastructure; it is this card's way of looking at its own list.

        A context provider renders no DOM element, so the card's DOM is
        unchanged by it and the sticky block is still a direct child of the
        padded box it sticks inside. The card stays a Server Component: the
        provider is a Client Component it renders, not a boundary it crosses.
      */}
      <FilterViewProvider>
        <StickyTopBlock />
        {/*
          The list region, which Story 2.4 turned from the empty element Story
          2.3 left into the component that owns it. Story 2.5's skeleton rows
          and Story 2.6's empty state are branches inside it rather than
          siblings here, because both are the same region resolving.

          Story 2.6's error banner is the one thing that is *not*: DESIGN.md
          fixes the vertical order as add input → error banner region → filter
          tabs → list, so the banner belongs to `StickyTopBlock` above and
          reaches this card only through it. An earlier revision of this comment
          claimed otherwise. The card stays a Server Component — the client
          boundary is `TodoList`.
        */}
        <TodoList />
      </FilterViewProvider>
    </div>
  );
}
