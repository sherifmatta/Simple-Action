// The Completion Status request, as values (AD-1, AD-6, AD-10; epics.md Story
// 4.2 AC1, AC7).
//
// `use-set-completed.ts` owns the React wiring; the request lives here for the
// reason `create-todo.ts` gives for the create and `todo-list-query.ts` gives
// for the read — under `environment: "node"` a `QueryClient` can run these
// directly, so the body that goes on the wire, the `200` the server answers
// with and the error classification are all provable with no DOM in the way.
//
// This file mirrors `create-todo.ts` line for line on purpose. Two mutations
// that fail differently are two failure paths for Story 4.4's banner to learn,
// and there is nothing about a `PATCH` that makes a hung connection, a refused
// response or a transport failure mean anything different from what they mean
// on a `POST`.
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
 * How long a Completion Status update may take before it is abandoned.
 *
 * The read's reasoning, unchanged and reached by the same route: `retry:
 * false` means nothing gives up on its own and `networkMode: "always"` means a
 * request is attempted rather than paused, and neither helps against a
 * connection that is accepted and then never answered. Without a deadline that
 * update stays pending forever — no failure, so no rollback, and the row sits
 * in a status the server never agreed to with nothing on screen saying so.
 *
 * The same 15s as the read and the create, because it answers the same
 * question about the same connection and a third number would only invite a
 * reader to look for the difference. `motion.test.ts` names all three as its
 * exemptions from the "every millisecond constant lives in the motion module"
 * scan: they are network deadlines, and nothing animates on any of them.
 */
export const SET_COMPLETED_DEADLINE_MS = READ_DEADLINE_MS;

/**
 * The `PATCH` body (Story 4.1's `SetCompletedRequest`).
 *
 * One field, and it is the *value the user asked for* rather than the
 * inversion of what is stored (AD-6). That is what makes a retry idempotent:
 * re-sending `{"completed":true}` produces `true` a second time, where
 * re-sending a toggle would flip it back. The route handler reads `completed`
 * and nothing else, so sending a whole `Todo` would send three fields it
 * ignores and invite a reader to believe they mean something.
 */
function setCompletedBody(completed: boolean): string {
  return JSON.stringify({ completed });
}

/**
 * Set `todo`'s Completion Status, or throw a `TodoRequestError` of kind
 * `update`.
 *
 * Takes the Todo rather than its id because the caller — and the rollback that
 * follows a failure — needs the whole row anyway, and because a function that
 * took `(id, completed)` would make the id and the status two arguments of the
 * same primitive-ish shape with nothing but order to tell them apart.
 *
 * Every failure becomes kind `update`, including the deadline above firing and
 * a transport failure where no response arrived at all. AD-10 classifies by
 * the operation attempted, not by the response shape, which is why an error
 * with no status still has a kind.
 *
 * The response body is trusted exactly as far as `createTodo` trusts the
 * created row's: it must be an object, and nothing more is checked.
 * Per-field validation is the trust AD-3 places in the deployment.
 */
export async function setCompleted({
  todo,
  completed,
}: {
  todo: Todo;
  completed: boolean;
}): Promise<Todo> {
  try {
    // Encoded, though a `Todo` id is a canonical UUIDv7 and cannot contain
    // anything that needs it: the id is the one part of this URL that is not a
    // literal, and a path segment built by interpolation is where a value that
    // is *not* what the type says arrives.
    const response = await fetch(
      `${TODOS_ENDPOINT}/${encodeURIComponent(todo.id)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: setCompletedBody(completed),
        // The deadline, and the only signal on this request. No caller signal
        // is threaded, for `create-todo.ts`'s reason: an update the user asked
        // for is not abandoned because the page moved on, the way an unread
        // list is.
        signal: AbortSignal.timeout(SET_COMPLETED_DEADLINE_MS),
      },
    );

    if (!response.ok) {
      throw new TodoRequestError("update", { status: response.status });
    }

    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error(
        `PATCH ${TODOS_ENDPOINT}/:id did not answer a JSON object.`,
      );
    }

    return body as Todo;
  } catch (cause) {
    if (cause instanceof TodoRequestError) throw cause;
    throw new TodoRequestError("update", { cause });
  }
}
