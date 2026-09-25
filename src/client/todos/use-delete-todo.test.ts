import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_COPY, RETRY_LABEL } from "@/client/feedback/error-copy";
import type { ErrorSlotEntry } from "@/client/feedback/error-slot-state";
import type { Todo } from "@/shared/contract/todo";

import { TODOS_QUERY_KEY } from "./query-keys";
import { todoListQueryOptions, TodoRequestError } from "./todo-list-query";
import {
  DELETE_TODO_MUTATION_KEY,
  deletedAnnouncement,
  deleteTodoMutationOptions,
  useDeleteTodo,
  type DeleteTodoVariables,
} from "./use-delete-todo";

// Covers epics.md Story 5.3 AC1, AC4, AC5 and AC8-AC13 at the layer below
// React: what the cache holds before the request resolves, what a refusal puts
// back and where, what its `Retry` re-attempts, and — the row the whole design
// turns on — what a refusal leaves alone while a second mutation is still in
// flight.
//
// Driven through a real `MutationObserver` against a real `QueryClient` under
// `environment: "node"`, which is `use-set-completed.test.ts`'s argument
// reached from the delete side: the cache dance is where these bugs live, and a
// mount test that failed on one would not say which.
// `todo-list.render.test.tsx` proves the same mutation through the mounted
// card, once.

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
  raiseError: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
  remove: (variables: DeleteTodoVariables) => Promise<void>;
  cached: () => Todo[] | undefined;
  ids: () => string[] | undefined;
  /** The entry the last refusal put in the slot, which is where `Retry` lives. */
  raised: () => ErrorSlotEntry;
};

/**
 * The seams, all spied.
 *
 * The hook wires `reattempt` to its own `mutate`, and so does this: a `Retry`
 * that re-entered the mutation by some other route would prove nothing about
 * the product.
 */
function harness(
  mutationFn: (variables: DeleteTodoVariables) => Promise<void>,
): Harness {
  const client = new QueryClient();
  client.setQueryData<Todo[]>(TODOS_QUERY_KEY, LIST);

  const announce = vi.fn();
  const raiseError = vi.fn();
  const clearError = vi.fn();

  const observer = new MutationObserver<void, Error, DeleteTodoVariables>(
    client,
    {
      ...deleteTodoMutationOptions(client, {
        announce,
        raiseError,
        clearError,
        reattempt: (variables) =>
          void observer.mutate(variables).catch(() => undefined),
      }),
      mutationFn,
    },
  );

  const cached = () => client.getQueryData<Todo[]>(TODOS_QUERY_KEY);

  return {
    client,
    announce,
    raiseError,
    clearError,
    remove: (variables) => observer.mutate(variables),
    cached,
    ids: () => cached()?.map((todo) => todo.id),
    raised: () => raiseError.mock.lastCall?.[0] as ErrorSlotEntry,
  };
}

/** The seams a structural check does not exercise, spelled once. */
const inertSeams = () => ({
  announce: vi.fn(),
  raiseError: vi.fn(),
  clearError: vi.fn(),
  reattempt: vi.fn(),
});

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

const refused = () => new TodoRequestError("delete", { status: 500 });

afterEach(() => vi.unstubAllGlobals());

describe("the row leaves the cache before the server answers (AC1)", () => {
  it("removes it on the one key, before the request resolves", async () => {
    const pending = deferred<void>();
    const { remove, ids } = harness(() => pending.promise);

    const running = remove({ todo: ACTIVE });
    await settle();

    expect(ids()).toEqual([COMPLETED.id]);

    pending.resolve();
    await running;
  });

  it("removes a Completed row by the same route, leaving the other alone", async () => {
    const pending = deferred<void>();
    const { remove, cached } = harness(() => pending.promise);

    const running = remove({ todo: COMPLETED });
    await settle();

    expect(cached()).toEqual([ACTIVE]);

    pending.resolve();
    await running;
  });

  it("writes nothing back when the server agrees — there is no body", async () => {
    // The `204` carries nothing, so `onSuccess` has nothing to install. The
    // row is simply still gone, which is what a reload would also find (AC6).
    const { remove, cached } = harness(() => Promise.resolve());

    await remove({ todo: ACTIVE });

    expect(cached()).toEqual([COMPLETED]);
  });
});

describe("a delete cancels a read in flight (AC4)", () => {
  /**
   * A `fetch` whose first call answers `LIST` and whose next hangs.
   *
   * The first is what makes a server list *land* on this client, which is the
   * condition AC4's permission to cancel rests on. The second is the read the
   * delete then cancels.
   */
  function stubLandedThenHanging(response: { promise: Promise<Response> }) {
    let call = 0;
    let readSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        readSignal = init?.signal ?? undefined;
        call += 1;
        return call === 1
          ? Promise.resolve(Response.json(LIST))
          : response.promise;
      }),
    );
    return { signal: () => readSignal };
  }

  it("aborts the read, so the arriving list cannot bring the row back", async () => {
    const response = deferred<Response>();
    const stub = stubLandedThenHanging(response);

    const mutation = deferred<void>();
    const { client, remove, ids } = harness(() => mutation.promise);

    // A list from the server, landed. Only now may a delete cancel.
    await client.fetchQuery(todoListQueryOptions);

    const read = client
      .refetchQueries({ queryKey: TODOS_QUERY_KEY })
      .catch(() => undefined);
    await settle();
    const readSignal = stub.signal();
    expect(readSignal?.aborted).toBe(false);

    const running = remove({ todo: ACTIVE });
    await settle();

    // Cancelled, which is the half a source scan cannot see: a `cancelQueries`
    // spelled through an alias would pass a grep and fail here.
    expect(readSignal?.aborted).toBe(true);

    // And the pre-delete list arriving afterwards does not land. Without the
    // cancel this is exactly where the row comes back —
    // `merge-todo-list.ts` protects only *unconfirmed creates* from an arriving
    // list, and a delete's id must never join that set or the row would be
    // immortal instead.
    response.resolve(Response.json(LIST));
    await read;
    await settle();

    expect(ids()).toEqual([COMPLETED.id]);

    mutation.resolve();
    await running;
  });

  it("leaves the *initial* read running, because that row may be one the server never knew", async () => {
    // The one state where cancelling is the bug rather than the fix. An
    // optimistic create renders a live delete control while the first `GET` is
    // still on its way (Story 3.3 AC6), and cancelling that read leaves the
    // query idle with `data` undefined and nothing to re-issue it — skeletons
    // forever.
    const response = deferred<Response>();
    let readSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        readSignal = init?.signal ?? undefined;
        return response.promise;
      }),
    );

    const mutation = deferred<void>();
    const { client, remove } = harness(() => mutation.promise);

    const read = client.fetchQuery(todoListQueryOptions);
    await settle();

    const running = remove({ todo: ACTIVE });
    await settle();

    expect(readSignal?.aborted).toBe(false);

    // And it still lands, which is the whole point.
    response.resolve(Response.json(LIST));
    await expect(read).resolves.toEqual(LIST);

    mutation.resolve();
    await running;
  });

  it("registers no unconfirmed id, or the deleted row would be immortal", async () => {
    // The mutation key is deliberately not `pending-creates.ts`'s, and it does
    // not begin with `todos` either — `providers.test.ts` reads an array
    // literal starting `["todos", …]` anywhere in the tree as a second query
    // key (AD-8).
    expect([...DELETE_TODO_MUTATION_KEY]).toEqual(["delete-todo"]);
    expect(DELETE_TODO_MUTATION_KEY[0]).not.toBe("todos");

    const { client, remove } = harness(() => Promise.resolve());
    await remove({ todo: ACTIVE });

    const { unconfirmedCreateIds } = await import("./pending-creates");
    expect([...unconfirmedCreateIds(client)]).toEqual([]);
  });
});

describe("a confirmed removal says so, politely and once (AC5)", () => {
  it("announces the Todo's text and `deleted`", async () => {
    const { remove, announce } = harness(() => Promise.resolve());

    await remove({ todo: ACTIVE });

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("send invoice, deleted", "polite");
  });

  it("builds the message the way the add and the toggle do, comma and all", () => {
    // EXPERIENCE.md:211 — on a delete, "the Todo text, then `deleted`".
    // `addedAnnouncement` and `toggledAnnouncement` are its two siblings, and
    // the vocabulary bans `Done` everywhere.
    expect(deletedAnnouncement("book dentist")).toBe("book dentist, deleted");
    expect(deletedAnnouncement("x")).not.toMatch(/\bDone\b/);
  });

  it("asks for its own banner to be taken down, by kind", () => {
    // EXPERIENCE.md:109. It is `clearError`'s *argument* that is the whole
    // assertion: passing the kind is what makes the reducer leave a failed
    // add's banner standing. A bare `clearError()` here would take down
    // whatever happened to be showing.
    const { remove, clearError } = harness(() => Promise.resolve());

    return remove({ todo: ACTIVE }).then(() => {
      expect(clearError).toHaveBeenCalledWith("delete");
      for (const call of clearError.mock.calls) {
        expect(call, "clearError was called bare").toEqual(["delete"]);
      }
    });
  });
});

describe("a refusal puts back one row, in its place (AC8, AC9)", () => {
  it("re-inserts it at its `id DESC` position rather than on the end", async () => {
    // `ACTIVE` sorts first, so appending it would put it last and the test
    // would see it. The position is not a behaviour anything implements — it is
    // what `upsertTodoById` does to a list ordered by an id that never changes
    // (AD-5) — and this is the assertion that it acquired no second rule.
    const { remove, cached } = harness(() => Promise.reject(refused()));

    await remove({ todo: ACTIVE }).catch(() => undefined);

    expect(cached()).toEqual(LIST);
  });

  it("puts a middle row back between the two it sat between", async () => {
    const MIDDLE: Todo = {
      id: "0199a2b8-0000-7000-8000-00000000000d",
      text: "pay rent",
      completed: false,
      createdAt: "2026-09-21T18:00:00.000Z",
    };
    const client = new QueryClient();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [ACTIVE, MIDDLE, COMPLETED]);

    const observer = new MutationObserver<void, Error, DeleteTodoVariables>(
      client,
      {
        ...deleteTodoMutationOptions(client, inertSeams()),
        mutationFn: () => Promise.reject(refused()),
      },
    );

    await observer.mutate({ todo: MIDDLE }).catch(() => undefined);

    expect(
      client.getQueryData<Todo[]>(TODOS_QUERY_KEY)?.map((todo) => todo.id),
    ).toEqual([ACTIVE.id, MIDDLE.id, COMPLETED.id]);
  });

  it("leaves a concurrent change alone when the delete fails (AC9)", async () => {
    // The row this design exists for. A whole-list snapshot taken in `onMutate`
    // and restored in `onError` would pass every other assertion in this file
    // and fail this one: the snapshot predates the other change, so restoring
    // it would undo something this mutation never did (AD-16).
    const pending = deferred<void>();
    const { client, remove, cached } = harness(() => pending.promise);

    const running = remove({ todo: ACTIVE }).catch(() => undefined);
    await settle();

    // A second mutation — a toggle, as the list would do it — lands while the
    // delete is in flight.
    const toggled = { ...COMPLETED, completed: false };
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [toggled]);

    pending.reject(refused());
    await running;
    await settle();

    // The deleted row is back, and the toggle kept the value it was given.
    expect(cached()).toEqual([ACTIVE, toggled]);
  });

  it("takes no whole-list snapshot, and reads the cache once at most", async () => {
    // The assertion above is the behavioural one; these are the structural
    // ones, and they are cheap. A snapshot arrives in exactly two ways —
    // `onMutate` reading the cache, and `onMutate` returning a mutation context
    // for `onError` to restore — so both are closed here.
    const client = new QueryClient();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, LIST);
    const options = deleteTodoMutationOptions(client, inertSeams());

    const context = await options.onMutate?.(
      { todo: ACTIVE },
      { client, meta: undefined, mutationKey: DELETE_TODO_MUTATION_KEY },
    );
    expect(context).toBeUndefined();

    // Exactly one `getQueryData`, as the toggle's equivalent scan allows, and
    // for the same structural reason: a retry that looks one row up is not a
    // snapshot. The `?.find(` is what makes that readable at a glance — a read
    // of the whole array would be the thing this test exists to catch.
    const source = readFileSync(
      fileURLToPath(new URL("./use-delete-todo.ts", import.meta.url)),
      "utf8",
    );
    expect(source.match(/getQueryData/g)).toHaveLength(1);
    expect(source).toMatch(/getQueryData<Todo\[\]>\(TODOS_QUERY_KEY\)\s*\?\.find\(/);
    // Two writes and no more: the optimistic removal and the rollback.
    // Anchored on the call rather than on the identifier, so the prose above
    // each one is not counted as a third.
    expect(
      source.match(/client\.setQueryData<Todo\[\]>\(TODOS_QUERY_KEY/g),
    ).toHaveLength(2);
  });
});

describe("a refused delete says so, and offers the same removal again (AC10-AC13)", () => {
  it("raises exactly one `delete` entry into the one slot, and announces nothing", async () => {
    const { remove, raiseError, announce } = harness(() =>
      Promise.reject(refused()),
    );

    await remove({ todo: ACTIVE }).catch(() => undefined);

    expect(raiseError).toHaveBeenCalledTimes(1);
    expect(raiseError.mock.lastCall?.[0].kind).toBe("delete");
    // Not announced from here (AC13). `error-banner.tsx` announces whatever the
    // slot holds, assertively, from one site for all four kinds — so a second
    // announcement raised here would be the same sentence spoken twice.
    expect(announce).not.toHaveBeenCalled();
  });

  it("uses the shared save string and the one `Retry` label (AC10)", () => {
    // The kind is what the entry carries; this is the tie that makes the kind
    // mean the sentence AC10 asks for. A failed toggle and a failed delete
    // share it "because they share a shape" (EXPERIENCE.md:87), and a new
    // string invented for the delete would pass every other assertion here.
    expect(ERROR_COPY.delete).toBe("Couldn't save that change.");
    expect(ERROR_COPY.delete).toBe(ERROR_COPY.update);
    expect(RETRY_LABEL).toBe("Retry");
  });

  it("re-attempts the same Todo and removes it again (AC11)", async () => {
    const sent: DeleteTodoVariables[] = [];
    const { remove, raised, ids } = harness((variables) => {
      sent.push(variables);
      return sent.length === 1 ? Promise.reject(refused()) : Promise.resolve();
    });

    await remove({ todo: ACTIVE }).catch(() => undefined);
    expect(ids()).toEqual([ACTIVE.id, COMPLETED.id]);

    raised().retry();
    await settle();

    expect(sent).toEqual([{ todo: ACTIVE }, { todo: ACTIVE }]);
    // Removed optimistically a second time, with no confirmation in between:
    // the retry closure lives in the error slot, not in the list, so there is
    // no dialog on this path at all.
    expect(ids()).toEqual([COMPLETED.id]);
  });

  it("sends the row the cache holds, which the rollback is what restores (AC11)", async () => {
    // The two halves of the retry, shown together. The rollback in `onError` is
    // what puts the row back, and it is *that* row the closure finds and
    // re-sends — so the ordinary retry works, and the existence check that
    // makes AC12 possible costs it nothing.
    //
    // It also pins which of the two identical instructions goes out. The
    // closure holds the Todo it tried to delete and the cache holds whatever
    // the list says now; for a delete they mean the same removal, so taking the
    // cached one keeps this closure from being the last reader of a row the
    // rest of the product has moved on from.
    const sent: DeleteTodoVariables[] = [];
    const { client, remove, raised } = harness((variables) => {
      sent.push(variables);
      return Promise.reject(refused());
    });

    await remove({ todo: ACTIVE }).catch(() => undefined);

    // The rollback put it back, at its `id DESC` position.
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)).toEqual(LIST);

    raised().retry();
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ todo: ACTIVE });
  });

  it("raises the banner again when the retried delete fails again", async () => {
    const { remove, raised, raiseError } = harness(() =>
      Promise.reject(refused()),
    );

    await remove({ todo: ACTIVE }).catch(() => undefined);
    raised().retry();
    await settle();

    expect(raiseError).toHaveBeenCalledTimes(2);
    expect(raiseError.mock.lastCall?.[0].kind).toBe("delete");
  });

  it("does nothing beyond clearing the banner when the row has vanished (AC12)", async () => {
    // The rollback puts the row back, so the ordinary retry finds it. Here
    // something else takes it away in between — an arriving list, another tab,
    // a second delete — and the banner's operation no longer has a Todo to be
    // about. Nothing is re-sent.
    //
    // The banner clears either way: `retryCurrentError` empties the slot before
    // it invokes this closure and does not care what the closure does (AD-9).
    //
    // Asserted against `reattempt` rather than against a request count, and
    // that is the point of writing it this way. Without the existence check the
    // closure re-attempts with an `undefined` Todo, which never reaches the
    // request either — it throws inside `onMutate` a turn later, surfacing as
    // an unhandled rejection after this test has already made its assertions.
    // Counting requests would call that a pass. Counting the call the closure
    // itself makes cannot.
    const client = new QueryClient();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, LIST);

    const raiseError = vi.fn();
    const reattempt = vi.fn();
    const options = deleteTodoMutationOptions(client, {
      ...inertSeams(),
      raiseError,
      reattempt,
    });

    options.onError?.(refused(), { todo: ACTIVE }, undefined, {
      client,
      meta: undefined,
      mutationKey: DELETE_TODO_MUTATION_KEY,
    });
    const entry = raiseError.mock.lastCall?.[0] as ErrorSlotEntry;

    // The rollback ran, so the row is there; something else now takes it away.
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)).toEqual(LIST);
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [COMPLETED]);

    entry.retry();

    expect(reattempt).not.toHaveBeenCalled();
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)).toEqual([COMPLETED]);
  });

  it("reloads rather than re-sending when the Client Identity has expired", async () => {
    // The one non-retryable failure, reached from a fourth side.
    // `middleware.ts` never mints under `app/api/`, so a `401` on the `DELETE`
    // means re-sending yields `401` for as long as the page is open.
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });

    let attempts = 0;
    const { remove, raised } = harness(() => {
      attempts += 1;
      return Promise.reject(new TodoRequestError("delete", { status: 401 }));
    });

    await remove({ todo: ACTIVE }).catch(() => undefined);
    raised().retry();
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(1);
  });
});

describe("the module's export surface", () => {
  it("exports the hook, its key, its message builder and its options", async () => {
    const exported: Record<string, unknown> = await import("./use-delete-todo");
    expect(Object.keys(exported).sort()).toEqual([
      "DELETE_TODO_MUTATION_KEY",
      "deleteTodoMutationOptions",
      "deletedAnnouncement",
      "useDeleteTodo",
    ]);
    expect(typeof useDeleteTodo).toBe("function");
  });

  it("is built on the read's failure discipline, not a second one", () => {
    const options = deleteTodoMutationOptions(new QueryClient(), inertSeams());
    // `retry: false` — recovery is AD-9's explicit `Retry`, never an automatic
    // chain. `networkMode: "always"` — a delete attempted offline must fail
    // visibly rather than pause into a state with nothing to press (NFR-4).
    expect(options.retry).toBe(false);
    expect(options.networkMode).toBe("always");
    expect(options.mutationKey).toBe(DELETE_TODO_MUTATION_KEY);
  });
});
