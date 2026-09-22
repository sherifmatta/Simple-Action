import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { classNamesOf, parseTsx, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import type { Todo } from "@/shared/contract/todo";

// Covers the list region Story 2.4 fills: the one caller of `useTodos()`, the
// client boundary, and the three branches this story deliberately does not
// have. AC1-AC6 are the row's and are asserted in `todo-row.test.ts`.
//
// The hook is stubbed and the component rendered, rather than its source read
// for the shape of an `if`. A regex over the file passes when the import path
// is wrong and fails when Prettier reflows a line — it tests the text, not the
// behaviour (2026-09-22 code review). `react-dom/server` needs no DOM.

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
    mockUseTodos.mockReturnValue({ data: [] });
    const html = render();
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
  });

  it("renders nothing at all until the list has resolved", () => {
    // `data` is undefined both in flight and after a failure. Story 2.6 and
    // Story 2.7 are what make those two stop being the same thing.
    mockUseTodos.mockReturnValue({ data: undefined });
    expect(render()).toBe("");
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

  it("renders a <ul> of rows and nothing else", () => {
    expect(elements()).toEqual(["ul", "TodoRow"]);
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
    for (const name of ["todo-card.tsx", "todo-row.tsx", "sticky-top-block.tsx"]) {
      const file = markup.find(({ file: f }) => f.endsWith(name));
      expect(file, `${name} is not in the markup surface`).toBeDefined();
      expect(file?.source, `${name} must not declare a client boundary`).not.toMatch(
        directive,
      );
    }
  });
});

describe("the states this story does not build are absent, not stubbed", () => {
  it("names the three stories that own the missing branches", () => {
    // Story 1.7's rule, kept: a placeholder is a thing a later story has to
    // remember to delete.
    for (const owner of ["Story 2.6", "Story 2.7", "Story 2.8"]) {
      expect(listSource).toContain(owner);
    }
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

describe("the list region is reachable from the page", () => {
  it("is rendered by the card, which is rendered by the page", () => {
    const card = markup.find(({ file }) =>
      file.endsWith(path.join("components", "todo-card.tsx")),
    );
    expect(card?.source).toMatch(/<TodoList \/>/);
  });
});
