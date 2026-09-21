import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";
import { describe, expect, it } from "vitest";

// Matrix rows covered here (spec-1-2-transcribe-design-tokens-load-typeface.md,
// frozen `## I/O & Edge-Case Matrix`):
//   - "Theme completeness"
//   - "Focus ring on a Completed row"
//   - "`rounded.full` token"
// The "Font swap" row lives in app/layout.test.ts (it inspects a different
// file). The "Hex/arbitrary-value sweep" row is deliberately NOT here: the
// spec's frozen Boundaries say it "stays a one-time verified sweep, not a CI
// gate" — see Verification in the spec for that one-time check.

const globalsCssPath = path.resolve(process.cwd(), "app/globals.css");
const css = readFileSync(globalsCssPath, "utf8");

// DESIGN.md frontmatter, `colors:` (21 tokens).
const expectedColors = [
  "ground",
  "card",
  "row-active",
  "row-complete",
  "accent",
  "accent-deep",
  "on-accent",
  "text-primary",
  "text-muted",
  "text-completed",
  "text-placeholder",
  "hairline",
  "border-control",
  "danger-bg",
  "danger-border",
  "danger-text",
  "danger-fill",
  "on-danger-fill",
  "tab-track",
  "tab-selected-bg",
  "tab-selected-text",
];

// DESIGN.md frontmatter, `rounded:` (4 tokens).
const expectedRadii = ["sm", "md", "lg", "full"];

// DESIGN.md frontmatter, `spacing:` (8 numbered + 6 named = 14 tokens).
const expectedSpacing = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "row-gap",
  "row-padding",
  "gutter",
  "margin-phone",
  "touch-target-min",
  "card-max-width",
];

// DESIGN.md frontmatter, `typography:` (10 roles), transcribed as
// `@utility text-<role>` custom utilities per this story's Design Notes.
const expectedTypographyRoles = [
  "dialog-title",
  "todo-text",
  "input-text",
  "empty-message",
  "empty-sub",
  "banner-message",
  "tab-label",
  "tab-label-selected",
  "button-label",
  "counter",
];

function extractColors(source: string): string[] {
  return [...source.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
}

function extractRadii(source: string): string[] {
  return [...source.matchAll(/--radius-([a-z0-9-]+):/g)].map((m) => m[1]);
}

function extractSpacing(source: string): string[] {
  return [...source.matchAll(/--spacing-([a-z0-9-]+):/g)].map((m) => m[1]);
}

function extractTypographyRoles(source: string): string[] {
  return [...source.matchAll(/@utility text-([a-z-]+)\s*\{/g)].map((m) => m[1]);
}

describe("app/globals.css — theme completeness (AD-13 transcription)", () => {
  it("declares exactly 21 named --color-* custom properties, all from DESIGN.md", () => {
    const declared = extractColors(css);
    expect(declared).toHaveLength(21);
    for (const name of expectedColors) {
      expect(declared, `expected --color-${name} to be declared`).toContain(name);
    }
  });

  it("declares exactly 4 named --radius-* custom properties, all from DESIGN.md", () => {
    const declared = extractRadii(css);
    expect(declared).toHaveLength(4);
    for (const name of expectedRadii) {
      expect(declared, `expected --radius-${name} to be declared`).toContain(name);
    }
  });

  it("declares exactly 14 named --spacing-* custom properties, all from DESIGN.md", () => {
    const declared = extractSpacing(css);
    expect(declared).toHaveLength(14);
    for (const name of expectedSpacing) {
      expect(declared, `expected --spacing-${name} to be declared`).toContain(name);
    }
  });

  it("declares exactly 10 typography-role @utility classes, all from DESIGN.md", () => {
    const declared = extractTypographyRoles(css);
    expect(declared).toHaveLength(10);
    for (const role of expectedTypographyRoles) {
      expect(declared, `expected @utility text-${role} to be declared`).toContain(role);
    }
  });

  it("every typography role references the shared --font-sans token, not a hardcoded family", () => {
    for (const role of expectedTypographyRoles) {
      const match = css.match(new RegExp(`@utility text-${role}\\s*\\{([^}]*)\\}`));
      expect(match, `expected to find the text-${role} utility body`).not.toBeNull();
      expect(match![1]).toContain("font-family: var(--font-sans);");
    }
  });

  it("--font-sans itself resolves through var(--font-poppins), the variable next/font declares", () => {
    const match = css.match(/--font-sans:\s*([^;]+);/);
    expect(match, "expected --font-sans to be declared").not.toBeNull();
    expect(match![1]).toContain("var(--font-poppins)");
  });
});

describe("app/globals.css — negative fixtures prove the completeness guard can fail", () => {
  it("catches a missing colour token", () => {
    const mutated = css.replace("--color-hairline: #E3E2F0;\n", "");
    const declared = extractColors(mutated);
    expect(declared).toHaveLength(20);
    expect(declared).not.toContain("hairline");
  });

  it("catches a missing radius token", () => {
    const mutated = css.replace("--radius-full: 999px;\n", "");
    const declared = extractRadii(mutated);
    expect(declared).toHaveLength(3);
    expect(declared).not.toContain("full");
  });

  it("catches a missing spacing token", () => {
    const mutated = css.replace("--spacing-gutter: 18px;\n", "");
    const declared = extractSpacing(mutated);
    expect(declared).toHaveLength(13);
    expect(declared).not.toContain("gutter");
  });

  it("catches a missing typography role", () => {
    const mutated = css.replace(
      /@utility text-counter\s*\{[^}]*\}\n?/,
      "",
    );
    const declared = extractTypographyRoles(mutated);
    expect(declared).toHaveLength(9);
    expect(declared).not.toContain("counter");
  });
});

describe("app/globals.css — focus ring hue-only difference", () => {
  function shadowValue(source: string, name: string): string {
    const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`));
    expect(match, `expected --${name} to be declared`).not.toBeNull();
    return match![1].trim();
  }

  // Strip out every colour reference (a `var(--color-*)` token or an
  // `rgba(...)` literal) so what's left is pure geometry: offsets, blur,
  // spread, repeated once per box-shadow layer.
  function stripColors(value: string): string {
    return value.replace(/var\(--color-[a-z0-9-]+\)|rgba\([^)]*\)/g, "<color>");
  }

  function colorTokens(value: string): string[] {
    return [...value.matchAll(/var\(--color-[a-z0-9-]+\)|rgba\([^)]*\)/g)].map((m) => m[0]);
  }

  function rgbaAlpha(rgba: string): string {
    const match = rgba.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    expect(match, `expected ${rgba} to be an rgba() literal`).not.toBeNull();
    return match![1];
  }

  const focus = shadowValue(css, "shadow-focus");
  const focusOnComplete = shadowValue(css, "shadow-focus-on-complete");

  it("has identical non-colour geometry (offsets, blur, spread) in both variants", () => {
    expect(stripColors(focusOnComplete)).toBe(stripColors(focus));
  });

  it("uses --color-accent for the default ring and --color-accent-deep for -on-complete", () => {
    const [focusSolid] = colorTokens(focus);
    const [completeSolid] = colorTokens(focusOnComplete);
    expect(focusSolid).toBe("var(--color-accent)");
    expect(completeSolid).toBe("var(--color-accent-deep)");
  });

  it("keeps the bloom's opacity identical between variants and changes only its hue", () => {
    const [, focusBloom] = colorTokens(focus);
    const [, completeBloom] = colorTokens(focusOnComplete);
    expect(rgbaAlpha(completeBloom)).toBe(rgbaAlpha(focusBloom));
    expect(completeBloom).not.toBe(focusBloom);
  });

  it("negative fixture: catches a spread mismatch between the two variants", () => {
    const mismatched = "0 0 0 2px var(--color-accent-deep), 0 0 0 5px rgba(27, 101, 194, 0.3)";
    expect(stripColors(mismatched)).not.toBe(stripColors(focus));
  });

  it("negative fixture: catches an opacity mismatch in the bloom layer", () => {
    const mismatched = "0 0 0 1px var(--color-accent-deep), 0 0 0 5px rgba(27, 101, 194, 0.5)";
    const [, mismatchedBloom] = colorTokens(mismatched);
    const [, focusBloom] = colorTokens(focus);
    expect(rgbaAlpha(mismatchedBloom)).not.toBe(rgbaAlpha(focusBloom));
  });
});

describe("app/globals.css — `rounded-full` compiles to 999px via the real Tailwind compiler", () => {
  // This is the one matrix row that needs the actual toolchain rather than a
  // text parse: Tailwind has historically special-cased `rounded-full` as a
  // hardcoded `calc(infinity * 1px)` (effectively 9999px), which would
  // silently win over a same-named theme token if the precedence ever
  // regressed. We drive @tailwindcss/postcss — the exact PostCSS plugin
  // wired up in postcss.config.mjs — the same way eslint.config.test.ts
  // drives the real ESLint via `ESLint#lintText` instead of parsing
  // eslint.config.mjs as text.
  it("resolves `.rounded-full` to var(--radius-full) = 999px, not Tailwind's hardcoded 9999px", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "tw-rounded-full-"));
    try {
      const entryPath = path.join(fixtureDir, "entry.css");
      // Import this project's real theme so the probe exercises the actual
      // shipped --radius-full token, not a duplicated fixture value.
      writeFileSync(entryPath, `@import "${globalsCssPath}";\n`, "utf8");
      // @tailwindcss/postcss discovers utility classes by scanning files
      // under `base` for candidate class names; this marker file is the
      // only thing that makes "rounded-full" a candidate.
      writeFileSync(path.join(fixtureDir, "marker.html"), `<div class="rounded-full"></div>\n`, "utf8");

      const entryCss = readFileSync(entryPath, "utf8");
      const result = await postcss([tailwindcssPostcss({ base: fixtureDir })]).process(entryCss, {
        from: entryPath,
      });
      const output = result.css;

      const ruleMatch = output.match(/\.rounded-full\s*\{\s*border-radius:\s*([^;]+);/);
      expect(ruleMatch, "expected a compiled .rounded-full rule").not.toBeNull();
      expect(ruleMatch![1].trim()).toBe("var(--radius-full)");

      const themeMatch = output.match(/--radius-full:\s*([^;]+);/);
      expect(themeMatch, "expected --radius-full to be emitted in the theme layer").not.toBeNull();
      expect(themeMatch![1].trim()).toBe("999px");

      expect(output).not.toContain("9999px");
      expect(output).not.toContain("infinity");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
