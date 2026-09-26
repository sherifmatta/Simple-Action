// The nine patterns this product does not have (epics.md Story 6.2 AC21;
// epic-6-context "the banned-pattern list must still hold").
//
// Every one of these is a thing a todo app grows by accident, one reasonable
// commit at a time — a toast because an inline message felt cramped, an undo
// because a delete felt final, infinite scroll because a list got long. The
// list is not a style preference: each entry is a decision the UX documents
// made and gave a reason for, and each would quietly contradict something the
// product already promises. A second `<dialog>` breaks "one dialog, one level
// deep". A toast breaks "the error banner keeps its one fixed region". An
// animation on mount breaks the reserved-height, zero-layout-shift claim the
// skeletons rest on.
//
// `todo-card.test.ts` already bans the fade, mask and inner-shadow family
// around the card's edges, and `motion.test.ts` bans a duration or an
// `animate-` class in markup. This file extends the idea to the nine named
// patterns rather than restating either — where an existing scan already
// holds a line, the test below says so and asserts the *new* half.
//
// Source scans, not DOM: a pattern that is not in the source cannot be on the
// screen, and the absence of a long-press timer is not a thing a browser can
// be asked about. `e2e/audit-responsive.spec.ts` carries the half that only a
// running product can answer — that no toast or undo control ever appears.

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  dynamicClassNames,
  matches,
  opaqueMarkup,
  parseTsx,
  readMarkup,
  readSources,
  styleSheetMatches,
} from "@/test-support/markup";

const markup = readMarkup();
const sources = readSources();

/**
 * Only code reaches the browser.
 *
 * `add-input.test.ts:60` uses the same stripper for the same reason, and
 * `styleSheetMatches` strips CSS comments before matching: this repository
 * documents its decisions at length in prose, so the modules that explain why
 * there is no undo and why there is exactly one `<dialog>` are precisely the
 * modules a naive text scan would convict.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Product source only, comments stripped.
 *
 * Test files are excluded because a ban asserted against its own fixtures is
 * circular — `delete-dialog.render.test.tsx` naturally contains `<dialog`, and
 * `src/test-support/` exists to build one.
 */
const productSources = sources
  .filter(
    ({ file }) =>
      !/\.test\.[tj]sx?$/.test(file) &&
      !file.startsWith("e2e/") &&
      !file.startsWith("src/test-support/"),
  )
  .map(({ file, source }) => ({ file, source: code(source) }));

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

/** `file:match` for every product source line matching `pattern`. */
function sourceHits(pattern: RegExp): string[] {
  return productSources.flatMap(({ file, source }) =>
    [...source.matchAll(pattern)].map(([hit]) => `${file}:${hit}`),
  );
}

describe("the scans are not vacuous", () => {
  it("reads a product tree with markup in it", () => {
    expect(productSources.length).toBeGreaterThan(10);
    expect(classNameLiterals().length).toBeGreaterThan(10);
  });

  it("leaves nothing computed out of reach", () => {
    // Same exception as `todo-card.test.ts:125` — the font variable on
    // `<html>`, which carries no utility class.
    expect(dynamicClassNames(markup)).toEqual([
      "app/layout.tsx:{poppins.variable}",
    ]);
    expect(opaqueMarkup(markup)).toEqual([]);
  });
});

describe("1. nothing is dragged and nothing is reordered", () => {
  it("declares no drag handler and no draggable element", () => {
    // Ordering is newest-first throughout and reconciliation preserves it
    // (epic-6-context). A drag handle would make order a user-owned property
    // the server has no column for.
    expect(sourceHits(/\bonDrag[A-Z]\w*|draggable=|onDrop\b/g)).toEqual([]);
  });

  it("pulls in no drag or sortable library", () => {
    expect(sourceHits(/from "[^"]*(dnd|draggable|sortable)[^"]*"/gi)).toEqual([]);
  });
});

describe("2. there is no bulk action", () => {
  it("offers no select-all, clear-completed or multi-select control", () => {
    // Every mutation in the contract takes exactly one id. A "Clear
    // completed" control would need an endpoint that does not exist, and the
    // optimistic layer's per-entity rollback is built on one-at-a-time.
    expect(
      sourceHits(/\b(selectAll|clearCompleted|deleteAll|bulk[A-Z]\w*)\b/g),
    ).toEqual([]);
  });

  it("renders no checkbox that is not a row's own status control", () => {
    // The only `aria-checked` in the product belongs to a row's completion
    // checkbox; a select-all would be a second one, outside a row.
    const checkboxes = sourceHits(/aria-checked=/g);
    expect(checkboxes).toEqual(["src/client/components/todo-row.tsx:aria-checked="]);
  });
});

describe("3. nothing is revealed by holding", () => {
  it("starts no timer from a pointer or touch press", () => {
    // A long-press menu is the touch pattern the delete reveal deliberately
    // replaced (Story 5.2). Its signature is a timer armed in a press
    // handler, which is also how an accidental menu appears mid-scroll.
    const timers = productSources.flatMap(({ file, source }) => {
      const hits: string[] = [];
      for (const [handler] of source.matchAll(
        /on(PointerDown|TouchStart|MouseDown)=\{[^}]*\}/g,
      )) {
        if (/setTimeout|setInterval/.test(handler)) hits.push(`${file}:${handler}`);
      }
      return hits;
    });
    expect(timers).toEqual([]);
  });

  it("names no long-press anywhere in the product source", () => {
    expect(sourceHits(/longPress|long-press|pressAndHold/gi)).toEqual([]);
  });
});

describe("4. there is no toast", () => {
  it("has one error region and no floating notification", () => {
    // DESIGN.md: "Keep the error banner in its one fixed region under the
    // input / Scatter inline error treatments per row, or use a toast." The
    // banner's region is `sticky-top-block.tsx` slot 2 and nothing else
    // reports a failure.
    expect(sourceHits(/\btoast|snackbar|notification[A-Z]?/gi)).toEqual([]);
  });

  it("positions nothing fixed, which is what a toast would need", () => {
    // `todo-card.test.ts` already bans `fixed` tree-wide as something that
    // covers the sticky block; this states the other reason it is banned.
    expect(matches(markup, /^fixed$/)).toEqual([]);
  });
});

describe("5. nothing can be undone after the fact", () => {
  it("offers no undo control and no restore-from-trash", () => {
    // Delete is confirmed in advance by the dialog rather than reversed
    // afterwards — that is the whole design of Story 5.2. An undo affordance
    // would make the confirmation redundant and needs a server-side tombstone
    // the schema does not have.
    expect(sourceHits(/\bundo\b|\brestoreDeleted\b|\btrash\b/gi)).toEqual([]);
  });

  it("keeps the optimistic restore internal, not a control", () => {
    // Story 5.3 *does* restore a Todo the server refused to delete. That is a
    // rollback, not an undo affordance: it is automatic, it is invisible, and
    // the user never asks for it. The distinction this asserts is that no
    // element offers it.
    const restoreControls = classNameLiterals().filter(({ classes }) =>
      classes.some((name) => /undo/.test(name)),
    );
    expect(restoreControls).toEqual([]);
  });
});

describe("6. the list does not grow as you scroll", () => {
  it("paginates nothing and observes no intersection", () => {
    // The list endpoint returns every Todo for the owner. Infinite scroll
    // would put a second source of truth beside the one cache entry AD-8
    // permits, and a sentinel row would be a second thing for the sticky
    // block to cover.
    //
    // `cursor` is deliberately matched as a pagination *identifier* rather
    // than as a bare word: `\bcursor\b` is satisfied by the hyphen in
    // `cursor-pointer`, so the first legitimate pointer-cursor utility in the
    // markup would be reported as infinite scroll.
    expect(
      sourceHits(
        /IntersectionObserver|useInfiniteQuery|fetchNextPage|\bcursor\s*[:=]|\boffset=/g,
      ),
    ).toEqual([]);
  });

  it("would catch a pagination cursor without catching a CSS one", () => {
    // The distinction above, pinned. Without this the narrowing could be
    // loosened back to `\bcursor\b` and nothing would fail until a
    // `cursor-pointer` was added.
    const pattern = /\bcursor\s*[:=]|\bfetchNextPage\b/g;
    expect("className=\"cursor-pointer\"".match(pattern)).toBeNull();
    expect("const cursor = response.nextCursor".match(pattern)).not.toBeNull();
    expect("await fetchNextPage()".match(pattern)).not.toBeNull();
  });
});

describe("7. nothing is reachable by hover alone", () => {
  it("gives every hover-styled element a focus-visible twin", () => {
    // The delete control is the one affordance that appears on hover, and it
    // is also revealed by focus (Story 5.2) — which is what keeps it reachable
    // from the keyboard. This asserts the rule rather than the instance: any
    // element that styles `hover:` must also style focus, or it is a control
    // a keyboard user cannot discover.
    const hoverOnly = classNameLiterals()
      .filter(({ classes }) => classes.some((name) => name.startsWith("hover:")))
      .filter(
        ({ classes }) => !classes.some((name) => /^(focus|group-data)/.test(name)),
      )
      .map(({ file, classes }) => `${file}:${classes.join(" ")}`);
    expect(hoverOnly).toEqual([]);
  });

  it("actually has a hover-styled element, so the rule is exercised", () => {
    const hovers = classNameLiterals().filter(({ classes }) =>
      classes.some((name) => name.startsWith("hover:")),
    );
    expect(hovers.length).toBeGreaterThan(0);
  });
});

describe("8. one dialog, one level deep", () => {
  it("declares exactly one <dialog> in the product", () => {
    // "One dialog for the whole list rather than one per row" is a property
    // of where the element lives (`todo-list.tsx`), and a second `<dialog>`
    // anywhere is a modal stack — which EXPERIENCE.md forbids and which the
    // focus trap's restore-to-trigger cannot survive.
    const dialogs = productSources.flatMap(({ file, source }) =>
      [...source.matchAll(/<dialog\b/g)].map(() => file),
    );
    expect(dialogs).toEqual(["src/client/components/delete-dialog.tsx"]);
  });

  it("hand-rolls no modal beside it", () => {
    // The other way a second modal arrives: a `role="dialog"` div with a
    // scrim. `todo-card.test.ts` bans `fixed`, which a scrim needs; this bans
    // the role.
    expect(sourceHits(/role="(dialog|alertdialog)"|aria-modal=/g)).toEqual([]);
  });
});

describe("9. nothing animates because it appeared", () => {
  it("keys no animation on mount", () => {
    // The skeletons reserve the row's exact geometry so the swap to real
    // content costs no layout shift; an entry animation would reintroduce the
    // movement that was designed out. `motion.test.ts` bans `animate-`,
    // `transition-` and `duration-` classes in markup — what is added here is
    // the source-level form, a component animating itself as it arrives.
    expect(
      sourceHits(/\banimation:\s*[a-z-]+\s+[\d.]+m?s|\banimate(In|Enter|OnMount)\b/g),
    ).toEqual([]);
  });

  it("declares no keyframes in a component", () => {
    // Scoped to what this scan can actually see. `readSources()` walks `.ts`
    // and `.tsx` only, so asserting "the product has exactly one
    // `@keyframes`" here was asserting it about a file set that contains no
    // CSS at all — and `app/globals.css` in fact declares two
    // (`skeleton-pulse` and `counter-fade-in`), neither of which is an
    // entrance. What belongs here is that no *component* declares one.
    expect(sourceHits(/@keyframes/g)).toEqual([]);
  });

  it("keeps every keyframe in the stylesheet, and none of them keyed to mount", () => {
    // The stylesheet half, read through `styleSheetMatches` — which strips CSS
    // comments, so the prose around these declarations cannot satisfy it.
    const declared = styleSheetMatches(/@keyframes\s+[a-z-]+/g);
    expect(declared.length).toBeGreaterThan(0);

    // Both are resting or feedback states: the skeleton's pulse while a read
    // is in flight, and the character counter's fade as it appears. Neither is
    // an element animating because it mounted, which is what EXPERIENCE.md
    // bans and `motion.test.ts` guards in the markup.
    const names = declared.map((entry) => entry.split(/\s+/).pop());
    expect(names.sort()).toEqual(["counter-fade-in", "skeleton-pulse"]);
  });
});
