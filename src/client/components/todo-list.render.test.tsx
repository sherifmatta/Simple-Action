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

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";
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

describe("TodoList, actually mounted", () => {
  it("runs the real query and renders the Todos the server answered", async () => {
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

  it("renders no list at all while the read is in flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );

    await mount(freshClient());

    // The branch Stories 2.6 and 2.7 replace with skeletons and the banner.
    // Pinned so that replacement is a visible change rather than a silent one.
    expect(container.querySelector("ul")).toBeNull();
  });

  it("renders no list when the read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { kind: "load", message: "x" } }, { status: 500 })),
      ),
    );

    await mount(freshClient());

    expect(container.querySelector("ul")).toBeNull();
  });
});
