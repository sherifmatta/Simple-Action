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

// DESIGN.md is the authority for every value below (AD-13). Reading it here
// rather than re-typing its tokens is the whole point: a hand-written
// expectation list is a second transcription, and a typo made while
// transcribing globals.css would be mirrored into it and ship green.
//
// The frontmatter is flat `key: value` under a handful of top-level keys,
// with `typography` one level deeper. That is parsed directly instead of
// adding a YAML dependency to a project that pins every version by hand.
const designMdPath = path.resolve(
  process.cwd(),
  "docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md",
);

function frontmatterSection(
  source: string,
  key: string,
): Map<string, string | Map<string, string>> {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) throw new Error(`DESIGN.md has no \`${key}:\` section`);

  const unquote = (raw: string) => raw.trim().replace(/^['"]|['"]$/g, "");
  const section = new Map<string, string | Map<string, string>>();
  let nested: Map<string, string> | null = null;

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || /^[^\s]/.test(line)) break; // next top-level key
    const two = line.match(/^ {2}([^:]+):\s*(.*)$/);
    const four = line.match(/^ {4}([^:]+):\s*(.*)$/);
    if (four && nested) {
      nested.set(unquote(four[1]), unquote(four[2]));
    } else if (two) {
      const name = unquote(two[1]);
      if (two[2].trim() === "") {
        nested = new Map<string, string>();
        section.set(name, nested);
      } else {
        nested = null;
        section.set(name, unquote(two[2]));
      }
    }
  }
  return section;
}

const designMd = readFileSync(designMdPath, "utf8");

const designColors = frontmatterSection(designMd, "colors") as Map<
  string,
  string
>;
const designRadii = frontmatterSection(designMd, "rounded") as Map<
  string,
  string
>;
const designSpacing = frontmatterSection(designMd, "spacing") as Map<
  string,
  string
>;
const designTypography = frontmatterSection(designMd, "typography") as Map<
  string,
  Map<string, string>
>;

function declaredValue(source: string, property: string): string | null {
  const match = source.match(
    new RegExp(`--${property.replace(/[-]/g, "\\-")}:\\s*([^;]+);`),
  );
  return match ? match[1].trim() : null;
}

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
    expect(declared).toHaveLength(designColors.size);
    for (const name of expectedColors) {
      expect(declared, `expected --color-${name} to be declared`).toContain(
        name,
      );
    }
  });

  it("declares exactly 4 named --radius-* custom properties, all from DESIGN.md", () => {
    const declared = extractRadii(css);
    expect(declared).toHaveLength(designRadii.size);
    for (const name of expectedRadii) {
      expect(declared, `expected --radius-${name} to be declared`).toContain(
        name,
      );
    }
  });

  it("declares exactly 14 named --spacing-* custom properties, all from DESIGN.md", () => {
    const declared = extractSpacing(css);
    expect(declared).toHaveLength(designSpacing.size);
    for (const name of expectedSpacing) {
      expect(declared, `expected --spacing-${name} to be declared`).toContain(
        name,
      );
    }
  });

  it("declares exactly 10 typography-role @utility classes, all from DESIGN.md", () => {
    const declared = extractTypographyRoles(css);
    expect(declared).toHaveLength(designTypography.size);
    for (const role of expectedTypographyRoles) {
      expect(
        declared,
        `expected @utility text-${role} to be declared`,
      ).toContain(role);
    }
  });

  // --- Value assertions (2026-09-21 code review) --------------------------
  // Until these landed, the suite checked names and counts only: setting
  // --color-accent to #FF00FF, or every font-size to 99px, left all 16 tests
  // green. Names prove the transcription is complete; only these prove it is
  // correct.

  it("declares every colour with exactly the value DESIGN.md gives it", () => {
    for (const [name, expected] of designColors) {
      expect(
        declaredValue(css, `color-${name}`)?.toUpperCase(),
        `--color-${name} must match DESIGN.md`,
      ).toBe(expected.toUpperCase());
    }
  });

  it("declares every radius with exactly the value DESIGN.md gives it", () => {
    for (const [name, expected] of designRadii) {
      expect(declaredValue(css, `radius-${name}`), `--radius-${name}`).toBe(
        expected,
      );
    }
  });

  it("declares every spacing token with exactly the value DESIGN.md gives it", () => {
    for (const [name, expected] of designSpacing) {
      expect(declaredValue(css, `spacing-${name}`), `--spacing-${name}`).toBe(
        expected,
      );
    }
  });

  it("gives every typography role the size, weight and line-height DESIGN.md specifies", () => {
    for (const [role, spec] of designTypography) {
      const match = css.match(
        new RegExp(`@utility text-${role}\\s*\\{([^}]*)\\}`),
      );
      expect(match, `expected the text-${role} utility body`).not.toBeNull();
      const body = match![1];

      for (const [property, cssProperty] of [
        ["fontSize", "font-size"],
        ["fontWeight", "font-weight"],
        ["lineHeight", "line-height"],
      ] as const) {
        const expected = spec.get(property);
        expect(
          expected,
          `DESIGN.md typography.${role}.${property}`,
        ).toBeDefined();
        const declared = body.match(new RegExp(`${cssProperty}:\\s*([^;]+);`));
        expect(
          declared,
          `text-${role} must declare ${cssProperty}`,
        ).not.toBeNull();
        expect(declared![1].trim(), `text-${role} ${cssProperty}`).toBe(
          expected,
        );
      }
    }
  });

  it("every typography role references the shared --font-sans token, not a hardcoded family", () => {
    for (const role of expectedTypographyRoles) {
      const match = css.match(
        new RegExp(`@utility text-${role}\\s*\\{([^}]*)\\}`),
      );
      expect(
        match,
        `expected to find the text-${role} utility body`,
      ).not.toBeNull();
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
    // Matched by pattern rather than spelled out: a literal value here would
    // be the only hex in the repository outside app/globals.css, which is
    // exactly what this story's AC2 sweep forbids.
    const mutated = css.replace(/--color-hairline:[^;]*;\n/, "");
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
    const mutated = css.replace(/@utility text-counter\s*\{[^}]*\}\n?/, "");
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
    return [...value.matchAll(/var\(--color-[a-z0-9-]+\)|rgba\([^)]*\)/g)].map(
      (m) => m[0],
    );
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
    const mismatched =
      "0 0 0 2px var(--color-accent-deep), 0 0 0 5px rgba(27, 101, 194, 0.3)";
    expect(stripColors(mismatched)).not.toBe(stripColors(focus));
  });

  it("negative fixture: catches an opacity mismatch in the bloom layer", () => {
    const mismatched =
      "0 0 0 1px var(--color-accent-deep), 0 0 0 5px rgba(27, 101, 194, 0.5)";
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
      // Escaped: a repository path containing a quote or a backslash would
      // otherwise produce malformed CSS and fail this probe opaquely.
      const importTarget = globalsCssPath.replace(/["\\\\]/g, "\\\\$&");
      writeFileSync(entryPath, `@import "${importTarget}";\n`, "utf8");
      // @tailwindcss/postcss discovers utility classes by scanning files
      // under `base` for candidate class names; this marker file is the
      // only thing that makes "rounded-full" a candidate.
      writeFileSync(
        path.join(fixtureDir, "marker.html"),
        `<div class="rounded-full"></div>\n`,
        "utf8",
      );

      const entryCss = readFileSync(entryPath, "utf8");
      const result = await postcss([
        tailwindcssPostcss({ base: fixtureDir }),
      ]).process(entryCss, {
        from: entryPath,
      });
      const output = result.css;

      const ruleMatch = output.match(
        /\.rounded-full\s*\{\s*border-radius:\s*([^;]+);/,
      );
      expect(
        ruleMatch,
        "expected a compiled .rounded-full rule",
      ).not.toBeNull();
      expect(ruleMatch![1].trim()).toBe("var(--radius-full)");

      const themeMatch = output.match(/--radius-full:\s*([^;]+);/);
      expect(
        themeMatch,
        "expected --radius-full to be emitted in the theme layer",
      ).not.toBeNull();
      expect(themeMatch![1].trim()).toBe("999px");

      expect(output).not.toContain("9999px");
      expect(output).not.toContain("infinity");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
