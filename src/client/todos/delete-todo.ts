// The removal request, as values (AD-1, AD-10; epics.md Story 5.3 AC1, AC6).
//
// `use-delete-todo.ts` owns the React wiring; the request lives here for the
// reason `set-completed.ts` gives for the toggle and `todo-list-query.ts` gives
// for the read — under `environment: "node"` a `QueryClient` can run these
// directly, so what goes on the wire, the `204` the server answers with and the
// error classification are all provable with no DOM in the way.
//
// This file mirrors `set-completed.ts` line for line on purpose, so the two
// read as one family: one `try`, a `!response.ok` that throws a
// `TodoRequestError` carrying the status, and a catch that re-throws a
// `TodoRequestError` untouched and wraps anything else. There is nothing about
// a `DELETE` that makes a hung connection, a refused response or a transport
// failure mean anything different from what they mean on a `PATCH`.
//
// The one difference is the end of the happy path, and it is the endpoint's
// doing rather than a choice made here: `app/api/todos/[id]/route.ts` answers
// `new Response(null, { status: 204 })`, so there *is* no body — reading one
// would be reading nothing and would throw on the empty string. Nothing is
// written back to the cache from a delete's success for the same reason.
//
// This directory is the one sanctioned `fetch` site (`eslint.config.mjs`,
// AD-1).

import type { Todo } from "@/shared/contract/todo";

import {
  READ_DEADLINE_MS,
  TODOS_ENDPOINT,
  TodoRequestError,
} from "./todo-list-query";

/**
 * How long a removal may take before it is abandoned.
 *
 * The read's reasoning, unchanged and reached by a fourth route: `retry: false`
 * means nothing gives up on its own and `networkMode: "always"` means a request
 * is attempted rather than paused, and neither helps against a connection that
 * is accepted and then never answered. Without a deadline the delete stays
 * pending forever — no failure, so no rollback, and the row stays off screen
 * with nothing saying the server never agreed to it.
 *
 * The same 15s as the read, the create and the update, because it answers the
 * same question about the same connection and a fourth number would only invite
 * a reader to look for the difference. `motion.test.ts` names all four as its
 * exemptions from the "every millisecond constant lives in the motion module"
 * scan: they are network deadlines, and nothing animates on any of them.
 */
export const DELETE_DEADLINE_MS = READ_DEADLINE_MS;

/**
 * Remove `todo` at the server, or throw a `TodoRequestError` of kind `delete`.
 *
 * Takes the Todo rather than its id, exactly as `setCompleted` does and for the
 * same reason: the caller — and the rollback that follows a failure — needs the
 * whole row anyway, because the row *is* the rollback value.
 *
 * Resolves to `undefined` and reads no body. Story 5.1's endpoint answers `204`
 * unconditionally once the caller is identified and the id is well formed —
 * whether or not the row was there, and whether or not the caller owns it — so
 * a retry of a delete that in fact succeeded is another `204` rather than a
 * failure, and the status can never become an existence oracle.
 *
 * Every failure becomes kind `delete`, including the deadline above firing and
 * a transport failure where no response arrived at all. AD-10 classifies by the
 * operation attempted, not by the response shape, which is why an error with no
 * status still has a kind. The server's own `message` is never read (AD-10).
 */
export async function deleteTodo({ todo }: { todo: Todo }): Promise<void> {
  try {
    // Encoded, though a `Todo` id is a canonical UUIDv7 and cannot contain
    // anything that needs it: the id is the one part of this URL that is not a
    // literal, and a path segment built by interpolation is where a value that
    // is *not* what the type says arrives.
    const response = await fetch(
      `${TODOS_ENDPOINT}/${encodeURIComponent(todo.id)}`,
      {
        method: "DELETE",
        // No `content-type`, because there is no body to describe. `accept`
        // stays, because a *failure* answers the shared error envelope as JSON
        // and the route's content negotiation should see the same header every
        // other request in this directory sends.
        headers: { accept: "application/json" },
        // The deadline, and the only signal on this request. No caller signal
        // is threaded, for `set-completed.ts`'s reason: a removal the user
        // confirmed is not abandoned because the page moved on, the way an
        // unread list is.
        signal: AbortSignal.timeout(DELETE_DEADLINE_MS),
      },
    );

    if (!response.ok) {
      throw new TodoRequestError("delete", { status: response.status });
    }
  } catch (cause) {
    if (cause instanceof TodoRequestError) throw cause;
    throw new TodoRequestError("delete", { cause });
  }
}
