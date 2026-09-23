import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import { TODOS_QUERY_KEY } from "./query-keys";
import { todoListQueryOptions, TodoRequestError } from "./todo-list-query";
import {
  SET_COMPLETED_MUTATION_KEY,
  setCompletedMutationOptions,
  toggledAnnouncement,
  useSetCompleted,
  type SetCompletedVariables,
} from "./use-set-completed";

// Covers epics.md Story 4.2 AC1-AC7 at the layer below React: what the cache
// holds before the request resolves, what replaces it afterwards, what a
// refusal puts back, and — the row the whole design turns on — what a refusal
// leaves alone while a second toggle is still in flight.
//
// Driven through a real `MutationObserver` against a real `QueryClient` under
// `environment: "node"`, which is `todo-list-query.ts`'s own argument reached
// from the mutation side: the cache dance is where these bugs live, and a
// mount test that failed on one would not say which. `todo-list.render.test.tsx`
// proves the same mutation through the mounted list, once.
//
// One observer serves every case here, including the concurrent one, because
// that is what the product has: `TodoList` holds a single `useSetCompleted()`
// and hands it to every row, so two rows toggled in quick succession are two
// mutations on one observer. A test that used two observers would be testing a
// shape the product does not have.

const ACTIVE: Todo = {
  id: "0199a2c0-0000-7000-8000-00000000000c",
  text: "send invoice",
  completed: false,
  createdAt: "2026-09-22T08:00:00.000Z",
};

const COMPLETED: Todo = {
  id: "0199a2b0-0000-7000-8000-00000000000b",
  text: "book dentist",
  completed: true,
  createdAt: "2026-09-21T08:00:00.000Z",
};

/** The cache as the list region sees it: `id DESC`, newest first. */
const LIST: Todo[] = [ACTIVE, COMPLETED];

type Harness = {
  client: QueryClient;
  announce: ReturnType<typeof vi.fn>;
  toggle: (variables: SetCompletedVariables) => Promise<Todo>;
  cached: () => Todo[] | undefined;
  row: (id: string) => Todo | undefined;
};

function harness(mutationFn: (variables: SetCompletedVariables) => Promise<Todo>): Harness {
  const client = new QueryClient();
  client.setQueryData<Todo[]>(TODOS_QUERY_KEY, LIST);

  const announce = vi.fn();
  const observer = new MutationObserver<Todo, Error, SetCompletedVariables>(
    client,
    { ...setCompletedMutationOptions(client, announce), mutationFn },
  );

  const cached = () => client.getQueryData<Todo[]>(TODOS_QUERY_KEY);

  return {
    client,
    announce,
    toggle: (variables) => observer.mutate(variables),
    cached,
    row: (id) => cached()?.find((todo) => todo.id === id),
  };
}

/** A promise with its settlement pulled out, so a test can hold it open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** One macrotask, so a settled promise's callbacks can run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("the change is on screen before the server answers (AC1, AC2)", () => {
  it("writes the new Completion Status to the one key before the request resolves", async () => {
    const pending = deferred<Todo>();
    const { toggle, row } = harness(() => pending.promise);

    const running = toggle({ todo: ACTIVE, completed: true });
    await settle();

    expect(row(ACTIVE.id)?.completed).toBe(true);

    pending.resolve({ ...ACTIVE, completed: true });
    await running;
  });

  it("marks a Completed row Active again by the same route", async () => {
    const pending = deferred<Todo>();
    const { toggle, row } = harness(() => pending.promise);

    const running = toggle({ todo: COMPLETED, completed: false });
    await settle();

    expect(row(COMPLETED.id)?.completed).toBe(false);

    pending.resolve({ ...COMPLETED, completed: false });
    await running;
  });

  it("leaves the row where it was, and every other row untouched (AC2)", async () => {
    const pending = deferred<Todo>();
    const { toggle, cached } = harness(() => pending.promise);

    const running = toggle({ todo: COMPLETED, completed: false });
    await settle();

    // `byIdDescending` sorts on id alone and Completion Status is not a sort
    // key, so AC2 needs no code — this is the assertion that it acquired none.
    expect(cached()?.map((todo) => todo.id)).toEqual([ACTIVE.id, COMPLETED.id]);
    expect(cached()?.[0]).toEqual(ACTIVE);

    pending.resolve({ ...COMPLETED, completed: false });
    await running;
  });
});

describe("a toggle cancels a read in flight (AC3)", () => {
  /**
   * A `fetch` whose first call answers `LIST` and whose next hangs.
   *
   * The first is what makes a server list *land* on this client, which is the
   * condition AC3's permission to cancel rests on. The second is the read the
   * toggle then cancels.
   */
  function stubLandedThenHanging(response: { promise: Promise<Response> }) {
    let call = 0;
    let readSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        readSignal = init?.signal ?? undefined;
        call += 1;
        return call === 1 ? Promise.resolve(Response.json(LIST)) : response.promise;
      }),
    );
    return { signal: () => readSignal };
  }

  it("aborts the read, so the arriving list cannot overwrite the optimistic value", async () => {
    const response = deferred<Response>();
    const stub = stubLandedThenHanging(response);

    const mutation = deferred<Todo>();
    const { client, toggle, row } = harness(() => mutation.promise);

    // A list from the server, landed. Only now may a toggle cancel.
    await client.fetchQuery(todoListQueryOptions);

    // A refetch of the list, in flight and unresolved.
    const read = client
      .refetchQueries({ queryKey: TODOS_QUERY_KEY })
      .catch(() => undefined);
    await settle();
    const readSignal = stub.signal();
    expect(readSignal?.aborted).toBe(false);

    const running = toggle({ todo: ACTIVE, completed: true });
    await settle();

    // Cancelled, which is the half a source scan cannot see: a `cancelQueries`
    // spelled through an alias would pass a grep and fail here.
    expect(readSignal?.aborted).toBe(true);

    // And the pre-toggle list arriving afterwards does not land. Without the
    // cancel this is exactly where the change visibly un-happens —
    // `merge-todo-list.ts` protects only *unconfirmed creates* from an
    // arriving list, and `pending-creates.ts:10-12` is explicit that a
    // toggle's id must not join that set.
    response.resolve(Response.json(LIST));
    await read;
    await settle();

    expect(row(ACTIVE.id)?.completed).toBe(true);

    mutation.resolve({ ...ACTIVE, completed: true });
    await running;
  });

  it("leaves the *initial* read running, because that row is not one the server knows", async () => {
    // The one state where cancelling is the bug rather than the fix. An
    // optimistic create renders a live checkbox while the first `GET` is still
    // on its way (Story 3.3 AC6), so a toggle here is reachable — and
    // cancelling that read leaves the query idle with `data` undefined and
    // nothing to re-issue it, which is skeletons forever.
    const response = deferred<Response>();
    let readSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        readSignal = init?.signal ?? undefined;
        return response.promise;
      }),
    );

    const mutation = deferred<Todo>();
    const { client, toggle } = harness(() => mutation.promise);

    const read = client.fetchQuery(todoListQueryOptions);
    await settle();

    const running = toggle({ todo: ACTIVE, completed: true });
    await settle();

    expect(readSignal?.aborted).toBe(false);

    // And it still lands, which is the whole point.
    response.resolve(Response.json(LIST));
    await expect(read).resolves.toEqual(LIST);

    mutation.resolve({ ...ACTIVE, completed: true });
    await running;
  });

  it("registers no unconfirmed id, because the server knows this row already", async () => {
    // The mutation key is deliberately not `pending-creates.ts`'s. A toggle
    // that protected its row from an arriving list would make a Todo deleted
    // in another tab immortal.
    expect([...SET_COMPLETED_MUTATION_KEY]).toEqual(["set-completed"]);
    expect(SET_COMPLETED_MUTATION_KEY[0]).not.toBe("todos");
  });
});

describe("what the server confirms is what the cache keeps (AC7)", () => {
  it("replaces the optimistic row with the server's, in place", async () => {
    // The server trims, owns `createdAt`, and is the authority on the stored
    // status. A cache left holding the browser's guess is a list that disagrees
    // with the next reload — which is the whole of AC7.
    const stored: Todo = {
      ...ACTIVE,
      completed: true,
      createdAt: "2026-09-23T10:00:00.000Z",
    };
    const { toggle, cached } = harness(() => Promise.resolve(stored));

    await toggle({ todo: ACTIVE, completed: true });

    expect(cached()).toEqual([stored, COMPLETED]);
  });

  it("announces the Todo's text and its new status, once, politely (AC6)", async () => {
    const { toggle, announce } = harness((variables) =>
      Promise.resolve({ ...variables.todo, completed: variables.completed }),
    );

    await toggle({ todo: ACTIVE, completed: true });

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("send invoice, Completed", "polite");

    await toggle({ todo: COMPLETED, completed: false });

    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith("book dentist, Active", "polite");
  });

  it("announces the status the server stored, not the one that was asked for", async () => {
    // They agree in every ordinary case; what is announced is what is true.
    const { toggle, announce } = harness(() =>
      Promise.resolve({ ...ACTIVE, completed: false }),
    );

    await toggle({ todo: ACTIVE, completed: true });

    expect(announce).toHaveBeenCalledWith("send invoice, Active", "polite");
  });

  it("builds the message the way the add does, comma and all", () => {
    // `addedAnnouncement`'s sibling — EXPERIENCE.md's `send invoice, added`
    // and epic-4-context's `book dentist, Completed` are one shape. The
    // vocabulary's own words, and never `Done`.
    expect(toggledAnnouncement("book dentist", true)).toBe("book dentist, Completed");
    expect(toggledAnnouncement("book dentist", false)).toBe("book dentist, Active");
    expect(toggledAnnouncement("x", true)).not.toMatch(/\bDone\b/);
  });
});

describe("a refusal reverts one row and nothing else (AC4, AC5)", () => {
  it("restores the row to the Todo the mutation started from", async () => {
    const { toggle, cached } = harness(() =>
      Promise.reject(new TodoRequestError("update", { status: 500 })),
    );

    await toggle({ todo: COMPLETED, completed: false }).catch(() => undefined);

    expect(cached()).toEqual(LIST);
  });

  it("says nothing and raises nothing — that is Story 4.4", async () => {
    // A refused toggle reverts and is silent here. Splitting the banner across
    // two stories would leave one behaviour with two owners; Story 4.4's AC1
    // re-covers this restore and adds the announcement, the message and
    // `Retry`.
    const { toggle, announce } = harness(() =>
      Promise.reject(new TodoRequestError("update")),
    );

    await toggle({ todo: ACTIVE, completed: true }).catch(() => undefined);

    expect(announce).not.toHaveBeenCalled();
  });

  it("leaves a concurrent toggle's change alone when the first fails (AC5)", async () => {
    // The row this design exists for. A whole-list snapshot taken in
    // `onMutate` and restored in `onError` would pass every other assertion in
    // this file and fail this one: the snapshot predates the second toggle, so
    // restoring it would undo a change this mutation never made (AD-16).
    const first = deferred<Todo>();
    const second = deferred<Todo>();
    const answers = new Map<string, Promise<Todo>>([
      [ACTIVE.id, first.promise],
      [COMPLETED.id, second.promise],
    ]);

    const { toggle, row } = harness(({ todo }) => answers.get(todo.id)!);

    const failing = toggle({ todo: ACTIVE, completed: true }).catch(
      () => undefined,
    );
    const succeeding = toggle({ todo: COMPLETED, completed: false });
    await settle();

    // Both optimistic writes have landed.
    expect(row(ACTIVE.id)?.completed).toBe(true);
    expect(row(COMPLETED.id)?.completed).toBe(false);

    first.reject(new TodoRequestError("update", { status: 500 }));
    await failing;
    await settle();

    // The first reverted; the second kept the value the user asked for, which
    // the server has not answered about yet.
    expect(row(ACTIVE.id)?.completed).toBe(false);
    expect(row(COMPLETED.id)?.completed).toBe(false);

    second.resolve({ ...COMPLETED, completed: false });
    await succeeding;
    expect(row(COMPLETED.id)?.completed).toBe(false);
  });

  it("takes no whole-list snapshot and restores none, anywhere in the hook", async () => {
    // The assertion above is the behavioural one; these are the structural
    // ones, and they are cheap. A snapshot arrives in exactly two ways —
    // `onMutate` reading the cache, and `onMutate` returning a mutation
    // context for `onError` to restore — so both are closed here rather than
    // left to the concurrency case to catch.
    const client = new QueryClient();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, LIST);
    const options = setCompletedMutationOptions(client, vi.fn());

    const context = await options.onMutate?.(
      { todo: ACTIVE, completed: true },
      { client, meta: undefined, mutationKey: SET_COMPLETED_MUTATION_KEY },
    );
    expect(context).toBeUndefined();

    // The one text scan left: `getQueryData` in this module could only be a
    // snapshot being taken, and the behavioural cases above cannot see a
    // snapshot that is taken and never restored.
    const source = readFileSync(
      fileURLToPath(new URL("./use-set-completed.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/getQueryData/);
  });
});

describe("the module's export surface", () => {
  it("exports the hook, its key, its message builder and its options", async () => {
    const exported: Record<string, unknown> = await import("./use-set-completed");
    expect(Object.keys(exported).sort()).toEqual([
      "SET_COMPLETED_MUTATION_KEY",
      "setCompletedMutationOptions",
      "toggledAnnouncement",
      "useSetCompleted",
    ]);
    expect(typeof useSetCompleted).toBe("function");
  });

  it("is built on the read's failure discipline, not a second one", () => {
    const options = setCompletedMutationOptions(new QueryClient(), vi.fn());
    // `retry: false` — recovery is AD-9's explicit `Retry`, never an automatic
    // chain. `networkMode: "always"` — an update attempted offline must fail
    // visibly rather than pause into a state with nothing to press (NFR-4).
    expect(options.retry).toBe(false);
    expect(options.networkMode).toBe("always");
    expect(options.mutationKey).toBe(SET_COMPLETED_MUTATION_KEY);
  });
});
