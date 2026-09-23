// The create request, as values (AD-1, AD-4, AD-10; epics.md Story 3.3 AC1).
//
// `use-create-todo.ts` owns the React wiring; the request lives here for the
// reason `todo-list-query.ts` gives for the read — under `environment:
// "node"` a `QueryClient` can run these options directly, so the body that
// goes on the wire, the `201`/`200` the server answers with and the error
// classification are all provable with no DOM in the way.
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
 * How long a create may take before it is abandoned (Story 3.4).
 *
 * The read's reasoning, unchanged and reached by the same route: `retry:
 * false` means nothing gives up on its own and `networkMode: "always"` means
 * a request is attempted rather than paused, and neither helps against a
 * connection that is accepted and then never answered. Without a deadline
 * that create stays pending forever — no failure, so no rollback, no banner
 * and no text returned, which is every promise this story makes, silently
 * unkept. The stuck interface NFR-4 forbids, at the one point the product
 * could still reach it.
 *
 * The same 15s as the read, because it answers the same question about the
 * same connection and two numbers would only invite a reader to look for the
 * difference. `motion.test.ts`'s scan names this and `READ_DEADLINE_MS` as
 * its two exemptions: both are network deadlines, nothing animates on either.
 */
export const CREATE_DEADLINE_MS = READ_DEADLINE_MS;

/**
 * The create request body (Story 3.1's `CreateTodoRequest`).
 *
 * Only the two fields the server accepts: the client mints the id (AD-4) and
 * the server sets `completed` and `createdAt`, so sending a whole `Todo`
 * would send two fields the route handler ignores and invite a reader to
 * believe they mean something. The optimistic row is a whole `Todo` because
 * the cache holds `Todo`s; the wire carries less.
 */
function createBody(todo: Todo): string {
  return JSON.stringify({ id: todo.id, text: todo.text });
}

/**
 * Create `todo`, or throw a `TodoRequestError` of kind `create`.
 *
 * `200` and `201` are both success and are not distinguished here: `200` is
 * Story 3.1's idempotent retry answering with the row that already exists,
 * and AD-4 makes that row identical to the one a `201` would have returned.
 * A caller that branched on the status would be branching on whether it was
 * the first to ask, which is precisely what an idempotent endpoint exists to
 * make irrelevant.
 *
 * Every failure becomes kind `create`, including the deadline above firing
 * and a transport failure where no response arrived at all. AD-10 classifies
 * by the operation attempted, not by the response shape, which is why an
 * error with no status still has a kind (AC6 of Story 3.4, reached through
 * this function).
 *
 * The response body is trusted exactly as far as `readTodoList` trusts the
 * list's: it must be an object, and nothing more is checked. Per-field
 * validation is the trust AD-3 places in the deployment.
 */
export async function createTodo(todo: Todo): Promise<Todo> {
  try {
    const response = await fetch(TODOS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: createBody(todo),
      // The deadline, and the only signal on this request. No caller signal
      // is threaded in the way the read threads the query's: a create that
      // was abandoned because the page moved on is a Todo the user asked for
      // and did not get, where an abandoned read is a list nobody is looking
      // at any more.
      signal: AbortSignal.timeout(CREATE_DEADLINE_MS),
    });

    if (!response.ok) {
      throw new TodoRequestError("create", { status: response.status });
    }

    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error(`POST ${TODOS_ENDPOINT} did not answer a JSON object.`);
    }

    return body as Todo;
  } catch (cause) {
    if (cause instanceof TodoRequestError) throw cause;
    throw new TodoRequestError("create", { cause });
  }
}
