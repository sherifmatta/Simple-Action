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

const { mockUseTodos } = vi.hoisted(() => ({ mockUseTodos: vi.fn() }));
vi.mock("@/client/todos/use-todos", () => ({ useTodos: mockUseTodos }));

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
    mockUseTodos.mockReturnValue({
      isPending: false,
      data: [
        todo("0199a5c5-0000-7000-8000-000000000002", "send invoice"),
        todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", true),
      ],
    });
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

  it("renders an empty list as an empty <ul>, not as nothing", () => {
    mockUseTodos.mockReturnValue({ isPending: false, data: [] });
    const html = render();
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
  });

  it("holds three skeleton rows while the initial read is in flight", () => {
    // Was "renders nothing at all until the list has resolved", which pinned
    // `render()` as the empty string. Story 2.5 is where the region stops
    // leaving the DOM: `isPending` is the initial load and nothing else, and
    // it is the one state that shows placeholders.
    mockUseTodos.mockReturnValue({ isPending: true, data: undefined });
    const html = render();
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain("skeleton-row");
    // Placeholders, not rows: no checkbox, no marker, no text.
    expect(html).not.toContain("checkbox-box");
    expect(html).not.toContain("data-completed");
  });

  it("holds the region open and empty when the read failed", () => {
    // `isPending` is false once there is an error, and `data` stays
    // undefined: the contents are *unknown*, not known-empty, so neither
    // skeletons nor rows may show (epic-2-context: "A load failure is not an
    // empty list"). The banner and `Retry` are Story 2.6's.
    mockUseTodos.mockReturnValue({
      isPending: false,
      data: undefined,
      error: new Error("load failed"),
    });
    const html = render();
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
  });

  it("does not map over an absent list", () => {
    // The failure above is one `data.map` away from a crash that takes the
    // card down with it, and the region is the thing that must survive.
    mockUseTodos.mockReturnValue({ isPending: false, data: undefined });
    expect(() => render()).not.toThrow();
  });

  it("shows no skeleton once the list has resolved", () => {
    mockUseTodos.mockReturnValue({
      isPending: false,
      data: [todo("0199a5c5-0000-7000-8000-000000000002", "send invoice")],
    });
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

  it("renders a <ul> of skeletons or rows, and nothing else", () => {
    // Was `["ul", "TodoRow"]`. Story 2.5 adds the one branch the region was
    // missing; it adds no second element and no wrapper.
    expect(elements()).toEqual(["ul", "SkeletonRow", "TodoRow"]);
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
  it("names the one story that owns the branches still missing", () => {
    // Story 1.7's rule, kept: a placeholder is a thing a later story has to
    // remember to delete. The list was ["Story 2.6", "Story 2.7", "Story
    // 2.8"] under the pre-consolidation numbering — the old 2.6 is this
    // story and the old 2.7/2.8/2.9 are all the new 2.6, which is the
    // `deferred-work.md` renumbering entry discharged for this file.
    expect(listSource).toContain("Story 2.6");
    for (const gone of ["Story 2.7", "Story 2.8", "Story 2.9"]) {
      expect(listSource, `${gone} no longer exists in the backlog`).not.toContain(gone);
    }
  });

  it("builds no loading state for a mutation", () => {
    // AC10: an add, a toggle and a delete are optimistic and never show a
    // skeleton. `isPending` is true only with no data and no error, which is
    // the initial read and nothing else; a `isFetching` here would put
    // skeletons under every background refetch.
    expect(listSource).toMatch(/\bisPending\b/);
    expect(listSource).not.toMatch(/\bisFetching\b/);
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
      { isPending: true, data: undefined },
      { isPending: false, data: [] },
      { isPending: false, data: [todo("0199a5c5-0000-7000-8000-000000000002", "x")] },
      { isPending: false, data: undefined, error: new Error("load failed") },
    ];
    for (const state of states) {
      mockUseTodos.mockReturnValue(state);
      expect(render(), JSON.stringify(state)).toMatch(/^<ul /);
    }
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
    mockUseTodos.mockReturnValue({ isPending: true, data: undefined });
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
