import { existsSync } from "node:fs";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";
import { TODOS_QUERY_KEY } from "./query-keys";
import {
  READ_DEADLINE_MS,
  TODOS_ENDPOINT,
  TodoRequestError,
  fetchTodoList,
  identityExpired,
  todoListQueryOptions,
} from "./todo-list-query";

// Covers epics.md Story 2.2 AC1, AC4 and AC5.
//
// The query is exercised through a real `QueryClient` rather than through
// React: `fetchQuery` runs the same options `useTodos` passes to `useQuery`, so
// what lands in the cache and what the query reports on failure are both
// provable under `environment: "node"`. No DOM is installed — the epic's first
// component test adds one.

const repositoryRoot = process.cwd();

// `id DESC` as the server sends it. UUIDv7s, so the descending ids are also
// newest-first; the point of the test is that nothing here re-sorts them.
const SERVER_ORDER: Todo[] = [
  {
    id: "0199a2c0-0000-7000-8000-00000000000c",
    text: "send invoice",
    completed: false,
    createdAt: "2026-09-22T08:00:00.000Z",
  },
  {
    id: "0199a2b0-0000-7000-8000-00000000000b",
    text: "book dentist",
    completed: true,
    createdAt: "2026-09-21T08:00:00.000Z",
  },
  {
    id: "0199a2a0-0000-7000-8000-00000000000a",
    text: "water plants",
    completed: false,
    createdAt: "2026-09-20T08:00:00.000Z",
  },
];

function stubFetch(implementation: () => Promise<Response>) {
  // Typed as `fetch` itself so the recorded call reads back with fetch's own
  // parameter types; the implementation takes none, because everything asserted
  // about the arguments is asserted from `mock.calls`.
  const stub = vi.fn<typeof fetch>(() => implementation());
  vi.stubGlobal("fetch", stub);
  return stub;
}

function answer(body: unknown, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(Response.json(body, init));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the request (AC5)", () => {
  it("names a path a route handler actually serves", () => {
    // `TODOS_ENDPOINT` is a hand-written copy of a filesystem path. Without
    // this, moving or renaming `app/api/todos/route.ts` leaves a green tree
    // and a 404 — the request would fail as a designed load failure, which is
    // exactly what would make it hard to notice.
    const route = path.join(
      repositoryRoot,
      "app",
      ...TODOS_ENDPOINT.split("/").filter(Boolean),
      "route.ts",
    );
    expect(existsSync(route), `no route handler at ${route}`).toBe(true);
  });

  it("asks the endpoint Story 2.1 built, for JSON", async () => {
    const stub = stubFetch(() => answer(SERVER_ORDER));

    await fetchTodoList();

    expect(stub).toHaveBeenCalledTimes(1);
    const [url, init] = stub.mock.calls[0];
    expect(url).toBe(TODOS_ENDPOINT);
    expect(init).toMatchObject({ headers: { accept: "application/json" } });
  });

  it("forwards the abort signal it is given, so TanStack can cancel the read", async () => {
    const stub = stubFetch(() => answer(SERVER_ORDER));
    const controller = new AbortController();

    await fetchTodoList({ signal: controller.signal });

    expect(stub.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it.each([
    {
      name: "a 401 from the identity wall",
      respond: () =>
        answer({ error: { kind: "load", message: "no" } }, { status: 401 }),
    },
    {
      name: "the route handler's 500 envelope",
      respond: () =>
        answer(
          {
            error: {
              kind: "load",
              message: "The Todo List could not be read.",
            },
          },
          { status: 500 },
        ),
    },
    {
      name: "a 503 while the identity store is unreachable",
      respond: () =>
        answer({ error: { kind: "load", message: "no" } }, { status: 503 }),
    },
    {
      name: "a transport failure, where no response arrived at all",
      respond: () => Promise.reject(new TypeError("Failed to fetch")),
    },
    {
      name: "a 200 whose body is not a JSON array",
      respond: () => answer({ todos: [] }),
    },
    {
      name: "a 200 whose body is not JSON at all",
      respond: () =>
        Promise.resolve(new Response("<html>captive portal</html>")),
    },
  ])("classifies $name as kind load", async ({ respond }) => {
    stubFetch(respond);

    const failure = await fetchTodoList().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TodoRequestError);
    expect((failure as TodoRequestError).kind).toBe("load");
  });

  it("takes the kind from the operation attempted, not from the response body", async () => {
    // A server that answered the wrong kind — or a proxy that answered someone
    // else's envelope — cannot change what this read was. AD-10.
    stubFetch(() =>
      answer({ error: { kind: "create", message: "boom" } }, { status: 500 }),
    );

    const failure: unknown = await fetchTodoList().catch(
      (error: unknown) => error,
    );

    expect((failure as TodoRequestError).kind).toBe("load");
  });

  it("keeps the cause, and keeps its own message out of the interface's reach", async () => {
    const transport = new TypeError("Failed to fetch");
    stubFetch(() => Promise.reject(transport));

    const failure = (await fetchTodoList().catch(
      (error: unknown) => error,
    )) as TodoRequestError;

    expect(failure.cause).toBe(transport);
    // Diagnostic only: AD-10 has the client map `kind` to EXPERIENCE.md's copy
    // and never show a message. Nothing asserts this string is user-facing.
    expect(failure.message).not.toContain("Failed to fetch");
  });
});

describe("the query options (AC1, AC4)", () => {
  it("uses the one declared query key, imported rather than retyped", () => {
    expect(todoListQueryOptions.queryKey).toBe(TODOS_QUERY_KEY);
  });

  it("does not retry, so the designed load failure is not held back by a backoff chain", () => {
    expect(todoListQueryOptions.retry).toBe(false);
  });

  it("attempts the request even when the browser reports itself offline", () => {
    // The default `"online"` pauses the fetch instead of running it: the query
    // stays pending, never errors, and the list region would pulse forever with
    // no banner and nothing to press (NFR-4).
    expect(todoListQueryOptions.networkMode).toBe("always");
  });

  it.each(["staleTime", "refetchOnWindowFocus"] as const)(
    "leaves %s at the library default, which is a decision and not an omission",
    (option) => {
      // Story 1.7 left both for this epic to settle and this story settles them
      // by keeping them: `staleTime: 0` costs one request because every
      // consumer of the list mounts in the same commit, and a refetch on window
      // focus is this product's whole answer to a second tab. Asserted as
      // absent so a later story cannot change the answer silently.
      expect(todoListQueryOptions[option]).toBeUndefined();
    },
  );

  it("hands the fetch a signal, so TanStack's cancellation actually reaches the transport", async () => {
    // The direct-call test above proves `fetchTodoList` forwards a signal it is
    // given. It does not prove the `queryFn` passes TanStack's context signal
    // in — and that is the half that breaks silently: `queryFn: () =>
    // fetchTodoList()` type-checks (a queryFn may ignore its context) and keeps
    // every other test in this block green, because none of them reads the
    // `init` the queryFn produced.
    const stub = stubFetch(() => answer(SERVER_ORDER));

    await new QueryClient().fetchQuery(todoListQueryOptions);

    expect(stub.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives the fetch a deadline as well as the caller's signal", async () => {
    // A connection accepted and then left open is the case `retry: false` and
    // `networkMode: "always"` do not cover: without a deadline the query stays
    // pending, which is the same stuck interface those two options were chosen
    // to avoid. Proved by composition rather than by waiting out the clock —
    // the signal the transport receives must not be the caller's own.
    const stub = stubFetch(() => answer(SERVER_ORDER));
    const caller = new AbortController();

    await fetchTodoList({ signal: caller.signal });

    const passed = stub.mock.calls[0]?.[1]?.signal;
    expect(passed).toBeInstanceOf(AbortSignal);
    expect(passed).not.toBe(caller.signal);
    expect(READ_DEADLINE_MS).toBeGreaterThan(0);
    expect(Number.isFinite(READ_DEADLINE_MS)).toBe(true);
  });

  it("still aborts when the caller aborts, so cancellation is not lost to the deadline", async () => {
    const stub = stubFetch(() => answer(SERVER_ORDER));
    const caller = new AbortController();

    await fetchTodoList({ signal: caller.signal });
    const passed = stub.mock.calls[0]?.[1]?.signal;
    expect(passed?.aborted).toBe(false);

    caller.abort();
    expect(passed?.aborted).toBe(true);
  });

  it("caches the list under ['todos'] in the order received", async () => {
    stubFetch(() => answer(SERVER_ORDER));
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(todoListQueryOptions);

    expect(queryClient.getQueryData(TODOS_QUERY_KEY)).toEqual(SERVER_ORDER);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  it("does not re-sort, so `id DESC` is the server's ordering and not the client's", async () => {
    // The same three Todos, deliberately not in `id DESC` order. A client that
    // sorted would hide a server that had stopped ordering — and AD-5 puts the
    // ordering in the `(owner_id, id DESC)` index, not here.
    const asSent = [SERVER_ORDER[1], SERVER_ORDER[2], SERVER_ORDER[0]];
    stubFetch(() => answer(asSent));
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(todoListQueryOptions);

    expect(queryClient.getQueryData(TODOS_QUERY_KEY)).toEqual(asSent);
  });

  it("caches an empty list as a success, not a failure", async () => {
    // Story 2.8's empty state renders this; it must not arrive as an error.
    stubFetch(() => answer([]));
    const queryClient = new QueryClient();

    await expect(queryClient.fetchQuery(todoListQueryOptions)).resolves.toEqual(
      [],
    );
    expect(queryClient.getQueryState(TODOS_QUERY_KEY)?.error).toBeNull();
  });

  it("reports a failure once, with the kind the banner reads (AC5)", async () => {
    const stub = stubFetch(() =>
      answer({ error: { kind: "load", message: "no" } }, { status: 500 }),
    );
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(todoListQueryOptions).catch(() => undefined);

    const state = queryClient.getQueryState<Todo[], TodoRequestError>(
      TODOS_QUERY_KEY,
    );
    expect(state?.status).toBe("error");
    expect(state?.error?.kind).toBe("load");
    expect(state?.data).toBeUndefined();
    // `retry: false` means exactly one attempt, not four.
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing in the cache to mistake for a known-empty list after a failure", async () => {
    // A load failure makes the contents *unknown*, not known-empty — which is
    // what lets Story 2.8 suppress the empty state on this path.
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(todoListQueryOptions).catch(() => undefined);

    expect(queryClient.getQueryData(TODOS_QUERY_KEY)).toBeUndefined();
  });

  it("re-requests on retry and resolves to content (EXPERIENCE.md §State Patterns)", async () => {
    let attempt = 0;
    const stub = stubFetch(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : answer(SERVER_ORDER);
    });
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(todoListQueryOptions).catch(() => undefined);
    await queryClient.refetchQueries({ queryKey: TODOS_QUERY_KEY });

    expect(stub).toHaveBeenCalledTimes(2);
    const state = queryClient.getQueryState(TODOS_QUERY_KEY);
    expect(state?.status).toBe("success");
    expect(state?.data).toEqual(SERVER_ORDER);
  });
});

describe("identityExpired — the failure a Retry cannot fix", () => {
  // `middleware.ts` mints on a document request and never under `app/api/`
  // (AD-17), so a 401 means this page holds no identity the server accepts.
  // Story 2.7's Retry would re-request and receive 401 again, forever; only a
  // fresh document request mints. The middleware's own catch branch reaches
  // this state deliberately: when the identity store is unreachable it serves
  // the shell with no cookie at all.
  it("is true for a 401", async () => {
    stubFetch(() => answer({ error: { kind: "load", message: "x" } }, { status: 401 }));

    const error = await fetchTodoList().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TodoRequestError);
    expect((error as TodoRequestError).status).toBe(401);
    expect(identityExpired(error)).toBe(true);
  });

  it.each([500, 503])("is false for a %i, which a Retry can fix", async (status) => {
    stubFetch(() => answer({ error: { kind: "load", message: "x" } }, { status }));

    const error = await fetchTodoList().catch((caught: unknown) => caught);

    expect((error as TodoRequestError).status).toBe(status);
    expect(identityExpired(error)).toBe(false);
  });

  it("is false when no response arrived at all", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const error = await fetchTodoList().catch((caught: unknown) => caught);

    expect((error as TodoRequestError).status).toBeUndefined();
    expect(identityExpired(error)).toBe(false);
  });

  it("is false for anything that is not a TodoRequestError", () => {
    expect(identityExpired(new Error("unrelated"))).toBe(false);
    expect(identityExpired(undefined)).toBe(false);
  });
});
