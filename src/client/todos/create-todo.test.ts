import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import { CREATE_DEADLINE_MS, createTodo } from "./create-todo";
import { mergeTodoListById } from "./merge-todo-list";
import { CREATE_TODO_MUTATION_KEY, unconfirmedCreateIds } from "./pending-creates";
import { TODOS_QUERY_KEY } from "./query-keys";
import {
  READ_DEADLINE_MS,
  TodoRequestError,
  todoListQueryOptions,
} from "./todo-list-query";

// Covers epics.md Story 3.3 AC1, AC4, AC5 and AC7 at the layer below React:
// what goes on the wire, what comes back off it, and — the half that matters
// most — that the list query is the thing applying AD-16's merge.
//
// `add-todo.render.test.tsx` proves the same race through a mounted card.
// This file proves it through a real `QueryClient` under `environment:
// "node"`, which is where the ordering bug actually lives: the cache and the
// pending creates have to be read *after* the response arrives, and a mount
// test that failed on that would not say so.

const OPTIMISTIC: Todo = {
  id: "0199a2d0-0000-7000-8000-00000000000d",
  text: "send invoice",
  completed: false,
  createdAt: "2026-09-23T09:00:00.000Z",
};

const EXISTING: Todo = {
  id: "0199a2b0-0000-7000-8000-00000000000b",
  text: "book dentist",
  completed: true,
  createdAt: "2026-09-21T08:00:00.000Z",
};

function stubFetch(implementation: () => Promise<Response>) {
  const stub = vi.fn<typeof fetch>(() => implementation());
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => vi.unstubAllGlobals());

describe("createTodo — what goes on the wire (AC1)", () => {
  it("posts the minted id and the text, and nothing else", async () => {
    const stub = stubFetch(() => Promise.resolve(Response.json(OPTIMISTIC, { status: 201 })));

    await createTodo(OPTIMISTIC);

    const [endpoint, init] = stub.mock.calls[0] ?? [];
    expect(endpoint).toBe("/api/todos");
    expect(init?.method).toBe("POST");
    // `completed` and `createdAt` are the server's to set (AD-4); sending
    // them would be sending fields the route handler ignores.
    expect(JSON.parse(String(init?.body))).toEqual({
      id: OPTIMISTIC.id,
      text: OPTIMISTIC.text,
    });
  });

  it("takes `200` and `201` as the same answer, because the endpoint is idempotent", async () => {
    for (const status of [200, 201]) {
      stubFetch(() => Promise.resolve(Response.json(OPTIMISTIC, { status })));
      await expect(createTodo(OPTIMISTIC)).resolves.toEqual(OPTIMISTIC);
    }
  });

  it("classifies every failure as kind `create`, with or without a response", async () => {
    for (const status of [400, 401, 409, 500]) {
      stubFetch(() =>
        Promise.resolve(Response.json({ error: { kind: "create" } }, { status })),
      );
      await expect(createTodo(OPTIMISTIC)).rejects.toMatchObject({
        kind: "create",
        status,
      });
    }

    // A transport failure: no response at all, and the kind still comes from
    // the operation attempted (AD-10).
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const failure = await createTodo(OPTIMISTIC).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect(failure).toMatchObject({ kind: "create", status: undefined });
  });

  it("rejects a success that is not an object, rather than caching it", async () => {
    stubFetch(() => Promise.resolve(Response.json([OPTIMISTIC], { status: 201 })));
    await expect(createTodo(OPTIMISTIC)).rejects.toMatchObject({ kind: "create" });
  });
});

describe("createTodo gives up rather than hanging (Story 3.4)", () => {
  it("sends a signal that is already aborting on the deadline", () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const stub = stubFetch(() =>
      Promise.resolve(Response.json(OPTIMISTIC, { status: 201 })),
    );

    void createTodo(OPTIMISTIC);

    expect(timeout).toHaveBeenCalledWith(CREATE_DEADLINE_MS);
    const [, init] = stub.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("gives up at the same 15s the read does, in real milliseconds", () => {
    // Asserted as a number rather than against `READ_DEADLINE_MS`, which the
    // constant is currently an alias of — comparing an alias to what it
    // aliases pins nothing. What is worth pinning is the value a hung create
    // actually waits, and that it is the read's: two different numbers would
    // only invite a reader to look for the difference between a connection
    // that hangs on a `GET` and one that hangs on a `POST`, and there is
    // none.
    expect(CREATE_DEADLINE_MS).toBe(15_000);
    expect(READ_DEADLINE_MS).toBe(15_000);
  });

  it("classifies a create abandoned on the deadline as kind `create`", async () => {
    // The whole reason for the deadline. Without it this rejection never
    // arrives, so `onError` never runs — no rollback, no banner, no text
    // returned. AD-10 classifies by the operation attempted, and a timeout
    // brings back no response at all to classify by.
    stubFetch(() =>
      Promise.reject(new DOMException("signal timed out", "TimeoutError")),
    );

    await expect(createTodo(OPTIMISTIC)).rejects.toMatchObject({
      kind: "create",
      status: undefined,
    });
  });
});

describe("the list query merges what the cache holds (AC4, AC5, AC7)", () => {
  /** A client whose mutation cache holds one create in the given state. */
  async function clientWithCreate(settle: "pending" | "succeeded" | "failed") {
    const client = new QueryClient();
    const observer = new MutationObserver<Todo, Error, Todo>(client, {
      mutationKey: CREATE_TODO_MUTATION_KEY,
      mutationFn: () =>
        settle === "failed"
          ? Promise.reject(new TodoRequestError("create"))
          : new Promise<Todo>((resolve) => {
              if (settle === "succeeded") resolve(OPTIMISTIC);
            }),
      retry: false,
      networkMode: "always",
    });

    const running = observer.mutate(OPTIMISTIC).catch(() => undefined);
    if (settle !== "pending") await running;
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [OPTIMISTIC]);
    return client;
  }

  it("keeps an unconfirmed row through a response that predates it", async () => {
    const client = await clientWithCreate("pending");
    stubFetch(() => Promise.resolve(Response.json([EXISTING])));

    const merged = await client.fetchQuery(todoListQueryOptions);

    expect(merged.map((row) => row.id)).toEqual([OPTIMISTIC.id, EXISTING.id]);
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)).toEqual(merged);
  });

  it("still keeps it once the create has succeeded, because the read may be older", async () => {
    // A `GET` that left before the `POST` can land after it. Treating only
    // pending creates as unconfirmed would drop the row here, which is the
    // "never dropped" AC7 forbids.
    const client = await clientWithCreate("succeeded");
    stubFetch(() => Promise.resolve(Response.json([EXISTING])));

    expect((await client.fetchQuery(todoListQueryOptions)).map((row) => row.id)).toEqual([
      OPTIMISTIC.id,
      EXISTING.id,
    ]);
  });

  it("drops it once the create has failed, because it was never created", async () => {
    const client = await clientWithCreate("failed");
    stubFetch(() => Promise.resolve(Response.json([EXISTING])));

    expect((await client.fetchQuery(todoListQueryOptions)).map((row) => row.id)).toEqual([
      EXISTING.id,
    ]);
  });

  it("reads the cache after the response, not before it", async () => {
    // The ordering this file exists for. The optimistic write lands *while*
    // the read is in flight, so a merge whose cache read is evaluated beside
    // the request rather than after it sees an empty cache and returns the
    // response alone.
    const client = await clientWithCreate("pending");
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, undefined);

    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [OPTIMISTIC]);
          setTimeout(() => resolve(Response.json([EXISTING])), 0);
        }),
    );

    expect((await client.fetchQuery(todoListQueryOptions)).map((row) => row.id)).toEqual([
      OPTIMISTIC.id,
      EXISTING.id,
    ]);
  });

  it("is the merge, and not a coincidence of the two lists", async () => {
    // Guards against the assertions above passing on a query that replaces
    // wholesale: with no create in the cache, the response wins outright.
    const client = new QueryClient();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [OPTIMISTIC]);
    stubFetch(() => Promise.resolve(Response.json([EXISTING])));

    expect((await client.fetchQuery(todoListQueryOptions)).map((row) => row.id)).toEqual([
      EXISTING.id,
    ]);
  });
});

describe("unconfirmedCreateIds reads the mutation cache (AC5)", () => {
  it("is empty on a client that has mutated nothing", () => {
    expect([...unconfirmedCreateIds(new QueryClient())]).toEqual([]);
  });

  it("ignores mutations under another key, so a toggle protects no row", async () => {
    const client = new QueryClient();
    const observer = new MutationObserver<Todo, Error, Todo>(client, {
      mutationKey: ["set-completion-status"],
      mutationFn: () => Promise.resolve(OPTIMISTIC),
      networkMode: "always",
    });
    await observer.mutate(OPTIMISTIC);

    expect([...unconfirmedCreateIds(client)]).toEqual([]);
    // And the merge that consults it therefore lets the response win — which
    // is what makes Epic 5's delete work at all.
    expect(
      mergeTodoListById([OPTIMISTIC], [EXISTING], unconfirmedCreateIds(client)),
    ).toEqual([EXISTING]);
  });
});
