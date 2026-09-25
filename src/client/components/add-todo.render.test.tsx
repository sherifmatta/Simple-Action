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

import { focusManager } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RETRY_LABEL } from "@/client/feedback/error-copy";
import { AppProviders } from "@/client/providers";
import type { Todo } from "@/shared/contract/todo";

import { TodoCard } from "./todo-card";

/** The envelope the server answers a refused create with. */
const REFUSED = { error: { kind: "create", message: "diagnostic" } };

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
  /** The body of a `POST`, parsed. Read off the stub, never off the global. */
  createdBody: (index?: number) => { id: string; text: string };
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
    createdBody: (index = 0) => {
      expect(bodies.length, `create request ${index} was never sent`).toBeGreaterThan(
        index,
      );
      return JSON.parse(bodies[index] ?? "{}") as { id: string; text: string };
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

/** The one `<input>` in the card — the add field. */
function addField(): HTMLInputElement {
  const field = container.querySelector("input");
  expect(field, "the add input did not render").not.toBeNull();
  return field as HTMLInputElement;
}

/** Type into the field without submitting, as the user correcting their text. */
async function type(text: string): Promise<void> {
  const field = addField();
  await act(async () => {
    nativeValue.call(field, text);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

/**
 * What the banner region says, or `""` when it holds nothing.
 *
 * Read out of the region rather than off the card, because the announcer's
 * assertive live region keeps the last message it read and `container
 * .textContent` therefore still contains a string the banner has let go of.
 */
function bannerMessage(): string {
  const region = container.querySelector(".banner-region");
  expect(region, "the banner region did not render").not.toBeNull();
  return region?.textContent?.replace(new RegExp(`${RETRY_LABEL}$`), "").trim() ?? "";
}

/** The banner's `Retry`, or `undefined` when no banner is showing. */
function retryControl(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === RETRY_LABEL,
  );
}

async function pressRetry(): Promise<void> {
  const control = retryControl();
  expect(control, `no ${RETRY_LABEL} was showing`).toBeDefined();
  await act(async () => {
    control?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

function liveRegion(urgency: "polite" | "assertive"): string {
  const regions = [...container.querySelectorAll("[aria-live]")].filter(
    (element) => element.getAttribute("aria-live") === urgency,
  );
  expect(regions, `expected exactly one ${urgency} region`).toHaveLength(1);
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
    expect(liveRegion("polite")).toBe("send invoice, added");
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

// --- Story 3.4: what a failed add costs the user ----------------------------
//
// AC1-AC5 and AC7, through the mounted card. `merge-todo-list.test.ts` proves
// the rollback removes one row and `error-slot.test.ts` proves a clear can
// name its kind; neither says the user gets their sentence back. That is what
// these do, and they do it by reading the field's `value` and its caret rather
// than by matching the source that sets them.

describe("a Todo the server refused", () => {
  it("takes its row back and returns the text, caret at the end (AC1, AC2, AC3)", async () => {
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("  send invoice  ");
    expect(rows()).toEqual(["send invoice", "book dentist"]);
    expect(addField().value).toBe("");

    await create.resolve(REFUSED, 500);

    // AC1 — the row this mutation inserted, and only it.
    expect(rows()).toEqual(["book dentist"]);

    // AC2 — the trimmed text it actually submitted, focused, caret at the end.
    const field = addField();
    expect(field.value).toBe("send invoice");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe("send invoice".length);
    expect(field.selectionEnd).toBe("send invoice".length);

    // AC3 — its own string, not the save string, and announced assertively.
    expect(bannerMessage()).toBe("Couldn't add that Todo.");
    expect(liveRegion("assertive")).toBe("Couldn't add that Todo.");
    expect(retryControl()).toBeDefined();
  });

  it("retries the same id with the text now in the field, and clears on success (AC4, AC5)", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoce");
    await create.resolve(REFUSED, 500);

    // The user fixes their typo in the text that came back.
    await type("send invoice");
    await pressRetry();

    expect(create.calls()).toBe(2);
    // AC4 — the same id, so Story 3.1's endpoint treats it as one create and
    // not two; the text is the one on screen when `Retry` was pressed.
    expect(createdBody(1).id).toBe(createdBody(0).id);
    expect(createdBody(1).text).toBe("send invoice");
    expect(createdBody(0).text).toBe("send invoce");

    // The row is optimistic again, and the field still holds the text —
    // AC2's "not cleared again until the add succeeds".
    expect(rows()).toEqual(["send invoice", "book dentist"]);
    expect(addField().value).toBe("send invoice");

    const confirmed = {
      id: createdBody(1).id,
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-23T10:00:00.000Z",
    };
    await create.resolve(confirmed, 201);

    // AC5 — exactly where a first-time submit leaves things.
    expect(rows()).toEqual(["send invoice", "book dentist"]);
    expect(addField().value).toBe("");
    expect(document.activeElement).toBe(addField());
    expect(retryControl()).toBeUndefined();
    expect(liveRegion("polite")).toBe("send invoice, added");
  });

  it("retries nothing when the field no longer holds a Todo, and lets the banner go", async () => {
    // EXPERIENCE.md:115 — a `Retry` with nothing left to re-attempt does
    // nothing and the banner clears. Reached here by the user emptying the
    // field rather than by the row having been deleted, which is the only
    // form of it this epic can produce.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await create.resolve(REFUSED, 500);

    await type("   ");
    await pressRetry();

    expect(create.calls()).toBe(1);
    expect(retryControl()).toBeUndefined();
    expect(bannerMessage()).toBe("");
    expect(rows()).toEqual(["book dentist"]);
  });

  it("keeps its banner when a background read succeeds under it", async () => {
    // The first of the two guards `deferred-work.md` recorded against
    // `error-banner.tsx`. A read succeeding is grounds for taking down the
    // banner that said the read failed, and grounds for nothing else —
    // EXPERIENCE.md:109's "of the same kind". Before the slot's clear took a
    // kind, a focus refetch landing after a failed add wiped the add's
    // banner and its `Retry` with it.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await create.resolve(REFUSED, 500);
    expect(bannerMessage()).toBe("Couldn't add that Todo.");

    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();
      await read.resolve([EXISTING]);
    } finally {
      focusManager.setFocused(undefined);
    }

    expect(read.calls()).toBe(2);
    expect(bannerMessage()).toBe("Couldn't add that Todo.");
    expect(retryControl()).toBeDefined();
    expect(addField().value).toBe("send invoice");
  });

  it("gives the load failure its banner back when the add's is cleared (AC7)", async () => {
    // The second guard. A `create` entry displaces a `load` one (AD-9), and
    // the read is still broken underneath it — so when the add's banner goes,
    // the user was left with no banner, no `Retry` and a list region whose
    // contents are unknown, which is the exact ambiguity Story 2.6 exists to
    // remove. The load failure is raised again instead.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve({ error: { kind: "load", message: "diagnostic" } }, 500);
    expect(bannerMessage()).toBe("Couldn't load your Todos.");

    await submit("send invoice");
    // AC7 — the optimistic row stands over a failed load, and the banner is
    // still the load's until the create answers.
    expect(rows()).toEqual(["send invoice"]);
    expect(bannerMessage()).toBe("Couldn't load your Todos.");

    await create.resolve(REFUSED, 500);
    expect(bannerMessage()).toBe("Couldn't add that Todo.");

    await pressRetry();

    expect(create.calls()).toBe(2);
    expect(bannerMessage()).toBe("Couldn't load your Todos.");
    expect(retryControl()).toBeDefined();
  });

  it("does not put the load banner straight back when its own Retry is pressed", async () => {
    // The `isFetching` half of the same guard. `retryCurrentError` clears the
    // slot *before* calling the closure, so a `Retry` on the load banner
    // leaves exactly the state the test above raises into — an empty slot
    // over a still-failing read — and the banner the user just dismissed
    // would be back in the same commit.
    //
    // Reached only over a list that has already landed: before the first
    // response there is no data, so TanStack nulls `error` when the refetch
    // starts and the question never arises. With data in hand the error
    // survives the refetch, and the only thing separating "dismissed" from
    // "still unreported" is that a request is in flight.
    const { read } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();
      await read.resolve({ error: { kind: "load", message: "diagnostic" } }, 500);
      expect(bannerMessage()).toBe("Couldn't load your Todos.");

      await pressRetry();

      // The re-request is in flight and has not answered. Nothing is showing.
      expect(read.calls()).toBe(3);
      expect(bannerMessage()).toBe("");
      expect(retryControl()).toBeUndefined();

      await read.resolve([EXISTING]);
    } finally {
      focusManager.setFocused(undefined);
    }

    expect(bannerMessage()).toBe("");
    expect(rows()).toEqual(["book dentist"]);
  });

  it("does not eat a Todo the user started typing while an earlier add was in flight", async () => {
    // Why the clear in `onSuccess` is guarded on the id whose text was
    // returned rather than run for every confirmation. A plain submit already
    // cleared the field on Enter; clearing again when the server answers
    // would take whatever the user has typed since — and this epic's whole
    // rhythm is that the next Todo can be typed without waiting.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await type("book flights");

    await create.resolve(
      {
        id: "0199a2d0-0000-7000-8000-00000000000d",
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T10:00:00.000Z",
      },
      201,
    );

    expect(addField().value).toBe("book flights");
  });

  it("puts the caret back at the end when a retry fails on the same text", async () => {
    // The restore runs again with a string the field already holds, so React
    // re-renders nothing and the browser's own "setting `value` moves the
    // caret to the end" never fires. Only the explicit selection call is
    // left, and the user has been sitting mid-sentence since the last
    // failure.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await create.resolve(REFUSED, 500);

    const field = addField();
    await act(async () => field.setSelectionRange(4, 4));
    expect(field.selectionStart).toBe(4);

    await pressRetry();
    await create.resolve(REFUSED, 500);

    expect(addField().value).toBe("send invoice");
    expect(addField().selectionStart).toBe("send invoice".length);
  });

  it("reloads the document rather than re-sending when the identity expired", async () => {
    // The read has had this escape since Story 2.6 and the create reaches the
    // same `401`: the route handler refuses any `/api/**` request without a
    // valid Client Identity and `middleware.ts` mints one only on a document
    // request. Without it `Retry` re-`POST`s into the same refusal for as
    // long as the page is open — a dead button on the one operation whose
    // whole purpose is to work the second time.
    const { read, create } = stubFetch();
    const reload = vi.fn();
    // `reload` is a non-configurable own property of jsdom's `Location`, so
    // the whole `window.location` is swapped, as `todo-list.render.test.tsx`
    // does it for the read.
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: Object.assign(Object.create(Object.getPrototypeOf(original)), {
        href: original.href,
        origin: original.origin,
        reload,
      }),
    });

    try {
      await mountCard();
      await read.resolve([EXISTING]);

      await submit("send invoice");
      await create.resolve({ error: { kind: "create", message: "x" } }, 401);
      expect(bannerMessage()).toBe("Couldn't add that Todo.");

      await pressRetry();

      expect(reload).toHaveBeenCalledTimes(1);
      expect(create.calls()).toBe(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });

  it("keeps an unconfirmed row through the list a load Retry brings back (AC7)", async () => {
    // AC7's third clause. The row is optimistic and still unanswered, the
    // read has failed under it, and `Retry` re-requests a list that cannot
    // know about the Todo — so the merge is what has to keep it, exactly as
    // it does for the first response.
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve({ error: { kind: "load", message: "diagnostic" } }, 500);

    await submit("send invoice");
    expect(rows()).toEqual(["send invoice"]);
    expect(bannerMessage()).toBe("Couldn't load your Todos.");

    await pressRetry();
    expect(read.calls()).toBe(2);
    // The list the server has, which predates the create it has not answered.
    await read.resolve([EXISTING]);

    expect(rows()).toEqual(["send invoice", "book dentist"]);
    expect(bannerMessage()).toBe("");
    expect(create.calls()).toBe(1);

    // And it collapses to one entry rather than two when the create is
    // finally confirmed.
    await create.resolve(
      {
        id: createdBody(0).id,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T10:00:00.000Z",
      },
      201,
    );
    expect(rows()).toEqual(["send invoice", "book dentist"]);
  });

  it("leaves a Todo the user has started typing alone, and retries its own text", async () => {
    // The mirror of the confirmation guard. AC2 returns the submitted text so
    // that a failure costs nothing typed; writing it over a half-typed Todo
    // would cost precisely that, and this epic's whole rhythm is that the
    // next Todo can be started before the last one has answered. The failed
    // text is not lost — it is in the retry closure, and `Retry` re-sends it.
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await type("book flights");
    await create.resolve(REFUSED, 500);

    expect(addField().value).toBe("book flights");
    expect(bannerMessage()).toBe("Couldn't add that Todo.");

    await pressRetry();

    expect(create.calls()).toBe(2);
    expect(createdBody(1).id).toBe(createdBody(0).id);
    expect(createdBody(1).text).toBe("send invoice");
    // And the half-typed Todo is still where the user left it.
    expect(addField().value).toBe("book flights");
    expect(rows()).toEqual(["send invoice", "book dentist"]);
  });

  it("re-sends the same id when the user presses Enter on the text that came back", async () => {
    // Enter is the key their hands are on, and the banner's `Retry` is a
    // mouse away. Both are the same operation, so both reuse the id the
    // failure minted: Story 3.1's endpoint answers a create for an existing
    // id with the existing row, so a request that arrived and whose response
    // did not produces one Todo rather than two.
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await create.resolve(REFUSED, 500);
    expect(addField().value).toBe("send invoice");

    await submit("send invoice now");

    expect(create.calls()).toBe(2);
    expect(createdBody(1).id).toBe(createdBody(0).id);
    expect(createdBody(1).text).toBe("send invoice now");
    expect(rows()).toEqual(["send invoice now", "book dentist"]);
  });

  it("mints a fresh id for an ordinary Enter, with no failure behind it", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([EXISTING]);

    await submit("send invoice");
    await create.resolve(
      {
        id: createdBody(0).id,
        text: "send invoice",
        completed: false,
        createdAt: "2026-09-23T10:00:00.000Z",
      },
      201,
    );
    await submit("book flights");

    expect(createdBody(1).id).not.toBe(createdBody(0).id);
  });
});

// --- Story 4.3 AC7: a confirmed add shows the Todo it created ---------------

describe("a Todo added while another Filter View is selected (Story 4.3)", () => {
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tab = (label: string) =>
    tabs().find((candidate) => candidate.textContent?.startsWith(label)) as HTMLButtonElement;
  const selected = () =>
    tabs().find((candidate) => candidate.getAttribute("aria-selected") === "true")
      ?.textContent;

  it("shows All when the add confirms, so it is never created out of sight (AC7)", async () => {
    const { read, create, createdBody } = stubFetch();
    await mountCard();
    await read.resolve([{ ...EXISTING, completed: true }]);

    // Looking at Completed, where a new Todo — Active by definition — would
    // land somewhere the user cannot see.
    await act(async () => tab("Completed").click());
    expect(selected()).toBe("Completed 1");

    await submit("send invoice");
    await create.resolve({
      id: createdBody().id,
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-23T10:00:00.000Z",
    });

    expect(selected()).toBe("All 2");
    expect(rows()).toContain("send invoice");
  });

  it("leaves the view alone when the add fails", async () => {
    // AC7 is "given a *successful* add". A failure puts the text back in the
    // field for another attempt, and moving the view underneath that would
    // change what the user is looking at for a Todo that does not exist.
    const { read, create } = stubFetch();
    await mountCard();
    await read.resolve([{ ...EXISTING, completed: true }]);

    await act(async () => tab("Completed").click());
    await submit("send invoice");
    await create.resolve({ error: { kind: "create", message: "x" } }, 500);

    expect(selected()).toBe("Completed 1");
  });
});
