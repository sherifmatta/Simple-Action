import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { COLLAPSE_MS } from "@/client/motion/motion";
import {
  classNamesOf,
  dynamicClassNames,
  matches,
  matchesWithElement,
  parseTsx,
  readMarkup,
  styleSheetMatches,
} from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";

// Story 5.2's claims about what is *drawn* and what is *declared*: the dialog's
// recipe, the delete control's two presentations, and the three whole-tree
// walls AC15 names, and the two this repository already held.
//
// The behaviour is `delete-dialog.render.test.tsx`'s and
// `todo-row.render.test.tsx`'s. What is here is either the shape of a file or
// the content of a CSS rule, so most of it compiles the real `app/globals.css`
// through the real Tailwind engine and reads the emitted rule back — a test
// that only checked class strings would pass on `dialog-delete` whether or not
// Tailwind understood it, because an unrecognised utility is dropped silently
// rather than reported.
//
// What no test here can reach — that the scrim actually dims the list, that the
// panel actually slides, that 44px is actually tappable — is Epic 6's, which
// drives real browsers.

const repositoryRoot = process.cwd();

const dialogFile = path.join("src", "client", "components", "delete-dialog.tsx");
const rowFile = path.join("src", "client", "components", "todo-row.tsx");
const stickyFile = path.join(
  "src",
  "client",
  "components",
  "sticky-top-block.tsx",
);
const layoutFile = path.join("app", "layout.tsx");

const dialogSource = readFileSync(
  path.join(repositoryRoot, dialogFile),
  "utf8",
);
const dialogSourceFile = parseTsx("delete-dialog.tsx", dialogSource);
const dialogClasses = classNamesOf(dialogSource, "delete-dialog.tsx");
const rowSource = readFileSync(path.join(repositoryRoot, rowFile), "utf8");
const rowClasses = classNamesOf(rowSource, "todo-row.tsx");
const rowSourceFile = parseTsx("todo-row.tsx", rowSource);

/**
 * The delete control's own class list — the row's last `<button>`.
 *
 * Scoped to the one element, because the assertions below are about what this
 * control contributes to the row's flex line, and `classNamesOf` over the whole
 * file would answer with the checkbox's classes and the surface's too.
 */
const deleteControlClasses = (() => {
  const buttons: string[][] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(rowSourceFile) === "button") {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(rowSourceFile) === "className" &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer)
        ) {
          buttons.push(attribute.initializer.text.split(/\s+/).filter(Boolean));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(rowSourceFile);
  const last = buttons.at(-1);
  if (last === undefined) throw new Error("todo-row.tsx renders no button");
  return last;
})();

const markup = readMarkup();
const productClasses = markup.flatMap(({ classes }) => classes);

/** Comments stripped, so the stylesheet may explain itself in prose. */
const globalsCss = readFileSync(
  path.join(repositoryRoot, "app", "globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

// One compilation, shared — every assertion below wants the same stylesheet
// built from the same class list.
const compiled = compile(productClasses);

/** One `@utility` block from the source, read brace-balanced. */
function recipe(name: string): string {
  const opening = globalsCss.indexOf(`@utility ${name} {`);
  expect(opening, `expected @utility ${name} to be declared`).toBeGreaterThan(
    -1,
  );

  let depth = 0;
  let end = globalsCss.indexOf("{", opening);
  for (; end < globalsCss.length; end += 1) {
    if (globalsCss[end] === "{") depth += 1;
    else if (globalsCss[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  expect(depth, `unbalanced braces in @utility ${name}`).toBe(0);

  return globalsCss.slice(opening, end + 1);
}

/** Every JSX element in the dialog, in document order. */
function elements(): string[] {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      found.push(node.tagName.getText(dialogSourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(dialogSourceFile);
  return found;
}

/** The text of the JSX element carrying `name`, e.g. the autofocused button. */
function elementCarrying(name: string): string {
  let found: string | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(dialogSourceFile) === name,
      )
    ) {
      found ??= node.children
        .filter((child) => ts.isJsxText(child))
        .map((child) => child.getText(dialogSourceFile).trim())
        .join("");
    }
    ts.forEachChild(node, visit);
  }
  visit(dialogSourceFile);
  expect(found, `no JSX element carries ${name}`).toBeDefined();
  return found ?? "";
}

/** `element:attribute` for every JSX attribute in the dialog. */
function attributes(): string[] {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node)) {
      const opening = node.parent.parent;
      const element =
        ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)
          ? opening.tagName.getText(dialogSourceFile)
          : "(unknown)";
      found.push(`${element}:${node.name.getText(dialogSourceFile)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(dialogSourceFile);
  return found;
}

// --- The dialog is a native <dialog>, and that is load-bearing --------------

describe("the dialog is the platform's, not a hand-built modal", () => {
  it("renders a <dialog> with a title and exactly two buttons", () => {
    expect(elements()).toEqual(["dialog", "h2", "div", "button", "button"]);
  });

  it("opens it modally, and never non-modally", () => {
    // `show()` opens a non-modal dialog: no top layer, no focus trap, no
    // scrim. The two calls are one character apart and the markup is identical
    // either way, which is why the *source* is scanned as well as the mounted
    // behaviour in the render test.
    expect(dialogSource).toMatch(/\.showModal\(\)/);
    expect(dialogSource).not.toMatch(/\.show\(\)/);
  });

  it("hand-sets neither the modality nor the role", () => {
    // Both come from `showModal()`. Setting `aria-modal` by hand is the
    // classic way to claim a trap that does not exist.
    const names = attributes();
    expect(names).not.toContain("dialog:aria-modal");
    expect(names).not.toContain("dialog:role");
    expect(names).toContain("dialog:aria-labelledby");
  });

  it("traps focus with nothing of its own", () => {
    // No key handler, no focus-cycling, no `inert` on the rest of the tree.
    // "Tab cycles within the dialog only" (EXPERIENCE.md:202) is the platform's
    // to keep, and a hand-written trap beside it would be a second one to keep
    // correct.
    expect(dialogSource).not.toMatch(/onKeyDown|onKeyUp|\binert\b/);
    expect(attributes().filter((name) => name.endsWith(":tabIndex"))).toEqual(
      [],
    );
  });

  it("puts autoFocus on Cancel and on nothing else (AC10)", () => {
    // "Initial focus lands on Cancel, not Delete" (DESIGN.md:430). Read out of
    // the AST because React applies `autoFocus` imperatively and renders no
    // attribute, so the mounted DOM cannot be asked which button carries it.
    expect(elementCarrying("autoFocus")).toBe("Cancel");
    expect(attributes().filter((name) => name.endsWith(":autoFocus"))).toEqual([
      "button:autoFocus",
    ]);
  });

  it("writes the three strings verbatim, and never the banned word", () => {
    // EXPERIENCE.md:80 — `Delete this Todo?` with `Cancel` and `Delete`. Read
    // as JSX text so an attribute cannot stand in for a visible string.
    const text: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && node.getText(dialogSourceFile).trim() !== "") {
        text.push(node.getText(dialogSourceFile).trim());
      }
      ts.forEachChild(node, visit);
    }
    visit(dialogSourceFile);

    expect(text).toEqual(["Delete this Todo?", "Cancel", "Delete"]);
    expect(dialogSource).not.toMatch(/\bDone\b/);
    // "No third button, no checkbox, no 'don't ask again'" (DESIGN.md:430).
    expect(dialogSource).not.toMatch(/don't ask|checkbox|<input/i);
  });
});

// --- DESIGN.md `components.dialog-delete` -----------------------------------

describe("the dialog is DESIGN.md's dialog-delete recipe", () => {
  it("carries every class the recipe names, and each resolves to a token", async () => {
    const css = await compiled;

    expect(dialogClasses).toContain("dialog-delete");
    expect(ruleFor(css, "bg-card")).toContain("var(--color-card)");
    expect(ruleFor(css, "rounded-lg")).toContain("var(--radius-lg)");
    expect(ruleFor(css, "shadow-card")).toContain("--tw-shadow:");
    expect(ruleFor(css, "p-7")).toContain("var(--spacing-7)");
    // The title's role and colour, and the buttons' label role.
    expect(ruleFor(css, "text-dialog-title")).toContain("font-size: 16px");
    expect(ruleFor(css, "text-button-label")).toContain("font-weight: 600");
  });

  it("paints the scrim DESIGN.md's value, on ::backdrop", async () => {
    // `components.dialog-delete.scrim` — a literal with no token name of its
    // own, like the filter tabs' two shadows, and `app/globals.css` is the one
    // file AD-13 allows a literal in. On `::backdrop`, which no class can
    // reach and which no element in the markup has to stand in for.
    const block = recipe("dialog-delete");
    expect(block).toMatch(/&::backdrop\s*\{/);
    expect(block).toContain("rgba(36, 36, 58, 0.32)");

    const css = await compiled;
    expect(css.replace(/\s+/g, " ")).toContain(
      "::backdrop { background-color: rgba(36, 36, 58, 0.32)",
    );
  });

  it("gives both buttons a 44px floor and a pill radius", async () => {
    const css = await compiled;

    // The height half is a class; the width half cannot be, because `min-w-*`
    // is banned tree-wide as something that can outgrow the card.
    expect(dialogClasses.filter((name) => name === "min-h-touch-target-min"))
      .toHaveLength(2);
    expect(dialogClasses.filter((name) => name === "rounded-full")).toHaveLength(
      2,
    );
    expect(dialogClasses.filter((name) => name === "dialog-button")).toHaveLength(
      2,
    );
    expect(ruleFor(css, "dialog-button")).toContain(
      "min-width: var(--spacing-touch-target-min)",
    );
    // `cancel-border` and `confirm-border` are both `1.5px solid`.
    expect(ruleFor(css, "dialog-button")).toContain("border-width: 1.5px");
  });

  it("makes Cancel the outlined one and Delete the filled one", () => {
    // DESIGN.md:430 — Cancel transparent with a `{colors.border-control}` edge
    // and a `{colors.text-muted}` label; Delete solid `{colors.danger-fill}`
    // with an `{colors.on-danger-fill}` label. The asymmetry is the whole
    // point: only one of the two cannot be taken back.
    expect(dialogClasses).toContain("border-border-control");
    expect(dialogClasses).toContain("text-text-muted");
    expect(dialogClasses).toContain("bg-danger-fill");
    expect(dialogClasses).toContain("border-danger-fill");
    expect(dialogClasses).toContain("text-on-danger-fill");
    // And Cancel is drawn with no fill of its own at all.
    expect(dialogClasses.filter((name) => name.startsWith("bg-"))).toEqual([
      "bg-card",
      "bg-danger-fill",
    ]);
  });
});

// --- AC15: the three whole-tree walls ---------------------------------------

describe("the whole markup surface, after this story (AC15)", () => {
  it("fills exactly one element with the danger ramp", () => {
    // "The only filled button in the product, because it is the only
    // interaction that cannot be taken back" (DESIGN.md:430). DESIGN.md:299
    // sanctions exactly two `danger-fill` *surfaces* — this button and the
    // swipe lane — and the lane is deliberately *not* here: it is painted by
    // `@utility delete-lane`, behind a row, by a control that merely opens this
    // dialog. Pinned to the element and not just the file, so the fill cannot
    // migrate onto Cancel.
    expect(matchesWithElement(markup, /^bg-danger-fill$/)).toEqual([
      `${dialogFile}:button:bg-danger-fill`,
    ]);
  });

  it("still computes no className anywhere but the font variable", () => {
    // The swipe, the reveal and the dialog's open state are all attributes and
    // recipes. A `className={cn(…)}` would contribute nothing to any scan in
    // this repository and would contribute it silently.
    expect(dynamicClassNames(markup)).toEqual([
      `${layoutFile}:{poppins.variable}`,
    ]);
  });

  it("still declares stickiness exactly once, and pins nothing else", () => {
    // The reason the dialog is a `<dialog>`: a hand-built modal needs
    // `position: fixed` for its scrim, and a fixed or sticky element here is
    // one that can cover the sticky top block.
    expect(matches(markup, /^(sticky|fixed)$/)).toEqual([
      `${stickyFile}:sticky`,
    ]);
  });

  it("adds no motion utility, so no duration arrives through a class", () => {
    // The reveal's duration is `COLLAPSE_MS`, spelled once in the stylesheet
    // and asserted against the module below. A `duration-200` here would be a
    // timing Tailwind chose rather than one EXPERIENCE.md did.
    expect(
      matches(markup, /^(duration-|delay-|animate-|transition($|-))/),
    ).toEqual([]);
  });

  it("uses no hex literal and no arbitrary-value class in either new file", () => {
    // AD-13, at the two files this story adds to the markup surface.
    for (const file of [dialogFile, rowFile]) {
      const source = markup.find((entry) => entry.file === file)?.source ?? "";
      expect(source, file).not.toBe("");
      expect(source, file).not.toMatch(
        /#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/,
      );
      expect(source, file).not.toMatch(/\b[a-z-]+-\[[^\]]+\]/);
    }
  });
});

// --- The stylesheet, after this story ---------------------------------------

describe("app/globals.css, after this story", () => {
  it("still declares no sticky or fixed position", () => {
    // `showModal()` puts the dialog in the top layer, so the scrim needs no
    // `position: fixed` of its own — which is the wall this story was most
    // likely to have to widen and did not.
    expect(globalsCss).not.toMatch(/position\s*:\s*(sticky|fixed)/);
    expect(styleSheetMatches(/position\s*:\s*(sticky|fixed)/)).toEqual([]);
  });

  it("adds no fade, mask or gradient to the new recipes either", () => {
    expect(
      styleSheetMatches(/\b(mask[a-z-]*|text-overflow|[a-z-]*-gradient)\s*:/),
    ).toEqual([]);
  });

  it("names the new recipes so none can be counted as a typography role", () => {
    // `app/globals.test.ts` counts `@utility text-*` as the ten typography
    // roles, so a recipe called `text-anything` would fail that count.
    for (const name of [
      "delete-lane",
      "row-sliding",
      "delete-hit-area",
      "delete-action",
      "dialog-button",
      "dialog-delete",
    ]) {
      expect(globalsCss).toContain(`@utility ${name} {`);
      expect(name.startsWith("text-")).toBe(false);
    }
  });
});

// --- DESIGN.md `components.delete-action` -----------------------------------

describe("the delete control is DESIGN.md's delete-action recipe", () => {
  it("draws the muted trailing icon that takes the danger hue on hover", async () => {
    const css = await compiled;

    // `icon: {colors.text-muted}`, `icon-hover: {colors.danger-text}`, and
    // `radius: {rounded.md}` — all tokens, and all classes on the element.
    expect(rowClasses).toContain("text-text-muted");
    expect(rowClasses).toContain("hover:text-danger-text");
    expect(ruleFor(css, "hover:text-danger-text")).toContain(
      "var(--color-danger-text)",
    );
    expect(rowClasses).toContain("rounded-md");
  });

  it("takes both focus rings, stepped down on a Completed row (AC6)", async () => {
    const css = await compiled;

    // `focus-ring` and `focus-ring-on-complete`. "A Todo can be deleted in
    // either Completion Status, so this control is reachable on mint and its
    // ring has to clear 3:1 there" (DESIGN.md:446) — `accent` on mint is
    // 2.97:1 and fails WCAG 1.4.11.
    expect(rowClasses).toContain("focus-visible:shadow-focus");
    expect(rowClasses).toContain(
      "group-data-completed:focus-visible:shadow-focus-on-complete",
    );
    expect(
      ruleFor(css, "group-data-completed:focus-visible:shadow-focus-on-complete"),
    ).toContain("var(--color-accent-deep)");
  });

  it("reserves 44px of reach without adding a box to the row (AC7)", async () => {
    const css = await compiled;

    // The same shape as `checkbox-hit-area`, and this is the half of the first
    // attempt that had to be rebuilt. That one put a 44×44 wrapper in the row's
    // flex line, and a row's height is its tallest child plus
    // `{spacing.row-padding}` — so every row in the product went from the 50px
    // mockups/key-delete.html draws to 72px, with nothing in the suite
    // measuring a row.
    //
    // So the 44px lives where `checkbox-hit-area` puts it: in an `::after` that
    // is `position: absolute` and therefore out of flow, contributing nothing
    // to the line it sits in. DESIGN.md:354 — the hit area is padded out to
    // 44px "without changing the mark".
    const hitArea = ruleFor(css, "delete-hit-area");
    expect(hitArea).toContain("position: relative");
    expect(hitArea).toContain("position: absolute");
    expect(hitArea).toContain("var(--spacing-touch-target-min)");
    expect(recipe("delete-hit-area")).toMatch(/&::after\s*\{/);

    // And nothing on the control itself sizes it or pads it, in any variant —
    // which is what leaves the flex line's height to the 21px checkbox that
    // already governed it.
    const sizing = /^(h-|min-h-|max-h-|w-|min-w-|size-|p-|py-|pt-|pb-)/;
    expect(
      deleteControlClasses.filter((name) =>
        sizing.test(name.split(":").at(-1) ?? ""),
      ),
    ).toEqual([]);
  });

  it("draws a mark smaller than the checkbox that sets the row's height (AC7)", async () => {
    const css = await compiled;

    // The second half of the same criterion, and the one that makes "the row's
    // height is what it was before the control existed" true rather than
    // merely likely. The flex line's height is its tallest child: the checkbox
    // is 21px (`checkbox-box`), and the glyph this control draws is 17px, so
    // the line is still the checkbox's and the row is still 21px + two
    // `{spacing.row-padding}`.
    expect(ruleFor(css, "checkbox-box")).toContain("height: 21px");
    const glyph = /width="(\d+)"\s+height="(\d+)"/g;
    const sizes = [...rowSource.matchAll(glyph)].map(([, w, h]) => [
      Number(w),
      Number(h),
    ]);
    expect(sizes.length, "the row draws no sized glyph").toBeGreaterThan(0);
    for (const [width, height] of sizes) {
      expect(width).toBeLessThan(21);
      expect(height).toBeLessThan(21);
    }
  });

  it("uncovers a stationary lane behind the row, rather than pushing one in (AC1)", async () => {
    const css = await compiled;
    const lane = ruleFor(css, "delete-lane");
    const surface = ruleFor(css, "row-sliding");

    // "The row slides left over a stationary action lane — the Delete panel is
    // uncovered, not pushed in" (mockups/key-delete.html:414; DESIGN.md:446;
    // epics.md Story 5.2 AC1). So the lane is pinned to the wrapper's trailing
    // edge and never moves, and the thing that carries a `transform` is the
    // row's own surface.
    expect(lane).toContain("&::before");
    expect(lane).toContain("position: absolute");
    expect(lane).toContain("right: 0");
    expect(lane).toContain("inset-block: 0");
    expect(lane).toContain("var(--color-danger-fill)");
    // `revealed-background` is drawn here rather than as a class, which is what
    // keeps the markup's single `bg-danger-fill` single — see the AC15 wall
    // above. The lane never translates.
    expect(lane).not.toContain("transform");

    // And the lane is hidden at rest by the surface painting over it, which is
    // what `position: relative` on the surface buys: both are positioned, so
    // paint order is tree order and the pseudo-element comes first. Drop it and
    // the lane paints over the row — a red band down the trailing edge of every
    // Todo, with every other assertion in this file still green.
    expect(surface).toContain("position: relative");
    expect(lane).toContain("position: relative");
    expect(lane).not.toContain("z-index");

    // The surface is what travels, and it travels exactly the lane's width, so
    // the lane is wholly uncovered rather than partly.
    expect(surface).toContain('[data-revealed="true"] > &');
    expect(surface).toContain(
      "transform: translateX(calc(-1 * var(--delete-lane-width)))",
    );
    // One declaration of that width, inherited by everything that needs it —
    // the lane's own box, the row's travel and the control's travel back.
    expect(recipe("delete-lane")).toContain("--delete-lane-width: 96px");
    expect(
      [...globalsCss.matchAll(/--delete-lane-width:/g)],
      "the lane's width is declared more than once",
    ).toHaveLength(1);
  });

  it("stands the control still over the lane and paints it on-danger-fill (AC1)", async () => {
    const css = await compiled;
    const rule = ruleFor(css, "delete-action");

    // The control travels back by exactly what the surface travelled forward,
    // so it stands still while the row slides out from under it and ends up
    // over the uncovered lane. One icon for both presentations —
    // `revealed-icon: {colors.on-danger-fill}` (DESIGN.md `delete-action`).
    expect(rule).toContain('[data-revealed="true"] &');
    expect(rule).toContain("transform: translateX(var(--delete-lane-width))");
    expect(rule).toContain("var(--color-on-danger-fill)");
  });

  it("keeps the revealed icon on-danger-fill under a hover (AC1)", async () => {
    const css = await compiled;

    // The collision this rule exists to settle, and it is not hypothetical:
    // `danger-text` and `danger-fill` are the same hex (DESIGN.md:299 holds
    // them as two tokens deliberately), so an icon painted `danger-text` on the
    // revealed lane is an icon at 1:1 on its own ground — invisible, on the one
    // control that deletes something.
    //
    // `.hover\:text-danger-text:hover` is (0,2,0) and Tailwind emits it *after*
    // this recipe, so a plain `[data-revealed="true"] &` at (0,2,0) would lose
    // on source order. The `&:hover` arm is (0,3,0) and wins outright.
    expect(ruleFor(css, "delete-action")).toContain(
      '[data-revealed="true"] &:hover { color: var(--color-on-danger-fill); }',
    );
    // The order that makes the extra arm necessary rather than decorative: if
    // Tailwind ever emitted the hover utility first, specificity would still
    // decide it — but this is the arrangement shipped today.
    expect(css.indexOf(".hover\\:text-danger-text")).toBeGreaterThan(
      css.indexOf(".delete-action"),
    );
  });

  it("gates the hover reveal on capability, and the focus reveal on nothing (AC2, AC3, AC4)", async () => {
    const css = (await compiled).replace(/\s+/g, " ");
    const block = recipe("delete-action").replace(/\s+/g, " ");

    // "Touch and pointer are detected by capability, not by width"
    // (EXPERIENCE.md:245) — a media *feature*, which Tailwind has no variant
    // for, which is why this is a recipe rather than a `hover:` class.
    expect(block).toContain("@media (pointer: fine)");
    expect(block).toContain(".group:hover &");
    expect(block).not.toMatch(/min-width|max-width/);

    // And the focus reveal is outside that query. This is the assertion that
    // matters most in this file: the keyboard route "is mandatory and is not a
    // fallback: it is the WCAG 2.2 AA floor, and a pointer-hover-only or
    // gesture-only affordance would fail it" (EXPERIENCE.md:168). A
    // `:focus-visible` rule nested inside `(pointer: fine)` would take the
    // control away on exactly the devices with no other route to it.
    expect(block).toMatch(/\} &:focus-visible \{/);

    // The compiled sheet is where that is actually decided, so it is checked
    // there too rather than only in the source: the emitted rule is nested, and
    // the focus branch survives with the whole media block cut out of it.
    const rule = ruleFor(css, "delete-action");
    expect(rule).toContain("@media (pointer: fine)");
    const withoutQuery = rule.replace(
      /@media \(pointer: fine\) \{[^{}]*\{[^{}]*\} \}/,
      "",
    );
    expect(withoutQuery).not.toContain("@media");
    expect(withoutQuery).toContain("&:focus-visible { opacity: 1;");

    // Hidden by `opacity`, never by `display` or a branch: the control stays in
    // the tab order whether or not it is shown (AC3), and a control that is not
    // rendered cannot be tabbed to. `pointer-events` is what stops an invisible
    // control from taking a tap it gives no sign of being there for — and it
    // does not affect keyboard focus, which is the route meant to reach it.
    expect(rule).toContain("opacity: 0");
    expect(rule).toContain("pointer-events: none");
    expect(rule).not.toContain("display: none");
    expect(rule).not.toContain("visibility: hidden");
  });

  it("travels for exactly the departure's collapse, and no second duration", async () => {
    const css = (await compiled).replace(/\s+/g, " ");

    // "The same collapse runs on a confirmed delete, without the 400ms hold"
    // (EXPERIENCE.md:161) — the reveal and the removal are one gesture's two
    // halves and read as one speed, which is why `motion.ts` gained no
    // constant for this. CSS cannot read a TypeScript constant, so the number
    // is spelled twice and asserted equal here.
    expect(css).toContain(`transition: transform ${COLLAPSE_MS}ms ease-out`);
    expect(css).not.toContain(`transition: transform ${COLLAPSE_MS + 1}ms`);
    expect(css).toContain(
      `transition: opacity ${COLLAPSE_MS}ms ease-out, transform ${COLLAPSE_MS}ms ease-out`,
    );
    // And both stop moving under reduced motion, from the one marker the motion
    // module sets on the list region.
    expect(recipe("row-sliding")).toContain('[data-still="true"]');
    expect(recipe("delete-action")).toContain('[data-still="true"]');
  });

  it("clips the travel on the lane, only once the row has travelled", async () => {
    const css = await compiled;
    const lane = ruleFor(css, "delete-lane");

    // The half of the row that has slid off the lane has to be cut off at the
    // wrapper's edge. Gated, because "only a lane whose row has travelled needs
    // to clip — everywhere else the row keeps its full soft shadow"
    // (mockups/key-delete.html:266), and because `todo-card.test.ts`'s
    // allow-list names this selector rather than the recipe.
    expect(lane).toContain('&[data-revealed="true"] { overflow: hidden; }');
    expect(lane.replace(/&\[data-revealed="true"\][^}]*\}/, "")).not.toContain(
      "overflow",
    );
    // And no element in the row clips through a class: a row with `overflow`
    // would cut off its own focus rings, and `todo-card.test.ts` holds the
    // tree-wide rule.
    expect(rowClasses.filter((name) => name.startsWith("overflow-"))).toEqual(
      [],
    );
  });
});
