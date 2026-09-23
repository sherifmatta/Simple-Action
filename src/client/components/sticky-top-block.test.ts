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
    // Story 2.6 filled slot 2 and Story 3.2 filled slot 1. Only the tabs
    // (Epic 4) are still a comment, so this list grows once more, at Story
    // 4.3. An exact list rather than a `toContain`: it counts every JSX tag
    // in the file, so a wrapper element added around an occupant — the usual
    // way a container quietly becomes a component with a layout of its own —
    // shows up here.
    expect(elements()).toEqual(["div", "AddTodo", "ErrorBannerRegion"]);
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

  it("holds the one unfilled slot in the order DESIGN.md fixes", () => {
    // The comment form survives only for slots nobody has filled yet. Story
    // 3.2 filled slot 1, so its comment is gone and the element below has
    // taken over the claim; Story 4.3 AC12 is where the last one goes and the
    // whole assertion converts to element order. The numbering is still
    // pinned rather than the mere sequence — "3." is what proves the tabs go
    // *after* the banner rather than merely somewhere.
    const slots = [...stickySource.matchAll(/\{\/\* (\d)\. ([a-z ]+) —/g)].map(
      ([, index, name]) => `${index}. ${name}`,
    );
    expect(slots).toEqual(["3. filter tabs"]);
  });

  it("places the banner region between the input and the tabs' slot", () => {
    // AC9's tab order — "immediately after the input's position and before
    // the filter tabs" — is element order in the rendered markup. Half of it
    // is real now: Story 3.2 put the field above the banner, which is also
    // what makes the input first in the product's tab order (Story 3.2 AC9,
    // EXPERIENCE.md:194). The other neighbour is still a comment, so that
    // half stays asserted against the slot, which is what lets the claim be
    // made now rather than deferred to the story that adds it. The full
    // conversion to element order is Story 4.3 AC12.
    const input = stickySource.indexOf("<AddTodo");
    const banner = stickySource.indexOf("<ErrorBannerRegion");
    const tabs = stickySource.indexOf("{/* 3. filter tabs");

    expect(input).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(input);
    expect(tabs).toBeGreaterThan(banner);
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
