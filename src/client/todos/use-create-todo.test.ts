// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useErrorSlot } from "@/client/feedback/error-slot";
import type { ErrorSlotContextValue } from "@/client/feedback/error-slot";
import { AppProviders } from "@/client/providers";
import type { Todo } from "@/shared/contract/todo";

import { CREATE_TODO_MUTATION_KEY } from "./pending-creates";
import { TODOS_QUERY_KEY } from "./query-keys";
import { addedAnnouncement, useCreateTodo, type AddField } from "./use-create-todo";

// The hook-level tests `use-create-todo.ts` never had. Its two siblings,
// `use-delete-todo.test.ts` and `use-set-completed.test.ts`, each carry a
// structural guard against a whole-list snapshot and a concurrency case where
// one mutation fails while another is in flight; the create had neither,
// which left the last AC15/AC16 gap in the suite (spec-6-1 AC15, AC16).
//
// Driven through a real mount rather than through exported mutation options,
// because unlike its siblings this hook exports none: its `onMutate` and
// `onError` are reachable only from inside `useMutation`. The tree is the
// product's own `AppProviders`, so the query cache, the error slot and the
// announcer are all the real ones. `add-todo.render.test.tsx` proves the same
// mutation through the whole card; this file proves what the hook does to the
// cache, which a card-level failure would not name.

const EXISTING: Todo = {
  id: "0199a2b0-0000-7000-8000-00000000000b",
  text: "book dentist",
  completed: true,
  createdAt: "2026-09-21T08:00:00.000Z",
};

type Captured = {
  submit: (text: string) => void;
  client: QueryClient;
  slot: ErrorSlotContextValue;
};

const mounted: { current: Captured | null } = { current: null };
let container: HTMLDivElement;
let root: Root;
let field: AddField;
let restoreText: ReturnType<typeof vi.fn<(text: string) => void>>;
let clearAndFocus: ReturnType<typeof vi.fn<() => void>>;
let onAdded: ReturnType<typeof vi.fn<() => void>>;

/**
 * A component whose only job is to call the hook and hand the test its seams.
 *
 * The handle is published from an effect rather than from the render body:
 * writing to something outside the component during render is exactly what
 * `react-hooks/globals` refuses, and an effect with no dependency array runs
 * after every commit, so what the test reads is never a commit behind.
 */
function Harness(): ReactNode {
  const submit = useCreateTodo(field, onAdded);
  const client = useQueryClient();
  const slot = useErrorSlot();
  useEffect(() => {
    mounted.current = { submit, client, slot };
  });
  return null;
}

function hook(): Captured {
  const current = mounted.current;
  if (current === null) throw new Error("The harness has not mounted.");
  return current;
}

/** Three macrotasks inside `act`, so a settled fetch reaches the cache. */
async function settle(): Promise<void> {
  for (let flush = 0; flush < 3; flush += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

type Transport = {
  /** Answer the create at `index`, in the order the requests were made. */
  answer: (index: number, body: unknown, status?: number) => Promise<void>;
  /** Fail the create at `index` the way a dropped connection does. */
  refuse: (index: number) => Promise<void>;
  sent: () => { id: string; text: string }[];
};

/** A `fetch` whose every `POST` is held until the test settles it by hand. */
function stubFetch(): Transport {
  const pending: {
    resolve: (response: Response) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  const bodies: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Promise<Response>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    }),
  );

  return {
    answer: async (index, body, status = 201) => {
      const request = pending[index];
      expect(request, `no create #${index} was in flight`).toBeDefined();
      request?.resolve(Response.json(body, { status }));
      await settle();
    },
    refuse: async (index) => {
      const request = pending[index];
      expect(request, `no create #${index} was in flight`).toBeDefined();
      request?.reject(new TypeError("Failed to fetch"));
      await settle();
    },
    sent: () => bodies.map((body) => JSON.parse(body) as { id: string; text: string }),
  };
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  restoreText = vi.fn<(text: string) => void>();
  clearAndFocus = vi.fn<() => void>();
  onAdded = vi.fn<() => void>();
  field = { currentText: () => "", restoreText, clearAndFocus };
  // jsdom implements no `matchMedia`; `false` is "no reduced motion and no
  // fine pointer", which nothing in this file depends on either way.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  await act(async () => {
    root.render(createElement(AppProviders, null, createElement(Harness)));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  mounted.current = null;
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

const cached = (client: QueryClient) => client.getQueryData<Todo[]>(TODOS_QUERY_KEY);
const ids = (client: QueryClient) => cached(client)?.map((todo) => todo.id);

describe("the row enters the cache before the server answers", () => {
  it("adds it to the one key, newest first, before the request resolves", async () => {
    stubFetch();
    const { client, submit } = hook();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [EXISTING]);

    await act(async () => submit("send invoice"));

    const list = cached(client);
    expect(list).toHaveLength(2);
    // uuidv7 is time-ordered and the list is `id DESC`, so the new Todo sorts
    // ahead of one minted yesterday without anything sorting by a timestamp.
    expect(list?.[0]?.text).toBe("send invoice");
    expect(list?.[0]?.completed).toBe(false);
    expect(list?.[1]).toEqual(EXISTING);
  });

  it("confirms it in place when the server agrees, and says so politely", async () => {
    const transport = stubFetch();
    const { client, submit } = hook();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, []);

    await act(async () => submit("send invoice"));
    const optimisticId = ids(client)?.[0];

    await transport.answer(0, {
      id: optimisticId,
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-25T08:00:00.000Z",
    });

    expect(cached(client)).toEqual([
      {
        id: optimisticId,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-25T08:00:00.000Z",
      },
    ]);
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(addedAnnouncement("send invoice")).toBe("send invoice, added");
  });
});

describe("a refused create takes back its own row and nothing else (AC15)", () => {
  it("removes the row it added, leaving every other row untouched", async () => {
    const transport = stubFetch();
    const { client, submit } = hook();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [EXISTING]);

    await act(async () => submit("send invoice"));
    expect(cached(client)).toHaveLength(2);

    await transport.refuse(0);

    // Exactly the row this mutation put there, and only that one. A whole-list
    // snapshot restored here would pass this assertion too — which is why the
    // concurrency case below exists and why the structural guard does.
    expect(cached(client)).toEqual([EXISTING]);
    expect(hook().slot.error?.kind).toBe("create");
  });

  it("hands the text back to the field rather than losing it", async () => {
    const transport = stubFetch();
    const { submit } = hook();

    await act(async () => submit("send invoice"));
    await transport.refuse(0);

    expect(restoreText).toHaveBeenCalledWith("send invoice");
    expect(clearAndFocus).not.toHaveBeenCalled();
  });
});

describe("a refused create leaves a concurrent one alone (AC16)", () => {
  it("keeps the second create's optimistic row when the first fails", async () => {
    // The row this design exists for, reached from the create side. A
    // whole-list snapshot taken in `onMutate` and restored in `onError` would
    // satisfy every other assertion in this file and fail this one: the
    // snapshot predates the second create, so restoring it would delete a row
    // this mutation never added (AD-16).
    const transport = stubFetch();
    const { client, submit } = hook();
    client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [EXISTING]);

    await act(async () => submit("send invoice"));
    await act(async () => submit("pay rent"));

    expect(cached(client)).toHaveLength(3);
    const sent = transport.sent();
    expect(sent.map((body) => body.text)).toEqual(["send invoice", "pay rent"]);
    // Two live mutations, two distinct client-minted ids.
    expect(sent[0]?.id).not.toBe(sent[1]?.id);

    // The first fails while the second is still in flight.
    await transport.refuse(0);

    expect(cached(client)?.map((todo) => todo.text)).toEqual(["pay rent", "book dentist"]);

    // And the survivor still confirms normally afterwards.
    await transport.answer(1, {
      id: sent[1]?.id,
      text: "pay rent",
      completed: false,
      createdAt: "2026-09-25T09:00:00.000Z",
    });
    expect(cached(client)?.map((todo) => todo.text)).toEqual(["pay rent", "book dentist"]);
  });

  it("registers the unconfirmed create so an arriving list cannot drop it", async () => {
    const transport = stubFetch();
    const { client, submit } = hook();

    await act(async () => submit("send invoice"));
    const { unconfirmedCreateIds } = await import("./pending-creates");
    expect([...unconfirmedCreateIds(client)]).toEqual([transport.sent()[0]?.id]);

    // A failed create is no longer unconfirmed — it is gone, and an arriving
    // list that has never heard of it is right.
    await transport.refuse(0);
    expect([...unconfirmedCreateIds(client)]).toEqual([]);
  });
});

describe("the structural guards its two siblings already carry", () => {
  // Read from the repository root rather than from `import.meta.url`: under
  // `environment: "jsdom"` that URL is an `http:` one and `fileURLToPath`
  // refuses it, which is why the two sibling scans can use it and this cannot.
  const source = readFileSync(
    path.join(process.cwd(), "src", "client", "todos", "use-create-todo.ts"),
    "utf8",
  );

  it("takes no whole-list snapshot: `onMutate` returns no mutation context", async () => {
    // One of the two ways a snapshot arrives. `use-delete-todo.test.ts` calls
    // its exported `onMutate` directly and asserts the return is `undefined`;
    // this hook exports none, so the same fact is read off the mutation cache
    // afterwards — which also catches a context returned and then ignored.
    stubFetch();
    const { client, submit } = hook();
    await act(async () => submit("send invoice"));

    const mutations = client
      .getMutationCache()
      .findAll({ mutationKey: CREATE_TODO_MUTATION_KEY, exact: true });
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.state.context).toBeUndefined();
  });

  it("reads the cache at most once, which is the other way a snapshot arrives", () => {
    // The sibling scans allow exactly one `getQueryData` — a retry that looks
    // one row up is not a snapshot. This hook needs none at all, because its
    // retry closure holds the Todo it tried to create; the ceiling is what is
    // asserted, so the guard survives a retry that later needs the lookup.
    const reads = source.match(/getQueryData/g) ?? [];
    expect(reads.length).toBeLessThanOrEqual(1);
  });

  it("writes to the cache three times and no more", () => {
    // The optimistic insert, the confirmation, and the rollback. Anchored on
    // the call rather than on the identifier, so the prose above each one is
    // not counted as a fourth.
    expect(
      source.match(/client\.setQueryData<Todo\[\]>\(TODOS_QUERY_KEY/g),
    ).toHaveLength(3);
  });

  it("is built on the read's failure discipline, not a second one", () => {
    // `retry: false` — recovery is AD-9's explicit `Retry`, never an automatic
    // chain. `networkMode: "always"` — a create attempted offline must fail
    // visibly rather than pause into a state with nothing to press (NFR-4).
    expect(source).toMatch(/retry:\s*false/);
    expect(source).toMatch(/networkMode:\s*"always"/);
    expect(source).toMatch(/mutationKey:\s*CREATE_TODO_MUTATION_KEY/);
  });
});
