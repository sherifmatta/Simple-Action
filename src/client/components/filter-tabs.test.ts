// The filter tabs as markup: the labels, the roles, the tab stops, and the
// classes that paint a selection (Story 4.3 AC1, AC4, AC6, AC11).
//
// `renderToStaticMarkup` with the two hooks stubbed, plus a source scan, in
// `node`. What the tabs *do* with a real list — counts moving, a view changing —
// is `filter-tabs.render.test.tsx`'s, in a real DOM.

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { classNamesOf, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import type { Todo } from "@/shared/contract/todo";
import type { FilterView } from "@/client/todos/filter-view";

const { mockUseTodos, mockSelect, mockView } = vi.hoisted(() => ({
  mockUseTodos: vi.fn(),
  mockSelect: vi.fn(),
  mockView: { current: "all" as FilterView },
}));
vi.mock("@/client/todos/use-todos", () => ({ useTodos: mockUseTodos }));
vi.mock("@/client/todos/filter-view-context", () => ({
  useFilterView: () => ({
    view: mockView.current,
    select: mockSelect,
    showAll: vi.fn(),
    isDeparting: () => false,
    noteToggle: vi.fn(),
    endDeparture: vi.fn(),
  }),
}));

const { FilterTabs } = await import("./filter-tabs");

const repositoryRoot = process.cwd();
const tabsFile = path.join("src", "client", "components", "filter-tabs.tsx");
const tabsSource = readFileSync(path.join(repositoryRoot, tabsFile), "utf8");
const tabsClasses = classNamesOf(tabsSource, "filter-tabs.tsx");

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

/** The `@utility` block's source text, brace-balanced. */
function recipeBody(name: string): string {
  const source = readFileSync(path.join(repositoryRoot, "app", "globals.css"), "utf8");
  const opening = source.indexOf(`@utility ${name} {`);
  expect(opening, `expected @utility ${name} to be declared`).toBeGreaterThan(-1);
  let depth = 0;
  let end = source.indexOf("{", opening);
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    else if (source[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(opening, end + 1);
}

const todo = (id: string, completed: boolean): Todo => ({
  id,
  text: "book dentist",
  completed,
  createdAt: "2026-09-23T09:00:00.000Z",
});

function render(list: Todo[] | undefined, listLanded = true, view: FilterView = "all") {
  mockView.current = view;
  mockUseTodos.mockReturnValue({ data: list, listLanded, isFetching: false });
  return renderToStaticMarkup(createElement(FilterTabs));
}

describe("three segments, in one inset track (AC1)", () => {
  it("names the three Filter Views and no synonym for Completed", () => {
    const markup = render([]);
    expect(markup).toContain(">All 0<");
    expect(markup).toContain(">Active 0<");
    expect(markup).toContain(">Completed 0<");
    // `Done` is banned everywhere — labels, tooltips, identifiers, prose.
    expect(tabsSource).not.toMatch(/\bdone\b/i);
  });

  it("renders exactly three segments, each a real button", () => {
    const markup = render([]);
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup.match(/type="button"/g)).toHaveLength(3);
  });

  it("holds them in a track that names itself a tablist", () => {
    const markup = render([]);
    expect(markup).toMatch(/<div[^>]*role="tablist"/);
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
  });
});

describe("the count is part of the name, not decoration beside it (AC4, AC6)", () => {
  it("puts label and count in one text node", () => {
    // EXPERIENCE.md:217 — the accessible name is `Active 2`, not `Active`.
    // One text node rather than two elements, because two concatenate to
    // `Active2` under `textContent` and are joined by a space only by an
    // accessible-name computation. This is what makes the name assertable.
    const markup = render([todo("a", false), todo("b", true), todo("c", true)]);
    expect(markup).toContain(">All 3<");
    expect(markup).toContain(">Active 1<");
    expect(markup).toContain(">Completed 2<");
  });

  it("renders a zero rather than hiding it (AC4)", () => {
    // "A count of zero renders as `0`; it never hides, because a disappearing
    // number is a layout shift and a silence" (DESIGN.md:420).
    const markup = render([todo("a", false)]);
    expect(markup).toContain(">Completed 0<");
  });

  it("reads three zeros until the list has landed (AC8)", () => {
    // An optimistic create makes `data` defined while the first read is still
    // in flight, so the gate is `listLanded` and not `data` being defined —
    // the same gate, for the same reason, the empty state uses.
    const markup = render([todo("a", false)], false);
    expect(markup).toContain(">All 0<");
    expect(markup).toContain(">Active 0<");
    expect(markup).toContain(">Completed 0<");
  });
});

describe("the selection is one attribute (AC1)", () => {
  it("marks the selected segment and only that one", () => {
    const markup = render([], true, "active");
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-selected="false"/g)).toHaveLength(2);
    // The selected one is Active, not whichever came first.
    expect(markup).toMatch(/aria-selected="true"[^>]*>Active 0</);
  });

  it("picks no class in JavaScript (AR-28)", () => {
    // Every selection-dependent class is gated on the control's own
    // `aria-selected`, so the picture and the state cannot disagree — a bug
    // that broke the attribute would break the fill too rather than hide
    // behind it. The class strings themselves stay static literals.
    const gated = tabsClasses.filter((name) => name.startsWith("aria-selected:"));
    expect(gated.sort()).toEqual([
      "aria-selected:bg-tab-selected-bg",
      "aria-selected:shadow-tab-selected",
      "aria-selected:text-tab-label-selected",
      "aria-selected:text-tab-selected-text",
    ]);
  });
});

describe("every segment is reachable and big enough (AC11)", () => {
  it("gives all three an explicit tab stop", () => {
    // EXPERIENCE.md:194 puts all three segments in the tab order, which rules
    // out APG's roving tabindex. The explicit `tabIndex={0}` is what makes the
    // committed order true rather than nearly true.
    const markup = render([]);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(3);
  });

  it("clears 44px in height from the token, not from a number", async () => {
    const css = await compile(tabsClasses);
    expect(ruleFor(css, "min-h-touch-target-min")).toContain(
      "var(--spacing-touch-target-min)",
    );
    expect(css).toContain("--spacing-touch-target-min: 44px");
  });

  it("shares the width equally between them", () => {
    expect(tabsClasses).toContain("flex-1");
  });
});

describe("the track and the chip, in tokens (DESIGN.md:418)", () => {
  it("compiles every class it asks for", async () => {
    // `ruleFor` throws when Tailwind emits nothing, which is what proves a
    // variant spelling is real: an unrecognised utility is dropped silently,
    // not reported.
    const css = await compile(tabsClasses);
    for (const name of tabsClasses) {
      expect(() => ruleFor(css, name), `${name} emitted no rule`).not.toThrow();
    }
  });

  it("recesses the track and raises the selected chip", async () => {
    const css = await compile(tabsClasses);
    expect(ruleFor(css, "bg-tab-track")).toContain("var(--color-tab-track)");
    expect(ruleFor(css, "aria-selected:bg-tab-selected-bg")).toContain(
      "var(--color-tab-selected-bg)",
    );
    // Tailwind inlines a `--shadow-*` token's value into the utility rather
    // than referencing the variable, so the assertion is the geometry itself —
    // which is the claim worth making: the track is pushed in and the chip
    // stands out of it, and a swap of the two would read as a dent.
    //
    // Read off `--tw-shadow` specifically, not the whole rule: every shadow
    // utility composes `var(--tw-inset-shadow)` into its `box-shadow`, so the
    // word `inset` appears in all of them and a search of the rule text would
    // pass whatever the token said.
    const shadowValue = (rule: string) =>
      /--tw-shadow:\s*([^;]+);/.exec(rule)?.[1] ?? "";

    expect(shadowValue(ruleFor(css, "shadow-tab-track"))).toMatch(
      /^inset\s+0\s+1px\s+3px/,
    );
    const chip = shadowValue(ruleFor(css, "aria-selected:shadow-tab-selected"));
    expect(chip).toMatch(/^0\s+2px\s+6px\s+-2px/);
    expect(chip).not.toContain("inset");
    // The two inset shadows are the only place in the product where something
    // is pushed *in* (DESIGN.md:373), and `shadow-inner` is banned tree-wide
    // as a "more below" cue — so the track's recess is its own token.
    expect(tabsClasses).not.toContain("shadow-inner");
  });

  it("changes the selected label's colour and weight, not only its fill", async () => {
    // The chip's fill is 1.16:1 against the track and DESIGN.md:494 accepts it
    // only because the fill is never the only cue. These two are the others.
    const css = await compile(tabsClasses);
    expect(ruleFor(css, "aria-selected:text-tab-selected-text")).toContain(
      "var(--color-tab-selected-text)",
    );
    expect(ruleFor(css, "aria-selected:text-tab-label-selected")).toMatch(/font-weight/);
  });

  it("holds the segments apart by the one value the recipe exists for", () => {
    // `filter-tab-track` carries a single untokenised `gap`, and that value is
    // the only reason it exists. `top-block-stack` — the precedent its comment
    // names — is pinned the same way in `add-input.test.ts`, for the same
    // reason: `ruleFor` only proves the recipe was emitted, not what it says.
    expect(recipeBody("filter-tab-track")).toContain("gap: 2px");
  });

  it("names the track, so the group is not three unlabelled buttons", () => {
    expect(render([])).toMatch(/role="tablist"[^>]*aria-label="Filter View"/);
  });

  it("carries the track and chip radius DESIGN.md fixes", () => {
    expect(tabsClasses.filter((name) => name === "rounded-full")).toHaveLength(2);
  });
});

describe("the file's own surface", () => {
  it("is a Client Component, because it holds an interaction", () => {
    expect(tabsSource.trimStart().startsWith('"use client";')).toBe(true);
  });

  it("uses no hex literal and no arbitrary-value class (AD-13)", () => {
    expect(tabsSource).not.toMatch(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/);
    expect(tabsSource).not.toMatch(/\b[a-z-]+-\[[^\]]+\]/);
  });

  it("is part of the markup surface the whole-tree scans read", () => {
    // So the bans every other component is held to apply here too, rather
    // than this file being a hole in them.
    expect(readMarkup().map(({ file }) => file)).toContain(tabsFile);
  });
});
