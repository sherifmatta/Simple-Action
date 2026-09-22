---
title: 'Story 2.5 — Seed the motion module and show skeleton rows while the list loads'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_revision: 'fa41359d8eb395e2da8f6d56554e159191559511'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/implementation-artifacts/epic-2-context.md'
  - '{project-root}/docs/implementation-artifacts/spec-2-4-render-a-todo-in-both-completion-statuses.md'
  - '{project-root}/docs/implementation-artifacts/spec-2-3-build-the-card-the-scroll-model-and-the-sticky-top-block.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      The loading and failed-read states are silent to assistive technology: the skeleton rows are
      aria-hidden, the list region carries no aria-busy and no accessible name, and a failed read
      renders an empty region, so a screen-reader user cannot tell "loading" from "you have no Todos".
    evidence: |-
      All three skeleton <li>s carry aria-hidden="true" (src/client/components/skeleton-row.tsx) and the
      region is a bare <ul> with a data-still marker only. skeleton-row.tsx defers this in a comment
      ("whether it is aria-busy ... is Story 2.6's"), but unlike this story's six other deferrals it had
      no deferred-work.md entry and no Story 2.6 AC names aria-busy. Story 2.6 AC16-AC20 own every
      announcement in this epic and are where it belongs.
    location: >-
      src/client/components/todo-list.tsx and skeleton-row.tsx
    severity: medium
  - summary: >-
      The Epic 1 carry-over that the epic's first component test must prove the live regions survive
      hydration rather than only server render is still unmet, and the recompiled epic-2-context.md no
      longer carries the obligation.
    evidence: |-
      todo-list.render.test.tsx is the repository's only real mount and it renders <TodoList /> alone
      inside a QueryClientProvider - never the announcer from src/client/feedback/announcer.tsx, and
      never through hydrateRoot. Story 2.4's review recorded the obligation as discharged when jsdom and
      the .tsx glob were added, but the live-region half of it was not. Story 2.6 is the natural owner:
      it is the story that first calls announce().
    location: >-
      src/client/components/todo-list.render.test.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Opening the application shows a blank list region: `todo-list.tsx:42` is `if (data === undefined) return null`, so the region leaves the DOM entirely while the read is in flight and there is nothing to look at and nothing for a later state to mount into. Separately, no motion module exists — every duration in `EXPERIENCE.md` is still only prose, and Epics 4 and 5 are meant to run in parallel importing the same collapse constant, so whichever reached the module second would either import something unmerged or declare a second one and break AR-27 on the first day of parallel work.

**Approach:** Seed the motion module complete — all four named durations and the single `prefers-reduced-motion` read — even though three of the four constants have no consumer in this epic, which is the point. Then build its one consumer: three skeleton rows in the exact geometry of `todo-row-active`, mounted into a list region that is now a persistent element rather than a `null` return. Per-row variation (pulse stagger and bar width) comes from position selectors in `app/globals.css`, never from JavaScript, because every `className` in this product must stay a static string literal or the whole-tree absence scans Story 2.3 built go blind.

## Boundaries & Constraints

**Always:**
- Every `className` is a static string literal. `dynamicClassNames(markup)` must stay exactly `["app/layout.tsx:`…font variable…`"]` (`todo-card.test.ts:125`) and `opaqueMarkup(markup)` must stay `[]` (`todo-card.test.ts:310`) — so **no inline `style={{…}}`**, no spread attribute, no `createElement`, and no conditional/computed class string anywhere.
- No hex literal and no arbitrary-value class (`w-[70%]`, `duration-[1400ms]`) in any `.tsx` under `app/` or `src/client/` — `app/page.test.ts:91` scans the whole file text, **comments included**.
- Untokenised literal values go into `app/globals.css` as `@utility` recipes, beside `checkbox-box` and `strikethrough-completed` (Story 2.4's precedent). Do **not** grow `@theme static`'s colour/radius/spacing blocks — `app/globals.test.ts` pins them to exactly 21/4/14.
- Do not run `app/globals.css` through Prettier: it lowercases the hex values two test files pin uppercase. Append by hand.
- Status resolution order in the list region: in-flight → skeletons; resolved → rows; anything else (a failed read) → the region renders empty, as a comment naming Story 2.6 rather than placeholder markup.
- Variant-marker discipline (AR-28), as `todo-row.tsx` already does it: one `data-` attribute, descendants derive through Tailwind `data-`/`group-data-` variants or a nested selector in the recipe.

**Never:**
- Never let a component read `prefers-reduced-motion` or call `matchMedia`; the motion module is the only place either appears in the product, CSS included — do **not** also add a `@media (prefers-reduced-motion: reduce)` block to `app/globals.css`, which would make two homes for one decision and fail AC2.
- Never inline a duration literal in a component (`1400`, `400ms`, a bare `setTimeout` delay). Only the motion module and `app/globals.css` carry duration values, and a test pins the two to agree.
- Never build the error banner, the empty state, or any announcement — all Story 2.6's. Never add a loading state for an add, toggle or delete; those are optimistic (AC10).
- Never re-sort the list, add a second query key, or touch the server, the repository or the contract.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial load in flight | `useTodos()` is `pending` (no data, no error) | The list region element is in the DOM and holds exactly three skeleton rows, each in `todo-row-active`'s geometry; the card and sticky block render normally | No error expected |
| List resolves with Todos | `data` is a non-empty array | The region holds one `TodoRow` per Todo, in received order; no skeleton remains | No error expected |
| List resolves empty | `data` is `[]` | The region is in the DOM and holds no children | Empty state is Story 2.6's; render nothing here |
| Read failed | `isPending` false, `data` undefined, `error` set | The region is in the DOM and holds **no** skeletons and no rows | Banner and Retry are Story 2.6's; the region must not throw on `data.map` |
| Reduced motion | `prefers-reduced-motion: reduce` | Three skeleton rows, identical geometry, resting at `{colors.hairline}`, animation suppressed | No error expected |
| Motion preference unknown (SSR / first paint) | No `window` | Skeletons render still, then start pulsing after hydration confirms motion is allowed | Fail toward stillness, never toward motion |

</intent-contract>

## Code Map

- `src/client/components/todo-list.tsx` — the change site. Line 42 is `if (data === undefined) return null`; the `<ul className="flex flex-col gap-row-gap">` below it becomes the persistent region. Its header comment names Stories "2.6/2.7/2.8" under the **pre-consolidation** numbering — sweep to 2.6 while here (`deferred-work.md` renumbering entry: fix opportunistically in files already being touched).
- `src/client/components/todo-row.tsx` — the geometry to match exactly. The `<li>`'s literal class string is `group flex min-h-touch-target-min items-center gap-4 rounded-md bg-row-active p-row-padding shadow-row …`; the checkbox span carries `checkbox-box …`. Read-only here.
- `src/client/todos/use-todos.ts` — returns the full `useQuery` result, so `isPending` / `data` / `error` are all available. No change.
- `app/globals.css` — `@utility checkbox-box` / `strikethrough-completed` at the foot are the precedent for a recipe holding untokenised literals; `--color-hairline: #E3E2F0` and `--color-tab-track: #EDEEF7` are the pulse endpoints.
- `src/test-support/markup.ts` — `readMarkup`, `classNamesOf`, `matches`, `dynamicClassNames`, `opaqueMarkup`, `styleSheetMatches`. The scan toolkit; use it for the tree-wide absence proofs rather than writing new walkers.
- `src/test-support/tailwind.ts` — `tailwindCompiler()` / `ruleFor(css, className)`. Compile the real classes against the real stylesheet; `ruleFor` throws when Tailwind emitted nothing, which is the silent-drop this harness exists for.
- `src/client/components/todo-list.render.test.tsx` — the jsdom mount (`// @vitest-environment jsdom`, `createRoot` + React `act`, `vi.stubGlobal("fetch", …)`). Its last two cases assert `container.querySelector("ul")` is **null** in flight and on failure; both are this story's to invert. jsdom has no `matchMedia` — stub it.
- `src/client/components/todo-list.test.ts` — node-environment test stubbing `useTodos` via `vi.hoisted`. Three assertions are this story's to update: `render()` is `""` when data is undefined, `elements()` equals `["ul","TodoRow"]`, and the "names the three stories" loop over `["Story 2.6","Story 2.7","Story 2.8"]`.
- `src/client/components/todo-card.test.ts:125,310` — the two whole-tree walls (`dynamicClassNames`, `opaqueMarkup`) this story must not trip. Read-only.
- `app/page.test.ts:91` — the AD-13 hex / arbitrary-value scan over every markup file's full text. Read-only.
- `docs/planning-artifacts/ux-designs/…/DESIGN.md:202-210,432-434` — `components.skeleton-row`: fill `{colors.row-active}`, `{rounded.md}`, `{spacing.row-padding}`, row shadow, placeholder fill `{colors.hairline}`, `pulse-to: {colors.tab-track}`, `pulse-duration: 1400ms`, `count: 3`.
- `docs/planning-artifacts/ux-designs/…/mockups/key-states.html:332-353` — the reference implementation: 22px box, one 12px bar per row at 70%/52%/61% width, `:nth-child` delays of .12s/.24s. Note it pulses *opacity* at 1.6s; DESIGN.md is normative — pulse `background-color` from `hairline` toward `tab-track` over 1400ms.
- `docs/planning-artifacts/…/EXPERIENCE.md:161,163,223-230` — the other three durations (~400ms hold, ~180ms collapse, ~600ms nudge) and the reduced-motion rules.
- `eslint.config.mjs` — no boundary rule constrains a new `src/client/` subdirectory; the AD-8 query-key and AD-1 fetch walls are untouched by this work.

## Tasks & Acceptance

**Execution:**
- `src/client/motion/motion.ts` -- create the motion module: four named duration constants (skeleton pulse 1400, departure hold 400, collapse 180, first-run nudge 600) and `useReducedMotion()`, the product's only `matchMedia` call -- AR-27/AC1–AC4; seeding it complete is what lets Epics 4 and 5 run in parallel.
- `src/client/motion/motion.test.ts` -- assert the four constants and their values, that the pulse value matches DESIGN.md's `pulse-duration`, that `useReducedMotion` is hydration-safe and defaults to still, and scan every source file under `app/` and `src/` for a second `prefers-reduced-motion`/`matchMedia` site and for duration literals outside this module -- AC1–AC4 are all absences and need scans, not call-site assertions.
- `app/globals.css` -- append the skeleton recipes by hand: `@keyframes skeleton-pulse` (hairline → tab-track), and `@utility` recipes carrying the pulse, the untokenised bar/box geometry, the `:nth-child` stagger and bar widths, and the `[data-still]` suppression -- AD-13 forbids arbitrary-value classes and the theme blocks are count-pinned, so recipes are the only home.
- `src/client/components/skeleton-row.tsx` -- create `SkeletonRow`: one `<li>` whose geometry classes are byte-identical to `todo-row.tsx`'s, holding a hairline box and one hairline bar -- AC5/AC6; identical geometry is what makes the swap cost no layout shift.
- `src/client/components/skeleton-row.test.ts` -- prove geometry equality against `todo-row.tsx` by AST, compile the new classes through `tailwindCompiler()`/`ruleFor`, and assert the pulse endpoints, the stagger, and that `[data-still]` suppresses the animation -- AC5–AC8.
- `src/client/components/todo-list.tsx` -- make the `<ul>` persistent, render three `SkeletonRow`s while `isPending`, rows when resolved, nothing otherwise; set the still marker from `useReducedMotion()`; sweep the stale story numbers in the comments -- AC9/AC11 and the `deferred-work.md` entry Story 2.4 left open.
- `src/client/components/todo-list.test.ts` -- update the three assertions the new branches invalidate and add coverage for the skeleton branch and the failed-read branch -- the old ones pin behaviour this story deliberately replaces.
- `src/client/components/todo-list.render.test.tsx` -- stub `matchMedia`, invert the two `querySelector("ul")` null assertions, and assert three skeleton rows mount in flight and none after resolution -- this is the only test that runs the real query in a real DOM.
- `src/client/components/todo-card.tsx` -- update the list-region comment's stale story numbers -- same opportunistic sweep; the comment currently misdescribes who owns which branch.
- `docs/implementation-artifacts/deferred-work.md` -- close the "list region leaves the DOM" entry and record anything this story leaves open -- the entry names 2.6/2.7 as owners and AC11 moved it here.

**Acceptance Criteria:**
- Given the product source, when it is scanned for `matchMedia` or `prefers-reduced-motion`, then `src/client/motion/motion.ts` is the only file containing either — no component and no stylesheet.
- Given `app/globals.css` and the motion module, when the compiled pulse rule is read back, then its duration equals the module's pulse constant rather than restating it independently.
- Given the motion module, when Epics 4 and 5 later import the collapse duration, then there is exactly one exported collapse constant in the product and no second duration declaration anywhere outside this module and the stylesheet.
- Given `useTodos()` is pending, when `TodoList` renders, then the list region element is present with exactly three skeleton rows, and the card and sticky top block render unchanged around it.
- Given a skeleton row and an Active `TodoRow`, when their `<li>` class literals are compared, then the geometry classes (fill, radius, padding, shadow, minimum height, flex layout and gap) are identical.
- Given a read that failed, when `TodoList` renders, then the list region element is present and holds neither skeleton rows nor Todo rows, and nothing throws.
- Given reduced motion is preferred, when the skeletons render, then the same three rows are present at the hairline resting fill with no running animation.
- Given the repository's existing whole-tree scans, when the suite runs, then `dynamicClassNames`, `opaqueMarkup`, `arbitraryProperties` and the AD-13 hex scan all still report nothing new.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 45 findings — high 0, medium 9, low 24, false 5, maybe-false 0 (7 descriptive observations recorded without a defect claim)
- findings:

**intent-alignment (descriptive layer; each divergence recorded as a row)**
  - `[low]` `[patch]` AC3 — `app/globals.css` holds `1400ms`, `120ms`, `240ms`, none of which a module constant backs — the pulse is now built from `SKELETON_PULSE_MS` in every test; the stagger values remain CSS-only and are recorded in `deferred-work.md`.
  - `[medium]` `[patch]` AC2 — the test bans **all** `@media` in the stylesheet, not only reduced-motion ones, so any later responsive rule fails a test named for AC2. Narrowed to `prefers-reduced-motion`.
  - `[low]` `[reject]` AC7 — "when they animate" is asserted against compiled CSS text, never a rendered frame. Correct: no layout or animation engine exists in this suite; Epic 6 owns it and `deferred-work.md` records it.
  - `[low]` `[reject]` AC5 — class-literal equality is not computed-geometry equality. True, and the strongest proof available at this surface; the diff adds a third DESIGN.md-sourced copy and a mutation check precisely to keep it non-vacuous.
  - `[low]` `[defer]` AC6 — CLS is argued in prose, never measured; the 21.03px text-line-box figure is asserted nowhere. Already recorded in `deferred-work.md` with Epic 6 as owner.
  - `[medium]` `[patch]` AC8 — no test proves the marker *stops* anything (jsdom applies no Tailwind). The stillness selector is now asserted in compiled CSS and the marker's lifecycle is exercised through a real `change` event.
  - `[low]` `[patch]` AC9 — nothing exercised it; `mount()` rendered `<TodoList />` alone. A `TodoCard` mount with the read in flight was added.
  - `[low]` `[reject]` AC10 — the proxy is a source regex that also bans `isLoading`, stricter than AC10 asks. No mutation exists until Epic 3, so no behavioural surface exists to assert against; the extra strictness costs nothing.
  - `[low]` `[reject]` AC4 — the scan proves no second *declaration*, not that a future epic *imports* this one. Unavoidable: the importers do not exist yet.
  - `[false]` `[reject]` AC11 — recorded as the diff exceeding the criterion by covering all four hook states. That is `epic-2-context`'s "the list region is a persistent element", not overreach.
  - `[low]` `[patch]` AC numbering is internally shifted across at least three files. Confirmed against `epics.md:656-706`; every citation corrected.
  - `[false]` `[reject]` `epic-2-context.md` rewritten beyond the story's remit. The regeneration is this workflow's own step-01 action (the cached file was stale against today's consolidated `epics.md`), not the implementation's; the compile instruction mandates aggressive scoping to the stories that remain.
  - `[low]` `[patch]` `deferred-work.md` says Story 3.2 while the spec says Story 3.3 for the same item. Verified against `epics.md` and `sprint-status.yaml`: 3.2 is "Build the add input", 3.3 is "Add a Todo optimistically" — the **code** was wrong, not the spec. Corrected in `todo-list.tsx` and `deferred-work.md`.

**verification-gap (pre-verified layer)**
  - `[medium]` `[patch]` The reduced-motion media query string is never observed by any test — mutating `REDUCE` to `no-preference` kept 59/59 green. The stub now records every query and the motion cases assert it was `(prefers-reduced-motion: reduce)`.
  - `[medium]` `[patch]` `subscribe` is never exercised; a no-op body kept the suite green. A mid-session preference flip and an unmount-teardown assertion were added.
  - `[medium]` `[patch]` `skeleton-box`'s 21px and `checkbox-box`'s 21px are independent literals; moving the checkbox to 24px failed only `todo-row.test.ts`. The two compiled rules are now compared to each other.
  - `[medium]` `[patch]` `SOURCE_ROOTS` omits repository-root source, so `middleware.ts` escaped every "anywhere" scan. Root-level `.ts` files added and `middleware.ts` pinned in the non-vacuity case.
  - `[false]` `[reject]` (other) The SSR→hydration path was probed directly and works as documented, with no hydration mismatch. Reported as not-a-defect by the layer itself.
  - `[low]` `[reject]` (other) `use-todos.ts` still cites Stories 2.7/2.8. Pre-existing documentation drift in a file this story did not open; the opportunistic-sweep rule in `deferred-work.md` already owns it.

**blind-hunter**
  - `[low]` `[patch]` AC citations across the new code do not match `epics.md`. Confirmed; all corrected. (Grouped with the intent-alignment row above.)
  - `[low]` `[patch]` AC9 has no test anywhere in the diff. Confirmed; a `TodoCard`-level mount was added.
  - `[low]` `[patch]` `ruleFor(css, "skeleton-row")` returns the first of five matching rules, including `[data-still] .skeleton-row > *`. Confirmed fragile (it would fail loudly, not pass silently); the pulse assertion is now keyed on the exact selector.
  - `[low]` `[patch]` `skeleton-row.test.ts:190` re-typed `1400ms`, making a third home for the value. Confirmed; built from `SKELETON_PULSE_MS`.
  - `[medium]` `[patch]` Two whole-product bans landed in a motion test — `styleSheetMatches(/@media/)` and scans reaching `src/server/`. Confirmed at `motion.test.ts:126,136`; narrowed and scoped to `app/` + `src/client/`.
  - `[low]` `[patch]` The ms-literal scan's comment describes matches the regex cannot make (`.24s`, bare `1400`). Confirmed; comment now states what it enforces and what it does not.
  - `[medium]` `[patch]` The subscription half of `useReducedMotion` is untested. Confirmed (duplicate of the verification-gap row); covered by the new mid-session case.
  - `[medium]` `[patch]` The `matchMedia` stub ignores the query it is handed. Confirmed (duplicate); now asserted.
  - `[false]` `[reject]` The new global stub has no teardown and leaves `matches: true` installed. Disproved: `todo-list.render.test.tsx:58-62` already calls `vi.unstubAllGlobals()` in `afterEach`. The remaining half — no default stub — makes a forgetful future test throw loudly in jsdom, which is correct behaviour, not a silent inheritance.
  - `[medium]` `[patch]` The diff places Story 2.6's error banner inside the `<ul>` while `sticky-top-block.tsx` reserves slot 2 for it. Confirmed, and a banner inside a `<ul>` is invalid content; the comment now sends the banner to the sticky block and keeps only the empty state as a list-region branch.
  - `[low]` `[patch]` Stagger and bar widths keyed on `:nth-child` of the region, with nothing guarding position. Not reachable today (the region holds only skeletons while pending) but Story 3.3 inserts a row above them; re-keyed on `.skeleton-row + .skeleton-row` chains.
  - `[false]` `[reject]` `epic-2-context.md` regenerated, dropping content. As above: the regeneration is this workflow's, and mandated by the stale-cache rule. The one obligation it retired that is still open is deferred rather than rejected — see `deferred`.
  - `[false]` `[reject]` Spec frontmatter says `deferred: []` while six entries were written to `deferred-work.md`. The frontmatter field is populated by this review step, not by implementation; it is correct to be empty until now.
  - `[low]` `[patch]` Post-consolidation story numbers inconsistent (3.2 vs 3.3). Confirmed, with the premise inverted: the code was wrong and the spec right. Corrected in code.
  - `[low]` `[patch]` The `deferred-work.md` mockup entry cites the wrong lines and undercounts the divergences. Confirmed — the skeleton block is `key-states.html:332-353`, and the mockup rests both placeholders at tab-track. Corrected and the fourth divergence added.
  - `[medium]` `[defer]` The loading state is silent to assistive technology and the gap is unrecorded. Confirmed: all three `<li>`s are `aria-hidden`, the `<ul>` has no `aria-busy` and no name, and the failed-read branch is an empty `<ul>` too. Announcements are Story 2.6's; recorded in `deferred`. The related DESIGN.md `count: 3` sub-point is rejected as negligible — the count is pinned twice already, by `SKELETON_ROW_KEYS` and by a test.
  - `[low]` `[patch]` `readSources()` is the deferred tree-walk consolidation but the file header still calls that work outstanding. Confirmed; header corrected. The `SOURCE_ROOTS`-has-no-external-consumer and `"src"`-vs-`path.join` halves are cosmetic and left alone.

**edge-case-hunter**
  - `[low]` `[reject]` `window` present but `matchMedia` absent. No such target exists for this product; the only environment without it is jsdom, where the stub is the answer and a throw is the correct loud failure. The fix adds a branch to production code for an unreachable state.
  - `[low]` `[reject]` `MediaQueryList` without `addEventListener` (Safari < 14). Outside this product's target set (Next 16 / React 19); the fix adds a legacy branch for a state never shown reachable.
  - `[low]` `[patch]` `:nth-child` stagger breaks if a non-skeleton child precedes the skeletons. Same defect as blind-hunter's row above; re-keyed on sibling chains.
  - `[low]` `[patch]` The width override targets `> :last-child` and would land on the wrong element if a third child is added. Confirmed; now targets `> .skeleton-bar` by name.
  - `[low]` `[patch]` `[data-still]` matches on presence, so `data-still="false"` would suppress. Not producible by today's consumer, but the fix is a direct tightening; now `[data-still="true"]`.
  - `[low]` `[patch]` Any ancestor carrying `data-still` freezes the pulse. Same fix: the selector is now `[data-still="true"] > & > *`, so only the region's own marker reaches its own rows.
  - `[low]` `[patch]` AC citations land on the wrong criteria. Duplicate of the rows above; corrected.
  - `[false]` `[reject]` The spec's task list claims the skeleton `<li>`'s classes are "byte-identical" while the test compares a filtered, sorted set. The claim is in this build's spec, and a finding whose fix is to edit the spec is rejected by rule; the code comment's "class for class" is accurate about the geometry subset it names.
  - `[low]` `[reject]` The `export const <UPPER>_MS` scan is escapable by naming (`const COLLAPSE = 180`). Real, and already recorded in `deferred-work.md`. Widening the scan to bare integers would false-positive across the whole codebase — more than a direct correction, for a defect no developer meets in everyday use.
  - `[medium]` `[defer]` The removed `epic-2-context.md` bullet carried an Epic 1 obligation — the epic's first component test must prove the live regions survive hydration, not only server render — and `todo-list.render.test.tsx` renders `TodoList` alone, never the announcer. Confirmed still unmet; recorded in `deferred`.

## Design Notes

**Why the module owns reduced motion alone, and fails toward stillness.** The pulse could have been suppressed by a `@media (prefers-reduced-motion: reduce)` block in CSS — that is what the mockup does — but the module must read the preference anyway for Epics 4 and 5, whose behaviours are JS-timed (skip the 400ms hold and cut to the end state; skip the nudge but still spend its once-ever flag). Two homes for one decision is exactly what AC2 forbids, so the module is the single reader and the skeleton consumes it. Use `useSyncExternalStore` over `matchMedia`, and make the **server snapshot report reduced motion**: the SSR markup is still, and the pulse begins only once hydration has confirmed motion is allowed. A user who asked for stillness never sees a frame of motion; everyone else's pulse starts a few milliseconds late. jsdom implements no `matchMedia`, so the mount test must stub it.

**Why the per-row variation lives in CSS.** The three rows differ in pulse delay and bar width, and a component cannot express that: a computed `className` fails `dynamicClassNames`, an inline `style` fails `opaqueMarkup`, and `w-[70%]` fails the AD-13 scan. Position selectors inside the recipe carry it instead, which is also how the mockup does it. Sketch:

```css
@keyframes skeleton-pulse {
  0%, 100% { background-color: var(--color-hairline); }
  50%      { background-color: var(--color-tab-track); }
}
@utility skeleton-bar {          /* the untokenised literals, per Story 2.4's precedent */
  height: 12px; width: 70%; border-radius: var(--radius-full);
  background-color: var(--color-hairline);
  animation: skeleton-pulse 1400ms ease-in-out infinite;
}
@utility skeleton-row {
  &:nth-child(2) > * { animation-delay: 120ms; }
  &:nth-child(3) > * { animation-delay: 240ms; }
  [data-still] & > * { animation: none; }   /* (0,2,0) beats the utility's (0,1,0) */
}
```

**One bar per row, not two, and that is what makes AC6 true.** An Active row's height is `14px + max(21px checkbox, 21.03px text line box) + 14px`. A skeleton with one bar of any height ≤ 21px is governed by the same 21px checkbox placeholder and lands within a rounding error of it; a second stacked bar would push the content box to ~24px and shift every row by 3px when the real list arrives. The mockup agrees — one line per skeleton row.

**What this suite cannot reach, and must not pretend to.** AC6 is a zero-layout-shift claim, and nothing here runs a layout engine — jsdom computes no geometry and Tailwind is compiled, not applied. So AC6 is proved *structurally*, as an equality between the two rows' geometry class literals plus the single-bar argument below; an actual CLS measurement belongs to Epic 6's end-to-end pass. Say so in the code rather than implying the assertion is a measurement.

**`isPending`, and what it deliberately does not cover.** `isPending` is true only when there is no data and no error, which is exactly "the initial load is in flight" and is false for every optimistic mutation (AC10). Two future stories widen it, and each should be named in a comment rather than anticipated here: Story 2.6 must return the region to skeletons while `Retry` re-runs a read that is currently in the `error` state, and Story 3.3 must keep the skeletons pulsing beneath an optimistic row added during load (`EXPERIENCE.md:149`), which an `isPending` keyed to cache contents cannot do once `setQueryData` has written.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, zero warnings.
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: every suite green except the eight pre-existing failures in `src/server/repository/todos.test.ts` and `client-identity.test.ts`, which fail with `password authentication failed for user 'neondb_owner'` (an expired `.env` credential, confirmed identical at HEAD by Story 2.4). Confirm the count is still eight and the reason is unchanged before attributing any failure to that cause.
- `npx next build` -- expected: succeeds, and the production CSS contains the `@keyframes skeleton-pulse` rule and every new `skeleton-*` utility.

**Manual checks (if no CLI):**
- Mutate and re-run, one at a time: change the pulse constant in the module without changing `app/globals.css` (the agreement test must fail); add `window.matchMedia` to a component (the single-reader scan must fail); drop `shadow-row` from the skeleton row's class string (the geometry-equality test must fail); return `false` from the server snapshot (the fail-toward-stillness test must fail).

## Auto Run Result

Status: done

**Implemented change.** The motion module is seeded complete — `SKELETON_PULSE_MS`, `DEPARTURE_HOLD_MS`, `COLLAPSE_MS` and `FIRST_RUN_NUDGE_MS`, three of which have no consumer until Epics 4 and 5, plus `useReducedMotion()`, the product's only `matchMedia` call. It reads the preference through `useSyncExternalStore` with a server snapshot that reports *reduced*, so server-rendered markup ships still and the pulse begins only once hydration confirms motion is wanted. Its one consumer is the skeleton: three rows in the Active row's geometry, class for class, mounted into a list region that is now a persistent `<ul>` rather than the `return null` Story 2.4 left. Per-row variation (pulse stagger, bar width) and the stillness suppression live in `app/globals.css` as sibling-chain selectors, because every `className` in this product must stay a static string literal.

**Files changed.**
- `src/client/motion/motion.ts` — new: the four duration constants and the single reduced-motion reader.
- `src/client/motion/motion.test.ts` — new: AC1–AC4, as whole-tree absence scans plus a DESIGN.md-sourced pulse value and a compiled-stylesheet agreement check.
- `src/client/components/skeleton-row.tsx` / `.test.ts` — new: one skeleton row and its geometry-equality, compiled-CSS and inertness proofs.
- `app/globals.css` — appended by hand: `@keyframes skeleton-pulse` and the `skeleton-box` / `skeleton-bar` / `skeleton-row` recipes.
- `src/client/components/todo-list.tsx` — the `<ul>` is unconditional; `isPending` renders skeletons, resolved renders rows, a failed read renders an empty region.
- `src/client/components/todo-list.test.ts`, `todo-list.render.test.tsx` — the invalidated assertions inverted, plus the skeleton, failed-read, stillness, mid-session-change and card-level cases.
- `src/test-support/markup.ts` — one shared `readSources()` walk over `app/`, `src/` and the repository root.
- `src/client/components/todo-card.tsx` — comment-only: corrected story numbers.
- `docs/implementation-artifacts/deferred-work.md` — six new deferrals; closes the "list region leaves the DOM" entry.
- `docs/implementation-artifacts/epic-2-context.md` — recompiled at step-01, because the cached copy predated today's consolidated `epics.md`.

**Review findings.** Four layers reported 45 findings. 16 entries after grouping: 14 patched (6 at entry verdict `medium`, 8 `low`), 2 deferred, and the remainder rejected.

Patched: the `matchMedia` stub now asserts which query the module asked for (mutating `REDUCE` had left 59/59 green); `subscribe`'s listener and teardown are exercised through a real `change` event; `skeleton-box`'s 21px is compared against `checkbox-box`'s compiled rule rather than a second typed literal; `readSources()` reaches repository-root source, so `middleware.ts` no longer escapes the "anywhere" scans; the blanket `@media` ban and the `src/server/`-reaching timer and store scans were narrowed; the pulse assertion is keyed on its exact selector and built from the constant instead of a third literal; the CSS stagger, bar widths and stillness selector were re-keyed off `:nth-child`/`:last-child`/attribute-presence; every AC citation was corrected against `epics.md`; the error-banner comment was moved out of the list region's branch list; Story 3.2 became Story 3.3; and the mockup-divergence entry's line range and missing fourth divergence were fixed. AC9 gained its first test — a `TodoCard` mount with the read in flight.

Rejected, with reasons: the two `matchMedia`/`MediaQueryList` legacy guards (unreachable in this product's targets, and the fix adds production branches); the `_MS`-scan naming escape (real, already recorded, and widening it to bare integers would false-positive everywhere); the "no stub teardown" claim (disproved — `vi.unstubAllGlobals()` is already in `afterEach`); the `deferred: []` frontmatter claim (that field is this step's to populate); the `epic-2-context.md` regeneration claims (it is this workflow's own mandated recompile, not the implementation's); the "byte-identical" wording claim (its fix is to edit this build's spec); and the structural-proof observations for AC5/AC6/AC7/AC10, which name the honest ceiling of a suite with no layout or animation engine.

**Follow-up review recommended: true.** Two or more `medium` entries were patched on a first pass. The specific unverified risk: the patch pass re-keyed every skeleton CSS selector — the stagger and bar widths onto `.skeleton-row + .skeleton-row` chains, the suppression onto `[data-still="true"] > & > *` — and those selectors are asserted only as compiled-CSS text against no rendered element, while the `:nth-child` form they replaced was the one the mockup had validated. An error in the new sibling chains would show as a wrong delay or a wrong bar width in a browser and would fail nothing in this suite.

**Verification performed.**
- `npm run lint` — clean, zero warnings.
- `npm run typecheck` — clean.
- `npm test` — 480 passing, 8 failing: the same pre-existing `password authentication failed for user 'neondb_owner'` failures in `src/server/repository/todos.test.ts` and `client-identity.test.ts`, count and reason unchanged from HEAD.
- `npx next build` — succeeds. Production CSS confirmed directly to carry `@keyframes skeleton-pulse`, `[data-still=true]>.skeleton-row>*{animation:none}` and both sibling-chain stagger and width rules; the prerendered document ships `<ul data-still="true">` with three skeleton rows, so fail-toward-stillness holds in the real build.
- All six I/O matrix rows are covered by tests that ran and passed, including the SSR/no-window row and the reduced-motion row.

**Residual risks.**
- AC6 (zero CLS) is proved structurally — identical geometry class literals plus a single-bar height argument — not measured. Epic 6 owns the measurement.
- The pulse duration is transcribed twice, in TypeScript and in CSS, held in step only by a test. The single-source fix needs `app/globals.test.ts`'s pinned token counts renegotiated, the same blocker Story 2.4 hit.
- The stagger delays (120ms/240ms) and the bar widths are CSS-only literals with no constant behind them.
- `isPending` is correct for today and deliberately does not cover Story 2.6's `Retry`-back-to-skeletons or Story 3.3's optimistic row during load; both are named in comments at the branch.
- Lightning CSS emits the stillness rule *before* the pulse rule in the production build, so suppression rests on specificity (0,2,0 against 0,1,0) rather than source order. Asserted as specificity, with the ordering fact recorded rather than relied on.
