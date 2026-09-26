// Where two tokens are allowed to meet (epics.md Story 6.2 AC14, AC15;
// DESIGN.md:471-489).
//
// `app/globals.contrast.test.ts` proves the ratios in DESIGN.md's table are
// what the declared hex values actually compute to. That is one half of the
// claim. The other half is that the product only ever paints the pairs the
// table clears — and the table contains two rows that are not clearances at
// all:
//
//   accent on row-complete    2.97:1  **Fails** — "the pair this design does
//                                     not use", recorded so nobody re-derives
//                                     it
//   hairline on card          1.28:1  Exempt, and only because it is "purely
//                                     decorative ... no control boundary and
//                                     no information"
//
// A ratio test cannot catch either one. The first is a pair that must not
// occur; the second is a pair whose exemption is conditional on *where* it is
// used, and an exemption that nothing checks is an exemption that quietly
// stops being true the first time someone reaches for a subtle border on a
// button. So both are scans over the rendered markup.
//
// The scans go through `src/test-support/markup.ts` like every other
// whole-tree scan in the repository, including `opaqueMarkup`, which is what
// keeps a computed `className`, a spread or a `style={{…}}` from making the
// absence claims below vacuous.

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  dynamicClassNames,
  matchesWithElement,
  opaqueMarkup,
  parseTsx,
  readMarkup,
} from "@/test-support/markup";

const markup = readMarkup();

/**
 * Every class whose base utility is accent-toned, as `file:element:class`.
 *
 * `matchesWithElement` filters on the *base* utility — variants stripped —
 * but reports the class in full, which is exactly the shape this file needs:
 * the pattern finds the paint, and the reported string still carries the
 * `group-data-completed:` that says which surface it lands on.
 */
const accentClasses = matchesWithElement(markup, /accent/);

/** Every `className` string literal in the markup, one entry per element. */
function classNameLiterals(): { file: string; classes: string[] }[] {
  return markup.flatMap(({ file, source }) => {
    const sourceFile = parseTsx(file, source);
    const found: { file: string; classes: string[] }[] = [];

    function visit(node: ts.Node) {
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(sourceFile) === "className" &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        found.push({
          file,
          classes: node.initializer.text.split(/\s+/).filter(Boolean),
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
  });
}

/** The same, for the focus ring, which is a shadow rather than a colour. */
const focusShadows = matchesWithElement(markup, /^shadow-focus/);

/** A class scoped to a Completed row — the mint surface. */
function onMint(entry: string): boolean {
  return /group-data-completed|row-complete/.test(entry);
}

describe("the scans can see the whole tree", () => {
  it("finds markup to scan", () => {
    // An empty parse makes every absence assertion below pass for the wrong
    // reason.
    expect(markup.length).toBeGreaterThan(10);
  });

  it("leaves no class computed out of reach of the scan", () => {
    // The same guard the other whole-tree scans take: a `className` built at
    // runtime, a `{...props}` spread or an inline `style` is a route around
    // every assertion in this file.
    //
    // The one permitted exception is `todo-card.test.ts:125`'s: the font
    // variable on `<html>`, which carries no utility class and so hides no
    // paint. Spelled the same way here rather than relaxed to a `filter`, so
    // that a *second* computed class shows up as a failure in both files.
    expect(dynamicClassNames(markup)).toEqual(["app/layout.tsx:{poppins.variable}"]);
    expect(opaqueMarkup(markup)).toEqual([]);
  });

  it("actually found the accent and focus classes it is about to judge", () => {
    expect(accentClasses.length).toBeGreaterThan(0);
    expect(focusShadows.length).toBeGreaterThan(0);
  });
});

describe("accent never paints on mint (AC14)", () => {
  it("uses the deep accent, never the bright one, on a Completed row", () => {
    // 2.97:1 against 4.33:1 — the difference between a checkbox that fails
    // 1.4.11 on a Completed row and one that passes it. DESIGN.md keeps the
    // failing row in the table "so nobody re-derives it"; this is what stops
    // anybody needing to.
    const mintAccents = accentClasses.filter(onMint);

    // A failure prints `file:element:class`, so the offending pairing is
    // named rather than counted.
    expect(mintAccents.filter((entry) => !/accent-deep/.test(entry))).toEqual(
      [],
    );

    // And the correct pairings are present — otherwise this would pass just
    // as well against a product that had stopped marking Completed rows.
    expect(mintAccents.length).toBeGreaterThan(0);
  });

  it("keeps the bright accent for surfaces that are not mint", () => {
    // The other direction, so the fix for AC14 cannot be "delete every accent
    // class". `accent` on `card` is 3.91:1 and passes: it is the Active row's
    // checked checkbox, the leading plus glyph and the input's focus edge.
    const elsewhere = accentClasses.filter((entry) => !onMint(entry));
    expect(elsewhere.length).toBeGreaterThan(0);
  });

  it("pairs every on-complete focus ring with the deep shadow", () => {
    // The half that is easy to miss: the ring is a shadow rather than a
    // colour class, so the accent scan above cannot see it.
    // `--shadow-focus` is built from `--color-accent` and
    // `--shadow-focus-on-complete` from `--color-accent-deep`
    // (app/globals.css:113-114), so a focusable descendant of a Completed row
    // must carry the second.
    const mintRings = focusShadows.filter(onMint);
    expect(mintRings.length).toBeGreaterThan(0);
    expect(
      mintRings.filter((entry) => !/shadow-focus-on-complete/.test(entry)),
    ).toEqual([]);
  });

  it("gives every on-complete ring a plain-surface twin, on the same element", () => {
    // A row is only sometimes Completed, so a control carrying the deep ring
    // must carry the bright one too — otherwise it has no visible focus at
    // all while the row is Active (AC20).
    //
    // Compared per element, not in aggregate. A count comparison passes as
    // long as *some* other element carries two rings, which is exactly the
    // invisible-focus regression this test is named for.
    const ringless = classNameLiterals()
      .filter(({ classes }) =>
        classes.some((name) => /group-data-completed:.*shadow-focus/.test(name)),
      )
      .filter(
        ({ classes }) =>
          !classes.some((name) =>
            /^focus-visible:shadow-focus$/.test(name),
          ),
      )
      .map(({ file, classes }) => `${file}: ${classes.join(" ")}`);

    expect(ringless, "a control has a ring on mint but none on a plain row").toEqual(
      [],
    );
  });
});

describe("the hairline bounds nothing operable (AC15)", () => {
  // DESIGN.md exempts this pair from 1.4.11 on a stated condition — "purely
  // decorative separators and placeholder ornament, no control boundary and
  // no information". 1.28:1 is far below any floor, so if the condition ever
  // stops holding the exemption goes with it and the product has an
  // inaccessible control boundary.

  it("appears only on the empty panel and the skeleton fill", () => {
    const hairline = matchesWithElement(markup, /hairline/);
    expect(hairline.sort()).toEqual([
      "src/client/components/empty-state.tsx:div:border-hairline",
      "src/client/components/skeleton-row.tsx:span:bg-hairline",
      "src/client/components/skeleton-row.tsx:span:bg-hairline",
    ]);
  });

  it("bounds no element that can be operated or focused", () => {
    // The exemption's actual condition, asserted rather than trusted. Both
    // sites are non-interactive by construction: a `<div>` panel that renders
    // copy, and two `<span>` placeholders inside a row that is `aria-hidden`
    // while it pulses. Neither is a button, a link, an input or a control
    // with a `tabIndex`.
    const operable = matchesWithElement(markup, /hairline/).filter((entry) =>
      /:(button|a|input|textarea|select|dialog|summary):/.test(entry),
    );
    expect(operable).toEqual([]);
  });

  it("is never the border of a control elsewhere in the tree", () => {
    // The direction this would drift: a control edge that wants to be subtle.
    // `border-control` is the token for that at 3.28:1 and it is what the
    // checkbox, the input, Cancel and the `Enter` hint all use.
    const controlEdges = matchesWithElement(markup, /^border-/).filter((entry) =>
      /:(button|input):/.test(entry),
    );
    expect(controlEdges.length).toBeGreaterThan(0);
    expect(controlEdges.filter((entry) => /hairline/.test(entry))).toEqual([]);
  });
});
