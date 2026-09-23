// @vitest-environment jsdom

// The epic's first real mount (epic-2-context "the first component test here
// adds jsdom and the `.tsx` test glob", and "proves the live regions survive
// hydration rather than only server render").
//
// Every other test of this component renders it with `renderToStaticMarkup`
// and mocks `useTodos` away, and `use-todos.test.ts` is an AST scan that
// executes nothing. So until this file existed, `useQuery(todoListQueryOptions)`
// had never run inside a `QueryClientProvider` anywhere in the suite: a wrong
// import path, a missing provider, or a `queryOptions`/`useQuery` type mismatch
// would have left the whole tree green.
//
// This is deliberately the thinnest possible mount — `createRoot` and React's
// own `act`, no testing library — because what is being proved is that the
// wiring runs at all, not how the markup reads.
//
// Story 2.5 adds the second thing only a real mount can show: the motion
// module's *client* snapshot. jsdom implements no `matchMedia` at all, so
// `useSyncExternalStore` would throw the moment the component hydrated past
// its server snapshot — the stub below is what makes the hook reachable, and
// flipping it is how the reduced-motion case is exercised. Every other test
// in this repository renders on the server, where the snapshot is always
// "still".

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnouncerProvider } from "@/client/feedback/announcer";
import { AppProviders } from "@/client/providers";
import { TODOS_QUERY_KEY } from "@/client/todos/query-keys";
import type { Todo } from "@/shared/contract/todo";
import { TodoCard } from "./todo-card";
import { TodoList } from "./todo-list";

const TODOS: Todo[] = [
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
];

let container: HTMLDivElement;
let root: Root;

// React only treats `act` as a real flush boundary when this is set, and
// warns "The current testing environment is not configured to support act(...)"
// when it is not. Without it `act` returns before React has drained its work,
// so an assertion can read a tree React has not finished committing — which
// is a race that passes alone and fails under a loaded worker.
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(client: QueryClient) {
  // `QueryClientProvider` alone stopped being enough at Story 4.2: the list
  // now holds `useSetCompleted()`, which announces a confirmed toggle through
  // `useAnnounce()` — and that throws outside its provider by design rather
  // than degrading to a no-op. The error slot is still not needed here, which
  // is the shape of this story: a refused toggle reverts and says nothing
  // (Story 4.4 owns the banner).
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AnnouncerProvider>
          <TodoList />
        </AnnouncerProvider>
      </QueryClientProvider>,
    );
  });

  // The render commits before the query has resolved; one macrotask lets the
  // stubbed fetch settle and the re-render commit. Without it the component is
  // asserted in its loading branch, which is the one state every case here is
  // trying to get past.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The whole card, under the whole shell.
 *
 * `QueryClientProvider` alone is no longer enough: Story 2.6 put the banner
 * region in the sticky top block, and it reads the error slot and announces
 * through the announcer — both of which throw outside their providers by
 * design rather than degrading to a no-op. `AppProviders` is what the
 * application actually mounts, so using it here is also the only test that
 * proves the three singletons compose in the order `providers.tsx` nests them.
 *
 * It builds its own `QueryClient` internally, which is why this takes none.
 */
/** One macrotask inside `act`, so a settled fetch can commit. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

/**
 * The text a live region of the given urgency currently holds.
 *
 * The urgency is read off the element rather than written into the selector,
 * deliberately. `announcer.test.ts` scans every source file in the repository
 * for something shaped like a declared live region, and an attribute selector
 * carrying a value is shaped exactly like one — this file would have to join
 * that scan's exemption list, which is a real hole opened for a cosmetic
 * reason. Matching on the attribute's presence and comparing its value
 * afterwards reads the same and stays under the scan.
 */
function liveRegions(urgency: "polite" | "assertive"): Element[] {
  return [...container.querySelectorAll("[aria-live]")].filter(
    (element) => element.getAttribute("aria-live") === urgency,
  );
}

function liveRegion(urgency: "polite" | "assertive"): string {
  const regions = liveRegions(urgency);
  expect(regions, `expected exactly one ${urgency} region`).toHaveLength(1);
  return regions[0]?.textContent?.trim() ?? "";
}

// `retry: false` is already in the options; a fresh client per test keeps the
// cache from leaking between them.
const freshClient = () => new QueryClient();

/**
 * The one `matchMedia` jsdom does not provide.
 *
 * Stubbed here rather than in the component, because the product reads the
 * preference in exactly one module (Story 2.5 AC2) and this is the only test
 * that runs that module's client path.
 *
 * The stub is a recording one, not a constant. A stub that answers `matches`
 * for any query proves nothing about *which* query was asked — inverting the
 * module's feature to `(prefers-reduced-motion: no-preference)` would leave
 * every assertion green — so `queries` is asserted below. And the listeners
 * are captured rather than discarded, so the subscription itself can be
 * exercised: without that, a wrong event name or a listener never removed is
 * invisible to the whole suite.
 *
 * It answers every query with the same value, which matters since Story 3.2:
 * the card now also asks `(pointer: fine)` for autofocus, so `false` here is
 * "no reduced motion and no pointer" and `true` is both. Every case below
 * wants one of those two pairings; a test that needs them apart belongs in
 * `add-input.render.test.tsx`, whose stub answers per query.
 */
type MediaStub = {
  queries: string[];
  listeners: Map<string, () => void>;
  removed: string[];
  setMatches: (value: boolean) => void;
};

function stubMotionPreference(reduced: boolean): MediaStub {
  const stub: MediaStub = {
    queries: [],
    listeners: new Map(),
    removed: [],
    setMatches: () => {},
  };
  let matches = reduced;
  stub.setMatches = (value: boolean) => {
    matches = value;
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      stub.queries.push(query);
      return {
        media: query,
        get matches() {
          return matches;
        },
        addEventListener: (event: string, handler: () => void) =>
          stub.listeners.set(event, handler),
        removeEventListener: (event: string) => stub.removed.push(event),
      };
    }),
  );

  return stub;
}

/** The query the module must ask, spelled out once (EXPERIENCE.md:223). */
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

describe("TodoList, actually mounted", () => {
  it("runs the real query and renders the Todos the server answered", async () => {
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(TODOS))),
    );

    await mount(freshClient());

    const items = [...container.querySelectorAll("li")];
    expect(items).toHaveLength(2);
    // Server order, not re-sorted (AD-5).
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("send invoice"),
      expect.stringContaining("book dentist"),
    ]);
  });

  it("marks the Completed row and not the Active one", async () => {
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(TODOS))),
    );

    await mount(freshClient());

    // Completion Status is expressed once, as `data-completed` on the row
    // (AR-28); every other cue derives from it. This is the first test that
    // sees it on a real element rather than in a markup string.
    const completed = container.querySelectorAll("[data-completed]");
    expect(completed).toHaveLength(1);
    expect(completed[0]?.textContent).toContain("book dentist");
  });

  it("leaves no skeleton behind once the list has landed", async () => {
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(TODOS))),
    );

    await mount(freshClient());

    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(TODOS.length);
  });

  it("holds three skeleton rows in the region while the read is in flight", async () => {
    // Was `expect(container.querySelector("ul")).toBeNull()`. Story 2.5
    // inverts it: the region is a persistent element, and the loading state
    // is three placeholders inside it rather than the absence of the region.
    const media = stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mount(freshClient());

    const region = container.querySelector("ul");
    expect(region).not.toBeNull();
    expect(region?.querySelectorAll("li")).toHaveLength(3);
    expect(region?.querySelectorAll(".skeleton-row")).toHaveLength(3);
    // Motion is allowed, so hydration has cleared the server snapshot's
    // marker and the pulse is running.
    expect(region?.hasAttribute("data-still")).toBe(false);
    // And it asked the right question. Without this, inverting the module's
    // feature to `no-preference` would leave every assertion here green.
    expect(media.queries).toContain(REDUCE_QUERY);
    expect(new Set(media.queries)).toEqual(new Set([REDUCE_QUERY]));
  });

  it("keeps the region and shows nothing in it when the read fails", async () => {
    // Also inverted. A failure leaves the contents unknown rather than
    // known-empty, so neither skeletons nor rows may show — and the region
    // has to survive, because Story 2.6's banner and `Retry` render beside
    // it and its `Retry` returns this same element to skeletons.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      ),
    );

    await mount(freshClient());

    const region = container.querySelector("ul");
    expect(region).not.toBeNull();
    expect(region?.querySelectorAll("li")).toHaveLength(0);
  });

  it("holds the pulse still when the browser asks for reduced motion", async () => {
    // The geometry stays and only the motion goes (EXPERIENCE.md:230). The
    // marker is the whole mechanism — `app/globals.css` derives the
    // suppression from it, and `skeleton-row.test.ts` asserts that rule.
    const media = stubMotionPreference(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mount(freshClient());

    const region = container.querySelector("ul");
    expect(region?.getAttribute("data-still")).toBe("true");
    expect(region?.querySelectorAll(".skeleton-row")).toHaveLength(3);
    expect(media.queries).toContain(REDUCE_QUERY);
  });

  it("follows the preference changing mid-session, and lets go on unmount", async () => {
    // The subscription is the half of `useSyncExternalStore` that no snapshot
    // assertion reaches: replacing `subscribe()`'s body with a no-op leaves
    // every other test in the repository green, so a wrong event name or a
    // listener that is never removed would be invisible.
    const media = stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mount(freshClient());

    const region = container.querySelector("ul");
    expect(region?.hasAttribute("data-still")).toBe(false);

    const onChange = media.listeners.get("change");
    expect(onChange, "the module registered no `change` listener").toBeDefined();

    // The user turns reduced motion on while the page is open.
    media.setMatches(true);
    await act(async () => onChange!());
    expect(region?.getAttribute("data-still")).toBe("true");

    // And back off again, so the binding is two-way rather than a latch.
    media.setMatches(false);
    await act(async () => onChange!());
    expect(region?.hasAttribute("data-still")).toBe(false);

    // Unmount here rather than in `afterEach`, so the teardown is observed.
    await act(async () => root.unmount());
    expect(media.removed).toContain("change");
  });

  it("keeps the card and the sticky top block real while the list is skeletal", async () => {
    // AC9. Every other case mounts `TodoList` alone, which cannot see the
    // claim at all: "the card, input and filter tabs are already real and
    // interactive while skeletons are showing — only the list is skeletal"
    // (DESIGN.md:432, EXPERIENCE.md). So this one mounts the card.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mountCard();

    // The card itself, rendered rather than withheld behind a boundary.
    const card = container.querySelector(".bg-card.rounded-lg");
    expect(card, "the card did not render during the load").not.toBeNull();
    // The sticky top block, present and holding its own place — not a
    // skeleton, and not absent until the list resolves.
    const sticky = container.querySelector(".sticky");
    expect(sticky, "the sticky top block did not render").not.toBeNull();
    expect(sticky?.querySelectorAll(".skeleton-row")).toHaveLength(0);
    // And only the list region is skeletal.
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3);
    const region = container.querySelector("ul");
    expect(region?.parentElement).toBe(card);
  });
});

describe("the checkbox, through the mounted list (Story 4.2)", () => {
  // `use-set-completed.test.ts` proves what the cache does with an answer, and
  // `todo-row.render.test.tsx` proves the control calls its handler. Neither
  // can see that the two are joined: a row whose `onToggle` reached nothing, or
  // a hook held per row instead of per list, would leave both green.
  //
  // What makes this worth its weight is the last step. AC7 is "when the page
  // is reloaded, the Completion Status is the toggled one" — a claim about the
  // *server's* confirmation persisting rather than the optimistic change
  // having rendered. A unit suite cannot reload a page; remounting against a
  // fresh `QueryClient` whose `GET` answers the persisted row is the closest
  // it gets, and it is close enough to catch the failure that matters: a
  // mutation whose success path never replaced the guess.

  /**
   * A `fetch` that answers the list read and each `PATCH` independently.
   *
   * One resolver per row rather than one shared slot: a single `pending` that
   * every `PATCH` overwrote left the earlier mutation unsettled forever, so a
   * case that confirmed both rows would hang with nothing to point at.
   */
  function stubTransport(stored: Todo[]) {
    const patches: { url: string; body: unknown }[] = [];
    const pending = new Map<string, (response: Response) => void>();

    const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        patches.push({ url, body: JSON.parse(String(init.body)) });
        return new Promise<Response>((resolve) => pending.set(url, resolve));
      }
      return Promise.resolve(Response.json(stored));
    });
    vi.stubGlobal("fetch", stub);

    const answer = async (todo: Todo, response: Response) => {
      const resolve = pending.get(`/api/todos/${todo.id}`);
      expect(resolve, `no PATCH is in flight for ${todo.id}`).toBeDefined();
      resolve!(response);
      await settle();
      await settle();
    };

    return {
      patches,
      /** Answer the `PATCH` the way Story 4.1's endpoint does: the row, bare. */
      confirm: async (todo: Todo) => {
        stored = stored.map((row) => (row.id === todo.id ? todo : row));
        await answer(todo, Response.json(todo));
      },
      /** Refuse it, the way the route handler refuses everything (AD-10). */
      refuse: (todo: Todo) =>
        answer(
          todo,
          Response.json(
            { error: { kind: "update", message: "diagnostic" } },
            { status: 500 },
          ),
        ),
      /** What a reload would read. */
      persisted: () => stored,
    };
  }

  const checkboxes = () => [...container.querySelectorAll('[role="checkbox"]')];

  it("flips the row before the request resolves, and keeps the server's row after (AC1, AC7)", async () => {
    stubMotionPreference(false);
    const transport = stubTransport(TODOS);

    const client = freshClient();
    await mount(client);

    // `send invoice` is the Active row, first in `id DESC` order.
    const [checkbox] = checkboxes();
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");

    await act(async () => (checkbox as HTMLElement).click());
    await settle();

    // The request went out with the value asked for, to that row's own URL.
    expect(transport.patches).toHaveLength(1);
    expect(transport.patches[0]?.url).toBe(`/api/todos/${TODOS[0].id}`);
    expect(transport.patches[0]?.body).toEqual({ completed: true });

    // And the interface already answered, with the request still in flight.
    expect(checkboxes()[0]?.getAttribute("aria-checked")).toBe("true");
    const rows = [...container.querySelectorAll("li")];
    expect(rows[0]?.hasAttribute("data-completed")).toBe(true);
    // The row did not move: ordering is `id DESC` and Completion Status is not
    // a sort key (AC2).
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("send invoice"),
      expect.stringContaining("book dentist"),
    ]);

    // The server's row differs from the optimistic guess in a second field, on
    // purpose. Confirming with a row identical to the guess makes this case
    // pass with `onSuccess`'s `setQueryData` deleted — the cache would still
    // hold the browser's guess and nothing on screen would differ, which is
    // exactly the failure AC7 exists to catch. `createdAt` is the server's to
    // set and the client's guess of it is never right.
    const STORED_AT = "2026-09-23T11:22:33.000Z";
    await transport.confirm({
      ...TODOS[0],
      completed: true,
      createdAt: STORED_AT,
    });

    // Still Completed, and now on the server's own record rather than the
    // guess: the confirmation actually replaced the row.
    expect(checkboxes()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(transport.persisted()[0].completed).toBe(true);
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)?.[0]).toEqual({
      ...TODOS[0],
      completed: true,
      createdAt: STORED_AT,
    });

    // The reload, as near as this suite gets: a fresh cache, a fresh mount,
    // and a `GET` answering what the server now holds.
    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const reloaded = freshClient();
    await mount(reloaded);

    expect(checkboxes()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll("[data-completed]")).toHaveLength(2);
    expect(reloaded.getQueryData<Todo[]>(TODOS_QUERY_KEY)?.[0].createdAt).toBe(
      STORED_AT,
    );
  });

  it("puts the row back when the server refuses the change (AC4)", async () => {
    // The interface half of the rollback. `use-set-completed.test.ts` proves
    // the cache reverts; nothing until now showed the checkbox un-checking.
    // And it is silent: a refused toggle says nothing here — no banner, no
    // announcement — because Story 4.4 owns all three.
    stubMotionPreference(false);
    const transport = stubTransport(TODOS);

    await mount(freshClient());
    await act(async () => (checkboxes()[0] as HTMLElement).click());
    await settle();

    expect(checkboxes()[0]?.getAttribute("aria-checked")).toBe("true");

    await transport.refuse(TODOS[0]);

    expect(checkboxes()[0]?.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelectorAll("[data-completed]")).toHaveLength(1);
    // The other row, which nothing asked about, is untouched (AC5).
    expect(checkboxes()[1]?.getAttribute("aria-checked")).toBe("true");
    expect(liveRegion("polite")).toBe("");
    expect(liveRegion("assertive")).toBe("");
  });

  it("announces the confirmed toggle politely, once (AC6)", async () => {
    stubMotionPreference(false);
    const transport = stubTransport(TODOS);

    await mount(freshClient());
    await act(async () => (checkboxes()[0] as HTMLElement).click());
    await settle();

    // Nothing yet: AC6 is "given a *successful* toggle, when it completes".
    expect(liveRegion("polite")).toBe("");

    await transport.confirm({ ...TODOS[0], completed: true });

    expect(liveRegion("polite")).toBe("send invoice, Completed");
    expect(liveRegion("assertive")).toBe("");
  });

  it("toggles two rows independently, both against the one cache entry", async () => {
    // Named for what it proves. Whether the list holds one hook or one per row
    // is a source-level claim and `todo-list.test.ts` makes it; what a mount
    // can show is that two rows toggled in succession each send their own
    // request and neither disturbs the other's optimistic value — the shape
    // the per-entity rollback depends on.
    stubMotionPreference(false);
    const transport = stubTransport(TODOS);

    await mount(freshClient());
    const [first, second] = checkboxes();

    await act(async () => (first as HTMLElement).click());
    await act(async () => (second as HTMLElement).click());
    await settle();

    expect(transport.patches.map(({ body }) => body)).toEqual([
      { completed: true },
      { completed: false },
    ]);
    expect(checkboxes().map((box) => box.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
  });
});

describe("the resolved states, in a real DOM (Story 2.6)", () => {
  it("shows the All empty state and announces it politely (AC10, AC17)", async () => {
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json([]))),
    );

    await mountCard();

    expect(container.textContent).toContain("Nothing here yet.");
    expect(container.textContent).toContain("Type above to add your first Todo.");
    // The region survives beside it and is no longer busy.
    const region = container.querySelector("ul");
    expect(region).not.toBeNull();
    expect(region?.querySelectorAll("li")).toHaveLength(0);
    expect(region?.hasAttribute("aria-busy")).toBe(false);
    // Both lines as one utterance, in the polite region, and nothing in the
    // assertive one — an empty list is a resolution, not a failure.
    expect(liveRegion("polite")).toBe(
      "Nothing here yet. Type above to add your first Todo.",
    );
    expect(liveRegion("assertive")).toBe("");
  });

  it("shows the banner and announces it assertively when the read fails (AC3, AC18)", async () => {
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "boom" } }, { status: 500 })),
      ),
    );

    await mountCard();

    expect(container.textContent).toContain("Couldn't load your Todos.");
    expect(container.querySelector("button")?.textContent).toBe("Retry");
    // Assertive, and the polite region stays silent.
    expect(liveRegion("assertive")).toBe("Couldn't load your Todos.");
    expect(liveRegion("polite")).toBe("");
    // The server's own message never reaches the interface (AD-10).
    expect(container.textContent).not.toContain("boom");
    // And the list region shows neither skeletons nor the empty state (AC4,
    // AC15): the contents are unknown, not known-empty.
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(0);
    expect(container.textContent).not.toContain("Nothing here yet.");
  });

  it("returns to skeletons on Retry and resolves to the empty state (AC5, AC16)", async () => {
    stubMotionPreference(false);
    // Fails once, then answers an empty list — the exact path AC16 names.
    let pending: (value: Response) => void = () => {};
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (pending = resolve)),
      );
    vi.stubGlobal("fetch", fetchStub);

    await mountCard();
    expect(container.textContent).toContain("Couldn't load your Todos.");

    const retry = container.querySelector("button");
    await act(async () => retry?.click());
    // TanStack notifies its subscribers through a scheduled microtask, so the
    // `fetchStatus: "fetching"` that `refetch()` sets lands one tick after the
    // click commits — the same reason `mount()` above waits before asserting.
    await settle();

    // The slot cleared before the closure ran, so the banner is gone while
    // the request is in flight — and the region is back to skeletons, which
    // `isPending` alone could not have produced: the query is still in its
    // `error` status here.
    expect(fetchStub).toHaveBeenCalledTimes(2);
    // The banner is gone — asserted as the absence of its control, not as the
    // absence of its words: the assertive region still holds the string it
    // announced, and that is correct. A live region keeps its text until the
    // next announcement replaces it.
    expect(container.querySelector("button")).toBeNull();
    expect(liveRegion("assertive")).toBe("Couldn't load your Todos.");
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3);
    expect(container.querySelector("ul")?.getAttribute("aria-busy")).toBe("true");

    await act(async () => pending(Response.json([])));
    // Two ticks: one for the response to be read, one for the commit that
    // renders it. A single flush is a race, not a guarantee.
    await settle();
    await settle();

    expect(container.textContent).toContain("Nothing here yet.");
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(0);
  });

  it("clears the banner when a background refetch succeeds, not only on Retry", async () => {
    // EXPERIENCE.md:109 — "the banner clears when the retried operation
    // succeeds". `Retry` clears the slot itself before refetching, so the
    // path this covers is the one nothing else does: `refetchOnWindowFocus`
    // is left at its default of true (todo-list-query.ts:180), so returning
    // to the tab after a failure resolved the list *underneath* a banner
    // still reporting that it could not be loaded — the empty state and
    // "Couldn't load your Todos." on screen at the same time.
    stubMotionPreference(false);
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      )
      .mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal("fetch", fetchStub);

    await mountCard();
    expect(container.textContent).toContain("Couldn't load your Todos.");

    // A focus refetch, driven the way the browser would drive it.
    //
    // `focusManager` is a module-level singleton shared by every test in this
    // worker, so it is restored in a `finally` — the same discipline the
    // `401` case below uses for `window.location`. Leaving it pinned to
    // "focused" made later files in the same worker refetch when they did not
    // expect to, which is what this file was intermittently failing on.
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      // One tick starts the request, a second lets its response commit. A
      // single flush is enough only when the stub resolves before the first
      // one returns, which is a race under a loaded worker rather than a
      // guarantee.
      await settle();
      await settle();
    } finally {
      focusManager.setFocused(undefined);
    }

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Nothing here yet.");
    // The banner is gone: no control, and the region is back to holding
    // nothing. The assertive region keeps the words it announced, which is
    // why this is asserted on the banner rather than on the container's text.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector(".banner-region")?.children).toHaveLength(0);
  });

  it("raises the banner again when the retried read fails again (AC5)", async () => {
    // AC5 ends "and it resolves to content or to the same banner again". The
    // second half is its own path: `retryCurrentError` clears the slot before
    // it refetches, so nothing is left to re-render — the banner has to be
    // raised a second time, by a second failure, or `Retry` silently empties
    // the region and the user is back to a blank rectangle with no way out.
    stubMotionPreference(false);
    const fetchStub = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
    );
    vi.stubGlobal("fetch", fetchStub);

    await mountCard();
    expect(container.textContent).toContain("Couldn't load your Todos.");

    await act(async () => container.querySelector("button")?.click());
    await settle();

    expect(fetchStub).toHaveBeenCalledTimes(2);
    // Back, and still pressable — nothing dead-ends (NFR-4).
    expect(container.querySelector("button")?.textContent).toBe("Retry");
    expect(container.textContent).toContain("Couldn't load your Todos.");
    // And still no empty state: the contents are unknown, not known-empty.
    expect(container.textContent).not.toContain("Nothing here yet.");
  });

  it("reloads the document rather than refetching when the identity expired (AC6)", async () => {
    stubMotionPreference(false);
    const reload = vi.fn();
    // `reload` is a non-configurable own property of jsdom's `Location`, so
    // it cannot be replaced in place; `window.location` itself is
    // configurable, so the whole object is swapped for one that carries every
    // other field unchanged.
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: Object.assign(Object.create(Object.getPrototypeOf(original)), {
        href: original.href,
        origin: original.origin,
        reload,
      }),
    });

    const fetchStub = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 401 })),
    );
    vi.stubGlobal("fetch", fetchStub);

    try {
      await mountCard();
      expect(fetchStub).toHaveBeenCalledTimes(1);

      await act(async () => container.querySelector("button")?.click());

      // A 401 means the open document holds no identity the server will
      // accept, and only a document request mints one — so re-requesting
      // would fail forever.
      expect(reload).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("the live regions survive hydration, not only server render", () => {
  // The Epic 1 carry-over `epic-2-context.md` records and Story 2.5 deferred
  // here, as the story that first calls `announce()`. Until now nothing in the
  // suite had ever hydrated anything: `announcer.test.ts` renders the provider
  // with `renderToStaticMarkup`, and every mount above uses `createRoot`. A
  // region that the server emitted and hydration then dropped or duplicated
  // would have been invisible to both.

  it("carries exactly one polite and one assertive region through hydration, and announces into it", async () => {
    // Reduced motion on both sides, so the server snapshot and the client
    // agree and this test is about hydration rather than about the marker
    // Story 2.5 deliberately makes differ.
    stubMotionPreference(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      ),
    );

    // `beforeEach` gave this container a `createRoot` root, and unmounting a
    // root empties its container — so it has to go *before* the server markup
    // is written, not after, or hydration adopts an empty element.
    await act(async () => root.unmount());

    container.innerHTML = renderToString(
      <AppProviders>
        <TodoCard />
      </AppProviders>,
    );

    // The server emitted them, before anything hydrated.
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(2);

    let hydrated: Root;
    await act(async () => {
      hydrated = hydrateRoot(
        container,
        <AppProviders>
          <TodoCard />
        </AppProviders>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Still exactly two, and still one of each: hydration neither dropped the
    // server's regions nor mounted a second pair beside them (AC20).
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(2);
    expect(liveRegions("polite")).toHaveLength(1);
    expect(liveRegions("assertive")).toHaveLength(1);

    // And the region a hydrated client announces into is the one the server
    // shipped, which is the whole point: a live region inserted at the moment
    // its text arrives is not announced by most screen readers.
    expect(liveRegion("assertive")).toBe("Couldn't load your Todos.");

    await act(async () => hydrated.unmount());
    // `afterEach` unmounts `root`, which is already unmounted; re-point it so
    // that stays a no-op rather than a double unmount of a live tree.
    root = createRoot(document.createElement("div"));
  });
});

describe("the add input, in the block with its neighbours (Story 3.2)", () => {
  // `add-input.render.test.tsx` mounts the component alone and owns its
  // behaviour. These two claims are about the component *in place*, which is
  // the one thing a mount of it alone cannot see: what comes before it in the
  // tab order, and whether it is real while the list is not.
  //
  // `stubMotionPreference` answers the same thing to every query, so with it
  // set to `false` the pointer capability is absent too and the input does
  // not autofocus. That is the right default here — a test about tab order
  // that started with focus already in the field would be asserting less.

  it("is first in the tab order, ahead of Retry (AC9)", async () => {
    // EXPERIENCE.md:194 — "input → Retry (when the banner is occupied) → All
    // → Active → Completed". The first two of those exist now, and the order
    // is not arranged anywhere: it falls out of the input being slot 1 of the
    // sticky block and the banner being slot 2.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      ),
    );

    await mountCard();

    const focusable = [...container.querySelectorAll("input, button, [tabindex]")];
    expect(focusable.length).toBeGreaterThanOrEqual(2);
    expect(focusable[0]?.tagName).toBe("INPUT");
    expect(focusable[1]?.textContent).toBe("Retry");
    // And the pill `Enter` hint is not among them (AC7): it is a hint, not a
    // control, and `aria-hidden` besides.
    expect(focusable.map((element) => element.textContent)).not.toContain("Enter");
  });

  it("is real and writable while the list is still skeletal (AC1)", async () => {
    // The other half of the claim Story 2.5's card test makes — "the card,
    // input and filter tabs are already real and interactive while skeletons
    // are showing" — which could not be asserted about the input until there
    // was one.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mountCard();

    const sticky = container.querySelector(".sticky");
    const field = container.querySelector("input");
    expect(field, "the input did not render during the load").not.toBeNull();
    expect(sticky?.contains(field as Node)).toBe(true);
    expect((field as HTMLInputElement).disabled).toBe(false);
    expect((field as HTMLInputElement).readOnly).toBe(false);
    // The list underneath it is still skeletal, which is what makes the
    // assertion above worth making.
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3);
  });
});
