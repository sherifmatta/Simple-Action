// @vitest-environment jsdom

// The filter tabs, actually mounted (Story 4.3 AC2, AC3, AC4, AC5, AC6, AC8).
//
// What a markup scan cannot see: a segment being pressed and the view changing
// with it, counts moving when the cached list does, and — the one this file
// exists for — that none of it touches the network.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnouncerProvider } from "@/client/feedback/announcer";
import { FilterViewProvider } from "@/client/todos/filter-view-context";
import { TODOS_QUERY_KEY } from "@/client/todos/query-keys";
import type { Todo } from "@/shared/contract/todo";
import { FilterTabs } from "./filter-tabs";

const todo = (id: string, text: string, completed: boolean): Todo => ({
  id,
  text,
  completed,
  createdAt: "2026-09-23T09:00:00.000Z",
});

let container: HTMLElement;
let root: Root;
let fetchStub: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  // Reduced motion is irrelevant to the tabs but the provider reads it.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/**
 * Mount the tabs over a query client that has already been handed a list.
 *
 * `setQueryData` rather than a stubbed read, because what these cases are
 * about is what the tabs derive from the cache — and seeding it directly is
 * also what proves the counts follow an *optimistic* write, which is how every
 * add, toggle and delete reaches them (AC5).
 */
async function mount(list?: Todo[]) {
  fetchStub = vi.fn(async () => new Response(JSON.stringify(list ?? []), { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);

  const client = new QueryClient();
  if (list !== undefined) client.setQueryData(TODOS_QUERY_KEY, list);

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AnnouncerProvider>
          <FilterViewProvider>
            <FilterTabs />
          </FilterViewProvider>
        </AnnouncerProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
  return client;
}

const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const names = () => tabs().map((tab) => tab.textContent);
const selected = () =>
  tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;

describe("the counts the segments carry (AC4, AC5, AC6)", () => {
  it("names each segment with its own count", async () => {
    await mount([
      todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false),
      todo("0199a5c5-0000-7000-8000-000000000002", "send invoice", true),
      todo("0199a5c5-0000-7000-8000-000000000003", "pay rent", true),
    ]);
    // The whole name, as a screen reader would take it: `Completed 2`, not a
    // `2` sitting beside an unlabelled control (EXPERIENCE.md:217).
    expect(names()).toEqual(["All 3", "Active 1", "Completed 2"]);
  });

  it("moves them the instant the cached list changes (AC5)", async () => {
    const client = await mount([
      todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false),
    ]);
    expect(names()).toEqual(["All 1", "Active 1", "Completed 0"]);

    const reads = fetchStub.mock.calls.length;

    // An optimistic write, exactly as an add makes one.
    await act(async () => {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) => [
        todo("0199a5c5-0000-7000-8000-000000000009", "new one", true),
        ...(cached ?? []),
      ]);
    });
    await settle();

    expect(names()).toEqual(["All 2", "Active 1", "Completed 1"]);
    // Derived, not stored: the counts moved without anybody being asked.
    expect(fetchStub.mock.calls.length).toBe(reads);
  });

  it("reads three zeros while the first read is still in flight (AC8)", async () => {
    // Nothing seeded, and the read never resolves — so the list has not
    // landed, whatever else is true.
    let release: (value: Response) => void = () => {};
    fetchStub = vi.fn(
      () => new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchStub);

    const client = new QueryClient();
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <FilterViewProvider>
              <FilterTabs />
            </FilterViewProvider>
          </AnnouncerProvider>
        </QueryClientProvider>,
      );
    });

    // An optimistic create lands mid-load, which is what makes `data` defined
    // before the list has arrived — the case the `listLanded` gate exists for.
    await act(async () => {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, [
        todo("0199a5c5-0000-7000-8000-000000000001", "optimistic", false),
      ]);
    });
    await settle();

    // The write is on the board before this is asserted — without the flush
    // above `data` is still undefined here and the three zeros would be true
    // for the wrong reason, which is a test that cannot fail.
    expect(client.getQueryData<Todo[]>(TODOS_QUERY_KEY)).toHaveLength(1);
    expect(names()).toEqual(["All 0", "Active 0", "Completed 0"]);

    await act(async () => {
      release(new Response(JSON.stringify([]), { status: 200 }));
    });
    await settle();
  });
});

describe("selecting a view (AC2, AC3, AC9)", () => {
  it("starts on All", async () => {
    await mount([]);
    expect(selected()).toBe("All 0");
  });

  it("moves the selection to the segment that was pressed", async () => {
    await mount([todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false)]);

    await act(async () => {
      tabs()[1].click();
    });

    expect(selected()).toBe("Active 1");
    expect(
      tabs().filter((tab) => tab.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
  });

  it("fires no request, and cannot fail (AC3)", async () => {
    // The claim the whole Filter View rests on: local, instant, no loading
    // state and no way to fail. One read happened on mount; pressing every
    // segment adds none.
    await mount([todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false)]);
    const before = fetchStub.mock.calls.length;

    for (const tab of tabs()) {
      await act(async () => {
        tab.click();
      });
    }

    expect(fetchStub.mock.calls.length).toBe(before);
  });

  it("keeps every segment in the tab order (AC11)", async () => {
    // EXPERIENCE.md:194 lists all three, which rules out a roving tabindex —
    // so none of them may be taken out of the order by a `-1`.
    await mount([]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, 0, 0]);
  });
});
