// AD-16's merge rule, as two pure functions (epics.md Story 3.3 AC3, AC5,
// AC7, AC8).
//
// EXPERIENCE.md makes the input live before the Todo List has arrived, so a
// create and a read are routinely in flight at the same time over one cache
// entry. The documented optimistic-update recipe resolves that by cancelling
// the read; AD-16 forbids it, because cancelling is what deletes the user's
// Todo. What is left is this: the read runs to completion and its response is
// *merged* rather than installed.
//
// Both functions are total over their inputs and neither touches the cache —
// the caller passes what it read and stores what it gets back. That is what
// makes the race provable with no DOM, no fetch and no component, which is
// the shape the epic asks for ("write the add-during-load test first").
//
// Sorting is a plain string comparison, and it is correct rather than
// convenient: AD-5 makes `id DESC` the one order, ids are lowercase canonical
// UUIDv7, and a UUIDv7's leading 48 bits are big-endian Unix milliseconds —
// so lexicographic order and time order are the same order, and an optimistic
// row's position is final the moment it is minted.

import type { Todo } from "@/shared/contract/todo";

/** `id DESC`, the product's only order (AD-5). */
function byIdDescending(left: Todo, right: Todo): number {
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

/**
 * `list` with `todo` in it: replacing the row of the same id, or inserted at
 * its `id DESC` position.
 *
 * Used twice by one mutation and it is the same operation both times, which
 * is the point. On `onMutate` the id is new and the row appears at the top;
 * on success the id already matches and the server's record takes the
 * optimistic row's place without moving it. AC8's "no flash, no re-sort, no
 * position change" is therefore not a behaviour anything implements — it is
 * what happens when a replacement keyed on an id that was never going to
 * change is applied to a list ordered by that id.
 */
export function upsertTodoById(list: readonly Todo[] | undefined, todo: Todo): Todo[] {
  const existing = list ?? [];
  const replaced = existing.map((row) => (row.id === todo.id ? todo : row));

  if (replaced.some((row) => row.id === todo.id)) return replaced;
  return [...replaced, todo].sort(byIdDescending);
}

/**
 * The arriving Todo List, merged into what the cache already holds (AD-16).
 *
 * `unconfirmedIds` are the ids of creates the server has not yet accounted
 * for. Exactly three things happen, and the third is the one that matters:
 *
 *   - a row in the response is taken as the server sent it;
 *   - a cached row absent from the response is dropped, because the response
 *     is the truth about every Todo the server knows about;
 *   - *unless* an unconfirmed create is protecting it, in which case it is
 *     kept, because the server not knowing about it yet is the expected state
 *     rather than evidence it is gone.
 *
 * The exception is deliberately that narrow. Widening it to "keep anything
 * the response omits" would make a Todo deleted in another tab immortal, and
 * Epic 5 reuses this function unchanged.
 *
 * When nothing is unconfirmed the response is returned as received — not a
 * copy, not a re-sort. The server already orders by `id DESC` and there is
 * nothing to reconcile it with, so the ordinary read costs nothing at all.
 * `incoming` is therefore typed mutable and `cached` is not: the response is
 * a fresh array this function may hand on, and the cached list belongs to
 * someone else.
 */
export function mergeTodoListById(
  cached: readonly Todo[] | undefined,
  incoming: Todo[],
  unconfirmedIds: ReadonlySet<string>,
): Todo[] {
  if (unconfirmedIds.size === 0) return incoming;

  const arrived = new Set(incoming.map((row) => row.id));
  const kept = (cached ?? []).filter(
    (row) => unconfirmedIds.has(row.id) && !arrived.has(row.id),
  );

  if (kept.length === 0) return incoming;
  return [...incoming, ...kept].sort(byIdDescending);
}
