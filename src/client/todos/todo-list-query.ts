// The Todo List read, as values (AD-8, AD-10, AD-16; epics.md Story 2.2).
//
// `use-todos.ts` owns the React wiring; the request and its query options live
// here for the same reason `error-slot-state.ts` sits beside `error-slot.tsx`:
// under `environment: "node"` (vitest.config.mts:30) a `QueryClient` can fetch
// these options directly, so the cache contents, the `id DESC` order and the
// error classification are all provable without a DOM. This story adds no
// jsdom; the epic's first component test owns that.
//
// This directory is the one sanctioned `fetch` site in the codebase
// (`eslint.config.mjs`, AD-1): every component reads Todos through `useTodos`
// and none calls `fetch` itself.

import { queryOptions } from "@tanstack/react-query";

import type { ErrorKind } from "@/shared/contract/errors";
import type { Todo } from "@/shared/contract/todo";
import { TODOS_QUERY_KEY } from "./query-keys";

/** The endpoint Story 2.1 built. Declared once so a caller cannot retype it. */
export const TODOS_ENDPOINT = "/api/todos";

/**
 * A failed Todo request, carrying the kind of the operation that failed.
 *
 * `kind` is the shared contract's (AD-10), so the single error slot (AD-9) can
 * classify this into the banner string it needs with no translation table in
 * between. Epics 3 through 5 throw the same class with `create`, `update` and
 * `delete`.
 *
 * `message` is diagnostic and is never shown: AD-10 has the client map `kind`
 * to the copy in EXPERIENCE.md §Voice and Tone and never compose or forward a
 * message to the interface. The server's `message` is not read at all — this
 * class is built from the operation, not from the response body.
 */
export class TodoRequestError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, options?: { cause?: unknown }) {
    super(`The Todo ${kind} request failed.`, options);
    this.name = "TodoRequestError";
    this.kind = kind;
  }
}

/**
 * `GET /api/todos`, or a throw.
 *
 * Throws plain errors. Classification is `fetchTodoList`'s job below, and
 * keeping it there rather than here is what makes AD-10's "a transport failure
 * is classified by the operation attempted, not by the response" true by
 * construction: nothing on this path can decide a kind from what came back,
 * because nothing on this path decides a kind at all.
 *
 * The body is trusted element-wise and checked shape-wise. AD-3 makes the wire
 * `Todo` a type-level contract — one deployable serves both sides and the
 * server builds its responses from this same type, so per-field validation
 * would re-derive a guarantee the deployment already gives. That a JSON array
 * arrived at all is a different claim, and a cheaper one: a proxy, a captive
 * portal or an error page answers `200` with an object or a string, which
 * without this guard lands in the cache as the Todo List and fails in a
 * renderer instead of in the designed load-failure state.
 *
 * The guard is exactly that wide and no wider. An array of the wrong elements —
 * `[{}]`, `[null]` — still passes, and still reaches a renderer. Closing that
 * needs per-element validation, which is the trust AD-3 deliberately places in
 * the deployment; it is not closed here, and this comment does not claim it.
 */
async function readTodoList(signal?: AbortSignal): Promise<Todo[]> {
  const response = await fetch(TODOS_ENDPOINT, {
    signal,
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`GET ${TODOS_ENDPOINT} answered ${response.status}.`);
  }

  const body: unknown = await response.json();

  if (!Array.isArray(body)) {
    throw new Error(`GET ${TODOS_ENDPOINT} did not answer a JSON array.`);
  }

  return body as Todo[];
}

/**
 * The caller's Todo List, or a `TodoRequestError` of kind `load`.
 *
 * Every failure becomes kind `load` — a `401` from `middleware.ts`, the `500`
 * envelope from the route handler, a `503` while the identity store is
 * unreachable, a body that is not an array, and a transport failure where no
 * response arrived at all. The kind names the operation the user attempted,
 * which is why a failure with no response still has one.
 *
 * No branch for an aborted `signal`. TanStack cancels a fetch by rejecting the
 * retryer's own promise with a `CancelledError` and marking it resolved before
 * aborting the signal (`retryer.ts`, `cancel`), so a rejection arriving from
 * here afterwards is dropped — a cancelled read cannot raise a banner, and a
 * branch for it would be untestable through the query.
 */
export async function fetchTodoList({
  signal,
}: { signal?: AbortSignal } = {}): Promise<Todo[]> {
  try {
    return await readTodoList(signal);
  } catch (cause) {
    throw new TodoRequestError("load", { cause });
  }
}

/**
 * The one query in the application, as options a `QueryClient` can run.
 *
 * Shared through `queryOptions` rather than spelled inside `useTodos` so that
 * Epics 3 through 5 reach the same key and the same types from
 * `setQueryData`, `invalidateQueries` and `getQueryData` without restating
 * either. The key is imported, never written here (AD-8).
 *
 * `retry: false` overrides TanStack's default of three retries with backoff.
 * AD-9 makes recovery an explicit user action — one banner, one `Retry`, which
 * EXPERIENCE.md §State Patterns says re-requests the list and returns to the
 * skeleton — so an automatic retry chain would hold the skeletons pulsing for
 * roughly seven seconds before the designed load-failure state appears, and
 * would leave a `Retry` press racing a retry already in flight.
 *
 * `networkMode: "always"` overrides the default `"online"`, under which a
 * fetch attempted while the browser reports itself offline is *paused* rather
 * than run: the query stays `pending`, never errors, and the skeletons pulse
 * with no banner and nothing to press. That is precisely the stuck interface
 * NFR-4 forbids. Attempting the request and reporting the failure is what
 * keeps the offline case a designed state with a way out.
 *
 * `staleTime` and `refetchOnWindowFocus` are left at their defaults — `0` and
 * `true` — which Story 1.7 left for this epic to settle. Every consumer of the
 * list (the list region, the empty state, Epic 4's tab counts) mounts in the
 * same commit inside one card, so `staleTime: 0` costs one request rather than
 * one per consumer, and a refetch when the window regains focus is the whole
 * of this product's answer to a second tab having changed the list.
 */
export const todoListQueryOptions = queryOptions<
  Todo[],
  TodoRequestError,
  Todo[],
  typeof TODOS_QUERY_KEY
>({
  queryKey: TODOS_QUERY_KEY,
  queryFn: ({ signal }) => fetchTodoList({ signal }),
  retry: false,
  networkMode: "always",
});
