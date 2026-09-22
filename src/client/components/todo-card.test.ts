import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  dynamicClassNames,
  matches,
  parseTsx,
  readMarkup,
  type Markup,
} from "@/test-support/markup";

// Covers epics.md Story 2.3 AC2, AC3, AC4, AC5, AC6 and AC7.
//
// Most of this story's acceptance is an *absence* — no second scrolling
// element, no cue that there is more below, nothing above the add input — and
// an absence has no call site to test. So these are scans over the whole
// markup surface (`src/test-support/markup.ts`) plus `app/globals.css`.

const repositoryRoot = process.cwd();

const cardFile = path.join("src", "client", "components", "todo-card.tsx");
const stickyFile = path.join(
  "src",
  "client",
  "components",
  "sticky-top-block.tsx",
);
const layoutFile = path.join("app", "layout.tsx");

// --- What the scans are looking for -----------------------------------------

/** `overflow-auto` / `overflow-scroll`, on either axis or both. */
const SCROLL_CONTAINER = /^overflow(-[xy])?-(auto|scroll)$/;
/** `overflow-hidden`, on either axis or both. */
const CLIPPING = /^overflow(-[xy])?-hidden$/;
/** Anything that could shade, fade or mask a lower edge. */
const MORE_BELOW_CUE =
  /^(bg-(gradient|linear|radial|conic)|from-|via-|to-|mask|shadow-inner|scrollbar|backdrop-)/;
/** Both ways of holding an element against the viewport. */
const PINNED = /^(sticky|fixed)$/;
/** Widths that can outgrow the card and take the page sideways with them. */
const WIDER_THAN_THE_CARD = /^(w-(screen|dvw|lvw|svw|max|fit)$|min-w-)/;

const markup = readMarkup();
const cardSource =
  markup.find(({ file }) => file === cardFile)?.source ??
  (() => {
    throw new Error(`${cardFile} is not in the markup surface`);
  })();
const globalsCss = readFileSync(
  path.join(repositoryRoot, "app", "globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

// --- The scans find things, so their silence means something ----------------

describe("the scanners are not vacuous", () => {
  const planted: Markup[] = [
    // The variant-prefixed and important-marked spellings are here because
    // they are the ones an anchored pattern misses: `md:overflow-y-auto` is a
    // scroll container on a tablet and nowhere else, which is the version of
    // this bug that would ship.
    { file: "planted.tsx", source: "", classes: ["md:overflow-y-auto"] },
    {
      file: "planted.tsx",
      source: "",
      // `bg-linear-to-t` is Tailwind 4's spelling — the one this repository
      // would actually produce — and `bg-gradient-to-t` is the 3.x spelling an
      // author copying an older snippet would reach for. Both must be caught.
      classes: [
        "overflow-hidden",
        "bg-linear-to-t",
        "bg-gradient-to-t",
        "from-hairline",
        "shadow-inner",
      ],
    },
    {
      file: "planted.tsx",
      source: "",
      classes: ["hover:!fixed", "w-dvw", "min-w-md"],
    },
  ];

  it("catches each shape it is meant to catch when one is planted", () => {
    expect(matches(planted, SCROLL_CONTAINER)).toEqual([
      "planted.tsx:md:overflow-y-auto",
    ]);
    expect(matches(planted, CLIPPING)).toEqual(["planted.tsx:overflow-hidden"]);
    expect(matches(planted, MORE_BELOW_CUE)).toEqual([
      "planted.tsx:bg-linear-to-t",
      "planted.tsx:bg-gradient-to-t",
      "planted.tsx:from-hairline",
      "planted.tsx:shadow-inner",
    ]);
    expect(matches(planted, PINNED)).toEqual(["planted.tsx:hover:!fixed"]);
    expect(matches(planted, WIDER_THAN_THE_CARD)).toEqual([
      "planted.tsx:w-dvw",
      "planted.tsx:min-w-md",
    ]);
  });

  it("is reading real files, not an empty list", () => {
    const files = markup.map(({ file }) => file);
    expect(files).toContain(cardFile);
    expect(files).toContain(stickyFile);
    expect(files).toContain(layoutFile);
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("can see every class in the product, because none is computed", () => {
    // A `className={cn(…)}` contributes nothing to any scan above and reports
    // nothing while doing it, so every wall in this file would keep passing
    // over a component it can no longer read. The one exception is the font
    // variable on `<html>`, which carries no utility class.
    expect(dynamicClassNames(markup)).toEqual([
      `${layoutFile}:{poppins.variable}`,
    ]);
  });
});

// --- AC3: one scrolling element in the product ------------------------------

describe("the page body is the only scrolling element (AC3)", () => {
  it("declares no scroll container anywhere in the markup", () => {
    expect(matches(markup, SCROLL_CONTAINER)).toEqual([]);
  });

  it("clips nowhere but <body>, where it is the page's own horizontal wall", () => {
    // `overflow-x-hidden` on `<body>` is not a nested scroll container: with
    // `<html>` left at `visible`, the used value propagates from the body box
    // to the viewport and the body itself computes back to `visible` (CSS
    // Overflow 3 §3.3). That propagation is also what keeps `position: sticky`
    // working inside the card — the same declaration on any element *below*
    // the body would clip the sticky block instead, which is why this is an
    // allow-list of one rather than a ban on the whole family.
    expect(matches(markup, CLIPPING)).toEqual([
      `${layoutFile}:overflow-x-hidden`,
    ]);
  });

  it("declares no overflow in the stylesheet either", () => {
    expect(globalsCss).not.toMatch(/\boverflow(-[xy])?\s*:/);
  });
});

// --- AC4: nothing cues that there is more below -----------------------------

describe("the card's lower edge leaving the viewport is not cued (AC4)", () => {
  it("adds no fade, mask, inner shadow or region-local scrollbar", () => {
    expect(matches(markup, MORE_BELOW_CUE)).toEqual([]);
  });

  it("keeps the card's shadow an outer one", () => {
    // An `inset` keyword in `--shadow-card` would be an inner shadow on the
    // card — the exact cue DESIGN.md:358 rules out — arriving through the
    // token rather than through a class, where the scan above cannot see it.
    const shadow = globalsCss.match(/--shadow-card:[^;]*;/)?.[0] ?? "";
    expect(shadow).not.toBe("");
    expect(shadow).not.toContain("inset");
  });
});

// --- AC2: the page never scrolls sideways -----------------------------------

describe("nothing can take the page sideways (AC2)", () => {
  it("gives no element a width that can outgrow the card", () => {
    expect(matches(markup, WIDER_THAN_THE_CARD)).toEqual([]);
  });

  it("keeps the horizontal wall on <body>", () => {
    const layout = markup.find(({ file }) => file === layoutFile);
    expect(layout?.classes).toContain("overflow-x-hidden");
  });
});

// --- AC6: one sticky block, and later stories place inside it ---------------

describe("stickiness is declared exactly once (AC6)", () => {
  it("is declared in sticky-top-block.tsx and nowhere else", () => {
    // AC6's real claim is not that something sticks — it is that Epic 3's
    // input and Epic 4's tabs join *this* container rather than re-implement
    // stickiness beside it. A second declaration site is what that failure
    // looks like, so it is the thing under test.
    expect(matches(markup, PINNED)).toEqual([`${stickyFile}:sticky`]);
  });

  it("is not re-declared in the stylesheet", () => {
    expect(globalsCss).not.toMatch(/position\s*:\s*(sticky|fixed)/);
  });
});

// --- AC5 and AC7: the fixed order, and nothing above it ---------------------

describe("the card's children are in DESIGN.md's fixed order (AC5)", () => {
  const sourceFile = parseTsx("todo-card.tsx", cardSource);

  function firstElement(): ts.JsxElement {
    let found: ts.JsxElement | undefined;
    function visit(node: ts.Node) {
      if (found === undefined && ts.isJsxElement(node)) found = node;
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (found === undefined)
      throw new Error("todo-card.tsx renders no element");
    return found;
  }

  it("renders the sticky top block, then the list region, and nothing else", () => {
    const children = firstElement().children.flatMap((child) => {
      if (ts.isJsxElement(child)) {
        return [child.openingElement.tagName.getText(sourceFile)];
      }
      if (ts.isJsxSelfClosingElement(child)) {
        return [child.tagName.getText(sourceFile)];
      }
      return [];
    });
    // The first three regions of the order — add input, error banner region,
    // filter tabs — are the sticky block's occupants, so at the card's own
    // level the order is two children. Nothing renders above the block.
    expect(children).toEqual(["StickyTopBlock", "div"]);
  });

  it("gets the sticky block from the one module that declares it", () => {
    expect(cardSource).toMatch(
      /import \{ StickyTopBlock \} from "\.\/sticky-top-block";/,
    );
  });

  it("renders no text of its own (AC7)", () => {
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

describe("the product name appears in the tab title only (AC7)", () => {
  it("is in app/layout.tsx's metadata", () => {
    const layout = markup.find(({ file }) => file === layoutFile);
    expect(layout?.source).toMatch(/title:\s*"Simple Action"/);
  });

  it("is in no other markup file, as a wordmark, title bar or greeting", () => {
    const offenders = markup
      .filter(({ file }) => file !== layoutFile)
      .filter(({ source }) => source.includes("Simple Action"))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
