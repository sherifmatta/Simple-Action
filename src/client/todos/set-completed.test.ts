import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import { SET_COMPLETED_DEADLINE_MS, setCompleted } from "./set-completed";
import { TodoRequestError } from "./todo-list-query";

// The wire half of epics.md Story 4.2 — the matrix rows "Mark Completed",
// "Mark Active", "Confirmation" and "Refusal", at the layer below React.
//
// `use-set-completed.test.ts` proves what the cache does with the answer; this
// file proves what is asked and how a refusal is classified. Both exist
// because either alone is survivable: a correct cache dance over a `POST` to
// the wrong URL is invisible, and a correct request whose failures carry the
// wrong kind reaches Story 4.4's banner as the wrong sentence.

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

function stubFetch(implementation: () => Promise<Response>) {
  const stub = vi.fn<typeof fetch>(() => implementation());
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => vi.unstubAllGlobals());

describe("setCompleted — what goes on the wire (AC1, AC8)", () => {
  it("patches the row's own URL with the value asked for, and nothing else", async () => {
    const stub = stubFetch(() =>
      Promise.resolve(Response.json({ ...ACTIVE, completed: true })),
    );

    await setCompleted({ todo: ACTIVE, completed: true });

    const [endpoint, init] = stub.mock.calls[0] ?? [];
    expect(endpoint).toBe(`/api/todos/${ACTIVE.id}`);
    expect(init?.method).toBe("PATCH");
    // One field. `text` and `createdAt` are the server's, and the route
    // handler reads neither — sending them would invite a reader to believe
    // they mean something.
    expect(JSON.parse(String(init?.body))).toEqual({ completed: true });
  });

  it("marks a Completed Todo Active by the same call, in the other direction", async () => {
    const stub = stubFetch(() =>
      Promise.resolve(Response.json({ ...COMPLETED, completed: false })),
    );

    await setCompleted({ todo: COMPLETED, completed: false });

    const [, init] = stub.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ completed: false });
  });

  it("sends the value asked for rather than the inverse of what it holds (AD-6)", async () => {
    // The whole of AD-6, as one assertion: a *set* is idempotent and a toggle
    // is not, so a caller re-attempting after an uncertain failure must be
    // able to send the same body twice. `completed` here disagrees with the
    // Todo's own field on purpose — the request must follow the argument.
    const stub = stubFetch(() => Promise.resolve(Response.json(COMPLETED)));

    await setCompleted({ todo: COMPLETED, completed: true });
    await setCompleted({ todo: COMPLETED, completed: true });

    expect(stub.mock.calls.map(([, init]) => String(init?.body))).toEqual([
      '{"completed":true}',
      '{"completed":true}',
    ]);
  });

  it("returns the server's row, which is what the cache ends up holding (AC7)", async () => {
    const stored = { ...ACTIVE, completed: true };
    stubFetch(() => Promise.resolve(Response.json(stored)));

    await expect(setCompleted({ todo: ACTIVE, completed: true })).resolves.toEqual(
      stored,
    );
  });

  it("classifies every failure as kind `update`, with or without a response", async () => {
    for (const status of [400, 401, 404, 500]) {
      stubFetch(() =>
        Promise.resolve(Response.json({ error: { kind: "update" } }, { status })),
      );
      await expect(
        setCompleted({ todo: ACTIVE, completed: true }),
      ).rejects.toMatchObject({ kind: "update", status });
    }

    // A transport failure: no response at all, and the kind still comes from
    // the operation attempted (AD-10).
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const failure = await setCompleted({ todo: ACTIVE, completed: true }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect(failure).toMatchObject({ kind: "update", status: undefined });
  });

  it("never reports the server's own message, whatever it says", () => {
    // AD-10: the client maps `kind` to EXPERIENCE.md's copy and never forwards
    // a message. The route handler's `message` is diagnostic and the class is
    // built from the operation, so the two cannot be confused.
    expect(new TodoRequestError("update").message).not.toContain("could not");
  });

  it("rejects a success that is not an object, rather than caching it", async () => {
    stubFetch(() => Promise.resolve(Response.json([ACTIVE])));
    await expect(
      setCompleted({ todo: ACTIVE, completed: true }),
    ).rejects.toMatchObject({ kind: "update" });
  });
});

describe("setCompleted gives up rather than hanging", () => {
  it("sends a signal that is already aborting on the deadline", () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const stub = stubFetch(() => Promise.resolve(Response.json(ACTIVE)));

    void setCompleted({ todo: ACTIVE, completed: true });

    expect(timeout).toHaveBeenCalledWith(SET_COMPLETED_DEADLINE_MS);
    const [, init] = stub.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("gives up at the same 15s the read and the create do, in real milliseconds", () => {
    // Asserted as a number rather than against `READ_DEADLINE_MS`, which the
    // constant is currently an alias of — comparing an alias to what it
    // aliases pins nothing. What is worth pinning is the value a hung update
    // actually waits, and that it is the read's.
    expect(SET_COMPLETED_DEADLINE_MS).toBe(15_000);
  });

  it("classifies an update abandoned on the deadline as kind `update`", async () => {
    stubFetch(() =>
      Promise.reject(
        Object.assign(new Error("The operation was aborted."), {
          name: "TimeoutError",
        }),
      ),
    );

    const failure = await setCompleted({ todo: ACTIVE, completed: true }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TodoRequestError);
    expect(failure).toMatchObject({ kind: "update", status: undefined });
  });
});

describe("the module's export surface", () => {
  it("exports the request and its deadline, and nothing else", async () => {
    const exported: Record<string, unknown> = await import("./set-completed");
    expect(Object.keys(exported).sort()).toEqual([
      "SET_COMPLETED_DEADLINE_MS",
      "setCompleted",
    ]);
  });
});
