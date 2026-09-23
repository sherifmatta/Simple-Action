import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { TodoRow } from "@/client/components/todo-row";
import type { Todo } from "@/shared/contract/todo";
import { classNamesOf, parseTsx, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";

// Covers epics.md Story 2.4 AC1-AC6: an Active row in DESIGN.md's recipe, a
// Completed row that changes three cues and its shadow at once, a single
// variant marker every descendant derives from, text that wraps rather than
// truncates, and a row body that is not a click target.
//
// Most of this story is a claim about what a class *does*, so most of these
// assertions compile the real `app/globals.css` through the real Tailwind
// engine and read the emitted rule back. A test that only checked the class
// strings would pass on `data-completed:bg-row-complete` whether or not
// Tailwind understood the variant — and an unrecognised utility is dropped
// silently, not reported. No DOM environment is involved: every criterion here
// is either the shape of the file or the content of a CSS rule, and jsdom
// computes no Tailwind at all. What no test here can reach — that 500
// characters actually wrap on a 320px screen — is Epic 6's, which drives real
// browsers.

const repositoryRoot = process.cwd();
const rowFile = path.join("src", "client", "components", "todo-row.tsx");
const rowSource = readFileSync(path.join(repositoryRoot, rowFile), "utf8");
const sourceFile = parseTsx("todo-row.tsx", rowSource);
const rowClasses = classNamesOf(rowSource, "todo-row.tsx");

const markup = readMarkup();
const productClasses = markup.flatMap(({ classes }) => classes);

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

// One compilation, shared. Every assertion below wants the same stylesheet
// built from the same class list, and compiling it nine times was nine
// identical runs of the Tailwind engine (2026-09-22 code review).
const compiled = compile(productClasses);

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

function attributeNames(): string[] {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node)) found.push(node.name.getText(sourceFile));
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/**
 * Where a rule's selector starts in the emitted CSS.
 *
 * Three pairs in this row are two utilities of the same property on the same
 * element — `hidden`/`group-aria-checked/box:block`, the two checked fills and
 * the two focus rings — so which one wins is decided by the cascade rather
 * than by intent. Specificity settles all three, and source order is the
 * backstop: if a pair ever tied, the wrong half would paint with every other
 * assertion in this file still green, and for the fills that means `accent` on
 * mint at 2.97:1 — the exact WCAG 1.4.11 failure the `accent-deep` step-down
 * exists to prevent.
 *
 * Anchored selectors, not substring probes — a bare `indexOf(".hidden")` would
 * also match `.hiddenish` (2026-09-22 review).
 */
function ruleIndex(css: string, pattern: RegExp): number {
  const found = css.match(pattern);
  if (found === null || found.index === undefined) {
    throw new Error(`no rule matched ${pattern}`);
  }
  return found.index;
}

describe("the row is a list item holding a checkbox and the Todo's text", () => {
  it("renders the checkbox before the text, inside one <li>", () => {
    // Was `["li", "span", "svg", "path", "span"]`. Story 4.2 turns the
    // decorative glyph into the control that toggles, so the first `span` is a
    // `button` — and it is still first, which is AC14's tab order falling out
    // of document order rather than being arranged.
    expect(elements()).toEqual(["li", "button", "svg", "path", "span"]);
  });

  it("renders no copy of its own — the only text is the Todo's", () => {
    // The vocabulary is fixed and the word `Done` is banned everywhere
    // (epic-2-context). The row has no label, no status word and no tooltip:
    // the three visual cues carry the state, so there is nothing to word.
    const text: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && node.getText(sourceFile).trim() !== "") {
        text.push(node.getText(sourceFile).trim());
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(text).toEqual([]);
    expect(rowSource).not.toMatch(/\bDone\b/);
  });
});

describe("an Active row is DESIGN.md's todo-row-active recipe (AC1)", () => {
  it("carries every class the recipe names", async () => {
    const css = await compiled;

    expect(ruleFor(css, "bg-row-active")).toContain("var(--color-row-active)");
    expect(ruleFor(css, "rounded-md")).toContain("var(--radius-md)");
    expect(ruleFor(css, "p-row-padding")).toContain(
      "var(--spacing-row-padding)",
    );
    expect(ruleFor(css, "gap-4")).toContain("var(--spacing-4)");
    expect(ruleFor(css, "min-h-touch-target-min")).toContain(
      "var(--spacing-touch-target-min)",
    );
    expect(ruleFor(css, "shadow-row")).toContain("--tw-shadow:");
    // The typography role, which is four properties rather than a size.
    expect(ruleFor(css, "text-todo-text")).toContain("font-size: 14.5px");
    expect(ruleFor(css, "text-text-primary")).toContain(
      "var(--color-text-primary)",
    );
  });

  it("resolves the recipe's literals to the values DESIGN.md gives", async () => {
    const css = await compiled;
    expect(css).toContain("--spacing-row-padding: 14px");
    expect(css).toContain("--spacing-touch-target-min: 44px");
    expect(css).toContain("--radius-md: 14px");
    expect(css).toContain("--spacing-4: 12px");
  });

  it("would fail if a class stopped resolving, so the above is not vacuous", async () => {
    const css = await compiled;
    expect(() => ruleFor(css, "bg-row-invented")).toThrow(/emitted no rule/);
  });
});

describe("a Completed row changes three cues and its shadow at once (AC2, AC3)", () => {
  it("fills mint, fills the checkbox and strikes the text through", async () => {
    const css = await compiled;

    expect(ruleFor(css, "data-completed:bg-row-complete")).toContain(
      "var(--color-row-complete)",
    );
    // Since Story 4.2 the fill is gated on the control's own `aria-checked`
    // as well as on the row marker — one attribute drives the picture and the
    // accessible state together, so they cannot disagree (AC11).
    expect(
      ruleFor(css, "group-data-completed:aria-checked:bg-accent-deep"),
    ).toContain("var(--color-accent-deep)");
    expect(
      ruleFor(css, "group-data-completed:aria-checked:border-accent-deep"),
    ).toContain("var(--color-accent-deep)");
    expect(ruleFor(css, "group-data-completed:text-text-completed")).toContain(
      "var(--color-text-completed)",
    );

    const strike = ruleFor(css, "group-data-completed:strikethrough-completed");
    expect(strike).toContain("text-decoration-line: line-through");
    expect(strike).toContain("text-decoration-thickness: 1.5px");
    // `currentColor`, because the element already carries the token as a
    // class — DESIGN.md gives the line the colour of the text it strikes
    // through, and naming it twice is two places to be wrong.
    expect(strike).toContain("text-decoration-color: currentColor");
    expect(rowClasses).toContain("group-data-completed:text-text-completed");
  });

  it("re-tints the shadow green rather than lifting the row", async () => {
    const css = await compiled;
    // DESIGN.md:373 — the same recipe re-tinted, so the mint surface's shadow
    // belongs to it. DESIGN.md:376 — elevation never encodes state, so this is
    // the green token and not a larger one.
    const retint = ruleFor(css, "data-completed:shadow-row-complete");
    // The whole rule, not its first fragment. Tailwind nests a block inside
    // the shadow utilities, and until the 2026-09-22 review this helper read
    // only up to the first `}` — enough to see `--tw-shadow:` and not enough
    // to see whether `box-shadow` was ever applied or what the tint was.
    expect(retint).toContain("[data-completed]");
    expect(retint).toContain("rgba(37, 74, 58, 0.34)");
    expect(retint).toContain("box-shadow:");
    // Green, and specifically not the lavender the Active row carries.
    expect(retint).not.toContain("rgba(37, 44, 74");
    expect(css).toContain("--shadow-row-complete:");
    expect(rowClasses).toContain("data-completed:shadow-row-complete");
  });

  it("survives colour being removed, because two cues are not colour (AC3)", async () => {
    const css = await compiled;
    // The checkbox glyph is drawn in both statuses and revealed by the
    // control's own checked state, so the cue is a display change, not a hue.
    // The strikethrough is a line. Either alone reads in greyscale; the mint
    // fill is the third, redundant cue — DESIGN.md:493's 1.4.1 argument for a
    // 1.32:1 fill pair.
    //
    // Was gated on `group-data-completed:`. Story 4.2 moved it onto the named
    // `group/box` for the reason the fill moved: the glyph and `aria-checked`
    // now derive from one attribute, so a bug that breaks the accessible state
    // breaks the picture too rather than hiding behind it.
    expect(ruleFor(css, "group-aria-checked/box:block")).toContain(
      "display: block",
    );
    expect(rowClasses).toContain("hidden");
    expect(rowClasses).toContain("group-aria-checked/box:block");
    expect(rowClasses).toContain("group/box");

    // Both are `display` utilities on the same element, so which one wins is
    // decided by the cascade rather than by intent. Specificity settles it on
    // its own: the variant rule is a class plus
    // `:is(:where(.group\/box)[aria-checked="true"] *)`, and `:where()`
    // contributes nothing while the attribute selector contributes one level,
    // so it is (0,2,0) against `.hidden`'s (0,1,0).
    // Source order is the backstop — see `ruleIndex` above.
    const at = (pattern: RegExp) => ruleIndex(css, pattern);
    expect(
      at(/\.group-aria-checked\\\/box\\:block(?![\w\-\\/])/),
    ).toBeGreaterThan(at(/\.hidden(?![\w\-\\/])/));
  });

  it("draws the checkbox at DESIGN.md's untokenised size and border", async () => {
    const css = await compiled;
    const box = ruleFor(css, "checkbox-box");
    expect(box).toContain("width: 21px");
    expect(box).toContain("height: 21px");
    expect(box).toContain("border-width: 1.75px");
    expect(ruleFor(css, "rounded-sm")).toContain("var(--radius-sm)");
    expect(ruleFor(css, "border-border-control")).toContain(
      "var(--color-border-control)",
    );
    // The checked fill steps down to `accent-deep` on a Completed row because
    // `accent` on mint is 2.97:1 and fails WCAG 1.4.11 (DESIGN.md:412, 491).
    // Was `expect(rowClasses).not.toContain("group-data-completed:bg-accent")`,
    // which pinned the accent-on-Active spelling as *absent* — the state was
    // unreachable while the box was a picture of `todo.completed`. Story 4.2
    // gives it a reachable home on the control's own checked state, which is
    // the `deferred-work.md` entry naming this story.
    expect(rowClasses).toContain("aria-checked:bg-accent");
    expect(rowClasses).toContain("aria-checked:border-accent");
    expect(ruleFor(css, "aria-checked:bg-accent")).toContain(
      "var(--color-accent)",
    );
    expect(ruleFor(css, "aria-checked:border-accent")).toContain(
      "var(--color-accent)",
    );
    // And the two are different colours, or the step-down is decorative.
    expect(css).toContain("--color-accent:");
    expect(css).toContain("--color-accent-deep:");

    // Which of the two paints on a Completed row is the whole 1.4.11
    // argument, and it is decided by the cascade. Specificity settles it —
    // (0,3,0) against (0,2,0) — and source order is the backstop, exactly as
    // it is for the glyph's `hidden`/`block` pair above.
    expect(
      ruleIndex(
        css,
        /\.group-data-completed\\:aria-checked\\:bg-accent-deep(?![\w\-\\/])/,
      ),
    ).toBeGreaterThan(ruleIndex(css, /\.aria-checked\\:bg-accent(?![\w\-\\/])/));
    expect(
      ruleIndex(
        css,
        /\.group-data-completed\\:aria-checked\\:border-accent-deep(?![\w\-\\/])/,
      ),
    ).toBeGreaterThan(
      ruleIndex(css, /\.aria-checked\\:border-accent(?![\w\-\\/])/),
    );
  });

  it("rings the focused checkbox in the hue that clears 1.4.11 on its ground (AC12)", async () => {
    const css = await compiled;

    // `--shadow-focus-on-complete` has been declared since Story 1.2 with
    // zero consumers; this is its first. `app/globals.test.ts` already proves
    // the two rings differ in hue alone, so what is left to assert here is
    // which row gets which — and that both are gated, never chosen in JS.
    expect(rowClasses).toContain("focus-visible:shadow-focus");
    expect(rowClasses).toContain(
      "group-data-completed:focus-visible:shadow-focus-on-complete",
    );
    // Tailwind inlines the shadow recipe rather than referencing the token, so
    // the assertion is on the hue it resolved to — which is the thing AC12 is
    // about. `app/globals.test.ts:325-380` is what proves the two rings differ
    // in hue *alone*; this proves which ring each row gets.
    const ring = ruleFor(css, "focus-visible:shadow-focus");
    expect(ring).toContain(":focus-visible");
    expect(ring).toContain("var(--color-accent)");
    expect(ring).toContain("box-shadow:");

    const ringOnComplete = ruleFor(
      css,
      "group-data-completed:focus-visible:shadow-focus-on-complete",
    );
    expect(ringOnComplete).toContain("[data-completed]");
    expect(ringOnComplete).toContain("var(--color-accent-deep)");
    expect(ringOnComplete).toContain("box-shadow:");

    // Same pair, same cascade question, same backstop: a Completed row's
    // focused checkbox must take the deepened ring, or the ring it draws is
    // the one that measures 2.97:1 on mint.
    expect(
      ruleIndex(
        css,
        /\.group-data-completed\\:focus-visible\\:shadow-focus-on-complete(?![\w\-\\/])/,
      ),
    ).toBeGreaterThan(
      ruleIndex(css, /\.focus-visible\\:shadow-focus(?![\w\-\\/])/),
    );
  });

  it("pads the 21px mark to a 44px hit area without resizing it (AC13)", async () => {
    const css = await compiled;

    // The recipe rather than a class, because `min-w-*` is banned tree-wide
    // and `h-*` over this row's own classes — see the block below. The 44px
    // itself is asserted in `app/globals.test.ts`, which reads the stylesheet
    // rather than the compiled output; here it only has to be *on the box*.
    expect(rowClasses).toContain("checkbox-hit-area");
    const hitArea = ruleFor(css, "checkbox-hit-area");
    expect(hitArea).toContain("position: relative");
    // Still 21px: the hit area contributes nothing to layout, so the mark and
    // the text beside it do not move.
    expect(ruleFor(css, "checkbox-box")).toContain("width: 21px");
  });
});

describe("Completion Status is expressed exactly once (AC4)", () => {
  it("sets the variant marker on the row and nowhere else", () => {
    const markers = attributeNames().filter((name) => name === "data-completed");
    expect(markers).toEqual(["data-completed"]);

    // And the marker is on the outermost element, so every descendant is in
    // its scope. `group` is what the `group-data-` variants below resolve
    // against.
    expect(rowClasses).toContain("group");
  });

  it("is read in one file — no other component re-tests it", () => {
    const readers = markup
      .filter(({ source }) => /\.completed\b/.test(source))
      .map(({ file }) => file);
    expect(readers).toEqual([rowFile]);
  });

  it("derives every status-dependent class from the marker, not from a branch", () => {
    // AR-28. The alternative — picking classes in JavaScript — would also make
    // `className` a computed expression, which `dynamicClassNames()` in
    // `todo-card.test.ts` rejects outright; that guard and this one are the
    // same rule seen from two sides.
    //
    // Story 4.2 widens this twice. The utilities now include the checkbox's
    // own fill, border and focus ring; and the gates now include the control's
    // `aria-checked` and `focus-visible` alongside the row marker. Neither
    // weakens the rule — the guard's purpose was never "no controls", it was
    // "no class picked in JavaScript", and an attribute variant on the control
    // itself is as far from a branch as one on the row.
    const STATUS_UTILITIES =
      /^(bg-row-complete|shadow-row-complete|text-text-completed|strikethrough-completed|bg-accent|border-accent|bg-accent-deep|border-accent-deep|shadow-focus|shadow-focus-on-complete)$/;
    const GATES = new Set([
      "data-completed",
      "group-data-completed",
      "aria-checked",
      "focus-visible",
    ]);

    const statusClasses = rowClasses.filter((name) =>
      STATUS_UTILITIES.test(name.split(":").at(-1) ?? ""),
    );
    // Ten of them since this story: two on the `<li>`, six on the control and
    // two on the text. Exact, not a floor — a class silently dropped from the
    // control is precisely what a floor would let through.
    expect(statusClasses).toHaveLength(10);
    for (const name of statusClasses) {
      const gates = name.split(":").slice(0, -1);
      expect(gates, `${name} must be gated, not chosen`).not.toEqual([]);
      for (const gate of gates) {
        expect(GATES.has(gate), `${name} is gated on an unknown \`${gate}\``).toBe(
          true,
        );
      }
    }
  });
});

describe("a long Todo wraps and the row grows (AC5)", () => {
  it("lets the text shrink below its intrinsic minimum", async () => {
    const css = await compiled;
    // `overflow-wrap: anywhere`, not `break-word`. Only `anywhere` also
    // reduces the min-content contribution, which is what lets this flex cell
    // narrow; `break-word` would break the glyphs and still push the row wide.
    // The usual companion, `min-w-0`, is banned tree-wide by
    // `todo-card.test.ts` as something that can outgrow the card.
    expect(ruleFor(css, "wrap-anywhere")).toContain("overflow-wrap: anywhere");
    expect(rowClasses).toContain("wrap-anywhere");
  });

  it("shortens the Todo's text nowhere in the product", () => {
    // DESIGN.md:338 — Todo text "never truncates with an ellipsis and never
    // clips". These three spellings are the ways to do that and none of them
    // has a legitimate use anywhere in this product, so the scan is tree-wide.
    const banned = /^(truncate$|text-ellipsis$|line-clamp-)/;
    const offenders = markup.flatMap(({ file, classes }) =>
      classes
        .filter((name) => banned.test(name))
        .map((name) => `${file}:${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it("gives the row no ceiling and no way to hold one line", () => {
    // Scoped to the row's own classes, deliberately. A fixed height clips the
    // second line as surely as an ellipsis hides it, and `nowrap` stops the
    // wrap before it starts — but each is legitimate elsewhere: Story 2.6's
    // skeleton rows are a fixed geometry by definition, and DESIGN.md puts
    // the filter tabs' counts "on one line". A tree-wide ban written from
    // this file would have failed both of those stories from a file neither
    // of them touches (2026-09-22 code review).
    const banned = /^(h-|max-h-|whitespace-nowrap$|text-nowrap$|overflow-)/;
    expect(rowClasses.filter((name) => banned.test(name))).toEqual([]);
    // What makes the row grow instead.
    expect(rowClasses).toContain("min-h-touch-target-min");
    expect(rowClasses).toContain("wrap-anywhere");
  });
});

describe("the checkbox is the only control, and the row body is not one (AC6, AC8-AC10, AC14)", () => {
  it("carries exactly one handler, on the checkbox, and no tab stop of its own", () => {
    // Was "carries no handler, no tab stop and no role" — the row body still
    // carries none of those (EXPERIENCE.md:105: there is no editing, so a row
    // click has nothing to open). What changed is that the glyph became the
    // control, so the file now holds exactly one handler and exactly one role.
    const names = attributeNames();
    expect(names.filter((name) => /^on[A-Z]/.test(name))).toEqual(["onClick"]);
    expect(names.filter((name) => name === "role")).toEqual(["role"]);
    // `tabIndex` is absent on purpose (AC14): a `<button>` is focusable
    // already, and any explicit value here would be arranging a tab order that
    // document order gives for free.
    expect(names).not.toContain("tabIndex");
    expect(names).not.toContain("href");
  });

  it("gets Enter and Space from the platform rather than from a key handler", () => {
    // AC9 wants both keys. A native `<input type="checkbox">` activates on
    // Space only, so meeting AC9 with one means hand-writing `onKeyDown` and
    // keeping it in step with the click path. A `<button>` gets both through
    // one `onClick` — which is why the *absence* of a key handler is the
    // assertion, and why `todo-row.render.test.tsx` presses the keys.
    const names = attributeNames();
    expect(names.filter((name) => /^onKey/.test(name))).toEqual([]);
    expect(rowSource).toMatch(/type="button"/);
    // The `<button>` is the one control this row has. Everything else in the
    // original list stays forbidden: a `<label>` would make the row body a
    // click target (EXPERIENCE.md:105), an `<input type="checkbox">` is the
    // activation path this story rejected, and a link or a select in a Todo
    // row is nothing this product has.
    for (const tag of ["a", "input", "label", "select"]) {
      expect(elements(), `${tag} is a control this row does not have`).not.toContain(tag);
    }
  });

  it("exposes Completion Status as a checked state, not as decoration (AC10)", () => {
    // Was "hides the decorative glyph from assistive technology". That was the
    // placeholder Story 2.4 shipped and `deferred-work.md` recorded: a screen
    // reader heard `book dentist` for an Active row and `book dentist` for a
    // Completed one. The control is what puts the status on the accessibility
    // tree, and it does so as a side effect of being a control.
    const names = attributeNames();
    expect(names).not.toContain("aria-hidden");
    expect(names).toContain("aria-checked");
    // Named by the Todo's own text, borrowed from the element that renders it
    // rather than duplicated into a label that could drift from it.
    expect(names).toContain("aria-labelledby");
    expect(names).toContain("id");
    expect(rowSource).toMatch(/role="checkbox"/);
  });
});

// --- What the component actually renders -------------------------------------
//
// The scans above read the file; this renders it. `react-dom/server` runs in
// the node environment Vitest already uses, so the one thing no scan can
// reach — whether the marker actually lands on the element, and only on the
// element, for the status it is meant to — costs no DOM environment and no
// new dependency. A `.ts` test may import a `.tsx` module freely; it is the
// test file's own extension that the `include` glob constrains.
//
// What this still cannot show is layout: whether 500 characters wrap inside
// 320px is a question for a browser, and Epic 6 (6.2, 6.5) owns it.

describe("the rendered row carries the marker and nothing else varies", () => {
  const fixture: Todo = {
    id: "0199a5c5-0000-7000-8000-000000000000",
    text: "book dentist",
    completed: false,
    createdAt: "2026-09-22T09:00:00.000Z",
  };

  const render = (todo: Todo) =>
    renderToStaticMarkup(createElement(TodoRow, { todo, onToggle: () => {} }));

  it("marks a Completed Todo and leaves an Active one unmarked", () => {
    expect(render({ ...fixture, completed: true })).toContain(
      'data-completed="true"',
    );
    expect(render(fixture)).not.toContain("data-completed=");
  });

  it("differs between the two statuses by the two attributes alone (AC4, AC10)", () => {
    // This is AR-28 stated as an equality rather than as a convention: if any
    // cue were picked in JavaScript instead of derived from an attribute,
    // these two strings would differ somewhere else as well.
    //
    // Two attributes since Story 4.2, not one, and that is the criterion
    // rather than a loosening: `data-completed` is the row's variant marker
    // and `aria-checked` is the control's state, and AC11 keys the checkbox's
    // fill on the second precisely so the picture and the accessible state
    // cannot disagree. Everything else about the two renders is still
    // identical.
    const completed = render({ ...fixture, completed: true })
      .replace(' data-completed="true"', "")
      .replace('aria-checked="true"', 'aria-checked="false"');
    expect(completed).toEqual(render(fixture));
  });

  it("names the checkbox with the row's own text element (AC10)", () => {
    const html = render(fixture);
    // Prefixed, because a UUIDv7 usually starts with a digit and an id
    // starting with a digit is legal HTML but not a valid CSS identifier.
    expect(html).toContain(`aria-labelledby="todo-${fixture.id}-text"`);
    expect(html).toContain(`id="todo-${fixture.id}-text"`);
    expect(html).toMatch(/id="[A-Za-z_-]/);
    // Unique per row because the Todo's id is, so two rows in one list cannot
    // borrow each other's name.
    const other = render({ ...fixture, id: "0199a5c5-0000-7000-8000-000000000001" });
    expect(other).not.toContain(`"${fixture.id}-text"`);
  });

  it("renders the Todo's text whole, however long it is (AC5)", () => {
    const long = "x".repeat(500);
    const html = render({ ...fixture, text: long });
    expect(html).toContain(long);
    // Nothing shortens it on the way out — no ellipsis, no slice.
    expect(html).not.toContain("…");
  });

  it("escapes the Todo's text rather than interpreting it", () => {
    const html = render({ ...fixture, text: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
