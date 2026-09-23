// @vitest-environment jsdom

// Covers epics.md Story 3.3 AC3, AC4, AC6, AC7, AC8 and AC9 — the race the
// epic names as the hardest thing in the build, exercised as the browser
// meets it: the whole card mounted, a real `QueryClient`, a real mutation,
// and a `GET` that is still in flight when the user presses Enter.
//
// `merge-todo-list.test.ts` proves what the merge decides and this file
// proves that it is what decides. Both exist because either alone is
// survivable: a correct merge that nothing calls is invisible, and a wired
// mutation whose merge is wrong loses a Todo in the one state the epic is
// about.
//
// The order of the two resolutions below is the point of the whole story. The
// `GET` left the browser before the Todo existed, so the list it brings back
// cannot contain it; the documented optimistic recipe would have cancelled
// that read, and AD-16 forbids it. So the read completes, brings back a list
// that knows nothing about the new Todo, and the Todo is still there
// afterwards — never dropped, never duplicated (AC7).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/client/providers";
import type { Todo } from "@/shared/contract/todo";

import { TodoCard } from "./todo-card";

const EXISTING: Todo = {
  id: "0199a2b0-0000-7000-8000-00000000000b",
  text: "book dentist",
  completed: true,
  createdAt: "2026-09-21T08:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // jsdom implements no `matchMedia`; `false` here is "no reduced motion and
  // no fine pointer", which also keeps autofocus out of the way of the
  // explicit typing below.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

/**
 * Macrotasks inside `act`, so a settled fetch can commit.
 *
 * Three rather than `todo-list.render.test.tsx`'s one, because a read here
 * goes through more awaits before it reaches the cache: the response, its
 * `.json()`, the merge, and then TanStack's own scheduled notification. One
 * macrotask lands in the middle of that chain and reads a tree that is a
 * commit behind, which is a test that fails for a reason the product does not
 * have.
 */
async function settle() {
  for (let flush = 0; flush < 3; flush += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

type Deferred = {
  resolve: (body: unknown, status?: number) => Promise<void>;
  calls: () => number;
};

type Transport = {
  /** The read also exposes its `AbortSignal`, which is how AC4 is asserted. */
  read: Deferred & { signal: () => AbortSignal | undefined };
  create: Deferred;
  /** The body of the one `POST`, parsed. Read off the stub, never off the global. */
  createdBody: () => { id: string; text: string };
};

/**
 * A `fetch` that answers the `POST` and the `GET` independently.
 *
 * Both are deferred, because the whole story is about what happens between
 * them. The `GET`'s `AbortSignal` is kept so AC4 can be asserted on the
 * signal itself rather than on the absence of a `cancelQueries` call — a
 * source scan would pass on a cancel spelled `client.cancelQueries` through
 * an alias, and this cannot.
 */
function stubFetch(): Transport {
  const pending = {
    read: [] as ((response: Response) => void)[],
    create: [] as ((response: Response) => void)[],
  };
  const seen = { read: 0, create: 0 };
  let readSignal: AbortSignal | undefined;

  const bodies: string[] = [];
  const stub = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const write = init?.method === "POST";
    if (write) {
      seen.create += 1;
      bodies.push(String(init?.body ?? ""));
    } else {
      seen.read += 1;
      readSignal = init?.signal ?? undefined;
    }
    return new Promise<Response>((resolve) => {
      pending[write ? "create" : "read"].push(resolve);
    });
  });
  vi.stubGlobal("fetch", stub);

  const answer =
    (queue: "read" | "create") => async (body: unknown, status = 200) => {
      const resolve = pending[queue].shift();
      expect(resolve, `no ${queue} request was in flight`).toBeDefined();
      resolve?.(Response.json(body, { status }));
      await settle();
    };

  return {
    read: {
      resolve: answer("read"),
      signal: () => readSignal,
      calls: () => seen.read,
    },
    create: {
      resolve: answer("create"),
      calls: () => seen.create,
    },
    createdBody: () => {
      expect(bodies, "no create request was sent").not.toHaveLength(0);
      return JSON.parse(bodies[0] ?? "{}") as { id: string; text: string };
    },
  };
}

async function mountCard() {
  await act(async () => {
    root.render(
      <AppProviders>
        <TodoCard />
      </AppProviders>,
    );
  });
  await settle();
}

const nativeValue = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

async function submit(text: string): Promise<void> {
  const field = container.querySelector("input");
  expect(field, "the add input did not render").not.toBeNull();
  await act(async () => {
    nativeValue.call(field, text);
    field?.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    field?.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await settle();
}

/** The `<li>`s in the list region, as `"skeleton"` or their Todo's text. */
function rows(): string[] {
  return [...container.querySelectorAll("li")].map((item) =>
    item.className.includes("skeleton-row")
      ? "skeleton"
      : (item.textContent?.trim() ?? ""),
  );
}

function politeAnnouncement(): string {
  const regions = [...container.querySelectorAll("[aria-live]")].filter(
    (element) => element.getAttribute("aria-live") === "polite",
  );
  expect(regions, "expected exactly one polite region").toHaveLength(1);
  return regions[0]?.textContent?.trim() ?? "";
}

describe("a Todo added while the list is still loading", () => {
  it("appears above the pulsing skeletons and survives the list that arrives (AC4, AC6, AC7)", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();

    // The load is in flight and nothing has arrived: three skeletons.
    expect(rows()).toEqual(["skeleton", "skeleton", "skeleton"]);

    await submit("send invoice");

    // AC6 — the optimistic row is above the placeholders, not instead of
    // them, and it is not one of them: it carries text and no pulse.
    expect(rows()).toEqual(["send invoice", "skeleton", "skeleton", "skeleton"]);

    // AC4 — the read was not cancelled to make room for it.
    expect(read.signal()?.aborted).toBe(false);
    expect(read.calls()).toBe(1);

    // The list that was already on its way. It cannot know about the Todo,
    // which is exactly the case AD-16 exists for.
    await read.resolve([EXISTING]);

    // AC7 — never dropped, never duplicated, and the skeletons are gone
    // because the list has landed.
    expect(rows()).toEqual(["send invoice", "book dentist"]);

    // AC8 — and confirmation changes nothing visible.
    const optimistic = createdBody();
    await create.resolve(
      {
        id: optimistic.id,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T12:00:00.000Z",
      },
      201,
    );
    expect(rows()).toEqual(["send invoice", "book dentist"]);
  });

  it("survives the confirmation landing before the list does (AC7)", async () => {
    // The other order, and the one a pending-only view of "unconfirmed" gets
    // wrong: the create settles first, and the `GET` that left before the
    // Todo existed answers afterwards, still knowing nothing about it.
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await submit("send invoice");

    const optimistic = createdBody();
    await create.resolve(
      {
        id: optimistic.id,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T12:00:00.000Z",
      },
      201,
    );
    await read.resolve([EXISTING]);

    expect(rows()).toEqual(["send invoice", "book dentist"]);
  });

  it("sends the id it minted, and sends it once (AC1, AC3)", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    // Padded, so the trim is exercised rather than described: the same string
    // with no surrounding whitespace passes with `text.trim()` deleted.
    await submit("  send invoice  ");
    await read.resolve([]);

    expect(create.calls()).toBe(1);
    expect(createdBody().id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // The trimmed text, which is what the server persists.
    expect(createdBody().text).toBe("send invoice");
    // And the optimistic row carries the same string, so nothing changes
    // under the user when the server's record replaces it.
    expect(rows()).toEqual(["send invoice"]);
  });
});

describe("a Todo added to a list that has already arrived", () => {
  it("goes to the top, clears the field, and announces politely (AC3, AC9)", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);
    expect(rows()).toEqual(["book dentist"]);

    await submit("send invoice");

    // AD-5 — a freshly minted UUIDv7 sorts first, with no pin-to-top rule.
    expect(rows()).toEqual(["send invoice", "book dentist"]);
    expect(container.querySelector("input")?.value).toBe("");
    // No skeleton under a list already in hand.
    expect(rows()).not.toContain("skeleton");

    const optimistic = createdBody();
    await create.resolve(
      {
        id: optimistic.id,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T12:00:00.000Z",
      },
      201,
    );

    // AC9 — the text, then `added`, politely. EXPERIENCE.md:277.
    expect(politeAnnouncement()).toBe("send invoice, added");
  });

  it("keeps the load-failure banner when the list failed and a Todo is typed anyway", async () => {
    // `setQueryData` dispatches a *manual* success, which sets `error: null`
    // exactly as a real response would. So the optimistic write tears the
    // banner and its `Retry` down unless the banner is keyed on something the
    // write cannot reach — and the region must not conclude that a list has
    // landed, or Story 3.4's rollback would leave the All empty state
    // standing over contents nobody knows.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve({ error: { kind: "load", message: "no" } }, 500);
    expect(container.textContent).toContain("Couldn't load your Todos.");

    await submit("send invoice");

    expect(container.textContent).toContain("Couldn't load your Todos.");
    expect(container.querySelector("button")?.textContent).toBe("Retry");
    expect(rows()).toEqual(["send invoice"]);
    // Not a resolved-empty list, and not a loading one either: nothing is in
    // flight, so nothing pulses.
    expect(container.textContent).not.toContain("Nothing here yet.");
    expect(create.calls()).toBe(1);
  });

  it("creates nothing at all on a whitespace-only submit", async () => {
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([]);

    await submit("   \t  ");

    expect(create.calls()).toBe(0);
    expect(rows()).toEqual([]);
    // Story 3.2's rule, now reachable through the wired path: a mis-press
    // keeps what was typed rather than eating it.
    expect(container.querySelector("input")?.value).toBe("   \t  ");
  });
});
