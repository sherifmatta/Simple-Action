---
title: 'Story 1.2 — Transcribe the design tokens and load the typeface'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '16fc030ce6ecf2ec6dccef55e3699d0a6493f349'
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/globals.css` is a one-line stub and `app/layout.tsx` renders unstyled placeholder text. No DESIGN.md token exists anywhere yet, and Poppins is not loaded. Every later story (and AD-13) assumes the theme already exists — building it per-component is how a hex literal or a hand-picked font-family string sneaks in.

**Approach:** Transcribe DESIGN.md's frontmatter — colours, typography roles, radii, spacing scale — into the Tailwind v4 `@theme` block in `app/globals.css`, add the two shadow recipes, the Completed-row shadow re-tint, and the two focus-ring variants as named theme values, and load Poppins through `next/font/google` in the root layout with DESIGN.md's exact fallback stack, metric-adjusted for zero layout shift.

## Boundaries & Constraints

**Always:**
- Every DESIGN.md frontmatter token (colours, typography, radii, spacing) is transcribed verbatim by name into `app/globals.css`'s `@theme` block — the sole transcription (AD-13).
- Poppins loads via `next/font/google` in `app/layout.tsx`: weights `400`/`500`/`600` (Poppins ships no variable axis), DESIGN.md's exact fallback stack, `adjustFontFallback` left at its default so the swap contributes zero CLS.
- The two shadow recipes (card, row), the Completed-row green re-tint, and the two focus-ring variants (identical geometry/blur/opacity, hue-only difference, `-on-complete` on `accent-deep`) are named theme values.
- kebab-case files; `strict: true`; no hex literal or Tailwind arbitrary-value class anywhere outside `app/globals.css`.

**Never:**
- No component work. `app/page.tsx` stays Story 1.1's placeholder; Story 1.7 mounts the shell.
- No new lint rule for AD-13. Unlike Story 1.1's AC3–6, epics.md's AC list for this story has no lint AC — this stays a one-time verified sweep, not a CI gate.
- No component recipes from DESIGN.md §Components (checkbox, input, dialog, filter-tabs, etc.) — those ship with the stories that build each component. This story seeds `@theme`, shadows, focus rings and the typeface only.
- Never write "Done" in prose, identifiers, or tooltips.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Theme completeness | `app/globals.css` `@theme` block inspected | All 21 colours, 10 typography roles, 4 radii, 14 spacing tokens present, each named per DESIGN.md |
| Hex/arbitrary-value sweep | Repo grepped, excluding `app/globals.css` and `node_modules` | Zero hex literals, zero Tailwind arbitrary-value classes |
| Font swap | Page loads before Poppins resolves, then after | Fallback is metric-adjusted; swap contributes zero CLS |
| Focus ring on a Completed row | `-on-complete` variant compiled | Identical geometry/blur/opacity to the default variant; only the hue is `accent-deep` |
| `rounded.full` token | A probe class using the theme's `full`-radius token, built | Compiled CSS reads 999px — verify Tailwind's historically-hardcoded `rounded-full` (9999px) isn't silently winning instead |

</frozen-after-approval>

## Code Map

- `app/globals.css:1-4` — current stub; `@theme` goes here, the only file these tokens may live in (AD-13).
- `app/layout.tsx` — root layout; Poppins loads here via `next/font/google`, CSS variable applied to `<html>`.
- `DESIGN.md:9-30` — 21 colour tokens. **Note:** epics.md AC1 and epic-1-context.md both say "22"; DESIGN.md's own frontmatter — the AD-13 authority — defines 21. Transcribe all 21; treat "22" as a stale count, not a missing token.
- `DESIGN.md:31-81` — 10 typography roles (family/size/weight/line-height each).
- `DESIGN.md:82-86` — 4 radii (`sm` 7px, `md` 14px, `lg` 18px, `full` 999px).
- `DESIGN.md:87-101` — spacing: 8 numbered + 6 named = 14 tokens.
- `DESIGN.md:364-379` — shadow recipes, Completed-row re-tint, focus-ring variants, with rationale.
- `ARCHITECTURE-SPINE.md:143-147` — AD-13 rule text.
- `node_modules/tailwindcss/theme.css` — v4 `@theme` namespace conventions (`--color-*`, `--radius-*`, `--text-*`, `--shadow-*`); default Tailwind palette is not stripped, only added to.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` -- add `@theme` transcribing all 21 colours, 4 radii, 14 spacing tokens -- AC1
- [x] `app/globals.css` -- add `--shadow-card`, `--shadow-row`, `--shadow-row-complete` (green re-tint) -- AC5
- [x] `app/globals.css` -- add `--shadow-focus`, `--shadow-focus-on-complete` (identical geometry/blur/opacity, hue-only difference, `-on-complete` on `accent-deep`) -- AC4
- [x] `app/globals.css` -- one `@utility` per typography role (10), each referencing the Poppins CSS variable -- AC1
- [x] `app/layout.tsx` -- load Poppins via `next/font/google` (weights 400/500/600, DESIGN.md fallback stack), expose as a CSS variable applied to `<html>` -- AC3
  - fallback stack composed in `app/globals.css` rather than the loader call; see Spec Change Log entry 1
- [x] repo-wide sweep (one-time grep, not a lint rule or a persisted test — reaffirmed in review, see Review Triage Log) -- confirm zero hex literals and zero arbitrary-value classes outside `app/globals.css` -- AC2
- [x] probe -- confirm the `full`-radius token compiles to 999px as a genuinely named utility, not Tailwind's hardcoded `rounded-full`; kept as a persisted test (`app/globals.test.ts`) rather than deleted, per the Matrix Test Audit's requirement that every I/O matrix row have a persisted covering test -- AC1

**Acceptance Criteria:**
- Given `app/globals.css`, when the `@theme` block is inspected, then every DESIGN.md colour/typography/radius/spacing token is present and named verbatim.
- Given the repository excluding `app/globals.css`, when searched for hex literals and arbitrary-value classes, then there are none.
- Given the page loading before Poppins resolves, when the font swaps in, then the fallback is metric-adjusted and contributes zero CLS.
- Given the two focus-ring variants, when compared, then geometry/blur/opacity are identical and only the hue differs.
- Given the shadow recipes, when inspected, then card/row/row-complete-retint exist as named theme values.

### Review Findings

_Code review 2026-09-21 — four layers over the full Epic 1 diff._

- [x] [Review][Decision] `@theme static` is additive, so the token wall is leaky — `app/globals.css`'s comment states "a value not present in this block must be added here, with its DESIGN.md token name, before it can be used", but nothing resets Tailwind's defaults. `bg-red-500`, `p-9`, `text-2xl` and arbitrary values like `bg-[#fff]` all still compile. Options: (a) reset the namespaces (`--color-*: initial`, `--spacing: initial`) — a repo-wide change to what compiles, and it may break Tailwind utilities Epic 2 expects; (b) drop the absolute claim from the comment and keep the sweep as a convention; (c) leave as-is. **Resolved 2026-09-21 (option b):** the comment in `app/globals.css` now states plainly that the rule is a convention this file cannot enforce, names what still compiles, and says why the namespaces were not reset — a repository-wide change to what compiles, with Epic 2 unbuilt. The one-time sweep and review hold the rule; `app/globals.test.ts` checks presence and value only, which the comment now says outright.
- [x] [Review][Patch] Token values are asserted by name and count only, never against DESIGN.md [app/globals.test.ts:99-168] — expectation lists at :22, :46, :49, :69 are a second hand-transcription rather than being read from DESIGN.md, so a transcription typo is mirrored into its own test. Demonstrated: changing `--color-accent` to `#FF00FF` and every `font-size: 14.5px` to `99px` leaves all 16 tests green. The typography test checks only `font-family`, never size/weight/line-height. DESIGN.md's frontmatter is machine-readable YAML; parse and compare.
- [x] [Review][Patch] `layout.test.ts` negative fixtures re-implement the assertion instead of invoking it [app/layout.test.ts] — each "would flag ..." test hand-writes the inverse assertion, so weakening the production guard leaves the fixture green. Extract one predicate and assert both polarities against it, as `contract.test.ts` does.
- [x] [Review][Patch] `findProperty` misses string-literal keys and spreads [app/layout.test.ts:608-616] — `Poppins({ "fallback": [...] })` or `Poppins({ ...opts })` passes the zero-CLS guard.
- [x] [Review][Patch] The one hex literal outside `app/globals.css` sits in a test fixture [app/globals.test.ts:148] — `css.replace("--color-hairline: #E3E2F0;\n", "")`. This spec's Verification table records the AC2 sweep as "zero matches across all tracked source", which is not true of the tree as committed. Build the mutation string without a literal hex. (The focus-ring `rgba()` fixtures at :225 and :232 duplicate theme values in a spelling the hex regex does not catch.)
- [x] [Review][Patch] Generated `entry.css` import is not path-escaped [app/globals.test.ts:537] — a repository path containing a quote or backslash produces malformed CSS and an opaque probe failure.
- [x] [Review][Defer] `<body>` is never painted with `--color-ground` / `--color-text-primary` [app/layout.tsx:41] — deferred: the tokens are declared but no rule applies them, so the app renders on Tailwind-preflight white. `app/page.tsx` states Story 1.7 replaces the placeholder; the shell story owns painting the ground.

**Rejected**

- Poppins is loaded without `next/font`'s `fallback` option, against a frozen Boundaries bullet and AC3 — the technical argument is sound (Turbopack treats `fallback` as a replacement, killing the metric-adjusted face) and the composed CSS family list is equivalent; the stack is assembled in `globals.css` instead. The gap is procedural: the Spec Change Log flags it "for human confirmation" and no confirmation is recorded. Rejected here because the fix is to edit this spec — **worth your explicit sign-off outside this review.**
- The 10 typography roles sit in `@utility` rules, not inside the `@theme` block AC1 names — `low`. A role is four properties and `--text-*` cannot carry the family; the roles are all present and correctly named. The fix would amend the AC.

## Implementation Notes

**`@theme static`, not plain `@theme`.** Tailwind v4 only emits theme variables it sees a utility consume. Design tokens are the product's vocabulary, not a byproduct of today's markup, so the block is declared `@theme static` — every one of the 21 colours, 4 radii, 14 spacing tokens and 5 shadows lands in `:root` whether or not a component references it yet. This also guarantees `--shadow-focus`'s `var(--color-accent)` reference resolves without depending on Tailwind's var-dependency tracking.

**The `full`-radius probe came back clean — no rename needed.** Tailwind 4.3.3 registers `rounded-full` as a `staticValue` of `calc(infinity * 1px)`, but a `--radius-full` theme key takes precedence over it. Compiled output is `.rounded-full{border-radius:var(--radius-full)}` with `--radius-full:999px`. The Design Notes' contingency (`--radius-pill`) was implemented, verified unnecessary, and removed; all four radii keep their DESIGN.md names.

**Named spacing tokens beat the `--spacing` multiplier.** `--spacing-1: 4px` … `--spacing-8: 32px` shadow Tailwind's dynamic `calc(var(--spacing) * n)` scale, so `p-3` compiles to `var(--spacing-3)` = 9px, not 0.75rem. The 6 named structural tokens (`row-gap`, `row-padding`, `gutter`, `margin-phone`, `touch-target-min`, `card-max-width`) resolve the same way. All 14 verified in compiled CSS.

**Typography roles are `@utility`, not theme keys.** A role is four properties (family, size, weight, line-height); Tailwind's `--text-*` namespace cannot carry the family. Each of the 10 roles compiles to a single named class, so a component later writes `className="text-todo-text"` with no arbitrary value. All ten reference `--font-sans`, the one place the family string exists.

**The focus-ring variants differ only in hue.** Both compile to `0 0 0 1px <accent>, 0 0 0 5px <accent at 30%>`; geometry, blur and opacity are byte-identical and the `-on-complete` variant is `accent-deep` (`#1B65C2`), the 4.33:1 value DESIGN.md derives for mint.

**Out of scope, confirmed deliberately absent.** The two filter-tab inset shadows and every `§Components` recipe (checkbox, input-add, dialog-delete, skeleton-row, empty-state, char-counter, delete-action, error-banner, card, both row variants) are *not* in `@theme` — they ship with the stories that build each component, per this spec's Never list. `app/page.tsx` is untouched.

**Four of the five matrix rows have a persisted, passing automated test; the fifth stays the one-time manual sweep the frozen spec always asked for.** The original verification pass (below) had only build/grep/dev-server checks, which are one-shot and leave no regression protection for the other four rows. Two Vitest files close that gap:

- `app/globals.test.ts` — "Theme completeness" (all 21 colours / 4 radii / 14 spacing tokens / 10 typography `@utility` roles present, named per DESIGN.md, via regex extraction of `app/globals.css`, plus an assertion that `--font-sans` itself resolves through `var(--font-poppins)`), "Focus ring on a Completed row" (parses `--shadow-focus` / `--shadow-focus-on-complete`, strips colour tokens, and asserts the remaining geometry strings are byte-identical while the colour tokens differ — `--color-accent` vs `--color-accent-deep` — and the bloom's alpha is unchanged), and "`rounded.full` token" (see below). Each of the first two guards also carries negative-fixture cases (a mutated CSS string missing a token, a shadow pair with mismatched spread/opacity) proving the assertions would actually fail on a regression, not just pass vacuously — matching `eslint.config.test.ts`'s violating-fixture convention.
- `app/layout.test.ts` — "Font swap": parses `app/layout.tsx` with the real TypeScript compiler API (`ts.createSourceFile`), finds the `Poppins(...)` call, and asserts its options object never carries a `fallback` key, never sets `adjustFontFallback: false`, carries `variable: "--font-poppins"` exactly, and that `<html>`'s `className` expression is exactly `poppins.variable` (a second AST traversal for the JSX). Four negative fixtures (a `fallback`-carrying call, an `adjustFontFallback: false` call, a typo'd `variable` string, and a drifted `<html>` className) prove each check would catch the regression it targets.

**The "Hex/arbitrary-value sweep" row stays a one-time check, not a persisted test — by human decision during review.** A permanent Vitest suite for this row was drafted during implementation but review flagged that it contradicts the frozen Boundaries' explicit "this stays a one-time verified sweep, not a CI gate." Since the root cause touched frozen text, the human was asked directly rather than having either side silently overridden; the answer was to keep the sweep one-time only and rely on the check already recorded below in Verification as AC2's evidence — no test file for this row exists in the tree. The other four matrix rows keep their persisted tests; only this one row is a manual, point-in-time check by design, matching how the frozen spec described it from the start.

**Row 5 (`rounded.full` → 999px) got the real compiler, not a text-parse fallback.** `tailwindcss`'s own exported `compile()` (`node_modules/tailwindcss/dist/lib.d.mts`) requires the caller to supply a `loadStylesheet` resolver — there's no filesystem-aware default in the bare `tailwindcss` package, so driving it directly would mean reimplementing bare/relative `@import` resolution just to test it. `@tailwindcss/postcss` (already a devDependency, and the exact plugin `postcss.config.mjs` wires up) is the intended programmatic entry point instead: its default export is a real PostCSS plugin. `app/globals.test.ts` adds `postcss` itself as an explicit devDependency (it was previously only a transitive dependency of `@tailwindcss/postcss`, resolved by hoisting rather than declared — the same reasoning `eslint.config.test.ts` follows by depending on `eslint` directly rather than reaching into a transitive copy) and drives `postcss([tailwindcssPostcss({ base })]).process(...)` against a temp-directory fixture that `@import`s this project's real `app/globals.css` and a marker file using the `rounded-full` class, then asserts the compiled output contains both `.rounded-full{border-radius:var(--radius-full)}` and `--radius-full:999px` in the same compiled artifact, and contains neither `9999px` nor `infinity` anywhere.

## Spec Change Log

**1. The DESIGN.md fallback stack is composed in `app/globals.css`, not passed to `next/font/google`.** — *deviation from a frozen Boundaries bullet; flagged for human confirmation.*

The Boundaries section asks for both "DESIGN.md's exact fallback stack" and "`adjustFontFallback` left at its default so the swap contributes zero CLS" on the same loader call. Under Next 16.3.5, which builds with Turbopack, those two are mutually exclusive: Turbopack's `next/font` implementation treats a supplied `fallback` list as a *replacement* for the automatic fallback rather than a suffix to it. Verified empirically — with `fallback` passed, the compiled CSS contains no `Poppins Fallback` `@font-face` and no `ascent-override`/`size-adjust` at all; with it omitted, Turbopack emits:

```css
@font-face{font-family:Poppins Fallback;src:local(Arial);ascent-override:93.62%;descent-override:31.21%;line-gap-override:8.92%;size-adjust:112.16%}
```

(The webpack-era loader at `node_modules/next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js` concatenates both — `[family, adjustFontFallbackFamily, ...fallbackFonts]` — which is why the spec's wording is right about the intent and wrong only about the mechanism on this toolchain. `experimental.adjustFontFallbacks` exists in the Rust config struct but is rejected by Next's JS config schema, so it is not a lever.)

Resolution: `adjustFontFallback` stays at its default and `fallback` is omitted, so `--font-poppins` resolves to `"Poppins", "Poppins Fallback"`. DESIGN.md's remaining families are appended in `app/globals.css`:

```css
--font-sans: var(--font-poppins), "Century Gothic", "Futura", "Avenir Next",
  -apple-system, "Segoe UI", system-ui, sans-serif;
```

The resulting family list is character-for-character the order the webpack loader would have produced, with the metric adjustment retained. Both halves of the intent — exact stack, zero CLS — are met. It arguably lands *better* against AD-13, since the family string is a DESIGN.md typography token and now lives in the one file AD-13 permits tokens in. Poppins still loads via `next/font/google` in `app/layout.tsx` at weights 400/500/600, exposed as a CSS variable on `<html>`.

**2. Fallback family names are unquoted.** Incidental to change 1, and would have applied either way: `next/font` inlines the `fallback` array into a double-quoted JavaScript string, so `'"Century Gothic"'` is a build-time syntax error (`Expected ',', got 'ident'`). Unquoted multi-word family names are equivalent to the quoted form in CSS. Moot now that the stack lives in `globals.css`, where DESIGN.md's quoting is reproduced exactly.

## Review Triage Log

Pass 1 — layers: blind-hunter, edge-case-hunter, verification-gap, over the diff since `baseline_commit`.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `Poppins(...)`'s `variable: "--font-poppins"` and `<html className={poppins.variable}>` are never asserted, nor is `--font-sans`'s reference to `var(--font-poppins)` — a typo in any of the three would silently drop the typeface with every existing test green | medium | Read `app/layout.test.ts` and `app/globals.test.ts` in full; confirmed neither inspects the `variable` property, the JSX `className`, or `--font-sans`'s declared value. Compiled CSS (`.next/static/chunks/*.css` after a real `next build`) independently confirmed the wiring works today (`:root,:host{--font-sans:var(--font-poppins), ...}`), so this is an untested-regression gap, not a live bug. | patch |
| 2 | `app/ad-13-token-sweep.test.ts` is a permanent Vitest suite running on every `npm test`, contradicting the frozen Boundaries' "this stays a one-time verified sweep, not a CI gate" | medium | The persisted test exists (verified by reading the file); the Matrix Test Audit is what drove adding it. Root cause touches frozen text, so put to the human directly rather than silently patched either way. | human decision: delete the file, keep the sweep one-time only (see Implementation Notes) |
| 3 | `app/ad-13-token-sweep.test.ts` self-matches its own source once git-tracked: its own `it(...)` description strings contain the literal substrings `#abc`, `#aabbcc`, and `` `-[` `` | high | Verified directly: `grep` for `HEX_LITERAL`/`ARBITRARY_VALUE_CLASS` against the file's own text matches lines 63 and 68; `git ls-files` confirmed the file was untracked, which is the only reason `npm test` was still green — committing it would fail immediately. | moot — resolved by finding 2's deletion |
| 4 | No negative/red fixture proves the new guards (theme completeness, focus-ring geometry, font-swap AST check) can actually fail, unlike this repo's own `eslint.config.test.ts` convention (one violating + one allowed fixture per rule) | medium | Read all three new test files; confirmed every assertion runs only against the real, currently-passing source — no test asserts the guard would fail against a mutated/violating input. | patch |
| 5 | `app/globals.test.ts` has two separate `import { ... } from "node:fs"` statements | low | Confirmed by reading the file's import block. | patch |
| 6 | Spec's Tasks line for the `rounded.full` probe said "temporary... delete after," but it was kept as a permanent test in `app/globals.test.ts` | n/a | Fix is to edit this build's spec, not the code — rejected by rule. Independently corrected the Tasks wording to describe what actually happened and why (Matrix Test Audit). | rejected (spec-edit rule); spec text corrected directly |
| 7 | "Theme completeness" test regex-parses `app/globals.css`'s raw text rather than compiling it through the real Tailwind engine, unlike the `rounded.full` row | low | `@theme static` unconditionally emits every declared custom property regardless of usage (no content-dependent tree-shaking to defeat, unlike utility generation); `npm run build` passing already rules out a syntax error suppressing emission. No plausible failure mode identified that a real-compiler test would catch and a text-parse test would miss. | rejected (low, unlikely + fix nontrivial) |
| 8 | Font-swap test inspects the `Poppins(...)` call's source AST only, not the actual compiled `Poppins Fallback` `@font-face` | low | The two known ways to break the zero-CLS guarantee (passing `fallback`, setting `adjustFontFallback: false`) are both covered by the AST check. A compiled-CSS-level test would additionally guard against an unknown future Next/Turbopack behavior change, at the cost of running a full `next build` inside the test suite. | rejected (low, unlikely + fix nontrivial) |
| 9 | `--font-sans: var(--font-poppins), ...` sits in `@theme static`, not the `@theme inline` pattern Next's own bundled docs show for wiring a `next/font` CSS variable into Tailwind | maybe-false | Verified empirically: `next build` → `.next/static/chunks/*.css` shows `:root,:host{--font-sans:var(--font-poppins), ...}` and `--default-font-family:var(--font-sans)`, both resolving correctly for the one consumer that exists today (Preflight's base font, via the ten typography `@utility` roles). No code today uses Tailwind's generated `.font-sans` utility class directly, which is the specific case `@theme inline` protects; unconfirmed whether it would still resolve correctly if that utility class were used later. If true, impact would be low (one utility class, not yet used). | rejected (maybe-false, would be low if true) |

## Design Notes

Tailwind v4's `@theme` namespaces (`--color-*`, `--radius-*`, `--text-*`, `--shadow-*`) generate one utility per key automatically — use directly for colours, radii and shadows.

A typography role is four properties (family, size, weight, line-height), not one Tailwind namespace pair. Model each role as an `@utility` custom utility (Tailwind v4's `@layer utilities` replacement) in `app/globals.css`, e.g. `@utility text-dialog-title { font: ...; }`, so a component later applies `className="text-dialog-title"` with no arbitrary value. Every role references one shared Poppins CSS variable (`next/font`'s `variable` option) instead of hardcoding the family string ten times.

`rounded-full` has historically been a hardcoded 9999px special case in Tailwind, not theme-driven — if the `full` token still loses to that default after a build, rename it (e.g. `--radius-pill`) so it produces its own utility; the 999px value ships correctly either way, only the class name changes.

## Verification

**Commands:**
- `npm run typecheck` / `npm run lint` / `npm run build` -- expected: all exit zero
- `npm run dev` -- expected: serves the placeholder page with no console or network errors; stop once confirmed
- `grep` sweep for hex literals (`#[0-9A-Fa-f]{3,6}`) and arbitrary-value classes (`-\[`) across the repo excluding `app/globals.css` and `node_modules` -- expected: zero matches
- Inspect `.next/static/css/*.css` after `next build` for the `full`-radius utility -- expected: 999px, not 9999px
- `npm test` -- expected: exit 0, four of the five `## I/O & Edge-Case Matrix` rows covered by a persisted automated test (the "Hex/arbitrary-value sweep" row stays the one-time manual grep per the frozen Boundaries, see Implementation Notes)

**Results (all pass):**

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings=0`) |
| `npm run build` | exit 0 |
| `npm test` | 3 files / 49 tests pass -- Story 1.1's `eslint.config.test.ts` (23) plus this story's `app/globals.test.ts` (16) and `app/layout.test.ts` (10), including negative-fixture cases |
| `npm run dev` | `GET / 200`; `<html class="poppins_…__variable">`; only pre-existing `middleware` → `proxy` deprecation notice from Story 1.1 |
| Matrix row "Theme completeness" | `app/globals.test.ts`: 21/21 colours, 4/4 radii, 14/14 spacing tokens, 10/10 typography `@utility` roles, each asserted present by DESIGN.md name; `--font-sans` confirmed to resolve through `var(--font-poppins)`; negative fixtures confirm each count check fails when a token is removed |
| Matrix row "Hex/arbitrary-value sweep" | One-time manual check only, per human decision recorded above -- see AC2 rows below for the recorded evidence |
| Matrix row "Font swap" | `app/layout.test.ts`: TypeScript-AST-parsed `Poppins(...)` call in `app/layout.tsx` carries no `fallback` key, no `adjustFontFallback: false`, `variable: "--font-poppins"` exactly, and `<html>`'s `className` is exactly `poppins.variable`; four negative fixtures confirm each check would catch the regression it targets |
| Matrix row "Focus ring on a Completed row" | `app/globals.test.ts`: `--shadow-focus` / `--shadow-focus-on-complete` geometry byte-identical once colour tokens are stripped; bloom alpha identical; only the colour token differs (`--color-accent` vs `--color-accent-deep`) |
| Matrix row "`rounded.full` token" | `app/globals.test.ts`: real `@tailwindcss/postcss` compile of a fixture importing the actual `app/globals.css` resolves `.rounded-full` to `var(--radius-full)` = `999px` in the same compiled output; no `9999px` / `infinity` anywhere |
| AC1 — 21 colours | all 21 emitted to `:root`; probe produced 21 distinct `bg-*` utilities resolving to `var(--color-*)` |
| AC1 — 10 typography roles | all 10 compiled as named classes with family/size/weight/line-height |
| AC1 — 4 radii | `--radius-sm:7px --radius-md:14px --radius-lg:18px --radius-full:999px` |
| AC1 — 14 spacing tokens | all 14 compiled as `var(--spacing-*)`, none falling back to the multiplier scale |
| AC1 — `full` radius | `.rounded-full{border-radius:var(--radius-full)}` → **999px**, not 9999px / `calc(infinity * 1px)` |
| AC2 — hex sweep | zero matches across all tracked source (`app/`, `src/`, `e2e/`, `middleware.ts`, root configs), excluding `app/globals.css` |
| AC2 — arbitrary-value sweep | zero matches, same scope |
| AC3 — metric-adjusted fallback | `@font-face{font-family:Poppins Fallback;src:local(Arial);ascent-override:93.62%;descent-override:31.21%;line-gap-override:8.92%;size-adjust:112.16%}` present; `font-display:swap` |
| AC4 — focus-ring variants | `--shadow-focus: 0 0 0 1px var(--color-accent), 0 0 0 5px #2680eb4d` vs `--shadow-focus-on-complete: 0 0 0 1px var(--color-accent-deep), 0 0 0 5px #1b65c24d` — geometry, blur and opacity identical; hue only |
| AC5 — shadow recipes | `--shadow-card`, `--shadow-row`, `--shadow-row-complete` all present as named theme values |

**Sweep scope note.** The AC2 grep covers tracked application source. `docs/` is excluded because DESIGN.md *is* the hex authority and the mockups render it; `.claude/` and `_bmad/` are excluded because they are vendored agent tooling, not product code. Neither is compiled into the application.

**Probe disposal.** The verification probe lived temporarily in `app/page.tsx`; it has been reverted to Story 1.1's placeholder verbatim (`git status` shows `app/page.tsx` unmodified). A throwaway `experimental.adjustFontFallbacks` experiment in `next.config.ts` was likewise reverted.
