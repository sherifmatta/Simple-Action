// The real Tailwind pipeline, run over the real `app/globals.css`.
//
// A test that only reads class strings passes on `max-w-card-max-width` even
// when Tailwind emitted nothing for it, which is the failure mode that
// matters here: an unrecognised utility is dropped silently, not reported.
// So the tests that make claims about what a class *does* compile it and read
// the rule back.
//
// Story 1.2 established the approach in `app/globals.test.ts` and Story 2.3
// used it again in `app/page.test.ts`. Story 2.4 is the third consumer, which
// is where `deferred-work.md`'s standing note about copied test helpers stops
// being theoretical — so the harness moves here beside `markup.ts` rather
// than being pasted a third time.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";

/**
 * Compiles `classes` against the product's own stylesheet and returns the CSS.
 *
 * The caller owns the returned temp directory only insofar as it wants to
 * clean it up; `mkdtempSync` puts it under the OS temp root either way.
 */
export function tailwindCompiler(): {
  base: string;
  compile: (classes: string[]) => Promise<string>;
} {
  const repositoryRoot = process.cwd();
  const base = mkdtempSync(path.join(tmpdir(), "simple-action-tw-"));

  async function compile(classes: string[]): Promise<string> {
    writeFileSync(
      path.join(base, "marker.html"),
      `<div class="${classes.join(" ")}"></div>`,
    );
    const input = `@import "${path.join(repositoryRoot, "app", "globals.css")}";\n@source "${path.join(base, "marker.html")}";\n`;
    const result = await postcss([tailwindcssPostcss({ base })]).process(input, {
      from: path.join(base, "input.css"),
    });
    return result.css;
  }

  return { base, compile };
}

/**
 * The emitted rule for one class, whitespace-collapsed. Throws when Tailwind
 * emitted nothing, because that is the silent failure this harness exists for.
 *
 * Three details carry weight, and the first two are why this is no longer the
 * one-line regex `app/page.test.ts` used to hold.
 *
 * A variant class is escaped in the CSS — Tailwind writes
 * `data-completed:bg-row-complete` as `.data-completed\:bg-row-complete` — so
 * the `:` is matched as an escaped colon rather than as itself, and a variant
 * rule carries a selector tail before the brace (`[data-completed]`,
 * `:is(:where(.group)[data-completed] *)`), so the brace is not adjacent to
 * the class name.
 *
 * The lookahead is what stops that tail from swallowing a *different* class.
 * `[\w-]` alone is not enough: an opacity modifier is written `.bg-card\/50`,
 * so a lookahead that permits `\` and `/` lets `bg-card` match the modified
 * rule whenever Tailwind happens to emit it first.
 *
 * And the body is brace-balanced rather than read up to the first `}`, which
 * is not a refinement — Tailwind v4 emits the shadow utilities with a nested
 * block inside them, so `[^}]*\}` returned a truncated rule for every
 * `shadow-*` class. An assertion against a fragment of a rule is the same
 * silent pass this whole module exists to prevent (2026-09-22 code review).
 */
export function ruleFor(css: string, className: string): string {
  // `:` and `/` are both escaped *in the emitted CSS* — Tailwind writes
  // `group-aria-checked/box:block` as `.group-aria-checked\/box\:block` — so
  // each has to be matched as a backslash plus itself rather than as itself.
  // The `/` half arrived with Story 4.2's first named group; before that no
  // class under test carried one, and a helper that quietly failed to match
  // reported it as "Tailwind emitted no rule", which is the one error message
  // guaranteed to send a reader to the wrong file.
  const escaped = className
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:/g, "\\\\:")
    .replace(/\//g, "\\\\/");
  const opening = css.match(
    new RegExp(`\\.${escaped}(?![\\w\\-\\\\/])[^{}]*\\{`),
  );
  if (opening === null || opening.index === undefined) {
    throw new Error(
      `Tailwind emitted no rule for .${className} — an unrecognised utility is dropped silently, not reported.`,
    );
  }

  let depth = 0;
  let end = css.indexOf("{", opening.index);
  for (; end < css.length; end++) {
    if (css[end] === "{") depth += 1;
    else if (css[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error(`Unbalanced braces in the rule for .${className}`);
  }

  return css.slice(opening.index, end + 1).replace(/\s+/g, " ");
}
