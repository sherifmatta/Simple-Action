// Which creates the server has not yet accounted for (AD-16; epics.md Story
// 3.3 AC5, AC7).
//
// `merge-todo-list.ts` keeps a cached row the arriving list omits *only* when
// a create is protecting it. This module is where that protection is read
// from, and it reads it from TanStack's own mutation cache rather than from a
// registry kept beside it: the mutation already knows its own id, its own
// status and its own lifetime, and a second structure tracking the same three
// things is a second structure to get out of step. Epics 4 and 5 add their
// own mutation keys without touching this one, which is deliberate — a toggle
// or a delete acts on a row the server already knows about, so its id must
// *not* protect anything from an arriving list.
//
// The status filter is the subtle half. "Pending" alone is too narrow: a
// `GET` that left the browser before the `POST` can answer after it, knowing
// nothing about the new Todo, and by then the mutation has settled — so a
// pending-only filter would drop the row the instant the create succeeded,
// which is exactly the "never dropped" AC7 forbids. A settled create keeps
// protecting its row until TanStack garbage-collects the mutation, by which
// time every read in flight at create time has long since landed. A *failed*
// create protects nothing: its row is a row that was never created, and
// Story 3.4 removes it.

import type { QueryClient } from "@tanstack/react-query";

/**
 * The create mutation's key.
 *
 * Not a query key — AD-8's "exactly one query key" is about the query cache,
 * and this never reaches it. It is spelled without the word `todos` leading a
 * composite array on purpose: `providers.test.ts` reads an array literal
 * beginning `["todos", …]` anywhere in the tree as a second query key, and a
 * mutation key that trips that scan would be a mutation key arguing with a
 * rule it is not subject to.
 */
export const CREATE_TODO_MUTATION_KEY = ["create-todo"] as const;

/** Whether a mutation's recorded variables carry an id we can protect a row by. */
function createdId(variables: unknown): string | undefined {
  if (typeof variables !== "object" || variables === null) return undefined;
  const id: unknown = (variables as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * The ids of every create this cache has not seen fail (AC5, AC7).
 *
 * Read fresh at each call rather than memoised: the one caller is the list
 * query's own `queryFn`, which asks once per response, and a memoised answer
 * would be an answer about the moment the memo was built rather than about
 * the moment the response landed.
 */
export function unconfirmedCreateIds(client: QueryClient): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const mutation of client
    .getMutationCache()
    .findAll({ mutationKey: CREATE_TODO_MUTATION_KEY, exact: true })) {
    if (mutation.state.status === "error") continue;
    const id = createdId(mutation.state.variables);
    if (id !== undefined) ids.add(id);
  }

  return ids;
}
