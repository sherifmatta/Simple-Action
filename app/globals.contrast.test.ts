// Every load-bearing contrast pair, recomputed (epics.md Story 6.2 AC11, AC12,
// AC13; DESIGN.md:471-489 "Contrast — every load-bearing pair").
//
// DESIGN.md says of its own table: "Nothing here is asserted; each ratio is
// computed from the two hex values named in the row." Until this file, that
// was a claim about how the table was produced, not something the repository
// could check — the ratios lived in prose and the hex values lived in
// `app/globals.css`, and nothing compared them. A token could drift by a digit
// and every test in the suite would stay green while the table went quietly
// wrong.
//
// So both halves are parsed and the arithmetic is done here:
//
//   the table  -> DESIGN.md, the row's two `{colors.*}` names and its ratio
//   the values -> app/globals.css, the `--color-*` the product actually paints
//
// Neither is retyped into this file. A test that restated the hex values would
// be asserting that DESIGN.md agrees with this file's copy of DESIGN.md, which
// is the failure mode the parsing exists to avoid. The only literals below are
// WCAG 2.x's own constants and the two thresholds.
//
// AC12's pair is called out separately and deliberately. `text-completed` on
// `row-complete` is 4.69:1 against a 4.5:1 floor — 0.19 of headroom in the
// whole design system — and the spec's rule for it is one-directional: if it
// drifts below the floor the story fails, and the table is never edited to
// make it pass.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

const designSource = readFileSync(
  path.join(
    repositoryRoot,
    "docs",
    "planning-artifacts",
    "ux-designs",
    "ux-simple-action-2026-09-20",
    "DESIGN.md",
  ),
  "utf8",
);

const stylesheet = readFileSync(
  path.join(repositoryRoot, "app", "globals.css"),
  "utf8",
);

/** WCAG 2.x, 1.4.3 — normal-size text. */
const TEXT_FLOOR = 4.5;

/** WCAG 2.x, 1.4.11 — user-interface components and graphical objects. */
const NON_TEXT_FLOOR = 3;

/**
 * The `--color-*` custom properties the product actually declares.
 *
 * Read from the stylesheet rather than from a Tailwind compilation: the
 * question here is what hex value is transcribed, and `app/globals.test.ts`
 * already owns the separate question of whether the set matches DESIGN.md.
 */
function declaredColors(): Map<string, string> {
  const colors = new Map<string, string>();
  for (const [, name, value] of stylesheet.matchAll(
    /--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g,
  )) {
    colors.set(name, value.toUpperCase());
  }
  return colors;
}

type ContrastRow = {
  /** The row's source line, for a failure message that can be located. */
  readonly line: string;
  readonly foreground: string;
  readonly background: string;
  /** The ratio DESIGN.md tabulates. */
  readonly tabulated: number;
  readonly criterion: string;
  readonly verdict: string;
};

/**
 * Parse the contrast table out of DESIGN.md.
 *
 * Each row names exactly two `{colors.*}` tokens — the first is what is
 * painted, the second is what it is painted on — carries a ratio like
 * `4.69:1`, possibly bolded, and a criterion and verdict column.
 */
function contrastTable(): ContrastRow[] {
  const heading = designSource.indexOf("### Contrast — every load-bearing pair");
  expect(heading).toBeGreaterThan(-1);

  // The table runs to the next heading of any level. `indexOf("\n## ")` would
  // not match a `###`, so a later subsection whose rows also start
  // `| \`{colors.` would be absorbed into this parse with only the row count
  // below standing between that and a wrong answer.
  const after = designSource.slice(heading);
  const next = after.slice(1).search(/\n#{1,6} /);
  const section = next === -1 ? after : after.slice(0, next + 1);

  const rows: ContrastRow[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("| `{colors.")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    // `["", pair, ratio, criterion, verdict, ""]`
    const [, pair, ratioCell, criterion, verdict] = cells;

    const tokens = [...pair.matchAll(/\{colors\.([a-z-]+)\}/g)].map(
      ([, name]) => name,
    );

    // The first row names two backgrounds for one foreground
    // (`card` / `row-active`), which are the same hex value; the parse takes
    // the first, and "the two surfaces it names are the same colour" below
    // proves they agree.
    expect(tokens.length).toBeGreaterThanOrEqual(2);

    const ratio = ratioCell.match(/(\d+\.\d+):1/);
    expect(ratio).not.toBeNull();

    rows.push({
      line,
      foreground: tokens[0],
      background: tokens[1],
      tabulated: Number(ratio![1]),
      criterion,
      verdict,
    });
  }
  return rows;
}

/** WCAG 2.x relative luminance, from the sRGB definition. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const [r, g, b] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, lighter over darker. */
function contrastRatio(one: string, two: string): number {
  const a = relativeLuminance(one);
  const b = relativeLuminance(two);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const colors = declaredColors();
const table = contrastTable();

describe("the contrast table describes the colours the product declares (AC11)", () => {
  it("parses a table with a row for every load-bearing pair", () => {
    // A parse that silently matched nothing would make every assertion below
    // vacuous — `it.each` over an empty list reports success.
    expect(table.length).toBe(18);
  });

  it("proves the two surfaces the first row names are the same colour", () => {
    // The parse keeps `tokens[1]` and discards the rest, so the row that reads
    // "`{colors.text-primary}` on `{colors.card}` / `{colors.row-active}`"
    // is only checked against `card`. That is sound exactly as long as the two
    // are the same value — and nothing else in the repository says so.
    expect(colors.get("card")).toBe(colors.get("row-active"));
  });

  it("names only tokens that exist in the stylesheet", () => {
    const missing = table.flatMap((row) =>
      [row.foreground, row.background].filter((name) => !colors.has(name)),
    );
    expect(missing).toEqual([]);
  });

  it.each(table.map((row) => [`${row.foreground} on ${row.background}`, row]))(
    "%s matches its tabulated ratio",
    (_name, row) => {
      const computed = contrastRatio(
        colors.get(row.foreground)!,
        colors.get(row.background)!,
      );

      // Two decimal places, which is the precision the table is written to.
      // A failure names the pair, the tabulated figure and the computed one,
      // because "which direction did it drift" is the whole of what the
      // reader needs next.
      expect(
        Number(computed.toFixed(2)),
        `${row.foreground} (${colors.get(row.foreground)}) on ${row.background} (${colors.get(row.background)}): DESIGN.md tabulates ${row.tabulated}:1, computed ${computed.toFixed(2)}:1`,
      ).toBe(row.tabulated);
    },
  );
});

describe("the pair with no headroom (AC12)", () => {
  it("keeps Completed text above the 1.4.3 floor", () => {
    // DESIGN.md marks this "Passes, **no headroom**" — 4.69:1 against 4.5:1.
    // The assertion is deliberately not `toBe(4.69)`; that is the row-by-row
    // test above. This one is the floor itself, so that a drift reads as
    // "Completed text is no longer legible" rather than as "a table entry is
    // stale".
    const computed = contrastRatio(
      colors.get("text-completed")!,
      colors.get("row-complete")!,
    );
    expect(computed).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it("still records the headroom as the tightest in the system", () => {
    const textRows = table.filter((row) => row.criterion === "1.4.3");
    const tightest = textRows.reduce((worst, row) =>
      row.tabulated < worst.tabulated ? row : worst,
    );
    expect([tightest.foreground, tightest.background]).toEqual([
      "text-completed",
      "row-complete",
    ]);
  });
});

describe("the 1.4.11 corrections hold (AC13)", () => {
  it.each([
    ["accent-deep", "row-complete", 4.33],
    ["border-control", "card", 3.28],
    ["accent", "card", 3.91],
  ])("%s on %s clears the non-text floor", (foreground, background, expected) => {
    const computed = contrastRatio(
      colors.get(foreground)!,
      colors.get(background)!,
    );
    expect(Number(computed.toFixed(2))).toBe(expected);
    expect(computed).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
  });

  it("records the pair the design does not use, and why", () => {
    // `accent` on `row-complete` is 2.97:1 and fails 1.4.11. DESIGN.md keeps
    // the row "so nobody re-derives it", and `token-usage.test.ts` is what
    // proves the product never paints it. Here we only confirm the number
    // that makes it a failure is still the number.
    const computed = contrastRatio(
      colors.get("accent")!,
      colors.get("row-complete")!,
    );
    expect(computed).toBeLessThan(NON_TEXT_FLOOR);

    const row = table.find(
      (entry) =>
        entry.foreground === "accent" && entry.background === "row-complete",
    );
    expect(row?.verdict).toContain("Fails");
  });

  it("exempts the hairline, which bounds nothing operable", () => {
    const row = table.find((entry) => entry.foreground === "hairline");
    expect(row?.verdict).toContain("Exempt");
    expect(
      contrastRatio(colors.get("hairline")!, colors.get("card")!),
    ).toBeLessThan(NON_TEXT_FLOOR);
  });
});

describe("the computation itself is right (negative fixtures)", () => {
  // Without these, a `relativeLuminance` that returned a constant would make
  // every assertion above pass against a table of identical ratios.

  it("puts black on white at 21:1 and a colour on itself at 1:1", () => {
    expect(Number(contrastRatio("#000000", "#FFFFFF").toFixed(2))).toBe(21);
    expect(Number(contrastRatio("#2680EB", "#2680EB").toFixed(2))).toBe(1);
  });

  it("is symmetric — the order of the pair cannot change the answer", () => {
    const forward = contrastRatio(
      colors.get("text-completed")!,
      colors.get("row-complete")!,
    );
    const backward = contrastRatio(
      colors.get("row-complete")!,
      colors.get("text-completed")!,
    );
    expect(forward).toBe(backward);
  });

  it("fails when a declared hex drifts by one digit", () => {
    // The drift this whole file exists to catch: `text-completed` one shade
    // lighter, which is invisible on screen and takes the tightest pair in
    // the system under the floor.
    const drifted = contrastRatio("#6F6F8A", colors.get("row-complete")!);
    expect(drifted).toBeLessThan(TEXT_FLOOR);
  });

  it("fails when a tabulated value is mistyped", () => {
    // A table entry that says 4.96 where the colours compute 4.69 — two
    // digits transposed — must not match.
    const computed = contrastRatio(
      colors.get("text-completed")!,
      colors.get("row-complete")!,
    );
    expect(Number(computed.toFixed(2))).not.toBe(4.96);
  });
});
