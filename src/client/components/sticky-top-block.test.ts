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
  it("renders the container and its two occupants", () => {
    // Story 2.6 filled slot 2, Story 3.2 filled slot 1 and Story 4.3 filled
    // slot 3, which is the last of them — this list is now complete and does
    // not grow again. An exact list rather than a `toContain`: it counts every
    // JSX tag in the file, so a wrapper element added around an occupant — the
    // usual way a container quietly becomes a component with a layout of its
    // own — shows up here.
    expect(elements()).toEqual([
      "div",
      "AddTodo",
      "ErrorBannerRegion",
      "FilterTabs",
    ]);
  });

  it("writes no copy of its own", () => {
    // Story 1.7's rule for the card, applied to the block: a placeholder is a
    // thing a later story has to remember to delete. An occupant is a
    // component, so every string in the block belongs to the component that
    // owns it — the banner's copy is `error-copy.ts`'s and the input's
    // placeholder is `add-input.tsx`'s, not this file's.
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

  it("leaves no slot standing as a comment (AC12)", () => {
    // The comment form survived only for slots nobody had filled yet, and
    // there are none left. Story 4.3 AC12 retired it: a numbered comment is a
    // thing a later story has to remember to delete, and the claim it was
    // standing in for — the order these three occupants appear in — is now
    // made against the elements themselves in the test below.
    const slots = [...stickySource.matchAll(/\{\/\* (\d)\. ([a-z ]+) —/g)].map(
      ([, index, name]) => `${index}. ${name}`,
    );
    expect(slots).toEqual([]);
  });

  it("orders the three occupants as DESIGN.md fixes them (AC12)", () => {
    // DESIGN.md's vertical order for the block is add input → error banner
    // region → filter tabs, and EXPERIENCE.md:194 makes the same sequence the
    // product's tab order, because for these three it is element order that
    // produces it. Asserted from the rendered elements rather than from source
    // offsets or from a comment: `elements()` walks the JSX, so it cannot be
    // satisfied by a string that happens to appear in the right place, and it
    // fails if an occupant is moved, wrapped or replaced by a placeholder.
    //
    // The container is `elements()[0]`; the three occupants are what follow.
    expect(elements().slice(1)).toEqual([
      "AddTodo",
      "ErrorBannerRegion",
      "FilterTabs",
    ]);
  });
});

describe("the block holds against the viewport on an opaque surface (AC6)", () => {
  const classes = classNamesOf(stickySource, "sticky-top-block.tsx");

  it("carries the four classes that make it do so", () => {
    // A required subset rather than an exact list: Story 3.2 and Story 4.3 put
    // real occupants in here and will need layout classes of their own (a
    // `flex`, a column direction, a gap), and forcing each of them to edit a
    // done story's test to add one buys nothing. What must not change is the
    // behaviour AC6 names, which is these four and the bans below.
    for (const required of ["sticky", "top-0", "z-10", "bg-card"]) {
      expect(classes).toContain(required);
    }
  });

  it("pairs the negative gutter margin with the padding that undoes it", () => {
    // `-mx-gutter` widens the block to the card's border box so a row's
    // shadow passes behind it rather than bleeding into the 18px gutter
    // (DESIGN.md:360). `px-gutter` puts the contents back where they were.
    // One without the other is not half the effect, it is a defect: the bare
    // negative margin pushes the input out into the gutter, and the bare
    // padding indents it twice. So the claim is the pairing rather than the
    // presence of either — asserted in both directions, because a later
    // story removing whichever it thought was spare is what this is for.
    const gutter = (name: string) => classes.includes(name);
    expect(gutter("-mx-gutter")).toBe(gutter("px-gutter"));
    // And they are actually there, so the equality above is not two absences
    // agreeing with each other.
    expect(classes).toContain("-mx-gutter");
    expect(classes).toContain("px-gutter");
  });

  it("gives the block no height of its own", () => {
    // The block is as tall as its occupants make it. Story 6.2 measures that
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
