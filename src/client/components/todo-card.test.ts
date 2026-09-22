import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  arbitraryProperties,
  classNamesOf,
  dynamicClassNames,
  matches,
  matchesWithElement,
  opaqueMarkup,
  parseTsx,
  readMarkup,
  styleSheetMatches,
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
/** `overflow-hidden` or `overflow-clip`, on either axis or both. */
// `clip` clips exactly as `hidden` does — it merely refuses programmatic
// scrolling — so a clipping ancestor written `overflow-clip` cuts off the
// sticky block just the same, and the narrower pattern let it through.
const CLIPPING = /^overflow(-[xy])?-(hidden|clip)$/;
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
    // Pinned to the element, not just the file: the allow-list exists because
    // the propagation above is a property of `<body>` specifically. Moving the
    // same class to `<html>` — or onto any other element in `app/layout.tsx` —
    // breaks sticky positioning while a file-scoped assertion stays green.
    expect(matchesWithElement(markup, CLIPPING)).toEqual([
      `${layoutFile}:body:overflow-x-hidden`,
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

  it("adds none of them through the stylesheet either", () => {
    // The scans above read `.tsx` only. This epic has started putting
    // component recipes in `globals.css`, so every cue these ACs rule out can
    // now be reintroduced there with every markup scan still green.
    expect(
      styleSheetMatches(/\b(mask[a-z-]*|text-overflow|[a-z-]*-gradient)\s*:/),
    ).toEqual([]);
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
    expect(matchesWithElement(markup, /^overflow-x-hidden$/)).toEqual([
      `${layoutFile}:body:overflow-x-hidden`,
    ]);
  });

  it("declares no page-widening width in the stylesheet either", () => {
    expect(styleSheetMatches(/\b(width|min-width)\s*:\s*(100vw|100dvw|100lvw)/)).toEqual([]);
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
    //
    // Story 2.4 replaced the empty `div` Story 2.3 left with the component
    // that owns the list region. The assertion is still positional and still
    // two entries: what changed is that the region now has a name, because it
    // has contents and a client boundary. Skeletons (2.6), the empty state
    // (2.8) and their suppression on failure (2.7) are branches inside it
    // rather than new children here.
    expect(children).toEqual(["StickyTopBlock", "TodoList"]);
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

// --- The scans' own blind spots ---------------------------------------------
// Every assertion in this file is an absence proved by reading `className`
// string literals out of the AST. These three are what keep that reading
// honest: a class the scans cannot parse, markup they cannot see, and a
// declaration that never passes through a class at all.

describe("the absence scans can actually see the markup they scan", () => {
  it("finds no arbitrary-property class, which no utility pattern can match", () => {
    // `[overflow:auto]` is a scroll container and `md:[position:fixed]` a second
    // pinned block, both written in a form every pattern in this file misses.
    expect(arbitraryProperties(markup)).toEqual([]);
  });

  it("finds no spread attribute, createElement call or inline style", () => {
    // Each is a route to the browser that carries no `className` attribute
    // node, so the scans would go quietly blind rather than fail.
    expect(opaqueMarkup(markup)).toEqual([]);
  });

  it("would catch each of them, so the three assertions above are not vacuous", () => {
    const planted = (code: string): Markup => ({
      file: "planted.tsx",
      source: code,
      classes: classNamesOf(code, "planted.tsx"),
    });

    expect(
      arbitraryProperties([planted(`const a = <div className="md:[overflow:auto]" />;`)]),
    ).toEqual(["planted.tsx:md:[overflow:auto]"]);

    expect(
      opaqueMarkup([planted(`const a = <div {...props} />;`)]),
    ).toHaveLength(1);
    expect(
      opaqueMarkup([planted(`const a = <div style={{ overflow: "auto" }} />;`)]),
    ).toHaveLength(1);
    expect(
      opaqueMarkup([planted(`const a = React.createElement("div", { className: "sticky" });`)]),
    ).toHaveLength(1);

    // And the element-scoped form distinguishes the two elements a file-scoped
    // assertion cannot tell apart.
    expect(
      matchesWithElement(
        [planted(`const a = <html className="overflow-x-hidden" />;`)],
        CLIPPING,
      ),
    ).toEqual(["planted.tsx:html:overflow-x-hidden"]);
  });

  it("declares no positioning in the stylesheet", () => {
    // AC6's "stickiness is declared exactly once" is a markup scan; a
    // `position: sticky` in `globals.css` satisfies it without being seen.
    expect(styleSheetMatches(/\bposition\s*:\s*(sticky|fixed)/)).toEqual([]);
  });
});
