import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { classNamesOf, parseTsx, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import type { Todo } from "@/shared/contract/todo";

// Covers the list region: the one caller of `useTodos()`, the client
// boundary, and — since Story 2.5 — the order its three states resolve in.
// The row's own criteria are asserted in `todo-row.test.ts` and the skeleton's
// in `skeleton-row.test.ts`; what is here is which of them renders when.
//
// Story 2.5 replaced the branch Story 2.4 shipped. `if (data === undefined)
// return null` took the whole region out of the DOM in exactly the two states
// that most need something to render into, which is the `deferred-work.md`
// entry this story closes. Three assertions below changed with it, and they
// are called out where they sit rather than deleted quietly.
//
// The hook is stubbed and the component rendered, rather than its source read
// for the shape of an `if`. A regex over the file passes when the import path
// is wrong and fails when Prettier reflows a line — it tests the text, not the
// behaviour (2026-09-22 code review). `react-dom/server` needs no DOM, and it
// is also what exercises the motion module's server snapshot: with no
// `window` to ask, `useReducedMotion()` reports stillness, so every render
// below carries the still marker.

const {
  mockUseTodos,
  mockAnnounce,
  mockSetCompleted,
  mockNoteToggle,
  mockEndDeparture,
} = vi.hoisted(() => ({
  mockUseTodos: vi.fn(),
  mockAnnounce: vi.fn(),
  mockSetCompleted: vi.fn(),
  mockNoteToggle: vi.fn(),
  mockEndDeparture: vi.fn(),
}));
vi.mock("@/client/todos/use-todos", () => ({ useTodos: mockUseTodos }));
// Story 4.2 gave this component a second hook. `useSetCompleted` reaches for a
// `QueryClient` and the announcer, both of which throw outside their providers
// by design — and what it does with them is `use-set-completed.test.ts`'s
// subject, not this file's. What belongs here is that the list holds *one*
// instance and hands it to every row, which the assertions below cover.
vi.mock("@/client/todos/use-set-completed", () => ({
  useSetCompleted: () => mockSetCompleted,
}));
// The empty state announces its own text, and `useAnnounce()` throws outside
// its provider by design (announcer.tsx:40) rather than returning a no-op.
// Stubbing it keeps this file about which branch renders; that the right
// string is announced, politely, is `empty-state.test.ts`'s.
vi.mock("@/client/feedback/announcer", () => ({
  useAnnounce: () => mockAnnounce,
}));
// Story 4.3 gave it a third. `useFilterView()` throws outside its provider by
// design, and what it decides — which rows match, which one is leaving and what
// that announces — is `filter-view.test.ts`'s and
// `filter-view-context.test.tsx`'s. This file renders with `renderToStaticMarkup`
// and is about which branch renders, so the view is pinned to All and nothing
// is departing: the states the other two views produce are asserted through a
// real DOM in `todo-list.render.test.tsx`.
vi.mock("@/client/todos/filter-view-context", () => ({
  useFilterView: () => ({
    view: "all" as const,
    select: vi.fn(),
    showAll: vi.fn(),
    isDeparting: () => false,
    noteToggle: mockNoteToggle,
    endDeparture: mockEndDeparture,
  }),
}));

const { TodoList } = await import("./todo-list");

const repositoryRoot = process.cwd();
const listFile = path.join("src", "client", "components", "todo-list.tsx");
const listSource = readFileSync(path.join(repositoryRoot, listFile), "utf8");
const sourceFile = parseTsx("todo-list.tsx", listSource);
const listClasses = classNamesOf(listSource, "todo-list.tsx");

const markup = readMarkup();
const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

const todo = (id: string, text: string, completed = false): Todo => ({
  id,
  text,
  completed,
  createdAt: "2026-09-22T09:00:00.000Z",
});

const render = () => renderToStaticMarkup(createElement(TodoList));

// The hook's states, named. Story 3.3 replaced `data === undefined` with
// `listLanded` — "a Todo List from the server is what the cache holds" — and
// with it went the ability to describe a state by `isPending` alone: an
// optimistic row makes `data` defined and the query `success` while the list
// is still on its way. Naming the states here is what keeps each case below
// about the branch it is testing rather than about four fields.
const loading = { status: "pending", isFetching: true, data: undefined, listLanded: false };
const resolved = (data: Todo[]) => ({
  status: "success",
  isFetching: false,
  data,
  listLanded: true,
});
const refetching = (data: Todo[]) => ({ ...resolved(data), isFetching: true });
const failed = {
  status: "error",
  isFetching: false,
  data: undefined,
  listLanded: false,
  error: new Error("load failed"),
};
const retrying = { ...failed, isFetching: true };
/** A Todo added while the list is still loading — Story 3.3 AC6. */
const addedDuringLoad = (data: Todo[]) => ({
  status: "success",
  isFetching: true,
  data,
  listLanded: false,
});

beforeEach(() => mockUseTodos.mockReset());

function elements(): string[] {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      found.push(node.tagName.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

describe("the list region renders what the hook resolved to", () => {
  it("renders one row per Todo, in the order the server sent them", () => {
    mockUseTodos.mockReturnValue(
      resolved([
        todo("0199a5c5-0000-7000-8000-000000000002", "send invoice"),
        todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", true),
      ]),
    );
    const html = render();

    expect(html.match(/<li/g)).toHaveLength(2);
    // `id DESC`, as received — nothing here re-sorts (AD-5).
    expect(html.indexOf("send invoice")).toBeLessThan(
      html.indexOf("book dentist"),
    );
    // And the second one is the Completed Todo, so the marker travels with
    // the data rather than with the position.
    expect(html.split("<li").at(-1)).toContain('data-completed="true"');
  });

  it("resolves an empty list to the empty state, beside a region that stays", () => {
    // Was "renders an empty list as an empty <ul>, not as nothing", which
    // pinned the region as empty *and silent*. Story 2.6 is where a resolved
    // empty list stops looking identical to a failed one.
    mockUseTodos.mockReturnValue(resolved([]));
    const html = render();
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
    expect(html).toContain("Nothing here yet.");
    // A sibling of the region, not a child of it: a `<div>` is not valid
    // inside a `<ul>`, and the region is what Story 2.5 made persistent.
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("Nothing here yet."));
  });

  it("returns to skeletons while Retry re-runs a read that failed (AC5)", () => {
    // The query is `status: "error"` with a fetch in flight, which is exactly
    // the state the branch before Story 2.6 rendered as a blank rectangle.
    mockUseTodos.mockReturnValue(retrying);
    const html = render();
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain("skeleton-row");
    expect(html).not.toContain("Nothing here yet.");
  });

  it("shows no skeleton when a refetch runs over a list it already has", () => {
    // The other half of widening the branch: a background refetch with data
    // in hand is not a loading state, which is what keeps every optimistic
    // mutation in Epics 3 through 5 from flashing placeholders (AC10).
    mockUseTodos.mockReturnValue(
      refetching([todo("0199a5c5-0000-7000-8000-000000000002", "send invoice")]),
    );
    const html = render();
    expect(html).not.toContain("skeleton-row");
    expect(html).toContain("send invoice");
  });

  it("holds three skeleton rows while the initial read is in flight", () => {
    // Was "renders nothing at all until the list has resolved", which pinned
    // `render()` as the empty string. Story 2.5 is where the region stops
    // leaving the DOM: `isPending` is the initial load and nothing else, and
    // it is the one state that shows placeholders.
    mockUseTodos.mockReturnValue(loading);
    const html = render();
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain("skeleton-row");
    // Placeholders, not rows: no checkbox, no marker, no text.
    expect(html).not.toContain("checkbox-box");
    expect(html).not.toContain("data-completed");
    // AC14: the empty state is not shown while the list is still loading, and
    // there is no frame on the way to content in which it could be. The
    // guarantee is structural — the panel is gated on `data` being defined,
    // and during a load it is undefined — but AC14 is a named criterion, so
    // the state it names is asserted rather than left to the argument.
    expect(html).not.toContain("Nothing here yet.");
  });

  it("holds the region open and empty when the read failed (AC4, AC15)", () => {
    // Nothing is fetching and `data` stays undefined: the contents are
    // *unknown*, not known-empty, so neither skeletons nor rows nor the empty
    // state may show (epic-2-context: "A load failure is not an empty list").
    // The banner and `Retry` sit in the sticky block above, not here.
    mockUseTodos.mockReturnValue(failed);
    const html = render();
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("Nothing here yet.");
    expect(html).not.toContain("Retry");
  });

  it("does not map over an absent list", () => {
    // The failure above is one `data.map` away from a crash that takes the
    // card down with it, and the region is the thing that must survive.
    mockUseTodos.mockReturnValue(failed);
    expect(() => render()).not.toThrow();
  });

  it("shows no skeleton once the list has resolved", () => {
    mockUseTodos.mockReturnValue(
      resolved([todo("0199a5c5-0000-7000-8000-000000000002", "send invoice")]),
    );
    expect(render()).not.toContain("skeleton-row");
  });

  it("separates rows by DESIGN.md's row gap, and compiles it", async () => {
    expect(listClasses).toEqual(["flex", "flex-col", "gap-row-gap"]);
    const css = await compile(markup.flatMap(({ classes }) => classes));
    expect(ruleFor(css, "gap-row-gap")).toContain("var(--spacing-row-gap)");
    expect(css).toContain("--spacing-row-gap: 9px");
  });
});

describe("the list region reads the one query hook", () => {
  it("goes through useTodos rather than useQuery or fetch", () => {
    // AD-8: server state lives in one cache entry. `deferred-work.md` records
    // that nothing yet lints `useQuery` itself, so this is the assertion that
    // holds the rule at this call site.
    expect(listSource).toMatch(
      /import \{ useTodos \} from "@\/client\/todos\/use-todos";/,
    );
    expect(listSource).not.toMatch(/\buseQuery\b/);
    expect(listSource).not.toMatch(/\bfetch\b/);
    expect(listSource).not.toMatch(/\buseState\b/);
  });

  it("renders a <ul> of skeletons or rows, and the empty state beside it", () => {
    // Was `["ul", "TodoRow"]`, then `["ul", "SkeletonRow", "TodoRow"]`, then
    // with Story 2.6's empty state. Story 3.3 reordered the first two rather
    // than adding anything: rows render *then* skeletons, because an
    // optimistic row added during a load sits above the placeholders and not
    // instead of them (AC6). Still no wrapper, which is what keeps the `<ul>`
    // a direct child of the card.
    expect(elements()).toEqual(["ul", "TodoRow", "SkeletonRow", "EmptyState"]);
  });

  it("holds one toggle hook for the whole list and hands it to every row", () => {
    // AR-28's sibling rule, one level up: the row is presentational, so the
    // mutation lives here and arrives as a prop. A `useSetCompleted()` inside
    // `TodoRow` would be one mutation observer per row and would make every
    // markup test of the row mount two providers to exercise neither.
    expect(listSource.match(/useSetCompleted\(/g)).toHaveLength(1);
    // Story 4.3 gave it an argument: the mutation reports a refusal so the
    // departure it started can be called off. Nothing else learns of a
    // rollback — it is a cache write — and polling for it cannot work, because
    // `onMutate` is async and there is always a commit where the row is marked
    // departing and the optimistic write has not landed.
    expect(listSource).toMatch(/cancelDepartures\(\[todo\.id\]\)/);
    // Story 4.3 put a wrapper between the hook and the row, and Story 4.4 took
    // it away again: `noteToggle` goes *into* the mutation, so the one request
    // path is the one a `Retry` pressed in the banner re-enters too. A wrapper
    // here would run for the checkbox and never for the banner, and a retried
    // toggle would silently stop departing the view (Story 4.4 AC5).
    //
    // Which seam it goes into is the compiler's job, not this scan's:
    // `SetCompletedCallbacks` is named rather than positional precisely because
    // `(todo) => void` is assignable to a `(todo, completed) => void` slot, so
    // no ordering a test could pin here was ever the thing protecting it.
    expect(listSource).toMatch(/onRequested: noteToggle/);
    expect(listSource).toMatch(/onToggle=\{toggle\}/);
    expect(listSource).not.toMatch(/noteToggle\(todo, completed\)/);
    // And the list itself never reads Completion Status — `todo-row.tsx` is
    // the one file that does (`todo-row.test.ts` asserts the whole surface).
    expect(listSource).not.toMatch(/\.completed\b/);
  });

  it("keys rows by the Todo's id, which is its final sort position", () => {
    // AD-4/AD-5: a UUIDv7 is time-ordered, so an optimistic row minted in the
    // browser keeps its key and its place when the server's copy arrives.
    // Keying by index would make Epic 3's merge re-use the wrong row.
    expect(listSource).toMatch(/key=\{todo\.id\}/);
  });
});

describe("the client boundary is here and only here", () => {
  const directive = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

  it("declares itself a Client Component before anything else", () => {
    expect(listSource.trimStart().startsWith('"use client";')).toBe(true);
  });

  it("leaves the card and the row as they were", () => {
    // The card above stays a Server Component and the row below needs no
    // directive, being already in the client graph. Neither fact is visible
    // from those files, so it is asserted here, where the boundary is
    // (2026-09-22 code review): a `"use client"` migrating up to the card
    // would pull the whole tree across without failing anything.
    for (const name of [
      "todo-card.tsx",
      "todo-row.tsx",
      "skeleton-row.tsx",
      "sticky-top-block.tsx",
    ]) {
      const file = markup.find(({ file: f }) => f.endsWith(name));
      expect(file, `${name} is not in the markup surface`).toBeDefined();
      expect(file?.source, `${name} must not declare a client boundary`).not.toMatch(
        directive,
      );
    }
  });
});

describe("the states this story does not build are absent, not stubbed", () => {
  it("refers only to stories the consolidated backlog still has", () => {
    // Story 1.7's rule, kept: a placeholder is a thing a later story has to
    // remember to delete. This file's own branches are all built now, so what
    // survives is the forward reference to Story 3.3 — the one case the
    // loading key still cannot serve. The pre-consolidation numbers must not
    // come back; that is the `deferred-work.md` renumbering entry discharged
    // for this file.
    expect(listSource).toContain("Story 3.3");
    for (const gone of ["Story 2.7", "Story 2.8", "Story 2.9"]) {
      expect(listSource, `${gone} no longer exists in the backlog`).not.toContain(gone);
    }
  });

  it("builds no loading state for a mutation", () => {
    // Story 2.5 AC10: an add, a toggle and a delete are optimistic and never
    // show a skeleton. The states above are what prove it — a refetch over a
    // list already in hand renders no placeholder — so what is left here is
    // the one claim a fixture cannot make: `isLoading` is not the key. It is
    // `isPending && isFetching`, which an optimistic write turns false, and
    // it reads like the right answer.
    expect(listSource).not.toMatch(/\bisLoading\b/);
  });

  it("renders no copy of its own", () => {
    const text: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && node.getText(sourceFile).trim() !== "") {
        text.push(node.getText(sourceFile).trim());
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(text).toEqual([]);
  });
});

describe("the region is one element that never leaves the DOM (AC11)", () => {
  it("renders the same <ul> in every state the hook can be in", () => {
    // The `deferred-work.md` entry Story 2.4 left open, closed: the region is
    // unconditional and only its contents resolve, so Story 2.6's states have
    // something to mount into and the swap costs no layout shift.
    const states = [
      loading,
      resolved([]),
      resolved([todo("0199a5c5-0000-7000-8000-000000000002", "x")]),
      failed,
      addedDuringLoad([todo("0199a5c5-0000-7000-8000-000000000002", "x")]),
    ];
    for (const state of states) {
      mockUseTodos.mockReturnValue(state);
      expect(render(), JSON.stringify(state)).toMatch(/^<ul /);
    }
  });

  it("tells assistive technology when the region is working, and when it is not", () => {
    // The Story 2.5 deferral this story owns. The skeletons are
    // `aria-hidden` and carry no text, so without `aria-busy` a screen-reader
    // user cannot tell a list that is still loading from one that resolved to
    // nothing — both are an empty, unnamed `<ul>`.
    mockUseTodos.mockReturnValue(loading);
    expect(render()).toContain('aria-busy="true"');

    // Not busy once it has resolved, and not busy after a failure: a failed
    // read is finished, not working.
    for (const settled of [resolved([]), failed]) {
      mockUseTodos.mockReturnValue(settled);
      expect(render(), JSON.stringify(settled)).not.toContain("aria-busy");
    }
  });

  it("names the region, so what is busy is identifiable", () => {
    // `aria-busy` on an unnamed container reports that *something* is
    // working. The name is the vocabulary's own (`Todo List`), which
    // epic-2-context fixes as used verbatim in code as well as in copy.
    mockUseTodos.mockReturnValue(resolved([]));
    expect(render()).toContain('aria-label="Todo List"');
  });
});

describe("stillness arrives as one marker from the motion module", () => {
  it("reads the preference through the module and never itself", () => {
    // AC2: `src/client/motion/motion.ts` is the product's only `matchMedia`
    // call. A component that asked the browser itself would be the second
    // home for the decision, and `motion.test.ts` scans the whole tree for
    // exactly that; this is the same rule at the one consumer.
    expect(listSource).toMatch(
      /import \{ useReducedMotion \} from "@\/client\/motion\/motion";/,
    );
    expect(listSource).not.toMatch(/\bmatchMedia\b/);
    expect(listSource).not.toMatch(/prefers-reduced-motion/);
  });

  it("sets one data attribute rather than branching a class name", () => {
    // AR-28, and what keeps every `className` in the product a static string
    // literal: the recipes in `app/globals.css` derive the suppression from
    // the marker (`skeleton-row.test.ts` asserts the rule).
    mockUseTodos.mockReturnValue(loading);
    // No `window` here, so the module's server snapshot answers, and it
    // answers "still" — markup never ships a frame of motion it has not
    // confirmed is wanted.
    expect(render()).toContain('data-still="true"');
    expect(listClasses).toEqual(["flex", "flex-col", "gap-row-gap"]);
  });
});

describe("the list region is reachable from the page", () => {
  it("is rendered by the card, which is rendered by the page", () => {
    const card = markup.find(({ file }) =>
      file.endsWith(path.join("components", "todo-card.tsx")),
    );
    expect(card?.source).toMatch(/<TodoList \/>/);
  });
});
