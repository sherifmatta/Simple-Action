"use client";

// The filter tabs: an inset segmented control holding the three Filter Views
// (epics.md Story 4.3; DESIGN.md:418, EXPERIENCE.md:194, 217).
//
// Slot 3 of the sticky top block, and the last one to be filled. The block is a
// Server Component and writes no copy of its own, so the three labels live
// here, in the component that owns them.
//
// --- Why `role="tab"` with three tab stops -----------------------------------
//
// DESIGN.md:494 makes `aria-selected` load-bearing rather than decorative: it
// is the reason the selected chip's 1.16:1 fill against the track is accepted
// at all — "the chip fill is never the only cue: the selected label changes
// colour and weight, and `aria-selected` carries it programmatically". And
// `aria-selected` is valid on only a handful of roles, of which `tab` is the
// only one that fits a segmented control.
//
// But EXPERIENCE.md:194 commits the product to a tab order of "input → Retry →
// All → Active → Completed", which puts all three segments in the tab order and
// rules out the roving tabindex APG's tabs pattern calls for. The deviation is
// taken knowingly and in that direction: there is no `tabpanel` here — the list
// region carries its own `aria-label="Todo List"` and is not owned by these
// controls — so this is a selection control borrowing the role for its state
// rather than a tabs widget missing its panels. Every segment gets an explicit
// `tabIndex={0}`, which is what makes the committed order true.
//
// --- The count is the name ---------------------------------------------------
//
// AC6: "the count is part of the accessible name — `Active 2`, not `Active`".
// Label and count are therefore one text node rather than two elements, because
// two elements concatenate to `Active2` under `textContent` and are joined by a
// space only by an accessible-name computation no test in this repository can
// run. One node is unambiguous in every engine. The cost is DESIGN.md:420's
// `count-gap: {spacing.1}` — a 12.5px space measures a little under 4px — and
// it is recorded in this story's Spec Change Log as a departure taken so an
// acceptance criterion could be asserted rather than assumed.

import {
  countsByFilterView,
  FILTER_VIEW_LABELS,
  FILTER_VIEWS,
} from "@/client/todos/filter-view";
import { useFilterView } from "@/client/todos/filter-view-context";
import { useTodos } from "@/client/todos/use-todos";

export function FilterTabs() {
  const { data, listLanded } = useTodos();
  const { view, select } = useFilterView();

  // Derived per render and never stored (AC5), so a count cannot disagree with
  // the rows beside it: the same predicate, over the same array, in the same
  // commit. Gated on `listLanded` rather than on `data` being defined, because
  // an optimistic create makes `data` defined while the first read is still in
  // flight and AC8 wants three zeros until the list actually resolves — the
  // same gate, for the same reason, that `todo-list.tsx` puts on the empty
  // state.
  const counts = countsByFilterView(listLanded ? data : undefined);

  return (
    <div
      role="tablist"
      aria-label="Filter View"
      className="filter-tab-track flex rounded-full bg-tab-track p-1 shadow-tab-track"
    >
      {FILTER_VIEWS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          role="tab"
          // The selection, in the one attribute that both carries it to
          // assistive technology and drives every class that paints it. A fill
          // and a state driven by one attribute cannot disagree — the same
          // argument `todo-row.tsx` makes for `aria-checked`.
          aria-selected={candidate === view}
          tabIndex={0}
          onClick={() => select(candidate)}
          className="flex-1 min-h-touch-target-min rounded-full text-tab-label text-text-muted aria-selected:bg-tab-selected-bg aria-selected:text-tab-label-selected aria-selected:text-tab-selected-text aria-selected:shadow-tab-selected focus-visible:shadow-focus"
        >
          {`${FILTER_VIEW_LABELS[candidate]} ${counts[candidate]}`}
        </button>
      ))}
    </div>
  );
}
