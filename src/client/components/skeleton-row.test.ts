import { rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import {
  dynamicClassNames,
  opaqueMarkup,
  parseTsx,
  readMarkup,
  type Markup,
} from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import { SKELETON_PULSE_MS } from "@/client/motion/motion";
import { SKELETON_ROW_KEYS, SkeletonRow } from "./skeleton-row";

// Covers epics.md Story 2.5 AC5, AC6, AC7 and AC8.
//
// AC6 is a zero-layout-shift claim, and nothing in this suite runs a layout
// engine: jsdom computes no geometry and Tailwind here is compiled, not
// applied. So AC6 is proved *structurally* — as an equality between the
// skeleton row's and the Active row's `<li>` geometry classes, plus the
// one-bar argument the component states in situ — and not as a measurement.
// An actual CLS number belongs to Epic 6's end-to-end pass, which drives real
// browsers. Saying so here is the point: an assertion that reads like a
// measurement and is not one is worse than no assertion.
//
// Everything else is either the shape of the file or the content of a CSS
// rule. The rules are read back out of the real `app/globals.css` compiled
// through the real Tailwind engine, because an unrecognised utility is
// dropped silently rather than reported, and every literal in this story
// lives in a recipe.

const rowFile = path.join("src", "client", "components", "todo-row.tsx");
const skeletonFile = path.join("src", "client", "components", "skeleton-row.tsx");

const markup = readMarkup();

function markupOf(file: string): Markup {
  const found = markup.find((entry) => entry.file === file);
  if (found === undefined) throw new Error(`${file} is not in the markup surface`);
  return found;
}

const skeletonSource = markupOf(skeletonFile).source;
const skeletonClasses = markupOf(skeletonFile).classes;

/** The class literal on the first `<tag>` in a file, split into classes. */
function classesOn(file: string, tag: string): string[] {
  const source = markupOf(file).source;
  const sourceFile = parseTsx(path.basename(file), source);
  let found: string[] | undefined;

  function visit(node: ts.Node) {
    if (
      found === undefined &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === tag
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "className" &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer)
        ) {
          found = attribute.initializer.text.split(/\s+/).filter(Boolean);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (found === undefined) throw new Error(`${file} has no <${tag} className="…">`);
  return found;
}

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));
const compiled = compile(markup.flatMap(({ classes }) => classes));
/** The whole stylesheet on one line, for the nested rules `ruleFor` cannot key. */
const flattened = compiled.then((css) => css.replace(/\s+/g, " "));

function elements(): string[] {
  const sourceFile = parseTsx("skeleton-row.tsx", skeletonSource);
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

// --- AC5/AC6: the same geometry, class for class ----------------------------

describe("a skeleton row is an Active row's geometry exactly (AC5, AC6)", () => {
  // The markers are not geometry: `group` is `todo-row.tsx`'s hook for its
  // `group-data-` variants, `skeleton-row` is this component's hook for the
  // recipe, and `row-departing` is the row's hook for the collapse it leaves
  // by — all three name a behaviour rather than describe a box. A skeleton
  // has no departure to make: it is a placeholder for a row that has not
  // arrived, and nothing can toggle it out of a Filter View. Everything else
  // on either `<li>` that is not gated on a Completion Status variant *is*
  // the geometry, and the two must agree.
  const MARKERS = new Set(["group", "skeleton-row", "row-departing"]);
  const geometryOf = (classes: string[]) =>
    classes.filter((name) => !name.includes(":") && !MARKERS.has(name)).sort();

  it("carries the same fill, radius, padding, shadow, height, layout and gap", () => {
    expect(geometryOf(classesOn(skeletonFile, "li"))).toEqual(
      geometryOf(classesOn(rowFile, "li")),
    );
  });

  it("pins what that set is, so dropping a class from both is not a pass", () => {
    // An equality between two files passes when both lose the same class.
    // This is the third copy that makes the first two mean something —
    // DESIGN.md `components.skeleton-row`: "same fill, same {rounded.md},
    // same padding, same row shadow, same minimum height".
    expect(geometryOf(classesOn(rowFile, "li"))).toEqual(
      [
        "flex",
        "min-h-touch-target-min",
        "items-center",
        "gap-4",
        "rounded-md",
        "bg-row-active",
        "p-row-padding",
        "shadow-row",
      ].sort(),
    );
  });

  it("would notice a dropped class, so the equality is not vacuous", () => {
    const without = classesOn(skeletonFile, "li").filter(
      (name) => name !== "shadow-row",
    );
    expect(geometryOf(without)).not.toEqual(geometryOf(classesOn(rowFile, "li")));
  });

  it("renders three rows, which is DESIGN.md's count", () => {
    expect(SKELETON_ROW_KEYS).toHaveLength(3);
    expect(new Set(SKELETON_ROW_KEYS).size).toBe(3);
  });

  it("holds one bar, not two — which is what keeps the swap free", () => {
    // An Active row's content box is governed by the 21px checkbox, so one
    // 12px bar sits inside it; a second stacked bar would push the content
    // box past 21px and move every row down when the real list arrived.
    // Structural, like AC6 itself: this counts elements, it does not measure
    // them.
    expect(elements()).toEqual(["li", "span", "span"]);
  });
});

// --- AC7: the recipe's literals, read back out of the stylesheet ------------

describe("the placeholders are DESIGN.md's fills at the mockup's geometry", () => {
  it("stands a block in for the checkbox at the checkbox's own size", async () => {
    const css = await compiled;
    const sizeOf = (rule: string) => ({
      width: rule.match(/width: ([^;]+);/)?.[1],
      height: rule.match(/height: ([^;]+);/)?.[1],
    });
    const placeholder = sizeOf(ruleFor(css, "skeleton-box"));
    const control = sizeOf(ruleFor(css, "checkbox-box"));

    // Compared to the real checkbox, not to a second copy of its number.
    // The placeholder is what governs the row's content box, so if
    // `checkbox-box` ever moves off 21px the skeleton has to move with it —
    // and a re-typed literal here would keep passing while the swap started
    // shifting layout.
    expect(placeholder).toEqual(control);
    // DESIGN.md `components.checkbox` — `size: 21px`. The literal lives on
    // the `checkbox-box` side only, which is the side DESIGN.md names.
    expect(control).toEqual({ width: "21px", height: "21px" });
    // No border-width: a skeleton draws no control edge.
    expect(ruleFor(css, "skeleton-box")).not.toContain("border-width");
    expect(ruleFor(css, "rounded-sm")).toContain("var(--radius-sm)");
    expect(skeletonClasses).toContain("flex-none");
  });

  it("stands one 12px bar in for the text, at 70% of the row", async () => {
    const css = await compiled;
    const bar = ruleFor(css, "skeleton-bar");
    expect(bar).toContain("height: 12px");
    expect(bar).toContain("width: 70%");
    expect(ruleFor(css, "rounded-full")).toContain("var(--radius-full)");
  });

  it("rests at the hairline fill DESIGN.md names, as a token", async () => {
    const css = await compiled;
    // `placeholder-fill: {colors.hairline}` — a utility class on the element,
    // not a literal in the recipe, which is the rule the recipes state.
    expect(ruleFor(css, "bg-hairline")).toContain("var(--color-hairline)");
    expect(skeletonClasses.filter((name) => name === "bg-hairline")).toHaveLength(2);
  });

  it("pulses toward tab-track and staggers the three rows", async () => {
    const flat = await flattened;
    // The duration comes from the module, not from a third transcription of
    // it — `deferred-work.md` already records that this value has two homes.
    expect(flat).toContain(
      `.skeleton-row > * { animation: skeleton-pulse ${SKELETON_PULSE_MS}ms ease-in-out infinite; }`,
    );
    // Keyed on adjacency between skeleton rows, not on `:nth-child` of the
    // region: Story 3.3 puts an optimistic row above them during load, and
    // under `:nth-child` that row would take the first skeleton's delay.
    expect(flat).toContain(
      ".skeleton-row + .skeleton-row > * { animation-delay: 120ms; }",
    );
    expect(flat).toContain(
      ".skeleton-row + .skeleton-row + .skeleton-row > * { animation-delay: 240ms; }",
    );
    // "staggered a little so the pulse is not a single flat beat".
    expect(flat).toContain("@keyframes skeleton-pulse { 0%, 100% { background-color: var(--color-hairline); } 50% { background-color: var(--color-tab-track); } }");
  });

  it("varies the bar width by position, and only by position", async () => {
    const flat = await flattened;
    // The mockup's 70% / 52% / 61%. In CSS because a component cannot express
    // it: a computed `className` fails `dynamicClassNames`, an inline `style`
    // fails `opaqueMarkup`, and an arbitrary-value width class fails the
    // AD-13 scan in `app/page.test.ts`.
    // Targeted by name rather than as `> :last-child`, so a third
    // placeholder added to a row cannot silently take the width.
    expect(flat).toContain(
      ".skeleton-row + .skeleton-row > .skeleton-bar { width: 52%; }",
    );
    expect(flat).toContain(
      ".skeleton-row + .skeleton-row + .skeleton-row > .skeleton-bar { width: 61%; }",
    );
  });
});

// --- AC8: stillness comes from the marker, not from a second media query ----

describe("reduced motion holds the pulse still and keeps the geometry (AC8)", () => {
  it("suppresses the animation under the list region's marker", async () => {
    const flat = await flattened;
    // The value is required and the region is the row's own parent: matching
    // on attribute presence would freeze `data-still="false"` too, and
    // matching from any depth would let an unrelated ancestor do it.
    expect(flat).toContain('[data-still="true"] > .skeleton-row > * { animation: none; }');
  });

  it("wins on specificity, because it cannot rely on source order", async () => {
    const flat = await flattened;
    // `[data-still] .skeleton-row > *` is (0,2,0) against the pulse rule's
    // (0,1,0). That has to be the whole guarantee: the production minifier
    // *reverses* these two, emitting the suppression first — verified in
    // `.next/static/chunks/*.css` on this story's build — so an order
    // assertion here would pass while describing the opposite of what ships.
    // `todo-row.test.ts` asserts order as a backstop for its checkmark cue;
    // this one deliberately does not, and the difference is that one of them
    // survives minification and the other does not.
    const suppression = flat.match(/([^{}]*)\.skeleton-row > \* \{ animation: none/);
    expect(suppression, "the suppression rule is gone").not.toBeNull();
    expect(suppression![1]).toContain('[data-still="true"] >');
  });

  it("leaves the geometry alone — stillness removes motion, not the row", async () => {
    const flat = await flattened;
    const suppression = flat.slice(
      flat.indexOf('[data-still="true"] > .skeleton-row > * {'),
    );
    const body = suppression.slice(0, suppression.indexOf("}") + 1);
    expect(body).toContain("animation: none");
    expect(body).not.toContain("display");
    expect(body).not.toContain("height");
    expect(body).not.toContain("width");
    // And the resting fill is the element's own token class, so it survives.
    expect(skeletonClasses).toContain("bg-hairline");
  });
});

// --- The whole-tree walls Story 2.3 built still hold ------------------------

describe("the component adds nothing the absence scans cannot see", () => {
  it("computes no class name and opens no route around the scans", () => {
    // The two walls Story 2.3 built, asserted from the file that most wanted
    // to break them: three rows that differ would be a `clsx` call or an
    // inline `style` in almost any other implementation.
    expect(dynamicClassNames([markupOf(skeletonFile)])).toEqual([]);
    expect(opaqueMarkup([markupOf(skeletonFile)])).toEqual([]);
  });

  it("uses no hex literal and no arbitrary-value class, comments included", () => {
    // `app/page.test.ts` scans the whole markup surface for both; this is the
    // same assertion at the file that introduces the untokenised values, so
    // the failure names this file rather than a scan over eight others.
    expect(skeletonSource).not.toMatch(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/);
    expect(skeletonSource).not.toMatch(/\b[a-z-]+-\[[^\]]+\]/);
  });

  it("reads no preference and names no duration of its own", () => {
    expect(skeletonSource).not.toMatch(/\bmatchMedia\b/);
    expect(skeletonSource).not.toMatch(/prefers-reduced-motion/);
    expect(skeletonSource).not.toMatch(/\b\d+(?:\.\d+)?ms\b/);
  });
});

// --- What the component actually renders ------------------------------------

describe("the rendered skeleton row is inert and says nothing", () => {
  const html = renderToStaticMarkup(createElement(SkeletonRow));

  it("is one list item holding two empty placeholders", () => {
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html.match(/<span/g)).toHaveLength(2);
    // No copy, no glyph, nothing to read — a placeholder is a picture of a
    // row, and what the region announces while it loads is Story 2.6's.
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("is hidden from assistive technology", () => {
    expect(html).toContain('aria-hidden="true"');
  });

  it("carries no control, no handler and no tab stop", () => {
    for (const tag of ["button", "a", "input", "label", "svg"]) {
      expect(elements(), `${tag} is not part of a placeholder`).not.toContain(tag);
    }
    expect(skeletonSource).not.toMatch(/\bonClick\b/);
    expect(skeletonSource).not.toMatch(/\btabIndex\b/);
  });
});
