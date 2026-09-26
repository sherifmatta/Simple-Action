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
import { ErrorSlotProvider } from "@/client/feedback/error-slot";
import { AppProviders } from "@/client/providers";
import { FilterViewProvider } from "@/client/todos/filter-view-context";
import { TODOS_QUERY_KEY } from "@/client/todos/query-keys";
import type { Todo } from "@/shared/contract/todo";
import { installDialogShim } from "@/test-support/dialog";
import { ADD_INPUT_ID } from "./add-input";
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
  // than degrading to a no-op. Story 4.3 added a third for the same reason:
  // the list reads the Filter View to decide which rows it shows, and
  // `useFilterView()` throws outside its provider too. Story 4.4 added the
  // fourth and last: a refused toggle now raises into the one error slot, and
  // `useErrorSlot()` throws outside its provider on the same principle.
  //
  // Which is four of the shell's providers assembled by hand. `mountCard()`
  // below mounts the real `AppProviders` and is what every case added from
  // Story 4.3 on uses; this stack is kept only because the cases above it
  // predate the card mount and prove the list in isolation.
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ErrorSlotProvider>
          <AnnouncerProvider>
            <FilterViewProvider>
              <TodoList />
            </FilterViewProvider>
          </AnnouncerProvider>
        </ErrorSlotProvider>
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

/** The rendered row whose text contains `text`, if it is still on screen. */
const rowFor = (text: string) =>
  [...container.querySelectorAll("li")].find((row) =>
    row.textContent?.includes(text),
  );

/**
 * Report that a row's collapse has finished.
 *
 * jsdom runs no transitions and fires no `transitionend`, so the one event both
 * the departure and the delete hang off has to be dispatched. `propertyName:
 * "opacity"` and the row's own element are the two things `todo-row.tsx` guards
 * on — a descendant, or any other property, is ignored on purpose — so this is
 * that contract written down once, where a change to the guard has one place to
 * be mirrored rather than two.
 */
async function endCollapse(row: Element | undefined) {
  expect(row, "no row was left to finish collapsing").toBeDefined();
  await act(async () => {
    row!.dispatchEvent(
      Object.assign(new Event("transitionend", { bubbles: true }), {
        propertyName: "opacity",
      }),
    );
  });
  await settle();
}

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

  it("conveys the empty list exactly once (Story 6.2, decision 2)", async () => {
    // `deferred-work.md` recorded the duplicate: the named list region says
    // "Todo List, list, 0 items" and the empty state then announces the same
    // fact in the copy DESIGN.md wrote. Both were individually required, so
    // the fix had to choose, and it kept the one a screen reader receives
    // without navigating — the announcement.
    //
    // This is the assertion that pins it. The region is still in the DOM, so
    // skeletons keep somewhere to mount (Story 2.5 AC11); what changed is
    // that it stops being exposed in the one state where it is a duplicate.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json([]))),
    );

    await mountCard();

    const region = container.querySelector("ul");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-hidden")).toBe("true");
    // The accessible name is still declared — it is the exposure that is
    // withdrawn, not the region's identity, which returns with the first row.
    expect(region?.getAttribute("aria-label")).toBe("Todo List");
    // And the fact reaches the user exactly once, through the announcement.
    expect(liveRegion("polite")).toBe(
      "Nothing here yet. Type above to add your first Todo.",
    );
  });

  it("exposes the region again as soon as it holds a row (decision 2)", async () => {
    // The other half, and the one that would catch an over-broad fix: hiding
    // the region unconditionally would silence the list for every user who
    // has Todos.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json([
            {
              id: "01920000-0000-7000-8000-00000000000a",
              text: "Buy milk",
              completed: false,
              createdAt: new Date().toISOString(),
            },
          ]),
        ),
      ),
    );

    await mountCard();

    const region = container.querySelector("ul");
    expect(region?.hasAttribute("aria-hidden")).toBe(false);
    expect(region?.querySelectorAll("li")).toHaveLength(1);
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

  it("moves focus to the add input when Retry unmounts itself (Story 6.2, decision 1)", async () => {
    // `deferred-work.md` recorded that `retryCurrentError` clears the slot,
    // which removes the `<button>` that was just activated, and nothing moved
    // focus — so a keyboard or screen-reader user was returned to
    // `document.body` at the moment the region swapped back to skeletons.
    // EXPERIENCE.md:202 forbids exactly that.
    //
    // Driven rather than scanned: the ordering assertion in
    // `error-banner.test.ts` proves focus is moved *before* the retry, and
    // this proves where it lands.
    stubMotionPreference(false);
    let pending: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() =>
          Promise.resolve(
            Response.json({ error: { kind: "load", message: "x" } }, { status: 500 }),
          ),
        )
        .mockImplementationOnce(
          () => new Promise<Response>((resolve) => (pending = resolve)),
        ),
    );

    await mountCard();
    const retry = container.querySelector("button");
    expect(retry?.textContent).toBe("Retry");

    // Stand on the control, the way a keyboard user would before pressing it.
    retry?.focus();
    expect(document.activeElement).toBe(retry);

    await act(async () => retry?.click());

    // The button is gone, and focus went somewhere deliberate rather than to
    // the body.
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement)?.id).toBe(ADD_INPUT_ID);

    await act(async () => pending(Response.json([])));
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
    //
    // Scoped to the banner region by Story 4.3: the card holds three tab
    // buttons now, so an unscoped `button` query asks "is there any control on
    // screen" when the claim is "the banner has no control".
    expect(container.querySelector(".banner-region button")).toBeNull();
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
    // Scoped to the region for the same reason as above — the filter tabs put
    // three buttons in this card.
    expect(container.querySelector(".banner-region button")).toBeNull();
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
    // → Active → Completed". All five exist now that Story 4.3 has filled the
    // block's third slot.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      ),
    );

    await mountCard();

    const focusable = [...container.querySelectorAll("input, button, [tabindex]")];
    expect(focusable.length).toBeGreaterThanOrEqual(5);
    expect(focusable[0]?.tagName).toBe("INPUT");
    expect(focusable[1]?.textContent).toBe("Retry");
    // Story 4.3 filled the last slot, so the whole committed order is now
    // observable rather than half of it (AC11). Still not arranged anywhere:
    // it falls out of the input being slot 1, the banner slot 2 and the tabs
    // slot 3 of the sticky block.
    expect(focusable.slice(2, 5).map((element) => element.textContent)).toEqual([
      "All 0",
      "Active 0",
      "Completed 0",
    ]);
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

// --- Story 4.3: the Filter Views, and a row that leaves one ------------------

describe("the Filter Views, through the mounted card (Story 4.3)", () => {
  const LIST: Todo[] = [
    {
      id: "0199a5c5-0000-7000-8000-000000000003",
      text: "pay rent",
      completed: true,
      createdAt: "2026-09-23T09:02:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000002",
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-23T09:01:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000001",
      text: "book dentist",
      completed: false,
      createdAt: "2026-09-23T09:00:00.000Z",
    },
  ];

  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tab = (label: string) =>
    tabs().find((candidate) => candidate.textContent?.startsWith(label)) as HTMLButtonElement;
  const rowText = () =>
    [...container.querySelectorAll("li")].map((row) => row.querySelector("span")?.textContent);
  const checkboxIn = (text: string) =>
    [...container.querySelectorAll("li")]
      .find((row) => row.textContent?.includes(text))
      ?.querySelector<HTMLElement>('[role="checkbox"]');

  /** The card, over a list the server answers with, with motion enabled. */
  async function mountList(list: Todo[] = LIST, reduced = false) {
    stubMotionPreference(reduced);
    // A server that remembers. The PATCH echoes back the row it was actually
    // asked about with the status it was asked to set, *and* keeps it, so a
    // later read agrees with the change rather than undoing it. Both halves
    // matter: a stub answering with some other row fails the mutation's shape
    // guard and rolls the optimistic change back, and a stub whose GET still
    // returns the original list overwrites the confirmed one — either looks
    // exactly like a departure that did not happen.
    let stored = [...list];
    const fetchStub = vi.fn<typeof fetch>((input, init) => {
      if (init?.method !== "PATCH") {
        return Promise.resolve(Response.json(stored, { status: 200 }));
      }
      const id = String(input).split("/").pop();
      const { completed } = JSON.parse(String(init.body)) as { completed: boolean };
      stored = stored.map((each) => (each.id === id ? { ...each, completed } : each));
      const updated = stored.find((each) => each.id === id);
      return Promise.resolve(Response.json(updated, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchStub);
    await mountCard();
    return fetchStub;
  }

  it("shows every Todo in All, and only the matching ones in the others (AC2)", async () => {
    await mountList();
    expect(rowText()).toEqual(["pay rent", "send invoice", "book dentist"]);

    await act(async () => tab("Active").click());
    expect(rowText()).toEqual(["send invoice", "book dentist"]);

    await act(async () => tab("Completed").click());
    expect(rowText()).toEqual(["pay rent"]);

    // And back, with the order and the positions the list always had: a row
    // leaves its place only by leaving the view or being deleted.
    await act(async () => tab("All").click());
    expect(rowText()).toEqual(["pay rent", "send invoice", "book dentist"]);
  });

  it("shows the matching empty state when a view resolves to nothing (AC10)", async () => {
    // The Active and Completed panels, reachable for the first time. Until
    // this story `todo-list.tsx` passed the literal `"all"` and the other two
    // variants were built, tested and unreachable.
    await mountList([LIST[0]]);

    await act(async () => tab("Active").click());
    // Asserted on the panel, not on the container's text: the polite region
    // holds this exact string too, so a text search would stay green with the
    // panel deleted.
    expect(container.querySelector(".empty-panel")?.textContent).toContain(
      "Nothing active.",
    );
    expect(liveRegion("polite")).toBe("Nothing active.");

    await act(async () => tab("Completed").click());
    // Asserted on the panel rather than on the container's text: the polite
    // region still holds the words it announced, and that is correct — a live
    // region keeps its text until the next announcement replaces it.
    expect(container.querySelector(".empty-panel")).toBeNull();
    expect(rowText()).toEqual(["pay rent"]);

    await act(async () => tab("All").click());
    expect(rowText()).toEqual(["pay rent"]);
  });

  it("announces the other empty variant when the view changes under it", async () => {
    // `empty-state.tsx` keys its effect on the variant precisely so switching
    // between two empty Filter Views announces the new one rather than staying
    // silent because the panel never unmounted.
    await mountList([]);
    expect(liveRegion("polite")).toBe(
      "Nothing here yet. Type above to add your first Todo.",
    );

    await act(async () => tab("Completed").click());
    expect(liveRegion("polite")).toBe("Nothing completed yet.");
  });

  it("keeps the counts in step with the rows on screen (AC5)", async () => {
    const fetchStub = await mountList();
    expect(tabs().map((each) => each.textContent)).toEqual([
      "All 3",
      "Active 2",
      "Completed 1",
    ]);

    // An optimistic toggle, made through the interface rather than written
    // into the cache: the counts must move with it.
    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    expect(tabs().map((each) => each.textContent)).toEqual([
      "All 3",
      "Active 1",
      "Completed 2",
    ]);
    expect(fetchStub.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
  });

  it("holds a departing row on screen until its transition finishes (AC13, AC15)", async () => {
    await mountList();
    await act(async () => tab("Active").click());
    expect(rowText()).toEqual(["send invoice", "book dentist"]);

    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    // Still there, marked, and in its *new* status — the hold is what makes
    // the change read as caused. Nothing announced yet: AC15 ties the
    // announcement to the departure, not to the toggle that began it.
    const departing = [...container.querySelectorAll("li")].find((row) =>
      row.textContent?.includes("book dentist"),
    );
    expect(departing).toBeDefined();
    expect(departing?.getAttribute("data-departing")).toBe("true");
    expect(departing?.getAttribute("data-completed")).toBe("true");
    expect(liveRegion("polite")).not.toContain("removed from");

    // The collapse finishes. No timer is involved anywhere: the row leaves
    // because its own transition reported that it had ended.
    await act(async () => {
      departing?.dispatchEvent(
        Object.assign(new Event("transitionend", { bubbles: true }), {
          propertyName: "opacity",
        }),
      );
    });

    expect(rowText()).toEqual(["send invoice"]);
    expect(liveRegion("polite")).toBe("book dentist, removed from Active");
  });

  it("puts the segments between Retry's slot and the first row (AC11)", async () => {
    // EXPERIENCE.md:194's full order is "input → Retry → All → Active →
    // Completed → then, per row, checkbox → delete control". The case in the
    // add-input block above runs against a failed load, so it sees the banner
    // and no rows; this is the other arrangement, where the rows exist and the
    // banner does not.
    await mountList();

    const focusable = [...container.querySelectorAll("input, button, [tabindex]")];
    const labels = focusable.map((element) => element.textContent);
    expect(labels[0]).toBe("");
    expect(focusable[0]?.tagName).toBe("INPUT");
    expect(labels.slice(1, 4)).toEqual(["All 3", "Active 2", "Completed 1"]);
    // The first row's checkbox comes next, and it is the row's own control
    // rather than anything the block added.
    expect(focusable[4]?.getAttribute("role")).toBe("checkbox");
  });

  it("runs no departure in the All view (AC17)", async () => {
    await mountList();
    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    const row = [...container.querySelectorAll("li")].find((each) =>
      each.textContent?.includes("book dentist"),
    );
    expect(row?.getAttribute("data-departing")).toBeNull();
    // The row still matches, so it keeps its place rather than moving.
    expect(rowText()).toEqual(["pay rent", "send invoice", "book dentist"]);
  });

  it("cuts straight to the end state under reduced motion, and still says so (AC16)", async () => {
    await mountList(LIST, true);
    await act(async () => tab("Active").click());

    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    // Gone in the same commit — no hold, no marker, and no animation to wait
    // for, which is exactly why it cannot be left in a departing set: with
    // `transition: none` no `transitionend` would ever fire.
    expect(rowText()).toEqual(["send invoice"]);
    expect(container.querySelector("[data-departing]")).toBeNull();

    // The departure announcement is asserted in `filter-view-context.test.tsx`
    // rather than here, and deliberately so. Under reduced motion both
    // sentences are produced within one interaction — the departure
    // immediately, the toggle's own confirmation when the request settles —
    // and the second replaces the first in the single polite region, so the
    // text left behind at the end of this case is `book dentist, Completed`.
    //
    // That collision is real and is recorded in `deferred-work.md`; it is not
    // this story's to resolve, because the region's queueing behaviour belongs
    // to the announcer and changing it would change every announcement in the
    // product. What matters for AC16 is that the departure is announced at
    // all, which the context test asserts at the point it happens.
    expect(liveRegion("polite")).toBe("book dentist, Completed");
  });

  it("calls off the departure when the server refuses the toggle", async () => {
    // The refusal undoes the very change the row is leaving over. Story 4.2's
    // rollback restores the status and deliberately says nothing to anybody,
    // so without the seam the mutation now offers, this row finishes
    // collapsing, announces a removal that never happened, and pops back at
    // full height. Story 4.4 owns the banner and the `Retry`; it does not own
    // a departure this story started.
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_input, init) =>
        init?.method === "PATCH"
          ? Promise.resolve(
              Response.json({ error: { kind: "update", message: "x" } }, { status: 500 }),
            )
          : Promise.resolve(Response.json(LIST, { status: 200 })),
      ),
    );
    await mountCard();

    await act(async () => tab("Active").click());
    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    const row = [...container.querySelectorAll("li")].find((each) =>
      each.textContent?.includes("book dentist"),
    );
    expect(row, "the refused row left the list").toBeDefined();
    expect(row?.getAttribute("data-departing")).toBeNull();
    expect(row?.getAttribute("data-completed")).toBeNull();
    expect(liveRegion("polite")).not.toContain("removed from");

    // And the row is back in the view it never left, counted with it.
    expect(rowText()).toEqual(["send invoice", "book dentist"]);
  });

  it("keeps the row when it is toggled back before it has gone", async () => {
    await mountList();
    await act(async () => tab("Active").click());
    await act(async () => checkboxIn("book dentist")?.click());
    await settle();
    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    const row = [...container.querySelectorAll("li")].find((each) =>
      each.textContent?.includes("book dentist"),
    );
    expect(row?.getAttribute("data-departing")).toBeNull();
    expect(rowText()).toEqual(["send invoice", "book dentist"]);
    expect(liveRegion("polite")).not.toContain("removed from");
  });

  // --- Story 4.4 ------------------------------------------------------------
  //
  // `use-set-completed.test.ts` proves the entry, its kind and what its closure
  // re-sends, against a real `MutationObserver` with no DOM. What only a mount
  // can show is the other half: that the entry reaches the banner the user
  // reads, that the row comes back where it was, and that a `Retry` pressed in
  // that banner re-enters the *whole* request — departure included.

  /**
   * A server that refuses the first `refusals` `PATCH`es, then relents.
   *
   * The GET keeps answering the stored list throughout, which is what the
   * product sees: nothing about a refused toggle changes what the server holds.
   *
   * The id comes off the path with no `URL` parsing, because the request is
   * relative (`/api/todos/<id>`) and `new URL` would throw on it. A miss is
   * asserted rather than left to `Response.json(undefined)`, which would throw
   * from inside the stub and report the wrong thing.
   */
  function refusingServer(refusals: number) {
    let refused = 0;
    let stored = [...LIST];
    const fetchStub = vi.fn<typeof fetch>((input, init) => {
      if (init?.method !== "PATCH") {
        return Promise.resolve(Response.json(stored, { status: 200 }));
      }
      if (refused < refusals) {
        refused += 1;
        return Promise.resolve(
          Response.json({ error: { kind: "update", message: "x" } }, { status: 500 }),
        );
      }
      const id = String(input).split("?")[0].split("/").pop();
      const { completed } = JSON.parse(String(init.body)) as { completed: boolean };
      stored = stored.map((each) => (each.id === id ? { ...each, completed } : each));
      const updated = stored.find((each) => each.id === id);
      expect(updated, `PATCH for an id the stub does not hold: ${id}`).toBeDefined();
      return Promise.resolve(Response.json(updated, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  const retryButton = () =>
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );

  it("says the change did not save, and says it assertively (AC2, AC7)", async () => {
    stubMotionPreference(false);
    refusingServer(1);
    await mountCard();

    await act(async () => checkboxIn("book dentist")?.click());
    await settle();

    expect(container.textContent).toContain("Couldn't save that change.");
    expect(retryButton()).toBeDefined();
    expect(liveRegion("assertive")).toBe("Couldn't save that change.");
    // The server's own message never reaches the interface (AD-10).
    expect(container.textContent).not.toContain("x");
  });

  it("puts a departed row back where it was, with the message (AC1, AC3)", async () => {
    stubMotionPreference(false);
    refusingServer(1);
    await mountCard();

    // In the Active view, completing `send invoice` takes it out — so the
    // refusal has to undo a departure, not only a status.
    await act(async () => tab("Active").click());
    expect(rowText()).toEqual(["send invoice", "book dentist"]);

    await act(async () => checkboxIn("send invoice")?.click());
    await settle();

    // Back in the list, in the position it held — between nothing and
    // `book dentist`, which is id order and never Completion Status.
    expect(rowText()).toEqual(["send invoice", "book dentist"]);
    const row = [...container.querySelectorAll("li")].find((each) =>
      each.textContent?.includes("send invoice"),
    );
    expect(row?.getAttribute("data-completed")).toBeNull();
    expect(row?.getAttribute("data-departing")).toBeNull();
    expect(container.textContent).toContain("Couldn't save that change.");
  });

  it("re-attempts the same change on Retry, and lets it depart (AC4, AC5)", async () => {
    stubMotionPreference(false);
    const fetchStub = refusingServer(1);
    await mountCard();

    await act(async () => tab("Active").click());
    await act(async () => checkboxIn("send invoice")?.click());
    await settle();

    await act(async () => retryButton()?.click());
    await settle();

    // The second `PATCH` asks for the same status the first one did — the
    // status the user asked for, not a toggle of the row as it stands now.
    const patches = fetchStub.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(JSON.parse(String(patches[1][1]?.body))).toEqual({ completed: true });

    // And the departure ran this time: the row is still on screen, marked
    // leaving, in its new status. A retry that skipped `noteToggle` would have
    // filtered it out in the same commit with no transition and no
    // announcement.
    const row = [...container.querySelectorAll("li")].find((each) =>
      each.textContent?.includes("send invoice"),
    );
    expect(row?.getAttribute("data-departing")).toBe("true");
    expect(row?.getAttribute("data-completed")).toBe("true");

    // The banner went with the success, and the row is gone once it reports.
    expect(retryButton()).toBeUndefined();
    await act(async () => {
      row?.dispatchEvent(
        Object.assign(new Event("transitionend", { bubbles: true }), {
          propertyName: "opacity",
        }),
      );
    });
    expect(rowText()).toEqual(["book dentist"]);
    expect(liveRegion("polite")).toBe("send invoice, removed from Active");
  });

  it("retries nothing and lets the banner go when the row is gone (AC6)", async () => {
    stubMotionPreference(false);
    let stored = [...LIST];
    let patches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_input, init) => {
        if (init?.method !== "PATCH") {
          return Promise.resolve(Response.json(stored, { status: 200 }));
        }
        patches += 1;
        return Promise.resolve(
          Response.json({ error: { kind: "update", message: "x" } }, { status: 500 }),
        );
      }),
    );
    await mountCard();

    await act(async () => checkboxIn("book dentist")?.click());
    await settle();
    expect(container.textContent).toContain("Couldn't save that change.");

    // The row leaves the cache — Epic 5's delete, or, as here, a read arriving
    // without it. Driven through a focus refetch because `mountCard()` mounts
    // the real `AppProviders` and builds its own client, which is the point of
    // it: there is no handle to write the cache behind the product's back.
    //
    // `focusManager` is a module-level singleton shared by every test in this
    // worker, so it is restored in a `finally` — the discipline the read's own
    // refetch case above established.
    stored = stored.filter((each) => !each.text.includes("book dentist"));
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();
      await settle();
    } finally {
      focusManager.setFocused(undefined);
    }
    expect(rowText()).toEqual(["pay rent", "send invoice"]);
    // The read succeeding says nothing about a failed toggle: the banner is
    // cleared by kind, so it is still standing here (EXPERIENCE.md:109).
    expect(container.textContent).toContain("Couldn't save that change.");

    const retry = retryButton();
    expect(retry, "the banner's Retry is still there to press").toBeDefined();
    await act(async () => retry?.click());
    await settle();

    // Nothing re-sent, and the banner is gone regardless — `retryCurrentError`
    // empties the slot before it invokes the closure and does not care what the
    // closure does (AD-9).
    expect(patches).toBe(1);
    // Asserted on the banner rather than on the container's text: the
    // assertive region keeps the words it announced, and that is correct.
    expect(container.querySelector(".banner-region")?.children).toHaveLength(0);
    expect(retryButton()).toBeUndefined();
  });

  it("raises the banner again when the retried toggle fails again", async () => {
    stubMotionPreference(false);
    refusingServer(2);
    await mountCard();

    await act(async () => checkboxIn("book dentist")?.click());
    await settle();
    await act(async () => retryButton()?.click());
    await settle();

    // `retryCurrentError` empties the slot *before* invoking the closure, so a
    // synchronous re-raise has to survive that clear rather than be wiped by it.
    expect(container.textContent).toContain("Couldn't save that change.");
    expect(retryButton()).toBeDefined();
  });
});

describe("the delete path, through the mounted card (Stories 5.2, 5.3)", () => {
  // `delete-dialog.render.test.tsx` proves the dialog's own logic and
  // `todo-row.render.test.tsx` proves the control calls its handler. Neither
  // can see that the two are joined, and neither can see the three things that
  // only exist once they are: that one dialog serves every row, that cancelling
  // leaves the list able to ask again, and that focus after a confirm lands on
  // a row that is actually rendered.
  //
  // jsdom 30 implements no part of `HTMLDialogElement`, so the shim is
  // installed per case — see `src/test-support/dialog.ts` for what that does
  // and does not buy.
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installDialogShim(window.HTMLDialogElement);
  });

  afterEach(() => uninstall());

  // Four rows, newest first, alternating Completion Status on purpose. The
  // alternation is what makes AC13 testable: in the Active view the on-screen
  // order is not the cache order, so a focus rule reading the cache lands on a
  // row that is not rendered and a rule reading the view does not.
  const LIST: Todo[] = [
    {
      id: "0199a5c5-0000-7000-8000-000000000014",
      text: "pay rent",
      completed: true,
      createdAt: "2026-09-25T09:03:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000013",
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-25T09:02:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000012",
      text: "call plumber",
      completed: true,
      createdAt: "2026-09-25T09:01:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000011",
      text: "book dentist",
      completed: false,
      createdAt: "2026-09-25T09:00:00.000Z",
    },
  ];

  /**
   * The card over a server that remembers, with motion enabled.
   *
   * The `PATCH` arm is not decoration: one case toggles a row out of the Active
   * view to get a *departing* row on screen, and a stub answering a toggle with
   * the whole list fails the mutation's shape guard, rolls the change back and
   * calls the departure off — which would leave that case asserting about a row
   * that never left.
   */
  async function mountList(list: Todo[] = LIST) {
    stubMotionPreference(false);
    let stored = [...list];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        if (init?.method !== "PATCH") {
          return Promise.resolve(Response.json(stored));
        }
        const id = String(input).split("/").pop();
        const { completed } = JSON.parse(String(init.body)) as {
          completed: boolean;
        };
        stored = stored.map((row) =>
          row.id === id ? { ...row, completed } : row,
        );
        return Promise.resolve(
          Response.json(stored.find((row) => row.id === id)),
        );
      }),
    );
    await mountCard();
  }

  const dialog = () => container.querySelector("dialog") as HTMLDialogElement;
  const rowText = () =>
    [...container.querySelectorAll("li")].map(
      (row) => row.querySelector("span")?.textContent,
    );
  const deleteControlFor = (text: string) =>
    container.querySelector<HTMLButtonElement>(
      `[aria-label="Delete ${text}"]`,
    ) as HTMLButtonElement;
  const dialogButton = (label: string) =>
    [...dialog().querySelectorAll("button")].find(
      (button) => button.textContent === label,
    ) as HTMLButtonElement;
  const tab = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (candidate) => candidate.textContent?.startsWith(label),
    ) as HTMLButtonElement;
  const checkboxFor = (text: string) =>
    [...container.querySelectorAll("li")]
      .find((row) => row.textContent?.includes(text))
      ?.querySelector<HTMLElement>('[role="checkbox"]');
  it("opens one dialog for whichever row asked, and removes nothing (AC8)", async () => {
    await mountList();

    await act(async () => deleteControlFor("send invoice").click());

    expect(dialog().open).toBe(true);
    expect(dialog().textContent).toContain("Delete this Todo?");
    expect([...dialog().querySelectorAll("button")].map((b) => b.textContent)).toEqual(
      ["Cancel", "Delete"],
    );
    // "Nothing is removed until the user chooses `Delete`": opening the
    // question changes no Todo, and the four rows are all still here.
    expect(rowText()).toEqual([
      "pay rent",
      "send invoice",
      "call plumber",
      "book dentist",
    ]);
    // One dialog for the whole list, not one per row (AC14).
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
  });

  it("closes on Cancel and leaves the Todo List untouched (AC9)", async () => {
    await mountList();

    await act(async () => deleteControlFor("book dentist").click());
    await act(async () => dialogButton("Cancel").click());

    expect(dialog().open).toBe(false);
    expect(rowText()).toEqual([
      "pay rent",
      "send invoice",
      "call plumber",
      "book dentist",
    ]);
  });

  it("opens again for the same row after a Cancel", async () => {
    // The mutation the first attempt would have survived: the parent holds the
    // pending row as an id, so a Cancel that forgot to clear it would make
    // `setPendingDeleteId(sameId)` a no-op and this row unconfirmable for the
    // rest of the session — with the control still there, still focusable, and
    // still doing nothing.
    await mountList();

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Cancel").click());
    expect(dialog().open).toBe(false);

    await act(async () => deleteControlFor("send invoice").click());
    expect(dialog().open).toBe(true);
  });

  it("forgets a pending row that leaves the Filter View under it", async () => {
    // The dialog closes itself when its row stops being visible — there is
    // nothing left to confirm. The id has to go with it, or the row comes back
    // into view with the question reopening unasked, and pressing its control
    // again does nothing at all.
    await mountList();

    await act(async () => deleteControlFor("send invoice").click());
    expect(dialog().open).toBe(true);

    await act(async () => tab("Completed").click());
    await settle();
    expect(dialog().open).toBe(false);

    // Back to a view holding it: the question stays closed until it is asked.
    await act(async () => tab("All").click());
    await settle();
    expect(dialog().open).toBe(false);

    await act(async () => deleteControlFor("send invoice").click());
    expect(dialog().open).toBe(true);
  });

  it("places focus on a row that is actually rendered, under any view (AC13)", async () => {
    // Story 5.2 removed nothing, so this could only prove the half that spans
    // the seam: *which* control is chosen. Story 5.3 removes the row for real,
    // and the criterion is unchanged — because focus is still resolved against
    // the list as the user last saw it, before the removal. In the Active view
    // the on-screen order differs from the cache order (`pay rent` is Completed
    // and filtered out), so a rule reading the cache would land focus on a row
    // that is not rendered.
    await mountList();
    await act(async () => tab("Active").click());
    expect(rowText()).toEqual(["send invoice", "book dentist"]);

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    // The row after it *in the view*, and its first focusable control. The row
    // after it in the *cache* is `call plumber`, which is Completed and not
    // rendered here — so this assertion fails for a rule that reads `data`.
    expect(document.activeElement).toBe(checkboxFor("book dentist"));
    expect(document.activeElement).not.toBe(document.body);

    // And the confirmed row is now collapsing rather than already gone: it is
    // still rendered, marked, so there is something on screen to leave
    // (EXPERIENCE.md:161). The cache write happens when that collapse reports
    // finished — `todo-list.render` drives it below — and focus does not move
    // when it does.
    const leaving = rowFor("send invoice");
    expect(leaving?.getAttribute("data-deleting")).toBe("true");
    expect(leaving?.getAttribute("data-departing")).toBeNull();

    await endCollapse(leaving);
    expect(rowText()).toEqual(["book dentist"]);
    expect(document.activeElement).toBe(checkboxFor("book dentist"));
  });

  it("falls back to the preceding row when the deleted one was last (AC13)", async () => {
    await mountList();
    await act(async () => tab("Active").click());

    await act(async () => deleteControlFor("book dentist").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    // Backwards, and the shortest distance it can: there is no row after the
    // last one to move up into its place.
    expect(document.activeElement).toBe(checkboxFor("send invoice"));

    // Still true once the row has actually gone, which is the half Story 5.2
    // could not reach.
    await endCollapse(rowFor("book dentist"));
    expect(rowText()).toEqual(["send invoice"]);
    expect(document.activeElement).toBe(checkboxFor("send invoice"));
  });

  it("never lands focus on a row that is on its way out (AC13)", async () => {
    // A departing row is kept in `visible` so it has something to leave with,
    // and it is about to unmount — focus parked on it is focus dropped to
    // `document.body` the moment its transition ends, which is the one outcome
    // EXPERIENCE.md:202 forbids. So the list hands the focus rule the rows that
    // are staying, and the fallback is the add input.
    await mountList();
    await act(async () => tab("Active").click());

    // `book dentist` starts leaving the Active view; its collapse has not
    // finished, so it is still on screen.
    await act(async () => checkboxFor("book dentist")?.click());
    await settle();
    expect(rowText()).toContain("book dentist");

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    expect(document.activeElement).not.toBe(checkboxFor("book dentist"));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      container.querySelector(`#${ADD_INPUT_ID}`),
    );

    // Both rows are now leaving, for two different reasons and on two
    // different collapses — `book dentist` out of the Active view with its
    // hold, `send invoice` out of the product without one. The markers say
    // which is which, and no row carries both.
    expect(rowFor("book dentist")?.getAttribute("data-departing")).toBe("true");
    expect(rowFor("book dentist")?.getAttribute("data-deleting")).toBeNull();
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBe("true");
    expect(rowFor("send invoice")?.getAttribute("data-departing")).toBeNull();
  });

  it("falls back to the add input when there is no row to take the place", async () => {
    // "Or to the input if the list is now empty. Focus is never dropped to the
    // document body" (EXPERIENCE.md:202).
    await mountList([LIST[1]]);

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    expect(document.activeElement).toBe(
      container.querySelector(`#${ADD_INPUT_ID}`),
    );
    expect(document.activeElement).not.toBe(document.body);

    // And the list really does empty, which is what makes the fallback the
    // right answer rather than a lucky one.
    await endCollapse(rowFor("send invoice"));
    expect(rowText()).toEqual([]);
    expect(container.textContent).toContain("Nothing here yet.");
  });
});

describe("the removal itself, through the mounted card (Story 5.3)", () => {
  // `use-delete-todo.test.ts` proves the cache dance against a real
  // `MutationObserver` with no DOM, and `delete-dialog.render.test.tsx` proves
  // the dialog's own logic. What only a mount can show is the sequence the two
  // are joined by: the dialog closes, the row *collapses* rather than
  // vanishing, the cache write and the request happen when that collapse
  // reports finished, and a refusal arriving afterwards puts the row back where
  // it was with a banner the user can press.
  //
  // jsdom 30 implements no part of `HTMLDialogElement`, so the shim is
  // installed per case — see `src/test-support/dialog.ts`.
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installDialogShim(window.HTMLDialogElement);
  });

  afterEach(() => uninstall());

  /** Four rows, newest first, two of each Completion Status. */
  const LIST: Todo[] = [
    {
      id: "0199a5c5-0000-7000-8000-000000000014",
      text: "pay rent",
      completed: true,
      createdAt: "2026-09-25T09:03:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000013",
      text: "send invoice",
      completed: false,
      createdAt: "2026-09-25T09:02:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000012",
      text: "call plumber",
      completed: true,
      createdAt: "2026-09-25T09:01:00.000Z",
    },
    {
      id: "0199a5c5-0000-7000-8000-000000000011",
      text: "book dentist",
      completed: false,
      createdAt: "2026-09-25T09:00:00.000Z",
    },
  ];

  /**
   * A server that answers the list read and holds each `DELETE` open.
   *
   * One resolver per row rather than one shared slot, which is the lesson the
   * `PATCH` transport above already learned: a single `pending` that every
   * request overwrote would leave the earlier mutation unsettled forever.
   *
   * Holding them open is the whole point here. Every claim in this block is
   * about a moment *between* the confirm and the answer — the row gone from the
   * cache with the request still in flight — and a stub that resolved
   * immediately would collapse all of them into one.
   */
  function stubDeletes(list: Todo[]) {
    let stored = [...list];
    const sent: { url: string; method: string }[] = [];
    const pending = new Map<string, (response: Response) => void>();

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        const url = String(input);
        if (init?.method === "DELETE") {
          sent.push({ url, method: "DELETE" });
          const id = url.split("/").pop() ?? "";
          return new Promise<Response>((resolve) => pending.set(id, resolve));
        }
        return Promise.resolve(Response.json(stored));
      }),
    );

    const answer = async (todo: Todo, response: Response) => {
      const resolve = pending.get(todo.id);
      expect(resolve, `no DELETE is in flight for ${todo.id}`).toBeDefined();
      pending.delete(todo.id);
      resolve!(response);
      await settle();
      await settle();
    };

    return {
      sent,
      /** Answer as Story 5.1's endpoint does: `204`, and no body at all. */
      confirm: async (todo: Todo) => {
        stored = stored.filter((row) => row.id !== todo.id);
        await answer(todo, new Response(null, { status: 204 }));
      },
      /** Refuse it, the way the route handler refuses everything (AD-10). */
      refuse: (todo: Todo) =>
        answer(
          todo,
          Response.json(
            { error: { kind: "delete", message: "diagnostic" } },
            { status: 500 },
          ),
        ),
      /**
       * Drop a row from what the server holds, without a request from here.
       *
       * Another tab, or another device. The next read then arrives without it,
       * which is the only route this suite has to a cache the product itself
       * did not empty.
       */
      forget: (todo: Todo) => {
        stored = stored.filter((row) => row.id !== todo.id);
      },
      /** What a reload would read (AC6). */
      persisted: () => stored,
    };
  }

  async function mountDeleting(
    { still = false, list = LIST }: { still?: boolean; list?: Todo[] } = {},
  ) {
    stubMotionPreference(still);
    const transport = stubDeletes(list);
    await mountCard();
    return transport;
  }

  const dialog = () => container.querySelector("dialog") as HTMLDialogElement;
  const rowText = () =>
    [...container.querySelectorAll("li")].map(
      (row) => row.querySelector("span")?.textContent,
    );
  const deleteControlFor = (text: string) =>
    container.querySelector<HTMLButtonElement>(
      `[aria-label="Delete ${text}"]`,
    ) as HTMLButtonElement;
  const dialogButton = (label: string) =>
    [...dialog().querySelectorAll("button")].find(
      (button) => button.textContent === label,
    ) as HTMLButtonElement;
  const tabLabels = () =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map(
      (each) => each.textContent,
    );
  const retryButton = () =>
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );

  /** Confirm the delete of `text`, and let its collapse finish. */
  async function confirmDelete(text: string) {
    await act(async () => deleteControlFor(text).click());
    await act(async () => dialogButton("Delete").click());
    await settle();
    await endCollapse(rowFor(text));
  }

  it("collapses the row first, then removes it and sends the request (AC1, AC2)", async () => {
    const transport = await mountDeleting();

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    // The dialog is closed and the row is still on screen, marked — which is
    // what "the same collapse runs on a confirmed delete" requires it to be. A
    // row removed from the cache on the click would have unmounted here, with
    // nothing left to animate.
    expect(dialog().open).toBe(false);
    expect(rowText()).toContain("send invoice");
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBe("true");
    // Nothing has been asked of the server yet.
    expect(transport.sent).toEqual([]);

    await endCollapse(rowFor("send invoice"));

    // Gone from the list, and the request is on its way — AC1's "removed before
    // the request resolves", which it is: the answer is still being held open.
    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    expect(transport.sent).toEqual([
      { url: `/api/todos/${LIST[1].id}`, method: "DELETE" },
    ]);
  });

  it("updates all three filter-tab counts in the same commit (AC7)", async () => {
    // Counts are `countsByFilterView(data)`, derived per render from the one
    // cache entry, so this is satisfied by construction — which is exactly why
    // it is asserted rather than built. A count held in state would pass every
    // other case in this file.
    await mountDeleting();
    expect(tabLabels()).toEqual(["All 4", "Active 2", "Completed 2"]);

    await confirmDelete("send invoice");

    expect(tabLabels()).toEqual(["All 3", "Active 1", "Completed 2"]);
    expect(rowText()).toHaveLength(3);
  });

  it("cuts to the end state under reduced motion (AC3)", async () => {
    // No departure is recorded, because with `transition: none` no
    // `transitionend` will ever fire and a row parked in the set would never
    // leave. So the row goes and the request is sent in the same tick, with
    // nothing waiting on an event that is not coming.
    const transport = await mountDeleting({ still: true });

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    expect(container.querySelectorAll("[data-deleting]")).toHaveLength(0);
    expect(transport.sent).toHaveLength(1);

    // And the announcement still fires once the server agrees — the motion is
    // what is dropped, never the information (EXPERIENCE.md:225).
    await transport.confirm(LIST[1]);
    expect(liveRegion("polite")).toBe("send invoice, deleted");
  });

  it("announces the removal politely, only once the server agrees (AC5)", async () => {
    const transport = await mountDeleting();

    await confirmDelete("send invoice");

    // Nothing yet: the row has left the screen but the server has not answered,
    // and announcing here would announce a removal that may yet be refused.
    expect(liveRegion("polite")).toBe("");

    await transport.confirm(LIST[1]);

    expect(liveRegion("polite")).toBe("send invoice, deleted");
    expect(liveRegion("assertive")).toBe("");
    expect(transport.persisted().map((row) => row.text)).toEqual([
      "pay rent",
      "call plumber",
      "book dentist",
    ]);
  });

  it("keeps it gone across a reload (AC6)", async () => {
    // The reload, as near as this suite gets: a fresh mount over a server that
    // no longer holds the row. `mountCard()` builds its own `QueryClient`, so
    // remounting is a fresh cache by construction.
    const transport = await mountDeleting();
    await confirmDelete("send invoice");
    await transport.confirm(LIST[1]);

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await mountCard();

    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
  });

  it("puts the row back in its position and says so when refused (AC8, AC9, AC10)", async () => {
    const transport = await mountDeleting();

    await confirmDelete("send invoice");
    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);

    await transport.refuse(LIST[1]);

    // Back between the two rows it sat between, which is `id DESC` and never
    // the end of the list (AC8).
    expect(rowText()).toEqual([
      "pay rent",
      "send invoice",
      "call plumber",
      "book dentist",
    ]);
    // And it is a row again rather than a row still leaving.
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBeNull();

    // The shared save string, with `Retry`, announced assertively by the banner
    // rather than by the mutation (AC10, AC13).
    expect(container.textContent).toContain("Couldn't save that change.");
    expect(retryButton()).toBeDefined();
    expect(liveRegion("assertive")).toBe("Couldn't save that change.");
    // The server's own message never reaches the interface (AD-10).
    expect(container.textContent).not.toContain("diagnostic");
  });

  it("leaves a toggle made while the delete was in flight alone (AC9)", async () => {
    // A whole-list snapshot taken in `onMutate` and restored in `onError` would
    // pass the case above and fail this one: the snapshot predates the toggle,
    // so restoring it would undo a change the delete never made (AD-16).
    let stored = [...LIST];
    const pending = new Map<string, (response: Response) => void>();
    stubMotionPreference(false);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        const url = String(input);
        const id = url.split("/").pop() ?? "";
        if (init?.method === "DELETE") {
          return new Promise<Response>((resolve) => pending.set(id, resolve));
        }
        if (init?.method === "PATCH") {
          const { completed } = JSON.parse(String(init.body)) as {
            completed: boolean;
          };
          stored = stored.map((row) =>
            row.id === id ? { ...row, completed } : row,
          );
          return Promise.resolve(
            Response.json(stored.find((row) => row.id === id)),
          );
        }
        return Promise.resolve(Response.json(stored));
      }),
    );
    await mountCard();

    await confirmDelete("send invoice");

    // `pay rent` is Completed; mark it Active while the delete is still open.
    const payRent = rowFor("pay rent");
    await act(async () =>
      payRent?.querySelector<HTMLElement>('[role="checkbox"]')?.click(),
    );
    await settle();
    expect(rowFor("pay rent")?.getAttribute("data-completed")).toBeNull();

    // Now refuse the delete.
    const resolve = pending.get(LIST[1].id);
    expect(resolve, "no DELETE is in flight").toBeDefined();
    await act(async () => {
      resolve!(
        Response.json(
          { error: { kind: "delete", message: "x" } },
          { status: 500 },
        ),
      );
      await new Promise((done) => setTimeout(done, 0));
    });
    await settle();

    // The deleted row is back where it was, and the toggle kept its new value.
    expect(rowText()).toEqual([
      "pay rent",
      "send invoice",
      "call plumber",
      "book dentist",
    ]);
    expect(rowFor("pay rent")?.getAttribute("data-completed")).toBeNull();
  });

  it("re-attempts the same removal on Retry, without asking again (AC11)", async () => {
    const transport = await mountDeleting();

    await confirmDelete("send invoice");
    await transport.refuse(LIST[1]);
    expect(retryButton()).toBeDefined();

    await act(async () => retryButton()?.click());
    await settle();

    // The same row, sent a second time to the same URL — and gone from the
    // list again, with no confirmation in between and no collapse to wait on.
    expect(transport.sent).toEqual([
      { url: `/api/todos/${LIST[1].id}`, method: "DELETE" },
      { url: `/api/todos/${LIST[1].id}`, method: "DELETE" },
    ]);
    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    // "The dialog does **not** re-open" — the user already confirmed, and
    // asking twice would make `Retry` a second confirmation.
    expect(dialog().open).toBe(false);
    expect(container.querySelectorAll("dialog")).toHaveLength(1);

    // And the banner goes when the retried removal succeeds.
    await transport.confirm(LIST[1]);
    expect(retryButton()).toBeUndefined();
    expect(liveRegion("polite")).toBe("send invoice, deleted");
  });

  it("retries nothing and lets the banner go when the row has vanished (AC12)", async () => {
    // A `Retry` whose Todo the cache no longer holds. The rollback put the row
    // back when the delete was refused, so something *else* has to take it away
    // for this branch to be reached at all — another tab, or, as here, a list
    // arriving without it. Driven through a focus refetch because `mountCard()`
    // builds its own client, which is the point of it: there is no handle to
    // write the cache behind the product's back.
    const transport = await mountDeleting();

    await confirmDelete("send invoice");
    await transport.refuse(LIST[1]);
    expect(rowText()).toContain("send invoice");
    const sentBefore = transport.sent.length;

    // `focusManager` is a module-level singleton shared by every test in this
    // worker, so it is restored in a `finally` — the discipline the read's own
    // refetch cases established.
    transport.forget(LIST[1]);
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();
      await settle();
    } finally {
      focusManager.setFocused(undefined);
    }

    // Gone from the cache, and the banner is still standing: a *read*
    // succeeding says nothing about a failed delete, because the slot is
    // cleared by kind (EXPERIENCE.md:109).
    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    expect(container.textContent).toContain("Couldn't save that change.");

    const retry = retryButton();
    expect(retry, "the banner's Retry is still there to press").toBeDefined();
    await act(async () => retry?.click());
    await settle();

    // Nothing re-sent — there is no longer a Todo for the banner's operation to
    // be about — and the banner is gone regardless, because `retryCurrentError`
    // empties the slot before it invokes the closure and does not care what the
    // closure does (AD-9).
    expect(transport.sent).toHaveLength(sentBefore);
    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    expect(container.querySelector(".banner-region")?.children).toHaveLength(0);
    expect(retryButton()).toBeUndefined();
  });

  it("lets two rows collapse at once, in whatever order they finish", async () => {
    // `endDeparture` uses the updater form of `setDepartures` precisely because
    // "two rows finishing in the same tick would otherwise each filter the
    // array they captured, and the second write would put the first row back".
    // Two deletes is the reachable version of that: confirm, confirm, and the
    // collapses end in the order the browser happens to report them.
    const transport = await mountDeleting();

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();
    await act(async () => deleteControlFor("call plumber").click());
    await act(async () => dialogButton("Delete").click());
    await settle();

    // Both on screen, both marked, and nothing asked of the server yet.
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBe("true");
    expect(rowFor("call plumber")?.getAttribute("data-deleting")).toBe("true");
    expect(transport.sent).toEqual([]);

    // The second one reports first, which is the order that breaks a
    // non-updater write.
    await endCollapse(rowFor("call plumber"));
    expect(rowText()).toEqual(["pay rent", "send invoice", "book dentist"]);
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBe("true");

    await endCollapse(rowFor("send invoice"));

    expect(rowText()).toEqual(["pay rent", "book dentist"]);
    expect(transport.sent).toEqual([
      { url: `/api/todos/${LIST[2].id}`, method: "DELETE" },
      { url: `/api/todos/${LIST[1].id}`, method: "DELETE" },
    ]);

    // And both are confirmed independently, each announcing its own Todo.
    await transport.confirm(LIST[2]);
    expect(liveRegion("polite")).toBe("call plumber, deleted");
    await transport.confirm(LIST[1]);
    expect(liveRegion("polite")).toBe("send invoice, deleted");
  });

  it("still delivers the removal when reduced motion arrives mid-collapse", async () => {
    // The one state the two halves of AC3 leave between them. A preference set
    // *before* the confirm records no departure at all and removes the Todo in
    // the same tick; a preference flipped *during* the collapse takes the
    // transition away from a row already marked, so no `transitionend` is ever
    // coming for it. Without the delete being delivered on that release the row
    // sits there confirmed, undeleted, with nothing ever sent — the one failure
    // in this story that is silent in both directions.
    const media = stubMotionPreference(false);
    const transport = stubDeletes(LIST);
    await mountCard();

    await act(async () => deleteControlFor("send invoice").click());
    await act(async () => dialogButton("Delete").click());
    await settle();
    expect(rowFor("send invoice")?.getAttribute("data-deleting")).toBe("true");
    expect(transport.sent).toEqual([]);

    const onChange = media.listeners.get("change");
    expect(onChange, "the module registered no `change` listener").toBeDefined();
    media.setMatches(true);
    await act(async () => onChange!());
    await settle();

    expect(rowText()).toEqual(["pay rent", "call plumber", "book dentist"]);
    expect(transport.sent).toEqual([
      { url: `/api/todos/${LIST[1].id}`, method: "DELETE" },
    ]);
  });
});
