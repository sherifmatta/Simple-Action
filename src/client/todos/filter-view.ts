// The Filter View: which Todos the list shows, and what a toggle does to a row
// that stops matching it (epics.md Story 4.3; DESIGN.md:418, EXPERIENCE.md:161,
// 181, 213).
//
// Every decision this story makes about a Todo is a pure function of the list
// and the view, and all of it is here. That placement is forced as much as it
// is tidy: `todo-list.test.ts` keeps `todo-list.tsx` free of Completion Status,
// so the predicate cannot live at the call site — and it should not, because a
// predicate, three counts and a departure rule are one rule read three ways. A
// module under `src/client/todos/` reading `todo.completed` breaks nothing; the
// scan that forbids it is file-scoped, by design.
//
// Nothing here touches React, the query cache or the network. The Filter View
// fires no request (AD-8, EXPERIENCE.md:181 "local, instant, cannot fail"), so
// there is no state to reach for and no failure to model — which is why all of
// it is testable under `environment: "node"` with no DOM.
//
// No `"use client"` directive, and the same argument `motion.ts` makes:
// nothing here is rendered by a Server Component, so there is no boundary to
// declare, and a module imported from a Client Component is already in the
// client graph (Next.js `use client` reference).

import type { Todo } from "@/shared/contract/todo";

/**
 * Which Todos the list is showing.
 *
 * Client state and never a query key: `useTodos()` takes no arguments
 * deliberately, because a `filter` parameter there would turn one cache entry
 * into three (AD-8).
 */
export type FilterView = "all" | "active" | "completed";

/**
 * The three views, in the order they render and are tabbed through.
 *
 * EXPERIENCE.md:194 fixes it — "input → Retry (when the banner is occupied) →
 * All → Active → Completed" — and the tabs get that order by rendering this
 * array rather than by arranging anything.
 */
export const FILTER_VIEWS = [
  "all",
  "active",
  "completed",
] as const satisfies readonly FilterView[];

/**
 * The vocabulary's own words, capitalised as the vocabulary capitalises them.
 *
 * DESIGN.md:420 gives the three segment labels literally. The word `Done` is
 * banned everywhere in this product, in copy and in identifiers alike, and
 * `Completed` is the only word for the status — which is why the labels are a
 * table here rather than a capitalisation of the view's own identifier: the
 * copy and the identifier are allowed to be the same string only because
 * somebody decided they are.
 */
export const FILTER_VIEW_LABELS: Record<FilterView, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
};

/** Whether a Todo belongs in a view. The All view holds everything. */
export function matchesFilterView(todo: Todo, view: FilterView): boolean {
  if (view === "all") return true;
  return todo.completed === (view === "completed");
}

/**
 * How many Todos each view holds, derived per render and never stored (AC5).
 *
 * All three are computed in one pass over the list, so the counts cannot
 * disagree with each other or with the rows: they are the same predicate the
 * list filters on, applied to the same array in the same commit.
 *
 * An absent list counts as three zeros rather than as an error. That is what
 * AC8 asks for — "given the initial list read is still in flight, all three
 * counts read `0`" — and the caller is what decides whether the list it holds
 * has landed, because `data` being defined does not mean it has (an optimistic
 * create makes it defined mid-load; `use-todos.ts` explains at length).
 */
export function countsByFilterView(
  list: readonly Todo[] | undefined,
): Record<FilterView, number> {
  const counts: Record<FilterView, number> = { all: 0, active: 0, completed: 0 };
  for (const todo of list ?? []) {
    for (const view of FILTER_VIEWS) {
      if (matchesFilterView(todo, view)) counts[view] += 1;
    }
  }
  return counts;
}

/**
 * Whether setting `completed` on this Todo takes it out of the active view.
 *
 * The value asked for, not the value it holds — the same shape as the toggle
 * itself (AD-6): the caller passes the status it wants and this answers what
 * that status would mean for the view the user is looking at.
 *
 * In the All view the answer is always no, and it falls out of the predicate
 * rather than being a case here: nothing ever stops matching All, so a toggle
 * there moves nothing and the row keeps its position (AC17).
 */
export function departsOnToggle(
  todo: Todo,
  completed: boolean,
  view: FilterView,
): boolean {
  return !matchesFilterView({ ...todo, completed }, view);
}

/**
 * What the live region says when a row leaves the view (AC15).
 *
 * EXPERIENCE.md:213 — "the Todo text, then `removed from Active` or `removed
 * from Completed`, so a screen-reader user learns what the departure
 * transition shows visually". The comma is the pause a screen reader needs
 * between the user's words and ours, which is the shape `addedAnnouncement`
 * and `toggledAnnouncement` already have.
 *
 * `all` has no announcement to make — nothing departs it — so passing it here
 * would be a caller that never checked `departsOnToggle`. The string it
 * produces is left well-formed rather than guarded, because the guard would be
 * a branch no call site can reach.
 */
export function departureAnnouncement(text: string, view: FilterView): string {
  return `${text}, removed from ${FILTER_VIEW_LABELS[view]}`;
}
