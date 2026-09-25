// Where focus goes when a Todo is removed (Story 5.2 AC13; EXPERIENCE.md:202).
//
// "On close by Delete, focus goes to the first focusable control of the row
// that took its place — the checkbox — or to the input if the list is now
// empty. Focus is never dropped to the document body."
//
// A pure function, and that is the point rather than a convenience. The rule it
// states spans the 5.2/5.3 seam: it is about where focus lands *after a row has
// been removed*, and Story 5.2 removed nothing at all. Written as a function of
// a list and an id it was testable against every arrangement the list can be
// in before anything could remove a row, which is why Story 5.3 had nothing to
// add here — the wiring was already in place and already exercised.
//
// It takes the list as it was *before* the removal, which is the list the
// caller is holding at the moment the dialog closes. "The row that took its
// place" is therefore the one after it, resolved against the pre-delete
// arrangement rather than hunted for in the post-delete one.
//
// No DOM here, and no element ids. This module answers *which Todo*, and the
// component that owns the markup turns that into something to call `focus()`
// on — the same split `filter-view.ts` keeps between the predicate and the rows.

import type { Todo } from "@/shared/contract/todo";

/**
 * The control focus should land on once a Todo has gone.
 *
 * Two cases and no third: a Todo still on screen, named by id, or the add
 * input. There is deliberately no "nothing" — dropping focus to the document
 * body is the failure EXPERIENCE.md:202 names, so the type has no way to say it.
 */
export type FocusAfterDelete =
  | { kind: "row"; id: string }
  | { kind: "input" };

/** The add input, as the one thing left to focus when the list empties. */
const INPUT: FocusAfterDelete = { kind: "input" };

/**
 * Which control takes focus after `deletedId` leaves `visible`.
 *
 * The row *after* the deleted one, because that is the row which will occupy
 * its position once it is gone — reading down the list, focus stays where the
 * eye already is. The row *before* it when the deleted row was last, because
 * there is no row after it to move up; this is the only case where focus
 * travels backwards, and it travels the shortest distance it can.
 *
 * `{ kind: "input" }` when the deleted row was the only one, when it is not in
 * the list at all, and when the list is empty. The first is the case
 * EXPERIENCE.md names; the other two are a deleted id this list never held — a
 * stale dialog, or a row a concurrent change removed first — and the input is
 * the honest answer to all three, because it is the only control the list
 * region is guaranteed to still have above it.
 *
 * @param visible The Todos on screen, in the order they are rendered — the
 *   *filtered* list and not the whole cache, because the row that takes a
 *   deleted row's place is the next row in the active Filter View, and the row
 *   after it in the cache may not be on screen at all.
 * @param deletedId The Todo that is going.
 */
export function focusTargetAfterDelete(
  visible: Todo[],
  deletedId: string,
): FocusAfterDelete {
  const index = visible.findIndex((todo) => todo.id === deletedId);
  if (index === -1) return INPUT;

  const successor = visible[index + 1] ?? visible[index - 1];

  return successor ? { kind: "row", id: successor.id } : INPUT;
}
