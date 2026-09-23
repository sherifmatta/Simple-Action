---
title: 'Story 3.2: Build the add input'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-3-context.md'
  - '{project-root}/docs/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Slot 1 of the sticky top block is still a JSX comment. There is nowhere to type, so capture — the product's whole reason to exist — cannot begin. The field also has to be the one part of the card that never waits: interactive from first paint, while skeletons are still pulsing, because a thought the user is trying not to lose does not wait for a network round trip.

**Approach:** Build `AddInput` as its own component and place it in slot 1 of the existing `StickyTopBlock`, never re-implementing stickiness. Enter with valid text submits, clears the field and keeps focus; whitespace-only is a silent no-op that does not clear. Typing stops at 500 characters with a counter that has been counting down since 450, and nothing about the interface changes at the ceiling itself. The mutation is Story 3.3's — this story ships the field, its rules, and the seam.

**Decisions recorded at planning time** (the first three were the human's; the rest follow from the repository's own constraints and are the agent's):

1. **`<input type="text">` at a fixed height, not a growing `<textarea>`.** `mockups/key-states.html:642` leaves grow-vs-cap explicitly undecided; a fixed single-line field settles it. Enter becomes a plain `onKeyDown` with no newline to suppress and no form element, and the list never shifts while the user types — which matters inside a sticky block. Text scrolls horizontally past the field width.
2. **The 10px gap above the banner region and the block's pinned top inset are transcribed into recipes with their mockup citations** (`mockups/key-states.html:254`), rather than added to DESIGN.md as new tokens. Editing a planning artifact routes to defer by rule, and Story 2.6 set the precedent when it transcribed the banner icon's `17×17` SVG geometry the same way. Both values become visible for the first time in this story, so deferring them again would ship a field touching the viewport edge on pin.
3. **The pill `Enter` hint is capability-gated with `@media (pointer: fine)`, not width-gated.** It sits beside an autofocus rule that EXPERIENCE.md:245 defines by capability rather than width, and the two reading differently would be arbitrary. As a CSS media query inside the recipe it adds no `matchMedia` call site.
4. **Autofocus adds a small `src/client/device/` module, and `motion.test.ts`'s `matchMedia` scan narrows to `prefers-reduced-motion`.** Autofocus cannot be decided in CSS, so `(pointer: fine)` must be read in JavaScript — a second `matchMedia` site, which today's scan forbids. That scan exists to stop motion being branched in a component, not to make `motion.ts` the sole owner of media queries; narrowing it to the motion query keeps every guarantee it was written to give.
5. **`AddInput` takes an `onSubmit: (text: string) => void` prop, passed a named placeholder from `StickyTopBlock` that cites Story 3.3 as its owner.** The seam is explicit and typed, so 3.2's clear-and-retain-focus behaviour is observable in a test without a mutation existing, and 3.3 replaces one named constant rather than restructuring the component.
6. **DESIGN.md beats the mockup wherever they disagree**, per AD-13: padding is `{spacing.4} {spacing.5}`, not the mockup's untokenised `12px 13px`; the counter is weight 500 from `{typography.counter}`, not the mockup's 600. `tabular-nums` and the 1.5px border width go into an `input-add` recipe with citations, because neither has a token. The 44px width floor is declared in that recipe against `var(--spacing-touch-target-min)`, because `todo-card.test.ts:188` bans the whole `min-w-*` family tree-wide.
7. **The counter's fade-in is a `globals.css` recipe whose duration is asserted against a new `motion.ts` constant** — the `skeleton-row` precedent — because `motion.test.ts:226` bans `transition-*`, `duration-*` and `animate-*` classes everywhere and `:192` bans millisecond literals outside the motion module.
8. **Focus after `Retry` stays deferred to Story 6.2.** `deferred-work.md` names this story only as the earlier candidate owner, on the grounds that the input is the first focusable neighbour; no Story 3.2 acceptance criterion covers it, and neither DESIGN.md nor EXPERIENCE.md says where that focus should land.

</frozen-after-approval>

## Implementation Notes

### What was built

- **`src/client/components/add-input.tsx`** (new, `"use client"`) — `AddInput`. A single-line `<input>` in a flex row with the accent plus glyph, the character counter and the pill `Enter` hint. Enter submits through `isValidTodoText` and clears; everything else is absence: no query, no mutation, no `disabled`, no `readOnly`, nothing keyed on the ceiling.
- **`src/client/device/pointer.ts`** (new) — `usePointerFine()`, `useSyncExternalStore` over `(pointer: fine)` with a `false` server snapshot, mirroring `motion.ts` line for line.
- **`src/client/components/sticky-top-block.tsx`** — slot 1 is now `<AddInput />`; the container gained `flex flex-col`, `-mx-gutter px-gutter` and `top-block-stack`.
- **`app/globals.css`** — five recipes and one keyframe block: `top-block-stack`, `input-add`, `input-add-field`, `enter-hint`, `char-counter`, `@keyframes counter-fade-in`.
- **`src/client/motion/motion.ts`** — a fifth constant, `COUNTER_FADE_MS = 180`.
- **Tests** — `add-input.test.ts` (28, source + compiled CSS), `add-input.render.test.tsx` (22, jsdom), two additions to `todo-list.render.test.tsx`, and updates to `sticky-top-block.test.ts` (4 assertions) and `motion.test.ts` (the narrowed scan, the fifth constant).

### Decisions taken during the build

**The `onSubmit` seam could not be built as planning decision 5 describes it, and the deviation is forced rather than chosen.** The plan had `StickyTopBlock` declare a named placeholder and pass it as `onSubmit`. `sticky-top-block.tsx` is a Server Component — `todo-list.test.ts:246-256` asserts it stays one, naming a `"use client"` migrating up to the card as the regression — and "passing a function as a prop from a Server Component to a Client Component throws" (Next.js, *Server and Client boundary* guide). The one function that does cross is a Server Function, which AD-1 bans outright. So `SUBMIT_NOT_YET_WIRED` is declared in `add-input.tsx` as the prop's *default*, and the block renders `<AddInput />` with no props. Everything the decision was for survives: the prop is explicit and typed, a test passes a spy into it today, and Story 3.3 still replaces one named constant. `add-input.test.ts` asserts the block passes no `onSubmit`, so a well-meaning "fix" back to the plan fails rather than crashing at runtime.

**The `border` class is deliberately absent from the input's wrapper.** Tailwind emits `.border` *after* the `@utility` recipes, so `border` beside `input-add` would silently reset DESIGN.md's 1.5px back to 1px. Preflight already gives every element `border: 0 solid`, so the colour class plus the recipe's `border-width` is the whole declaration — which is why `retry-pill`'s element and `empty-panel`'s element omit it too. The `Enter` hint *does* carry `border`, because its edge is 1px and the recipe sets no width.

**`min-width: 0` on the field is a third forced recipe.** An `<input>`'s automatic minimum size is its intrinsic width — its `size` attribute's worth of characters, roughly 180px — so on a 320px viewport with the counter showing, the row grows past the card. The class that says this is `min-w-0`, and `todo-card.test.ts:188` bans the whole `min-w-*` family tree-wide. Same argument as `retry-pill`'s `min-width`, one property down.

**Both halves of the `deferred-work.md` gutter entry were taken, at one transcribed value.** `-mx-gutter px-gutter` widens the block to the card's border box so a row's shadow passes behind it rather than bleeding into the 18px gutter, and `top-block-stack` carries `padding-top: 10px` (the block's pinned inset) and `gap: 10px` (the gap above the banner region), both cited to `mockups/key-states.html:254`. The inset reuses the gap's number rather than inventing a second one; the visible consequence at rest is 10px more space above the input, inside the card's own `py-6`. The two `deferred-work.md` entries this discharges — the gutter/inset entry and the 10px gap entry — were left unedited because another agent was writing that file concurrently.

**The mockup's `min-height: 50px` was not transcribed.** DESIGN.md's padding (`{spacing.4} {spacing.5}`) beats the mockup's `12px 13px` per AD-13, and the mockup's 50px floor was drawn against *its* padding. `min-h-touch-target-min` is what AC9 actually requires, the computed height lands at 48px, and taking a mockup floor while overriding the padding that produced it would be transcription without the reasoning.

**`aria-label` duplicates the placeholder string from one constant.** There is no visible label and nowhere to put one (DESIGN.md:334), and a placeholder is a weak accessible name. The counter is left un-ARIA'd — plain text, no `aria-hidden` — because hiding it would remove real information; the `Enter` hint *is* `aria-hidden`, being decorative and not in the tab order (AC7).

**`COUNTER_FADE_MS` is chosen, not transcribed.** DESIGN.md:440 and EXPERIENCE.md:144 both say the counter "fades in" and neither gives a duration. 180ms is the shortest number already in the motion module — the fade has to be over before the next keystroke lands — declared as its own constant rather than as a second consumer of `COLLAPSE_MS`, so a row collapsing and a numeral appearing stay free to diverge.

**`motion.test.ts`'s scan was narrowed, and restated rather than relaxed.** It was "no source file but `motion.ts` contains `matchMedia`". It is now: `prefers-reduced-motion` appears in `motion.ts` alone, *and* every `matchMedia` caller in the product is enumerated with the query it asks (`mediaQueryReaders()`). The guarantee AC2 was written for — the motion decision has one home and is never branched in a component — is intact; what went is the incidental monopoly on media queries, which would have forced an unrelated capability question into the motion module. The `useSyncExternalStore` vacuousness check now expects two files for the same reason.

### Surprises

- **The counter's fade cannot be proved to *run* in jsdom**, which implements no CSS animation. It is proved where it is decidable: the compiled rule names `counter-fade-in` at `COUNTER_FADE_MS` and carries the `[data-still="true"] > &` suppression, and the marker itself is asserted on a real mounted element.
- **`maxLength` is not enforced on a programmatic value in jsdom** — it is a user-agent constraint on typed input. AC4 is therefore asserted as the declared attribute plus the stronger structural claim: the ceiling appears nowhere in the component but `maxLength`, so no comparison, class or branch *can* change at 500. The render test also pins the wrapper's and the counter's class strings identical either side of the ceiling.
- **An `<input>` normalises newlines out of its value**, so the whitespace-only case uses tabs and spaces.
- **Both source-scanning tests had to strip comments before matching.** Every absence this story asserts — nothing disabled, no danger ramp, no second media query, no literal ceiling — is discussed at length in the prose of the very files being scanned. `styleSheetMatches` already strips CSS comments for exactly this reason; `add-input.test.ts` does the same for TypeScript.

### Verification

`npm run lint` and `npm run typecheck` are clean. `npx vitest run` — 677 passed, 15 failed, all 15 in `src/server/repository/todos.test.ts` and `client-identity.test.ts` on `password authentication failed for user 'neondb_owner'`, the inherited stale-`DATABASE_URL` condition `epic-3-context.md:57` warns about. No client test fails. Not committed.

### Review fixes (client half)

Eight findings from the 2026-09-23 review, applied to the client files only; the server half of that review was applied concurrently by another agent and nothing under `app/api/`, `src/server/` or `src/shared/` was touched here.

**1. The autofocus latch was inverted, and fixing it as prescribed would have broken autofocus outright.** The guard was `if (autofocused.current || !pointerFine) return`, so a touch device never latched: the subscription firing later — a mouse plugged into a tablet — passed the guard and stole the caret, the exact theft the comment claimed to prevent. The prescribed fix (latch unconditionally on the effect's first run, focus only if the pointer is fine then) was measured against a real hydration before being written, and it is wrong in the other direction: a probe with `hydrateRoot` shows the effect running **twice** — once with the server snapshot `false`, once with the browser's `true` a commit later — so a first-run latch leaves every hydrated pointer device without a caret, and every client-side mount test still passes.

So the fix is the prescription's *intent* with the missing input supplied: `pointer.ts`'s snapshot is now three-valued — `"unknown" | "fine" | "coarse"`, and the hook is `usePointerCapability()`. `"unknown"` is the server's answer, distinct from `"coarse"` rather than collapsed into it, which is what makes "the first settled client answer" something the component can *see*. The effect skips the `"unknown"` run, latches on whichever real answer follows, and focuses only if that answer is `"fine"`. Both halves are now pinned by tests that mount the way the browser does — `hydrate()` in `add-input.render.test.tsx` — and each was mutation-checked: the old latch fails the mid-session case, the naive first-run latch fails the hydration case.

**2. IME composition guard.** `if (event.nativeEvent.isComposing) return;` after the `Enter` check. The Enter that commits a Japanese/Chinese/Korean candidate was capturing the half-composed reading and clearing the field. Covered by a render test that composes, commits, and then submits with a second Enter.

**3. `classesOn()` unioned every element sharing a tag name.** It now takes an optional distinguishing class, returns exactly one element's classes, and throws when more than one matches. The two `<span>` call sites pass `char-counter` and `enter-hint`; the doc comment says what the helper does and why. Mutation-checked: stripping `text-counter text-text-muted` from the hint used to pass on the counter's copies of them, and now fails.

**4. The unasserted recipe and the unpaired gutter.** `add-input.test.ts` compiles `top-block-stack` and reads back `padding-top: 10px` and `gap: 10px` (misspelling the `@utility` now fails). `sticky-top-block.test.ts` asserts `-mx-gutter` and `px-gutter` are present *if and only if* each other, plus that they are present at all, so the equality is not two absences agreeing.

**5. `pointer.ts` had no test.** `src/client/device/pointer.test.tsx` (jsdom) now covers the server snapshot and its two mutations, both client answers, the query actually asked, the `change` subscription driving a re-render in both directions, and `removeEventListener` being handed the same function object on unmount. It follows `motion.test.ts`'s shape and `todo-list.render.test.tsx`'s capturing stub.

**6. The counter shifted the field's text.** `tabular-nums` equalises digit widths, not digit counts, so 10 → 9 narrowed the span and the `flex-1` field grew into the gap mid-keystroke. `char-counter` now reserves `min-width: 2ch` — the counter's whole range is 50 → 0 — in the recipe, because `min-w-*` is banned tree-wide (`todo-card.test.ts:188`), and the compiled rule is asserted. The component comment no longer claims `tabular-nums` does this, and says plainly that the single shift at 450 remains: only a permanently reserved slot could remove it, and this story chose an absent counter over a present-and-empty one.

**7. Two weightless assertions.** The fade duration is now `/counter-fade-in (\d+)ms/g` with every capture asserted equal to `COUNTER_FADE_MS`, rather than one adjacent wrong number ruled out. `SUBMIT_NOT_YET_WIRED` is asserted to be an empty-bodied function and to be the prop's default, rather than to return `undefined` as any function without a return does.

**8. `focus-within:border-accent` is now asserted** — in the required-classes loop and as a compiled rule carrying `border-color: var(--color-accent)`.

Untouched, as instructed: the `pointer.ts`/`motion.ts` duplication, the counter and ceiling being invisible to assistive technology, the missing `enterKeyHint`/`autoComplete`/`autoCapitalize`/`spellCheck`, and `SUBMIT_NOT_YET_WIRED` discarding text until Story 3.3 — all recorded in `deferred-work.md`. The `remount()`/`beforeEach` test-helper cleanup was rejected on review and was not done.

`npm run lint` and `npm run typecheck` clean. `npx vitest run` — 697 passed, 17 failed, all 17 in `src/server/repository/todos.test.ts` and `client-identity.test.ts` on the stale `DATABASE_URL`. Every client and app test passes. Not committed.

## Spec Change Log

### 2026-09-23 — Planning decision 5 could not be built as approved. Not edited; flagged.

The approved decision reads: "`AddInput` takes an `onSubmit: (text: string) => void` prop, **passed a named placeholder from `StickyTopBlock`** that cites Story 3.3 as its owner."

The second half cannot be built. `sticky-top-block.tsx` is a Server Component — `todo-list.test.ts:246-256` asserts it stays one, naming a `"use client"` migrating up to the card as the regression it exists to catch — and a function prop does not cross from a Server Component into a Client Component. The one kind of function that does cross is a Server Function, which AD-1 bans outright. This was not foreseeable from the decision as written; it is a property of the boundary the block already sat on.

**Everything the decision was for survives.** `SUBMIT_NOT_YET_WIRED` is declared in `add-input.tsx` as the prop's default instead, the block renders `<AddInput />` with no props, and `add-input.test.ts` asserts the block passes no `onSubmit` so a well-meaning "fix" back to the approved wording fails a test rather than throwing at runtime. The prop is still explicit and typed, a spy still goes in that slot today, and Story 3.3 still replaces exactly one named constant.

**This wants no decision from you** — the outcome is the one the decision asked for, reached one file over. It is recorded because only you may change the frozen block, and the block's wording now names a file that does not hold the constant.

### 2026-09-23 — The prescribed autofocus-latch fix was itself wrong, and was corrected during the patch pass.

Review found the latch never closing on a touch device, so a mouse plugged in mid-session stole the caret — the exact theft the code's own comment claimed to prevent. The fix dictated at triage was "latch unconditionally on the effect's first run, focus only if the pointer is fine then". Measurement during the patch showed that breaks the other direction: the component is server-rendered and hydrated, so the effect runs **twice** — once with the server snapshot, once with the browser's real answer a commit later — and a first-run latch leaves every hydrated pointer device with no caret at all. Every existing test stayed green, because they all use `createRoot` rather than `hydrateRoot`.

The implemented fix supplies the missing input rather than either latch: `usePointerCapability` is now three-valued (`"unknown" | "fine" | "coarse"`), keeping the server's non-answer distinct from a real "coarse", so "the first settled answer" is something the consumer can actually observe. Both halves are pinned by tests that hydrate, and both were mutation-checked in both directions.

## Review Triage Log

One review layer ran (Blind Hunter, context-free, over the client half of the worktree). Fourteen findings; each was checked against the cited file before a verdict was written.

**Patched**

- `high` — **The autofocus latch did the opposite of its own comment.** `if (autofocused.current || !pointerFine) return;` never sets the latch on a touch device, so a mouse arriving mid-session passes the guard and yanks the caret into the field. Confirmed by reading the path. Fixed as described in the change log above.
- `medium` — No IME composition guard. The Enter that commits a Japanese, Chinese or Korean candidate is the same Enter this handler submits on, so every commit would have captured half-composed text and cleared the field. `event.nativeEvent.isComposing` added, with a compose-commit-submit test.
- `medium` — `classesOn()` silently unioned every element sharing a tag name, and there are two `<span>`s. The counter assertion would have passed with `rounded-full` on the counter, and the hint assertion with the hint's classes missing. Now scoped by marker class, throwing on ambiguity.
- `medium` — The `top-block-stack` recipe and the `-mx-gutter`/`px-gutter` pair were asserted nowhere: deleting the `@utility` left the suite green while the block's inset and gap vanished. Compiled-rule and pairing assertions added, both mutation-checked.
- `medium` — `src/client/device/pointer.ts` had no test at all, and the render stub never invoked a listener, so a misnamed or leaked subscription was invisible. A proper test file now covers the server snapshot, both client answers, the query asked, and `removeEventListener` receiving the same function object.
- `low` — The counter's own comment claimed `tabular-nums` stopped the field's text shifting. It equalises digit widths, not digit counts, so the span narrowed at 10 to 9 and the `flex-1` field grew to absorb it. `min-width: 2ch` added to the recipe (a `min-w-*` class is banned tree-wide), the compiled rule asserted, and the comment corrected to admit the one remaining shift at the 450 threshold.
- `low` — Two assertions carried no weight: `not.toContain("…181ms")` passes for a stylesheet at 400ms, and `expect(SUBMIT_NOT_YET_WIRED("x")).toBeUndefined()` is true of any function without a return. Both replaced with assertions that bite.
- `low` — `focus-within:border-accent` was asserted nowhere and could be dropped without a failure. Added to the required-classes loop with its compiled rule read back.
- `low` — The `deferred-work.md` entry for the sticky block's gutter bleed and missing inset was discharged by this story but left open. The file is append-only with no closure marker, so a discharge entry was appended rather than history edited.

**Deferred** (each has an entry in `deferred-work.md`)

- `medium` — `pointer.ts` and `motion.ts` are now the same module twice; the mechanism wants a shared `useMediaQuery(query, serverSnapshot)`. Not taken because it adds a new shared public API and would edit `motion.ts`, whose scan this story already had to narrow.
- `medium` — The counter and the 500 ceiling are invisible to assistive technology. Fixing it needs a decision this epic has not made: AD-12 gives the product one polite region, and a counter announcing past 450 would flood it.
- `medium` — The input declares no `enterKeyHint`, `autoComplete`, `autoCapitalize` or `spellCheck`. Four small product decisions with no line in the design corpus behind them.
- `medium` — Until Story 3.3 lands, the deployed app accepts a Todo and silently discards it. The intended seam, recorded so the epic cannot be demoed between the two stories without someone having seen it written down.

**Rejected**

- `low` — Test-body duplication (`stubCapabilities` repeated in 15 of 20 cases; the last test hand-rolling a remount). Real, but developer-facing only and the fix is a helper extraction across two files rather than a simple correction, so it fails the bar for a `low` worth taking.
