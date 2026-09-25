import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import { DELETE_DEADLINE_MS, deleteTodo } from "./delete-todo";
import { TodoRequestError } from "./todo-list-query";

// The wire half of epics.md Story 5.3 — the matrix rows "Server answers `204`",
// "Server refuses", "Identity expired" and "Delete retried after it in fact
// succeeded", at the layer below React.
//
// `use-delete-todo.test.ts` proves what the cache does with the answer; this
// file proves what is asked and how a refusal is classified. Both exist because
// either alone is survivable: a correct cache dance over a `DELETE` to the
// wrong URL is invisible, and a correct request whose failures carry the wrong
// kind reaches the banner as the wrong sentence.

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

/** The endpoint's own success: `204`, and no body at all. */
const noContent = () => new Response(null, { status: 204 });

function stubFetch(implementation: () => Promise<Response>) {
  const stub = vi.fn<typeof fetch>(() => implementation());
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => vi.unstubAllGlobals());

describe("deleteTodo — what goes on the wire (AC1)", () => {
  it("sends DELETE to the row's own URL, with no body", async () => {
    const stub = stubFetch(() => Promise.resolve(noContent()));

    await deleteTodo({ todo: ACTIVE });

    const [endpoint, init] = stub.mock.calls[0] ?? [];
    expect(endpoint).toBe(`/api/todos/${ACTIVE.id}`);
    expect(init?.method).toBe("DELETE");
    // Nothing to send: the id is in the path and the route handler reads no
    // body. A `content-type` would describe a body that is not there.
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ accept: "application/json" });
  });

  it("removes a Completed Todo by the same call", async () => {
    // "Deletion works on a Todo in either Completion Status"
    // (epic-5-context). There is nothing in the request that could differ, and
    // this is the assertion that it acquired nothing.
    const stub = stubFetch(() => Promise.resolve(noContent()));

    await deleteTodo({ todo: COMPLETED });

    const [endpoint, init] = stub.mock.calls[0] ?? [];
    expect(endpoint).toBe(`/api/todos/${COMPLETED.id}`);
    expect(init?.method).toBe("DELETE");
  });

  it("resolves to nothing and reads no body from the 204", async () => {
    // `app/api/todos/[id]/route.ts` answers `new Response(null, {status: 204})`
    // — there is no body to parse, and `response.json()` on one throws. The
    // spy is the assertion: a `.json()` that crept in would reject here rather
    // than fail somewhere downstream with a cryptic syntax error.
    const response = noContent();
    const json = vi.spyOn(response, "json");
    const text = vi.spyOn(response, "text");
    stubFetch(() => Promise.resolve(response));

    await expect(deleteTodo({ todo: ACTIVE })).resolves.toBeUndefined();

    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it("succeeds again when the same delete is sent twice", async () => {
    // "The same delete sent twice succeeds twice, because a retry must not fail
    // for a row already gone" (epic-5-context). The endpoint is unconditionally
    // idempotent, so this is what `Retry` sees after a delete that in fact
    // succeeded but whose response never arrived.
    const stub = stubFetch(() => Promise.resolve(noContent()));

    await deleteTodo({ todo: ACTIVE });
    await deleteTodo({ todo: ACTIVE });

    expect(stub).toHaveBeenCalledTimes(2);
    expect(stub.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/todos/${ACTIVE.id}`,
      `/api/todos/${ACTIVE.id}`,
    ]);
  });

  it("classifies every failure as kind `delete`, with or without a response", async () => {
    for (const status of [400, 401, 404, 500]) {
      stubFetch(() =>
        Promise.resolve(Response.json({ error: { kind: "delete" } }, { status })),
      );
      await expect(deleteTodo({ todo: ACTIVE })).rejects.toMatchObject({
        kind: "delete",
        status,
      });
    }

    // A transport failure: no response at all, and the kind still comes from
    // the operation attempted (AD-10).
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const failure = await deleteTodo({ todo: ACTIVE }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect(failure).toMatchObject({ kind: "delete", status: undefined });
  });

  it("carries the 401 through as a status, so Retry can tell it apart", async () => {
    // The one non-retryable failure. `identityExpired` reads the status off the
    // error, so the status has to survive the classification above rather than
    // being flattened into "it failed".
    stubFetch(() => Promise.resolve(new Response(null, { status: 401 })));
    await expect(deleteTodo({ todo: ACTIVE })).rejects.toMatchObject({
      kind: "delete",
      status: 401,
    });
  });

  it("never reports the server's own message, whatever it says", async () => {
    // AD-10: the client maps `kind` to EXPERIENCE.md's copy and never forwards
    // a message. The envelope below is read by nothing at all.
    stubFetch(() =>
      Promise.resolve(
        Response.json(
          { error: { kind: "delete", message: "row 12 is locked by pid 4" } },
          { status: 500 },
        ),
      ),
    );

    const failure = await deleteTodo({ todo: ACTIVE }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect((failure as Error).message).not.toContain("locked");
    expect(new TodoRequestError("delete").message).not.toContain("locked");
  });
});

describe("deleteTodo gives up rather than hanging", () => {
  it("sends a signal that is already aborting on the deadline", () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const stub = stubFetch(() => Promise.resolve(noContent()));

    void deleteTodo({ todo: ACTIVE });

    expect(timeout).toHaveBeenCalledWith(DELETE_DEADLINE_MS);
    const [, init] = stub.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("gives up at the same 15s the other three requests do, in real milliseconds", () => {
    // Asserted as a number rather than against `READ_DEADLINE_MS`, which the
    // constant is currently an alias of — comparing an alias to what it aliases
    // pins nothing. What is worth pinning is the value a hung delete actually
    // waits, and that it is the read's.
    expect(DELETE_DEADLINE_MS).toBe(15_000);
  });

  it("classifies a delete abandoned on the deadline as kind `delete`", async () => {
    // Without this the mutation stays pending forever: no failure, so no
    // rollback, and the row stays off screen with nothing saying the server
    // never agreed to it.
    stubFetch(() =>
      Promise.reject(
        Object.assign(new Error("The operation was aborted."), {
          name: "TimeoutError",
        }),
      ),
    );

    const failure = await deleteTodo({ todo: ACTIVE }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect(failure).toMatchObject({ kind: "delete", status: undefined });
  });
});

describe("the module's export surface", () => {
  it("exports the request and its deadline, and nothing else", async () => {
    const exported: Record<string, unknown> = await import("./delete-todo");
    expect(Object.keys(exported).sort()).toEqual([
      "DELETE_DEADLINE_MS",
      "deleteTodo",
    ]);
  });
});
