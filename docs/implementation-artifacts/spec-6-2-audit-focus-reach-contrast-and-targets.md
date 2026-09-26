---
title: 'Story 6.2: Audit the assembled product — focus, reach, contrast and targets'
type: 'feature'
created: '2026-09-25'
baseline_revision: 'd34eb47aca4590a129cd3a5fa735a6c9659b110d'
baseline_commit: 'd34eb47aca4590a129cd3a5fa735a6c9659b110d'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-6-context.md'
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md'
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/EXPERIENCE.md'
warnings: ['oversized']
---

<frozen-after-approval>

## Intent

**Problem:** Five epics made local decisions about focus, reach, contrast and hit
size, and the assembled result has never been measured. The one requirement that
*could not* be built earlier is still missing entirely: the sticky block's live
height is nowhere, so `scroll-padding-top` is unset and a keyboard user tabbing
down a long list lands a focused checkbox underneath the block (UX-DR21,
EXPERIENCE.md:198). Everything else in this story is a measurement that has only
ever been asserted — 44px hit areas read off CSS, contrast ratios read off a
table, wrap at the 500-character ceiling read off a rule, tab order read off
source order.

**Approach:** Build the one thing Epic 6 permits — a live measurement of the
sticky block applied as scroll padding and scroll margin — and then measure the
finished surface four ways: a real-browser focus pass, a real-browser responsive
pass, a computed contrast pass against `DESIGN.md`'s table, and a keyboard and
target pass. Epic 6's scoping rule holds: apart from the sticky offset, product
source changes only where an audit surfaces a defect, and every such change is
recorded with the measurement that forced it.

## Boundaries & Constraints

**Always:**
- **The sticky offset is the only construction this story plans.** Every other
  product-source edit must be traceable to a measurement this story took. A
  criterion that cannot pass without a product change is a **finding**, recorded
  in frontmatter `deferred` with evidence, unless the defect decision below
  authorises the fix.
- **Measured, never hard-coded.** The block's height is read from the rendered
  element. `sticky-top-block.test.ts:141` already fails any `h-`/`min-h-`/`max-h-`
  class on the block precisely so a constant cannot become a second source of
  truth.
- **Smallest supported viewport is 320px wide.** Nothing in `DESIGN.md` or
  `EXPERIENCE.md` names one; 320 CSS px is WCAG 1.4.10's reflow floor and AC7 is
  that criterion's executable form. AC7 and AC8 run there; the existing `touch`
  project (Pixel 5, 393px) is not the floor.
- **Contrast is computed, never judged.** Each of `DESIGN.md`'s 18 tabulated
  pairs is recomputed from the two hex values `app/globals.css` actually
  declares, with WCAG 2.x relative luminance, and compared to the tabulated
  figure. The table is parsed from `DESIGN.md`, not retyped.
- Real-browser work reuses `e2e/support/app.ts`'s vocabulary and Story 6.1's
  rules: role- and text-based locators, no `data-testid`, Chromium only (the
  identity cookie is `secure`), production build, web-first assertions, never
  `waitForTimeout`.
- The six tree-walking source scans still bind: no literal `aria-live=` outside
  `announcer.tsx`, no re-declared contract, no `["todos"]`, no drizzle import.
  They do not skip `e2e/`.
- New theme tokens are forbidden. `app/globals.test.ts:170,180,190` assert
  **exactly** 21 `--color-*`, 4 `--radius-*` and 14 `--spacing-*` custom
  properties against `DESIGN.md`. `--sticky-block-height` is a runtime custom
  property written onto `document.documentElement`, never an `@theme` entry.
- No arbitrary-value classes and no hex literals outside `app/globals.css`
  (AD-13, `app/page.test.ts:91`). The scroll margin is an `@utility` recipe.

**Never:**
- Never add a JSX element to `sticky-top-block.tsx`. `sticky-top-block.test.ts:51`
  asserts its tag list is exactly `["div","AddTodo","ErrorBannerRegion","FilterTabs"]`,
  and `:150` pins its `bg-*` classes to exactly `["bg-card"]`. An `id` attribute
  on the existing `div` changes neither.
- Never add an element to `app/page.tsx` or `todo-card.tsx`: `app/page.test.ts:76`
  asserts the page renders the card and nothing beside it.
- Never introduce a second scrolling element or an `overflow` declaration outside
  `todo-card.test.ts`'s allow-list. `scroll-padding`/`scroll-margin` are not
  `overflow` and are unaffected.
- Never rename the Filter Views or use the word "Done" as a label.
- Never soften a contrast failure by moving a `DESIGN.md` value. AC12's 4.69:1
  pair has no headroom; if it drifts, the story fails rather than the table
  changing.
- Never truncate or clip Todo text to make AC8 pass. `DESIGN.md:340` names the
  lever as `todo-text` size and line-height.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Measure at rest (AC1) | Block holds input + empty banner region + tabs | `--sticky-block-height` equals the block's rendered `getBoundingClientRect().height`; no constant appears anywhere | Element absent (SSR, unmount) → property removed, offsets fall back to `0px` |
| Apply (AC2) | Height measured | `scroll-padding-top` on the root scroll container **and** `scroll-margin-top` on each row's checkbox and delete control both resolve to that height | Fallback `0px` keeps the page scrollable if the hook never runs |
| Tab below the fold (AC3) | 25 Todos, scrolled, Tab into a row control | Control's `top` ≥ the block's `bottom` — never partially covered, measured from both bounding boxes | Failure reports both rects, not a boolean |
| Banner grows under focus (AC4) | A control focused, then a mutation fails | Offset re-measures; AC3 re-asserted with the banner occupied | `ResizeObserver` is the trigger; no polling |
| Every view (AC5) | AC3 repeated at top / middle / bottom scroll, in All / Active / Completed | Holds in all nine combinations | n/a |
| 320px reflow (AC7, AC8) | 320×568, one Todo of exactly 500 characters | `document.scrollingElement.scrollWidth` ≤ client width; the row's text is fully rendered, no `text-overflow`, no clipped box | Any horizontal overflow names the offending element |
| Desktop cap (AC9) | 1440px wide | Card measures 640px and stops; one column, one region, at every width sampled | n/a |
| Viewport height change (AC10) | Height reduced mid-scroll (address-bar proxy) | Block's `top` is still 0 and its height is re-measured | A real address bar cannot be driven headless — recorded, not claimed |
| Contrast pair (AC11–AC13) | Each `DESIGN.md` row's two tokens | Computed ratio matches the tabulated value to 2 decimal places | A mismatch names the pair, the tabulated value and the computed one |
| Banned token use (AC14, AC15) | Whole product surface | `accent` never paints on `row-complete`; `hairline` appears only in `empty-panel` and the skeleton fill | A hit names file and class |
| Tab order (AC16, AC17) | Tab from the top with the banner occupied | input → Retry → All → Active → Completed → per row, checkbox → delete; each row's delete control is reachable and reveals on focus | Reports the observed order against the expected one |
| Hit area (AC18) | Every interactive element on the surface | Each bounding box ≥ 44×44 | Reports element, width and height |
| Trap (AC19, AC20) | Tab past the last control; open the dialog | Focus leaves the page outside the dialog; inside it Escape closes; every focused element shows a non-`none` focus shadow | n/a |

**Decided — what happens to a defect this audit surfaces.** Three of the six
accessibility findings `deferred-work.md` routes here are **fixed in this story**,
because each is bounded, local, and has an owner nowhere else:
1. `Retry` drops keyboard focus to `document.body` when it unmounts itself. This
   contradicts a rule the product already states and already implements for
   delete — EXPERIENCE.md:202, "focus is never dropped to the document body",
   whose delete half is `src/client/todos/focus-after-delete.ts`. Focus moves to
   the add input, the same destination that function chooses when the list empties.
2. A resolved-empty list is announced twice — once by the named, still-present
   list region and once by the empty state. One of the two announcements goes.
3. The character counter and the 500-character ceiling are silent to assistive
   technology. The fix routes through the single `announce()` function; a literal
   `aria-live` attribute outside `announcer.tsx` is banned by a tree-walking scan.

Three are **recorded, not fixed** — each is an interaction-design change that
deserves a story rather than an audit's diff: the filter tabs being a `tablist`
with no `tabpanel` and no roving `tabindex`; a departure's announcement being
replaced under reduced motion; and Completion Status reaching assistive
technology, which is to be **confirmed by measurement** (the checkbox's
`aria-checked` most likely closed it already) and its entry closed or re-affirmed
on that evidence rather than on reasoning.

A *fresh* failure this audit surfaces is fixed only if it clears the same bar —
bounded, local, and violating a rule the product already states. Everything else
is recorded in frontmatter `deferred` with the measurement that found it. AC12's
contrast floor is the one exception in the other direction: a drift below 4.5:1
fails the story outright.

</frozen-after-approval>

## Code Map

**The sticky offset — where each piece may and may not go**
- `src/client/components/sticky-top-block.tsx:70` — the one `div`, classes
  `top-block-stack sticky top-0 z-10 -mx-gutter flex flex-col bg-card px-gutter`.
  It is a **Server Component** (`todo-list.test.ts` asserts it stays one), so it
  can hold no ref and no hook. Give it `id="sticky-top-block"` — an attribute,
  which neither of its two exact-list assertions sees.
- `src/client/components/todo-list.tsx` — `"use client"`, mounted for the whole
  session, a sibling *after* the block inside `todo-card.tsx`. Already reaches
  into the document by id at `:251,259` (`document.getElementById`), so the hook
  call is in-idiom and adds no markup.
- `src/client/device/pointer.ts` — the precedent for a device/viewport hook
  (`useSyncExternalStore` with a `getServerSnapshot`, SSR-safe, no `"use client"`
  of its own). The new hook belongs beside it:
  `src/client/device/sticky-block-offset.ts`, which does not exist yet.
- `app/globals.css` — `@utility top-block-stack` at `:496` (`padding-top:10px; gap:10px`)
  is what makes the height non-obvious enough to measure. The file is all
  `@theme` + `@utility` today; the root rule this story adds is its first plain
  selector. `--spacing-touch-target-min: 44px` at `:95` is the 44px source of truth.
- `src/client/components/todo-row.tsx:349` (checkbox) and `:401` (delete control)
  — the two focusable row descendants AC2 names. Both already carry
  `focus-visible:shadow-focus` and `group-data-completed:focus-visible:shadow-focus-on-complete`.
- `app/layout.tsx` — `overflow-x-hidden` on `<body>`, which propagates to the
  viewport (`todo-card.test.ts:139-151`). This is why the sticky block still
  sticks and why AC7 is about the propagated rule, not about a nested scroller.

**What already measures things, and must be reused rather than reinvented**
- `src/test-support/tailwind.ts` — `tailwindCompiler()` / `ruleFor()` drive the
  **real** Tailwind engine over the real `app/globals.css`. `app/page.test.ts:145`
  and `app/globals.test.ts:455` are the working examples; this is how a class is
  resolved to a declaration without a browser.
- `src/test-support/markup.ts` — `readMarkup`, `matches`, `matchesWithElement`,
  `styleSheetMatches`, `classNamesOf`. Every source scan in the repository is
  built from these; AC14, AC15 and AC21's source half are more of the same.
- `app/globals.test.ts:325-380` — the checkbox's 44px hit area already asserted
  from `--spacing-touch-target-min` in both dimensions. AC18 is the *rendered*
  half of the same claim, not a replacement for it.
- `e2e/support/app.ts` — the full locator vocabulary (`addInput`, `rows`, `row`,
  `checkbox`, `deleteControl`, `banner`, `retryControl`, `filterTab`,
  `deleteDialog`, `seed`, `addTodo`, `failNext`, `holdOpen`, `revealDeleteControl`,
  `openDeleteDialog`) plus the exact copy constants. Extend this module; do not
  re-derive locators in a spec.
- `playwright.config.ts:50-63` — two Chromium projects, `pointer`
  (Desktop Chrome) and `touch` (Pixel 5, 393px).

**DESIGN.md, the contrast authority**
- `DESIGN.md:471-489`, `§Dos and don'ts → "Contrast — every load-bearing pair"` — 18 rows, each naming
  two `{colors.*}` tokens and a ratio. `{colors.text-completed}` on
  `{colors.row-complete}` = **4.69:1** (AC12); `{colors.accent-deep}` on
  `{colors.row-complete}` = **4.33:1** (AC13); `{colors.border-control}` on
  `{colors.card}` = **3.28:1** (AC13); `{colors.accent}` on `{colors.row-complete}`
  = **2.97:1**, the pair marked **Fails** and recorded so nobody re-derives it
  (AC14); `{colors.hairline}` on `{colors.card}` = **1.28:1**, exempt and
  decorative-only (AC15).

**What does not exist yet**
- No `ResizeObserver` or `visualViewport` use anywhere in the repository — jsdom
  provides neither, so the hook's unit test supplies a stub.
- No `scroll-padding` or `scroll-margin` declaration anywhere.
- No contrast computation anywhere; the ratios live only in `DESIGN.md` prose.

## Tasks & Acceptance

**Execution:**
- [x] `src/client/components/sticky-top-block.tsx` — add `id="sticky-top-block"`
  to the existing `div` and update the file's comment, which currently says the
  measurement "is Story 6.2's". Attribute only: no element, no class, no height.
- [x] `src/client/device/sticky-block-offset.ts` — **new**. `useStickyBlockOffset()`:
  resolve the block by id in a layout effect, measure `getBoundingClientRect().height`,
  write it as `--sticky-block-height` (px, rounded) on `document.documentElement`,
  keep it current with a `ResizeObserver` on the block plus a `visualViewport`
  (falling back to `window`) resize listener, and remove the property on cleanup.
  SSR- and absence-safe like `pointer.ts`: no window at module scope, no throw
  when the element is missing.
- [x] `src/client/device/sticky-block-offset.test.tsx` — **new**. Stub
  `ResizeObserver`; assert the property is written from a measured height, updated
  when the observer fires with a taller block, removed on unmount, and that the
  module contains no numeric height literal. Negative fixture: a stubbed height
  change that is *not* propagated fails the test.
- [x] `src/client/components/todo-list.tsx` — call `useStickyBlockOffset()`. No
  markup change; the component's existing tests must stay green untouched.
- [x] `app/globals.css` — add `:root { scroll-padding-top: var(--sticky-block-height, 0px); }`
  and `@utility scroll-clear-sticky { scroll-margin-top: var(--sticky-block-height, 0px); }`,
  each with the UX-DR21 line it transcribes. No `@theme` entry — the token counts
  in `app/globals.test.ts` are exact.
- [x] `src/client/components/todo-row.tsx` — add `scroll-clear-sticky` to the
  checkbox and the delete control, the two focusable row descendants.
- [x] `app/globals.contrast.test.ts` — **new**. Parse `DESIGN.md`'s contrast
  table and the `@theme` colour values, compute WCAG relative-luminance ratios,
  and assert every row matches. Include the AC12 floor as its own assertion
  (`≥ 4.5`), the three AC13 corrections, and negative fixtures proving a drifted
  hex and a mistyped table value both fail.
- [x] `src/client/components/token-usage.test.ts` — **new**. AC14: no markup pairs
  an `accent` paint with a `row-complete`/`group-data-completed` surface —
  `todo-row.tsx:349`'s `group-data-completed:aria-checked:bg-accent-deep` and
  `group-data-completed:focus-visible:shadow-focus-on-complete` are the shape that
  must hold. AC15: `hairline` appears only in `empty-panel` and the skeleton
  resting fill, and never on an operable boundary.
- [x] `src/client/components/banned-patterns.test.ts` — **new**. AC21's source
  half over the whole markup tree: no drag/reorder handlers, no bulk-action
  control, no long-press timer, no toast, no undo affordance, no pagination or
  intersection-observer list growth, no hover-only affordance without a
  `:focus-visible` twin, no second `<dialog>`, and no animation keyed to mount.
  `todo-card.test.ts` already bans the fade/mask/inner-shadow family — extend the
  idea, do not duplicate those assertions.
- [x] `playwright.config.ts` — add a third Chromium project, `narrow`, at 320×568
  with touch, for AC7 and AC8. Comment why 320 is the floor.
- [x] `e2e/support/app.ts` — extend with `stickyBlock(page)`, `boxOf(locator)`,
  `assertClearOfStickyBlock(page, locator)` (compares both rects, reports both on
  failure), `tabSequence(page, steps)` (returns accessible names/ids of
  successively focused elements), `interactiveElements(page)`, and
  `LONG_TODO_TEXT` (exactly 500 characters). One module, one locator vocabulary.
- [x] `e2e/audit-focus.spec.ts` — **new**. AC3 (tab to controls below the fold),
  AC4 (force a failure so the banner occupies while a control is focused, then
  re-assert), AC5 (three scroll positions × three Filter Views), AC16 (tab order
  from the top with the banner occupied), AC17 (delete control reachable and
  revealed by focus — assert `opacity` leaves `0`), AC18 (every interactive
  element ≥ 44×44, including the dialog's buttons), AC19 (no trap outside the
  dialog; Escape closes it), AC20 (every focused element resolves a non-`none`
  `box-shadow`).
- [x] `e2e/audit-responsive.spec.ts` — **new**. AC6 (`narrow`/`touch`: the input
  stays within a thumb's reach of the top at three scroll positions — the sticky
  block's `top` stays 0), AC7 (no horizontal overflow at 320 / 393 / 640 / 1024 /
  1440), AC8 (a 500-character Todo at 320px: full text rendered, row grows,
  nothing clipped or ellipsised, and the measured line count recorded), AC9
  (card caps at 640px; one column and one region at every sampled width), AC10
  (viewport height reduced mid-scroll → block re-seats and re-measures), AC21's
  DOM half (no toast, no undo, no second dialog, no hover-only control).
- [x] `src/client/components/error-banner.tsx` — on `Retry`, move focus to the
  add input before the control unmounts (decision 1). `focus-after-delete.ts` is
  the precedent for the destination, not a module to reuse — this is not a
  post-delete question. Note its shape: it is a pure function returning
  `{kind:"input"}`, and `todo-list.tsx` is what performs the actual `.focus()`
  via `document.getElementById(ADD_INPUT_ID)`. The banner's fix needs the same
  split or a local equivalent, not a call into it.
- [x] `src/client/components/empty-state.tsx` / `todo-list.tsx` — remove one of
  the two announcements of a resolved-empty list (decision 2), keeping whichever
  a screen reader reaches first, and pin the single announcement with a test.
- [x] `src/client/components/add-input.tsx` — announce the character counter's
  ceiling through `announce()` (decision 3). No literal `aria-live` attribute —
  `announcer.test.ts:227-246` walks the whole tree and fails any file that
  declares one.
- [x] `docs/implementation-artifacts/deferred-work.md` — append the audit's
  findings and, for each `deferred-work.md` entry this story's measurements close,
  a `closes:` entry naming the measurement that closed it.
- [x] `README.md` — one line under Testing naming the third Playwright project
  and what it is for. Story 6.3 re-verifies the document as a whole.

**Acceptance Criteria:**
- Given the block with any combination of occupants, when it is measured, then
  `--sticky-block-height` equals its rendered height and no height constant for it
  exists in the repository. *(AC1)*
- Given that height, when the page is inspected, then the root scroll container
  resolves `scroll-padding-top` to it and both focusable controls in every row
  resolve `scroll-margin-top` to it. *(AC2)*
- Given a list long enough to scroll, when a row control below the fold takes
  keyboard focus at any of three scroll positions in any of the three Filter
  Views, then its top edge is at or below the block's bottom edge, with both
  rectangles reported. *(AC3, AC5)*
- Given a control already focused, when a forced failure occupies the banner and
  the block grows, then the offset re-measures and the clearance assertion still
  holds. *(AC4)*
- Given 320 / 393 / 640 / 1024 / 1440px, when the page is measured, then the
  scrolling element's scroll width never exceeds its client width, the card stops
  at 640px, and no second column or region appears. *(AC7, AC9)*
- Given a 500-character Todo at 320px, when the row renders, then every character
  is laid out, the row's height grew to hold it, and no `text-overflow`, clip or
  fixed row height is in effect; the measured height and line count are recorded
  in Implementation Notes as the judgement AC8 asks for. *(AC8)*
- Given the smallest viewport, when the page is scrolled to three positions, then
  the sticky block's top stays at 0 so the add input remains one tap away; and
  when the viewport height shrinks, the block re-seats and re-measures. *(AC6, AC10)*
- Given each of `DESIGN.md`'s 18 tabulated pairs, when its ratio is recomputed
  from the hex values `app/globals.css` declares, then it matches the tabulated
  figure; `text-completed` on `row-complete` is 4.69:1 and any drift below 4.5:1
  fails; and the three 1.4.11 corrections hold in the running product.
  *(AC11, AC12, AC13)*
- Given the product surface, when it is scanned, then `accent` never paints on
  mint and `hairline` bounds nothing operable. *(AC14, AC15)*
- Given the banner occupied, when the user tabs from the top, then the observed
  focus order is input → Retry → All → Active → Completed → per row, checkbox →
  delete, matching reading order; and every row's delete control is reachable and
  becomes visible on focus. *(AC16, AC17)*
- Given every interactive element on the surface including the dialog's, when
  each is measured, then its hit area is at least 44px in both dimensions.
  *(AC18)*
- Given the finished product, when focus is driven past the last control, then it
  leaves the page; inside the dialog it is trapped and Escape releases it; and
  every element that takes focus resolves a visible focus shadow. *(AC19, AC20)*
- Given the banned-pattern list, when the surface and its source are audited,
  then none of the nine patterns is present. *(AC21)*
- Given `Retry`, an emptied list and the character ceiling, when each is
  exercised, then focus lands on the add input rather than `document.body`, the
  empty list is announced exactly once, and the ceiling reaches assistive
  technology through `announce()`. *(decisions 1–3)*
- Given a measurement that fails, when it is handled, then the defect decision
  is applied literally — recorded in frontmatter `deferred` with its
  evidence, or fixed with the measurement that forced it named in Implementation
  Notes. No product source changes without one or the other. *(epic scoping rule)*

## Implementation Notes

**What was built.** One construction, as the epic permits: the sticky block's
height is measured live and published as `--sticky-block-height`, read back by
`scroll-padding-top` on `:root` and a `scroll-clear-sticky` recipe on the two
focusable row descendants. Four product files carry it — an `id` attribute on
the block, the hook, the hook's call site in `todo-list.tsx`, and two classes
in `todo-row.tsx` — plus the two declarations in `app/globals.css`.

**A third module, not planned.** The spec put the id and the property name in
the hook's module. That does not build: `sticky-top-block.tsx` is a Server
Component, and importing a constant from a module that imports
`useLayoutEffect` fails with *"You're importing a module that depends on
`useLayoutEffect` into a React Server Component module"*. Marking the hook
`"use client"` does not help either — a constant imported from a client module
into a Server Component arrives as a client reference, not the string. So the
two shared names live in `src/client/device/sticky-block-contract.ts`, which
imports nothing. Caught by `npm run build`; no unit test could have seen it.

**The three defect decisions, applied.**
1. `Retry` now moves focus to the add input before `retryCurrentError()`
   unmounts the button (`error-banner.tsx`). Focus first, then the retry, so
   it leaves a live element. `error-banner.test.ts`'s binding assertion
   followed the indirection rather than pinning the old literal.
2. A resolved-empty list is conveyed once. The empty state's announcement
   stays — it is DESIGN.md's copy, it reaches a screen reader without
   navigation, and it is Story 2.6 AC17 — and the list region drops its
   *exposure* in that one state via `aria-hidden`, driven by the same
   `resolvedEmpty` expression that renders the panel. The element never leaves
   the DOM, so Story 2.5 AC11 is untouched. Pinned by two tests in
   `todo-list.render.test.tsx`, including the over-broad-fix case.
3. The character ceiling speaks through `announce()`, on a *change of stage*
   rather than of length: crossing 450 says "50 characters left.", reaching
   500 says "Character limit reached.", and the 49 keystrokes between are
   silent — which is the flooding cost `deferred-work.md` named.

**Two guards were narrowed, and why.** `add-input.test.ts` banned every
comparison against `TODO_TEXT_MAX_LENGTH` as a proxy for AC4's "nothing
changes at exactly 500". Decision 3 requires a comparison that changes nothing
visible, so the ban is now stated against what it stood for — no computed
`className` anywhere in the file — which is a stronger claim than the regex
made. The bare-numeral wording ban was scoped to the JSX, because the fix for
the gap the bare numeral created necessarily puts words in the module.

**What the measurements found.**
- **Contrast: all 18 tabulated pairs recompute exactly**, parsed from
  DESIGN.md and `app/globals.css` rather than retyped. `text-completed` on
  `row-complete` is 4.69:1 against the 4.5:1 floor — the table was right.
- **44px reach holds everywhere**, including the dialog's buttons — but only
  when measured as the reachable area. The raw border boxes are 21x21
  (checkbox) and 17x17 (delete); the reach is the `::after` overlay, which is
  exactly what DESIGN.md:354 specifies.
- **Tab order is reading order**, observed: input → Retry → All 2 → Active 2
  → Completed 0 → checkbox → delete. The names carry their counts, which is
  what is actually spoken.
- **AC8, recorded as the criterion asks**: a 500-character Todo at 320px
  renders **595.4px tall, 28 lines at 14.5px/21.025px**, `text-overflow: clip`,
  no line clamp, and zero horizontal overflow. The Poppins tension DESIGN.md:340
  flagged did not materialise; no truncation lever was needed.
- **AC4's premise was wrong.** `epic-6-context.md` says the banner's occupancy
  changes the block's height. It never does — 202.9px at rest and with the
  banner open at 1280/640/393/320px, because `banner-region` reserves 78px and
  the 44px `Retry` pill dominates even a wrapped message. The test now measures all five states and asserts the
  published property and `scroll-padding-top` both track the block, which is
  the claim that survives. Recorded in `deferred-work.md`.

**Four of my own tests were wrong before the product was.** Worth stating,
because each failure initially looked like a finding: `row()` matches by
substring so "Todo 1" also selected "Todo 19"; `failNext(page, method,
pattern)` was called with its arguments swapped; the card is capped by the page
margin below 640+2*margin, so 604px at a 640px viewport is correct; and the
block only pins *once scrolled*, so `y = 0` at the top would have asserted that
the page is permanently scrolled. A fifth: `LONG_TODO_TEXT` ended in a space,
which HTML collapses — 500 characters in, 499 out, reading exactly like the
truncation the fixture exists to disprove.

**One pre-existing flake, fixed.** `e2e/persistence.spec.ts` AC3 asserted the
*optimistic* checked state and then reloaded, so it was racing the PATCH. It
passed until the third Playwright project added contention, then failed
reproducibly in full runs and passed in isolation. It now awaits the PATCH
response, which is what AC3 was always about. Recorded.

**The `visualViewport` listener was removed during review.** The hook first
subscribed to viewport resizes as well as observing the block, justified by a
phone's address bar. Nothing could be written that would fail if that listener
were deleted: the address bar changes the viewport's height without changing
the block's box, and a block whose box has not changed has no new height to
publish. `ResizeObserver` observes the only box that matters. One subscription
now, and two unprovable claims fewer.

**Project gating.** `narrow` runs only `audit-responsive.spec.ts`, `pointer`
ignores it, and AC4's width sweep is gated to `pointer` because
`setViewportSize()` does not compose with the Pixel 5 project's mobile
viewport emulation. The reported skips are that gating and nothing else.

## Spec Change Log

- **2026-09-25 — planning resume (draft → ready-for-dev).** Route changed
  `dispatch` → `oneshot` at the user's direction. Code Map anchors re-verified
  against baseline `d34eb47`; six citations corrected, two of them inside the
  frozen block: `sticky-top-block.tsx:75`→`:70`; `sticky-top-block.test.ts` tag
  list `:52`→`:51`, `bg-*` pin `:141`→`:150`, height-class ban `:136`→`:141`
  (the last two were cited on each other's lines); `todo-row.tsx` checkbox
  `:339`→`:349` and delete control `:380`→`:401`; `announcer.test.ts:215-231`
  →`:227-246`; contrast table anchored at `DESIGN.md:471-489`. No intent changed.
- **2026-09-25 — two Code Map facts corrected.** `pointer.ts` is
  `useSyncExternalStore`-based with a `getServerSnapshot`, not a latching
  `matchMedia` hook. `focus-after-delete.ts` is a pure function returning
  `{kind:"input"}`; `todo-list.tsx` performs the `.focus()`.
- **2026-09-25 — baseline measured, not assumed.** `npm test` at `d34eb47`:
  1213 passed / 53 files / 0 skipped, exit 0, live-database repository tests
  among those that ran. The Verification section's 1213 figure is confirmed.
- **2026-09-25 — the defect rule's `deferred` frontmatter list was not added.**
  The frozen block says three times that a measured defect which is not fixed
  is "recorded in frontmatter `deferred` with its evidence". The five
  deferrals this story produced are recorded in `deferred-work.md` instead,
  which is where every other story in this project records them and where the
  epic's own entries already live; a second, spec-local list would be a
  second place to look. The frozen block is not edited to say so — it is the
  human's — so the deviation is recorded here.
- **2026-09-25 — review triage.** One review layer (blind hunter) returned 17
  findings. Triage is in the Review Triage Log below; the substantive fixes
  were an announcement that reported a fixed remainder rather than the real
  one, a `Retry` focus move with no fallback, two vacuous or mis-scoped test
  scans, and a viewport sweep running on a project that cannot support it.
- **2026-09-25 — token gate.** Spec is ~6-7k tokens against the 1600 guideline.
  Presented with three candidate carves; user chose to keep the full spec.
  Recorded as an accepted risk, not an oversight.

## Review Triage Log

One layer ran: **blind hunter**, context-free, over the whole worktree. It
returned 17 findings. Verdicts are mine, checked at the cited line.

**Patched (11).**
1. `medium` — The counter announced a fixed "50 characters left." built from
   `MAX - COUNTER_APPEARS_AT`, so a paste or a `restore` of a 480-character
   draft said "50" while the numeral beside it said "20". Real. Now computed
   from the length at the crossing, and driven by a test that pastes 480.
2. `medium` — Decision 3 was pinned only by regexes over its own source. Real,
   and it is why finding 1 survived. Six behavioural tests added to
   `add-input.render.test.tsx`; the source scan narrowed to the one rule it is
   good for. A comment claiming the announcements were "driven end to end
   through the mounted card" was false and is corrected.
3. `medium` — `handleRetry` used `?.focus()`, which silently does nothing if
   the input is absent and then unmounts the button anyway — the exact
   `document.body` outcome decision 1 exists to prevent, under a comment
   claiming explicitness. Now resolved explicitly and guarded, with a render
   test that drives `Retry` and asserts where focus lands.
4. `medium` — AC4's width sweep ran on the Pixel 5 project, the
   `isMobile` + `setViewportSize()` combination `playwright.config.ts` itself
   says does not compose, and labelled its measurements "1280px" there. Gated
   to `pointer`; the figure it produced on `touch` is withdrawn from
   `deferred-work.md`.
5. `medium` — The `visualViewport` listener could not be shown to earn its
   place: AC10 passes identically with it deleted. Removed rather than
   papered over (see Implementation Notes).
6. `low` — The contrast parser sliced to `"\n## "`, which cannot match a
   `###`, under a comment promising "any heading level". Fixed.
7. `low` — That file promised a "duplicate-detection test below" proving
   `card` and `row-active` agree. It did not exist; `row-active` was parsed
   and discarded. Added.
8. `low` — The `@keyframes` ban ran over `readSources()`, which walks only
   `.ts`/`.tsx`, under a name asserting the product has exactly one — while
   `app/globals.css` has two. Split into what the scan can see (no keyframes
   in a component) and a stylesheet check that names both and says why
   neither is an entrance.
9. `low` — `\bcursor\b` matches `cursor-pointer`, so the first pointer-cursor
   utility would be reported as infinite scroll; and a second
   `useInfiniteQuery` assertion was a strict subset of the one above it.
   Narrowed, with a fixture pinning the distinction.
10. `low` — The `ResizeObserver` stub filed `observe`/`disconnect` against
    `observers[observers.length - 1]` rather than its own instance. Correct
    only while exactly one observer exists. Now per-instance.
11. `medium` — AC19 ended with a comment about Escape restoring focus to the
    trigger and asserted only that the dialog was hidden; `expect(padding)
    .not.toBe("auto")` was vacuous; and `assertClearOfStickyBlock` had no
    proof it could fail. All three addressed, the last with a negative fixture
    that removes the published height and confirms the helper rejects a
    covered control.
12. `low` — `token-usage.test.ts` compared on-mint and plain focus rings by
    aggregate count, so a control with a ring only on mint passed as long as
    another element carried two. Now compared per element.

**Rejected as false (2).**
- `false` — "The AC7 horizontal-overflow assertion cannot fail, because
  `overflow-x-hidden` clips the overflow so `scrollWidth` always equals
  `clientWidth`." Disproved by measurement: injecting a 2000px-wide element
  into the running page at a 320px viewport gives `scrollWidth` 2000 against
  `clientWidth` 320. Clipping prevents *scrolling*, not the measurement. The
  per-element scan being nested inside `if (overflow > 0)` is also correct —
  it exists to name the offender once overflow is detected, not to detect it.
- `false` — "The story is left `in-progress` in both trackers while the work
  reads as finished." That is this step of the workflow: the status moves to
  `review`/`done` at finalisation, after review, which is where it now is.

**Accepted and recorded, not patched (2).**
- `low` — The e2e layer spells `#sticky-top-block` and `--sticky-block-height`
  as literals rather than importing the contract module. Real, but the import
  is not available: `e2e/support/app.ts` deliberately imports nothing from
  `src/`, which that module's own header states and which keeps the contract
  and query-key scans honest. The trade is now written down there instead of
  being claimed away — the previous comment said the module "reads the same id
  rather than inventing a parallel one", which was not true.
- `low` — The `visualViewport` branch was never present in any test, so "one
  or the other, never both" was unproven. Dissolved by finding 5: the branch
  no longer exists.

## Design Notes

**Why the hook lives in `todo-list.tsx` and not in the block.** The block is a
Server Component by assertion, and its JSX tag list is pinned to exactly four
entries — so it can hold neither a ref nor a wrapper. `TodoList` is the client
component mounted beside it for the whole session, and it already resolves
elements by id (`document.getElementById(rowCheckboxId(...))` at `:251`). A hook
call there adds no markup, crosses no boundary, and touches no existing test.

**Why `--sticky-block-height` is not a theme token.** `app/globals.test.ts`
asserts exactly 21 colour, 4 radius and 14 spacing custom properties against
`DESIGN.md`, so an `@theme` entry would fail a done story's completeness guard —
correctly, because this value is not a design token. It is a runtime measurement,
so it is written on `document.documentElement` at runtime and read through
`var(--sticky-block-height, 0px)`. The fallback is what keeps the page usable if
the hook never runs.

**Why 320px.** No document names a smallest supported viewport. AC7 is WCAG
1.4.10's reflow requirement in product language, and 1.4.10's threshold is 320
CSS px. Picking the existing Pixel 5 project instead would make AC7 and AC8 pass
on a wider screen than the criterion they encode.

**How "never even partially covered" is measured.** Not by a screenshot and not
by `toBeInViewport()`. Both rectangles are read with `boundingBox()` and compared:
the control's `y` must be at or below the block's `y + height`. A failure reports
both rectangles, because the interesting information is by how much and in which
direction.

## Verification

**Commands:**
- `npm run lint` -- expected: clean at `--max-warnings=0`, with `e2e/` linted.
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: all files pass, **zero skipped**, count above today's
  1213, live-branch repository tests among those that ran.
- `npm test -- app/globals.test.ts app/page.test.ts src/client/components/sticky-top-block.test.ts src/client/components/todo-card.test.ts src/client/components/todo-list.test.ts src/client/components/todo-row.test.ts`
  -- expected: green **without edits**. These are the done-story guards this
  story's product edits run closest to. Run them first.
- `npm test -- src/client/feedback/announcer.test.ts src/shared/contract/contract.test.ts src/client/providers.test.ts src/server/repository/client-identity.test.ts middleware.test.ts`
  -- expected: the tree-walking scans still pass with the new files present.
- `npm run test:e2e` -- expected: all three Chromium projects green; the `narrow`
  project's skips are project gating only.

**Measured on completion (baseline `d34eb47`):**
- `npm run lint` -- clean. `npm run typecheck` -- clean.
- `npm test` -- **1299 passed / 57 files / 0 skipped**, exit 0, up from 1213/53,
  live-database repository tests among those that ran.
- `npm run test:e2e` -- **81 passed / 13 skipped / 0 failed**, exit 0, 11.0s at
  the default 9 workers. The 13 skips are project gating and nothing else:
  the responsive audit's floor-specific tests outside `narrow`, and AC4's
  width sweep outside `pointer`.

**Manual checks (if no CLI):**
- `git diff --stat` on `app/`, `src/client/`, `src/server/`, `src/shared/`,
  `middleware.ts`: every non-test product file in the diff is either the sticky
  offset (four files) or carries a named measurement in Implementation Notes.
