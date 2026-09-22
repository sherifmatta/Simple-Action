import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { classNamesOf, parseTsx } from "@/test-support/markup";

// Covers epics.md Story 2.3 AC6: the block holds at the top of the viewport on
// an opaque `card` surface while the list runs underneath it, and in this epic
// its only occupant is the error banner region.
//
// What the block *compiles to* — `position: sticky`, `top: 0`, an opaque
// `--color-card` — is asserted in `app/page.test.ts`, which already drives the
// real Tailwind engine over the real `app/globals.css`. What is asserted here
// is the shape of the container itself: one element, the four classes that
// make it behave, and no occupant. `todo-card.test.ts` holds the rule that
// this is the only file in the product that declares stickiness at all.

const repositoryRoot = process.cwd();
const stickyFile = path.join(
  "src",
  "client",
  "components",
  "sticky-top-block.tsx",
);
const stickySource = readFileSync(
  path.join(repositoryRoot, stickyFile),
  "utf8",
);
const sourceFile = parseTsx("sticky-top-block.tsx", stickySource);

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

describe("the sticky top block is a container, not a component with contents", () => {
  it("renders exactly one element", () => {
    expect(elements()).toEqual(["div"]);
  });

  it("renders no occupant and no placeholder", () => {
    // Story 1.7's rule for the card, applied to the block: a placeholder is a
    // thing a later story has to remember to delete. The three slots are
    // comments, so the input (Epic 3), the banner region (Story 2.7) and the
    // tabs (Epic 4) each add markup rather than replace someone else's.
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

  it("names the three slots in the order DESIGN.md fixes", () => {
    // The order is the whole content of this file today, so it is the thing
    // worth pinning: a story that inserts its markup in the wrong place would
    // otherwise be caught only once all three occupants exist.
    const slots = [...stickySource.matchAll(/\{\/\* (\d)\. ([a-z ]+) —/g)].map(
      ([, index, name]) => `${index}. ${name}`,
    );
    expect(slots).toEqual([
      "1. add input",
      "2. error banner region",
      "3. filter tabs",
    ]);
  });
});

describe("the block holds against the viewport on an opaque surface (AC6)", () => {
  const classes = classNamesOf(stickySource, "sticky-top-block.tsx");

  it("carries the four classes that make it do so", () => {
    // A required subset rather than an exact list: Story 3.3 and Story 4.4 put
    // real occupants in here and will need layout classes of their own (a
    // `flex`, a column direction, a gap), and forcing each of them to edit a
    // done story's test to add one buys nothing. What must not change is the
    // behaviour AC6 names, which is these four and the bans below.
    for (const required of ["sticky", "top-0", "z-10", "bg-card"]) {
      expect(classes).toContain(required);
    }
  });

  it("gives the block no height of its own", () => {
    // The block is as tall as its occupants make it. Story 6.1 measures that
    // height live to size `scroll-padding-top` (UX-DR21), so a constant here
    // would be a second source of truth for it to disagree with.
    expect(classes.filter((name) => /^(h-|min-h-|max-h-)/.test(name))).toEqual(
      [],
    );
  });

  it("applies no opacity modifier to the surface", () => {
    // DESIGN.md:360 — an opaque surface rather than a translucent one. A
    // `bg-card/80` would still satisfy the `toContain` above, so the bans are
    // what carry the claim.
    expect(classes.filter((name) => name.startsWith("bg-"))).toEqual([
      "bg-card",
    ]);
    expect(stickySource).not.toMatch(/bg-card\//);
    expect(stickySource).not.toMatch(/\bopacity-/);
  });
});
