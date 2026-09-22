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
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TodoList />
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

    await act(async () => {
      root.render(
        <QueryClientProvider client={freshClient()}>
          <TodoCard />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

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
