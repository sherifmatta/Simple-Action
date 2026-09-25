---
title: 'Story 4.3: Build the filter tabs, and make a departing Todo leave visibly'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: '60f4edaa61b646d3b751b249305e8e4137b68985'
review_loop_iteration: 1
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: A reduced-motion departure's announcement is replaced by the toggle's own confirmation before it is likely to be read.
    evidence: Both belong to one interaction and share a single polite region; giving the announcer a queue changes every announcement in the product.
    location: src/client/feedback/announcement.ts
    severity: medium
  - summary: The filter tabs are a tablist with no tabpanel and no roving tabindex, and no real screen reader has met them.
    evidence: DESIGN.md:494 makes aria-selected load-bearing while EXPERIENCE.md:194 puts all three segments in the tab order; both commitments cannot be met by the APG pattern.
    location: src/client/components/filter-tabs.tsx
    severity: medium
  - summary: interpolate-size support is untested, and jsdom computes no styles.
    evidence: Where it is unsupported the height flips rather than eases; the removal hangs off opacity's transitionend so the row still leaves.
    location: app/globals.css
    severity: low
  - summary: useTodos() now has the third consumer the tracked-properties entry was waiting for.
    evidence: FilterTabs reads data and listLanded on every render of the sticky block; the fix is a nested return or notifyOnChangeProps.
    location: src/client/todos/use-todos.ts
    severity: low
  - summary: Counts and rows disagree for the ~580ms a departure is on screen, by design, and no test enters that window to pin it.
    evidence: The count follows the cache the optimistic toggle already wrote; the row is held visible deliberately. filter-view.test.ts now says so rather than claiming they never disagree.
    location: src/client/components/filter-tabs.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The list has no way to narrow itself. `sticky-top-block.tsx:68` is still a comment where slot 3 goes, `todo-list.tsx:143` passes the literal `variant="all"` because the other two empty states are unreachable, and `DEPARTURE_HOLD_MS`/`COLLAPSE_MS` (`motion.ts:48,58`) have been declared since Story 2.5 with no consumer. A toggle in Story 4.2 changes a row's status and nothing else — so a Todo that no longer belongs in the view the user is looking at has no view to leave.

**Approach:** Add a client-only Filter View — three segments in an inset track, each carrying a count derived from the cached list — and make it the thing a toggled row can stop matching. The state is a `FilterViewProvider` mounted in `todo-card.tsx`, the nearest common ancestor of the tabs (slot 3 of the sticky block) and the list. Filtering, counting and the departure decision are pure functions in `src/client/todos/filter-view.ts`. The departure itself is one CSS animation whose `animation-delay` *is* the 400ms hold, unmounted by `animationend` rather than by a timer, and skipped outright under reduced motion — which is both what AC16 asks for and the only shape the tree-wide `setTimeout` ban permits.

## Boundaries & Constraints

**Always:** Filter View lives in React state and never in the query cache; counts are derived per render from `useTodos().data`, never stored. Every duration comes from `src/client/motion/motion.ts`; `app/globals.css` re-spells the two numbers and a test asserts they agree. Reduced motion is read only through `useReducedMotion()` and reaches CSS only as a `data-*` marker. Vocabulary is verbatim: `All`, `Active`, `Completed` — the word `Done` appears nowhere. Every `className` stays a static string literal; status- and selection-dependent styling is gated on an attribute variant, never chosen in JavaScript.

**Never:** No request, loading state or error state on a Filter View switch. No second query key, no `['todos', view]`. No `setTimeout`/`setInterval` anywhere in `app/` or `src/client/`. No `transition-*`/`duration-*`/`animate-*` Tailwind class. No new `--color-*`, `--radius-*` or `--spacing-*` token (the exact-count assertions in `app/globals.test.ts` read DESIGN.md's frontmatter; `--shadow-*` is not counted and is the sanctioned route). No `@utility` named `text-*`. No banner, no `Retry`, no announcement on a *refused* toggle — Story 4.4 owns all three. No persistence of the selection and no routing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select a view | `view="all"`, user activates `Active` | Only Active Todos render; `view="active"`; no fetch issued | No error path exists |
| Counts | list of 4, 2 Completed | Names read `All 4`, `Active 2`, `Completed 2` | No error expected |
| Counts before landing | `listLanded === false`, optimistic row present | All three counts read `0` | No error expected |
| Counts after optimistic add | `view` any, add lands in cache | Counts recompute in the same commit as the row | No error expected |
| Empty view | `view="active"`, no Active Todos | `EmptyState` renders `variant="active"`, announces `Nothing active.` politely | No error expected |
| Departure | `view="active"`, Active row toggled to Completed | Row holds in Completed, then fades/collapses; unmounts on `animationend`; announces `<text>, removed from Active` | If the animation never fires, the row stays visible rather than vanishing untracked |
| Departure in All | `view="all"`, any toggle | No departure; row stays in place | No error expected |
| Departure, reduced motion | `view="completed"`, matching row toggled to Active | Row leaves immediately, no hold/fade/collapse; announcement still fires | No error expected |
| Successful add | `view="completed"`, add succeeds | `view` becomes `"all"`; the new row is visible | A *failed* add does not change the view |
| Toggle back mid-departure | row departing, toggled again so it matches again | Departure is cancelled; the row stays and re-renders normally | No error expected |
| Reload | any prior selection | `view` is `"all"` | No error expected |

</intent-contract>

## Code Map

- `src/client/components/sticky-top-block.tsx:68` -- **The slot.** `{/* 3. filter tabs — Epic 4, Story 4.3 */}` becomes `<FilterTabs />`. The container at `:65` already carries `top-block-stack` (whose `gap: 10px` exists for this third occupant, `globals.css:479-481`) and `z-10` (added at `:43-48` specifically for this story's transformed rows). Server Component; it must stay one (`todo-list.test.ts:284-297` asserts it declares no `"use client"`). It may write no JSX text of its own (`sticky-top-block.test.ts:54-69`), so the labels live in `filter-tabs.tsx`.
- `src/client/components/sticky-top-block.test.ts:45-51,71-82,84-100` -- **AC12 lives here.** Three assertions convert together: `:51` `elements()` exact list `["div","AddTodo","ErrorBannerRegion"]`; `:78-81` the comment regex `/\{\/\* (\d)\. ([a-z ]+) —/g` expecting `["3. filter tabs"]`; `:93-99` the `indexOf` ordering against `"{/* 3. filter tabs"`. After this story there is no unfilled slot, so the regex must assert `[]` and the ordering must read element order from `elements()`.
- `src/client/components/todo-card.tsx:32-47` -- Where `FilterViewProvider` mounts, wrapping both children. A provider renders no DOM element, so the card's DOM — and the sticky block's positioning context — is unchanged. Stays a Server Component.
- `src/client/components/todo-card.test.ts:237-258` -- `children` must equal `["StickyTopBlock","TodoList"]`; becomes `["FilterViewProvider"]` with the two inside it. **`:154-158`** is the harder one: `expect(globalsCss).not.toMatch(/\boverflow(-[xy])?\s*:/)`. The collapse needs `overflow: hidden`. The ban's own rationale (`:139-152`) is about a clipping *ancestor* of the sticky block breaking `position: sticky`; a departing row is a descendant of the list and an ancestor of nothing. Narrow it to an allow-list of exactly the departure recipe, the way `:153-156` already allow-lists `app/layout.tsx:body:overflow-x-hidden`. The markup-side `CLIPPING` scan at `:39-44,:153-156` stays a ban of one, because the clipping lives in the recipe and never as a class.
- `src/client/components/todo-list.tsx:86-146` -- Holds `useTodos()` `:87`, `useSetCompleted()` `:95`, `useReducedMotion()` `:99`. Gains `useFilterView()`. `:122` `data?.map` filters before mapping; `:143` `<EmptyState variant="all" />` takes the live view. **Two file-scoped guards constrain how:** `todo-list.test.ts:239` bans `useState` in this file (so departure state lives in the provider) and `:261` bans `/\.completed\b/` (so the predicate lives in `filter-view.ts`). Both stay standing.
- `src/client/components/todo-list.test.ts:222,239,249,255-261,402` -- `listClasses` exact `["flex","flex-col","gap-row-gap"]`; `elements()` exact `["ul","TodoRow","SkeletonRow","EmptyState"]`; `listSource.match(/useSetCompleted\(\)/g)` length 1 and `onToggle={setCompleted}` — the last spelling changes when the toggle is wrapped.
- `src/client/components/todo-list.render.test.tsx:82,104-127,373-398,606+,866,898-920` -- jsdom. `mount(client)`/`mountCard()`/`settle()`; `stubMotionPreference`; `matchMedia` stub. `:898-920` already quotes the committed tab order and stops at index 1 — extend it. This file is the home for AC2, AC5, AC7, AC10, AC13, AC15, AC16, AC17.
- `src/client/components/todo-row.tsx:90-96,111-114` -- Props `{ todo, onToggle }`; gains `departing` and `onDeparted`. The `<li>` at `:111` is the only element with height to collapse — there is no wrapper and none may be added (`todo-row.test.ts:96` pins the element list). `data-completed` at `:112` is the attribute idiom to copy for `data-departing`.
- `src/client/components/todo-row.test.ts:96,421-434,444,519-534` -- `elements()` exact `["li","button","svg","path","span"]`; **`:429-430` bans `/^(h-|max-h-|whitespace-nowrap$|text-nowrap$|overflow-)/` over every class literal in the file** — the recipe route exists to satisfy it, not to dodge it, and it stays standing; `:444` handlers exact `["onClick"]` — becomes `["onClick","onAnimationEnd"]`; `:519-534` the two-attribute-difference equality, which must tolerate the departure marker.
- `src/client/components/empty-state.tsx:36-53,63-66,80-82` -- `EmptyStateVariant = "all"|"active"|"completed"` and `EMPTY_COPY` already carry the exact strings; `:74-77`'s comment anticipates this story and the effect is already keyed on `variant`, so switching between two empty views re-announces. **No behavioural change needed** — only the type tie so the two vocabularies cannot drift.
- `src/client/todos/use-todos.ts:37-39,41-72` -- `useTodos()` takes no arguments *deliberately* ("a `filter` parameter here would turn one cache entry into three"). Returns the spread query plus `listLanded` `:57`. `listLanded` is AC8's gate and is already the idiom at `todo-list.tsx:143`. `use-todos.test.ts:229-238` lists `useState<FilterView>("all")` as an **allowed** fixture in the AD-8 server-state scan — this story's state is pre-blessed.
- `src/client/todos/use-create-todo.ts:87-91,105,150-170` -- `AddField` seam and `onSuccess`. AC7 attaches here: the success moment is observable nowhere else. `field.clearAndFocus()` at `:165` is conditional; AC7 must fire on every success, so it needs its own unconditional call rather than joining that branch.
- `src/client/todos/use-set-completed.ts:84-86,144-147,161-169,200-210` -- `toggledAnnouncement` is the announcement-builder shape to mirror; `onSuccess` announces, `onError` deliberately says nothing (Story 4.4). `useSetCompleted()` returns `(todo, completed) => void` and is unchanged by this story — the departure wraps it, it does not learn about views.
- `src/client/motion/motion.ts:48,58,143-145` -- `DEPARTURE_HOLD_MS = 400`, `COLLAPSE_MS = 180`, both with zero consumers; `useReducedMotion()` is the only reduced-motion reader in the product.
- `src/client/motion/motion.test.ts:227-252,254-273,275-281,283-289` -- The pinned eight-item `*_MS` list (no new constant is needed, so it is unchanged); no `ms` literal outside `motion.ts`; **no `setTimeout`/`setInterval` in `app/` or `src/client/`**; no Tailwind motion utility. `:130-144` shows the sanctioned way to assert a recipe's duration — match the selector text rather than `ruleFor`, because several rules share a recipe's class.
- `app/globals.css:68-70,95,103-105,326-366,531-566` -- `--color-tab-track/-selected-bg/-selected-text` all exist; the latter two have **zero consumers** and this story is their first. `--spacing-touch-target-min: 44px` `:95`. There is **no inset-track shadow and no raised-chip shadow token** — DESIGN.md:418 gives both as literals. `skeleton-row` `:345-366` and `char-counter` `:531-566` are the two precedents for a recipe plus its `[data-still="true"] > &` suppression, including the specificity argument (the minifier reorders, so it must win on specificity, not source order).
- `app/globals.test.ts:165-167,200-209,327-344` -- `extractTypographyRoles` matches `/@utility text-([a-z-]+)\s*\{/g` and `:201` pins exactly 10 — **a recipe named `text-*` fails this test even if it is not a typography role.** `recipe(name)` `:327-344` is the brace-balanced text reader for asserting a recipe's body. Colour/radius/spacing counts are read from DESIGN.md's frontmatter; `--shadow-*` is counted by nothing.
- `src/test-support/tailwind.ts:27-47,74-109` -- `tailwindCompiler()` and `ruleFor`, which throws when Tailwind emits nothing — the check that `aria-selected:` variant spellings are real.
- `docs/implementation-artifacts/deferred-work.md:136,201,229,313` -- Four entries this story answers; `:348-364` is the current tail and shows the `## Closed by:` / `## Deferred from:` shape.

## Tasks & Acceptance

**Execution:**
- `src/client/todos/filter-view.ts` -- create; `FilterView`, `FILTER_VIEWS`, `FILTER_VIEW_LABELS`, `matchesFilterView(todo, view)`, `countsByFilterView(list)`, `departsOnToggle(todo, completed, view)`, `departureAnnouncement(text, view)` -- every decision this story makes about a Todo is a pure function of the list and the view, so all of it is testable in `node` and none of it needs a DOM.
- `src/client/todos/filter-view.test.ts` -- create; cover each matrix row that does not need a DOM, and pin the module's export surface -- the matrix is the contract.
- `src/client/todos/filter-view-context.tsx` -- create; `FilterViewProvider` and `useFilterView()` returning `{ view, select, showAll, departing, noteToggle, endDeparture }`. Holds `useState<FilterView>("all")` and the departing-id state; `useFilterView()` throws outside the provider -- the `announcer.tsx:40-48` convention, and the state the two consumers share has exactly one owner.
- `src/client/todos/filter-view-context.test.tsx` -- create (jsdom); the departure lifecycle, cancellation when a row matches again, `showAll`, and the throw-outside-provider guard.
- `src/client/components/filter-tabs.tsx` -- create; `"use client"`; a `role="tablist"` track holding three `role="tab"` buttons with `aria-selected`, each `tabIndex={0}`, each label and count in one text node so the accessible name is `All 4` -- the count *is* the name (AC6), which a separately-rendered numeral cannot deliver.
- `src/client/components/filter-tabs.test.ts` -- create (node); the exact labels, the token-only class vocabulary, `ruleFor` over every `aria-selected:` spelling, the 44px floor, and that no count is hidden at zero.
- `src/client/components/filter-tabs.render.test.tsx` -- create (jsdom); selection, counts across optimistic changes, counts reading `0` before the list lands, and that activation fires no request.
- `app/globals.css` -- add `--shadow-tab-track` and `--shadow-tab-selected` from DESIGN.md:418; add `@keyframes` and `@utility row-departing` carrying `400ms` delay, `180ms` duration, `overflow: hidden`, and the `[data-still="true"]` suppression -- `--shadow-*` is the one token family `globals.test.ts` does not pin a count for, and a recipe is the only route left once `transition-*` classes are banned tree-wide.
- `app/globals.test.ts` -- assert both shadow tokens match DESIGN.md and that `row-departing` clips and animates -- the only place those values are checkable.
- `src/client/motion/motion.test.ts` -- assert `row-departing`'s delay and duration equal `DEPARTURE_HOLD_MS` and `COLLAPSE_MS` -- the `SKELETON_PULSE_MS` precedent; the constants' first consumers must be pinned to them, or the re-spelling is the copy that goes stale.
- `src/client/components/todo-card.tsx` -- wrap both children in `FilterViewProvider` -- the nearest common ancestor of the tabs and the list, and the level at which the Filter View is genuinely scoped; the shell's three singletons stay three.
- `src/client/components/todo-card.test.ts` -- update the children assertion; narrow the stylesheet `overflow` ban to an allow-list of the departure recipe, recording why a descendant row is not the ancestor the ban was written against -- a ban kept by accident is worse than one narrowed on the record.
- `src/client/components/sticky-top-block.tsx` -- replace the slot comment with `<FilterTabs />` -- and correct any remaining pre-consolidation story numbers in this file while it is open.
- `src/client/components/sticky-top-block.test.ts` -- convert all three ordering assertions to element order (AC12) -- the comment regex has been a stand-in since Story 2.6 and this is the story that retires it.
- `src/client/components/todo-list.tsx` -- filter rows through `matchesFilterView`, keep departing rows rendered until they finish, pass the live view to `EmptyState`, and route the toggle through `noteToggle` -- without reading `.completed` and without `useState`, both of which stay banned in this file.
- `src/client/components/todo-list.test.ts` -- update the element list and the toggle-handler spelling; assert the `.completed` and `useState` bans still hold -- the guards' purpose survives the change.
- `src/client/components/todo-list.render.test.tsx` -- add AC2, AC5, AC7, AC10, AC13, AC15, AC16 and AC17 through the mounted card; extend the tab-order case at `:898-920` past index 1 -- the closest this suite gets to the real interface.
- `src/client/components/todo-row.tsx` -- accept `departing`/`onDeparted`, set `data-departing` and the recipe class, and call `onDeparted` from `onTransitionEnd` -- the row stays presentational and learns nothing about Filter Views.
- `src/client/components/todo-row.test.ts` -- admit the second handler and the departure marker; re-assert the `h-*`/`overflow-*` ban over the row's classes -- the recipe exists so that ban can stay.
- `src/client/components/todo-row.render.test.tsx` -- add: the animation-end handler unmounts nothing by itself but reports, and a departing row still exposes its Completion Status -- behaviour a markup scan cannot see.
- `src/client/components/empty-state.tsx` -- tie `EmptyStateVariant` to `FilterView` -- two identical vocabularies in one product are one rename away from disagreeing.
- `src/client/todos/use-create-todo.ts` -- take an `onAdded` callback and call it unconditionally in `onSuccess` (AC7) -- the `AddField` seam's own convention: the side effect is passed in, not reached for; unconditional because `clearAndFocus`'s retry-only branch is not AC7's trigger.
- `src/client/components/add-todo.tsx` -- pass `useFilterView().showAll` as `onAdded` -- the component that owns the field owns the wiring.
- `src/client/todos/use-create-todo.test.ts` -- cover that a successful add calls `onAdded` and a failed one does not.
- `docs/implementation-artifacts/deferred-work.md` -- close `:136`, `:201` and `:229`; append this story's deferrals -- three entries name this story as their owner.

**Acceptance Criteria:**
- Given the rendered tabs, when their markup is read, then there are exactly three equal-width segments in an inset track labelled `All`, `Active` and `Completed`, and no synonym for Completed appears anywhere in the file (AC1).
- Given a screen reader, when it reaches a segment, then the segment's accessible name is its label followed by its count — `Active 2`, never `Active` — and a count of zero renders as the character `0` rather than being omitted (AC4, AC6).
- Given the initial list read is still in flight, when the tabs render, then all three counts read `0`, even when an optimistic row has already made `data` defined (AC8).
- Given an optimistic add, toggle or delete, when it changes the cached list, then the counts recompute in the same commit as the rows, with no request issued and no count held in state (AC5).
- Given a Filter View is selected, when the list renders, then exactly the Todos matching it render, in the same order and position they held in All, and no `fetch` is issued and no loading or error state is reachable from the switch (AC2, AC3).
- Given a successful add while a view other than All is selected, when it settles, then the view becomes All; and given a *failed* add, then the view is unchanged (AC7).
- Given a fresh mount, when the tabs render, then the view is All and nothing was read from storage or the URL (AC9).
- Given a Filter View that matches no Todo, when the list region renders, then `EmptyState` receives that view as its variant and announces `Nothing active.` or `Nothing completed yet.` politely (AC10).
- Given the rendered card, when its focusable elements are enumerated in document order, then the three segments follow `Retry` and precede the first row's checkbox, and each segment's compiled height floor is `var(--spacing-touch-target-min)` (AC11).
- Given `sticky-top-block.tsx`, when its JSX elements are enumerated, then they are the container, the input, the banner region and the tabs in that order, asserted from element order rather than from any comment, and no slot comment remains (AC12).
- Given a toggle that makes a Todo stop matching the active Filter View, when the transition runs, then the row stays mounted in its **new** Completion Status, carries the departure marker, and is removed from the list only when its animation reports completion — with no `setTimeout` or `setInterval` anywhere in `app/` or `src/client/` (AC13).
- Given the compiled `row-departing` recipe, when its delay and duration are read back, then they equal `DEPARTURE_HOLD_MS` and `COLLAPSE_MS`, and no `ms`-suffixed literal exists outside `motion.ts` and `globals.css` (AC14).
- Given a completed departure, when it settles, then `announce` is called exactly once with the Todo's text followed by `, removed from Active` or `, removed from Completed`, at `"polite"` (AC15).
- Given `prefers-reduced-motion: reduce`, when a toggle takes a row out of the active view, then the row leaves in the same commit with no hold, fade, collapse or slide-up, and the announcement still fires (AC16).
- Given the All view, when any Todo is toggled, then no departure marker is set and the row keeps its position (AC17).
- Given a row already departing, when a second toggle makes it match the view again, then the departure is cancelled and the row remains in the list.
- Given the whole markup surface, when it is scanned, then `todo-list.tsx` still matches neither `/\.completed\b/` nor `/\buseState\b/`, every `className` is a static literal, and `npm run lint` is clean at `--max-warnings=0`.

## Spec Change Log

**2026-09-24 — implementation, five recorded departures.** Each is a deviation
from the frozen task list, taken during the build and recorded rather than
negotiated away.

1. **The departure is a CSS transition, not a keyframe animation.** The spec's
   Design Notes spell `animation: row-departure 180ms ease-out 400ms forwards`
   and the row reporting through `onAnimationEnd`. React does not deliver
   `animationend` in the jsdom this repository tests in — measured directly:
   with handlers for all three on one element, `transitionend` and `click`
   arrive and `animationend` does not, while a native `addEventListener` for it
   does fire, so the event dispatches and React simply never registers it.
   Keeping the animation would have shipped AC13's removal step unexercised:
   the marker could be asserted, the row leaving could not. A transition
   carries the hold as `transition-delay` and changes nothing else about the
   shape — one declaration, one marker, no timer.

2. **Several rows may depart at once.** The partial implementation held a
   single departing row and the spec did not say otherwise. A second toggle
   inside one departure — Tab, Space, Tab, Space does it comfortably — would
   evict the first row mid-animation, so it vanished abruptly and never
   announced. AC15 says a departure announces; nothing in it says only one may
   be in flight. `isDeparting(id)` replaced `departing: string | null`.

3. **The count is one text node with an ordinary space, not two elements with
   `{spacing.1}` between them.** DESIGN.md:420 gives `count-gap: {spacing.1}`.
   Two elements concatenate to `Active2` under `textContent` and are joined by
   a space only by an accessible-name computation no test here can run, so AC6
   — "the count is part of the accessible name" — would have been assumed
   rather than asserted. A 12.5px space measures a little under 4px. The
   acceptance criterion won.

4. **`@utility filter-tab-track` exists for one untokenised value.** Not in the
   task list, which expected the tabs to be classes alone. DESIGN.md gives the
   track a padding but no gap between segments, and the mockup's 2px is not a
   spacing token — so it lives in the stylesheet beside the block's own 10px,
   for the reason `top-block-stack` gives.

5. **`todo-card.test.ts`'s stylesheet `overflow` ban became an allow-list, and
   two assertions in `todo-list.render.test.tsx` were scoped rather than
   loosened.** The overflow narrowing is a task in this spec. The two others
   are not: `container.querySelector("button")` meant "the banner has no
   control" and the tabs put three buttons in the card, so both became
   `.banner-region button`. Widening the expectation instead would have made
   them pass for the wrong reason.

6. **`use-create-todo.test.ts` was never created; its coverage went to
   `add-todo.render.test.tsx`.** The task list names that file and it does not
   exist in this repository, before or after — the create hook has always been
   exercised through the mounted card, because `useCreateTodo` needs three
   providers and the field's own handle. Both AC7 cases live there: a confirmed
   add moves the view to All, a refused one leaves it alone. The cost is that
   the `onAdded` seam has no test at the hook's own level, which is recorded
   rather than argued away.

7. **The selected segment's count takes `{typography.tab-label-selected}`, not
   DESIGN.md's `count-typography`.** The frontmatter fixes the count's role
   independently of the label's, so on the selected chip the count should keep
   the unselected weight. One text node cannot carry two roles, and departure 3
   above chose one text node so AC6's accessible name could be asserted rather
   than assumed. The count therefore inherits the chip's colour and weight.
   `filter-tabs.test.ts` asserts that pairing rather than catching it, which is
   the honest spelling of a departure taken knowingly.

**Two vacuous assertions, found by mutation and fixed.** Both were written this
pass and both passed against a broken product:

- The AC8 counts case never flushed its optimistic write, so `data` was still
  undefined and the three zeros were true for the wrong reason. Deleting the
  `listLanded` gate left it green. It now asserts the cache holds the row
  before asserting the counts ignore it.
- `motion.test.ts`'s clipping claim searched the whole compiled stylesheet for
  `overflow: hidden`, which `sr-only` supplies. Deleting the clipping from the
  departure recipe left it green. It now reads the departure's own rule.

## Review Triage Log

## Design Notes

**Why the provider sits on the card, not in the shell.** The two consumers are the tabs (inside `sticky-top-block.tsx`) and the list; their nearest common ancestor is `todo-card.tsx`. Mounting it there costs one assertion (`todo-card.test.ts:237-258`) and leaves `providers.tsx`'s "three singletons" claim true — the shell holds infrastructure (query cache, error slot, announcer), and a Filter View is not infrastructure. A context provider renders no DOM element, so the card's DOM, and therefore the sticky block's positioning context, is byte-identical.

**The hold is a `transition-delay`, not a timer.** `motion.test.ts:275-281` bans `setTimeout`/`setInterval` across `app/` and `src/client/`, and `:283-289` bans every Tailwind motion utility. One CSS declaration satisfies both and is a better description of the behaviour besides: the row is removed because its departure *finished*, not because a duration elapsed somewhere else.

> **Amended during implementation.** This section originally specified a keyframe animation reported by `onAnimationEnd`. React does not deliver `animationend` in this repository's jsdom, which would have left AC13's removal step permanently unexercised, so the shipped mechanism is a transition reported by `onTransitionEnd`. Spec Change Log entry 1 records the measurement. The example below is the shipped shape.

```css
@utility row-departing {
  /* In effect before the height changes, or `auto` may not interpolate. */
  interpolate-size: allow-keywords;

  /* 400ms is DEPARTURE_HOLD_MS and 180ms is COLLAPSE_MS, re-spelled because
     CSS cannot read a TypeScript constant; motion.test.ts compiles this file
     and asserts the two agree. */
  &[data-departing="true"] {
    transition: opacity 180ms ease-out 400ms, height 180ms ease-out 400ms, ...;
    overflow: hidden;
    opacity: 0;
    height: 0;
  }
  [data-still="true"] > &[data-departing="true"] { transition: none; }
}
```

The collapse must also close the `gap-row-gap` the flex `<ul>` leaves behind, or the row's disappearance ends with a 9px jump. Settle the exact property list against the rendered result; the constraint is that the height reaches zero and the gap closes with it.

**Why reduced motion skips the departure entirely rather than zeroing it.** With `transition: none` no `transitionend` event fires, so a row parked in the departing set would never be removed. AC16 asks for the end state immediately, which is the same thing as never entering the departing set — so `noteToggle` consults `useReducedMotion()` and, when still, filters the row out in the same commit and announces. A preference that flips *during* a departure is the same trap from the other side, and the CSS suppression does not solve it: the list releases rows already in the set when the marker changes, announcing each.

**`role="tab"` with three tab stops, deliberately off-pattern.** DESIGN.md:494 makes `aria-selected` load-bearing — it is the reason the 1.16:1 chip-against-track ratio is accepted — and `aria-selected` is only valid on a handful of roles, of which `tab` is the only fit. But EXPERIENCE.md:194 commits to all three segments being tab stops, which rules out APG's roving tabindex. The deviation is taken knowingly: there is no `tabpanel` here (the list region carries its own `aria-label="Todo List"`), so this is a selection control that borrows the role for its state, and every segment gets `tabIndex={0}`. The alternative — `aria-pressed` toggle buttons — would contradict an explicit design commitment to fix a convention the product has already chosen against.

**Counts are gated on `listLanded`, which is AC8 beating AC5 in one narrow window.** An optimistic create makes `data` defined before the first GET returns, so an ungated count would read `1` while the list is still loading. AC8 is explicit that every count reads `0` until the list resolves, so `listLanded` gates the derivation — the same gate `todo-list.tsx:143` already uses for the empty state, and for the same reason.

**Where `.completed` may be read.** `todo-list.test.ts:261` keeps `todo-list.tsx` free of Completion Status, and that guard stays. The predicate therefore lives in `filter-view.ts`; the scan is file-scoped, so a module in `src/client/todos/` reading `todo.completed` breaks nothing.

## Verification

**Commands:**
- `npm run lint` -- expected: clean at `--max-warnings=0`.
- `npm run typecheck` -- expected: clean.
- `npx vitest run src/client/todos src/client/components app/globals.test.ts src/client/motion` -- expected: green, with the three `sticky-top-block.test.ts` ordering assertions failing before the slot is filled and passing after.
- `npm test` -- expected: no pre-existing test changes its verdict against the `60f4eda` baseline of 43 files / 934 tests, except the guards this story deliberately converts; record both totals.
- Mutation checks: delete the `listLanded` gate on the counts and confirm the AC8 test fails; remove the `overflow: hidden` from `row-departing` and confirm the recipe assertion fails; pin `aria-selected` to a constant and confirm both the selection test and the chip-styling test fail; make `noteToggle` ignore `useReducedMotion()` and confirm the AC16 test fails; announce on toggle instead of marking the row and confirm the AC13 test fails; remove the refusal seam from `useSetCompleted` and confirm the refused-departure test fails.

## Auto Run Result (superseded — the blocked run of 2026-09-23)

> **Superseded by the result at the end of this file.** Kept because it records
> why three subagents produced no implementation, which is the only account of
> that; every statement below describes the tree as it stood that night. Two
> are no longer true: the stylesheet's departure ships as a transition with no
> `@keyframes` at all (Change Log 1), and the "To resume" instruction was
> carried out.

Status: blocked
Blocking condition: implementation subagent stalled

Planning completed and passed the Ready-for-Development gate. Implementation
did not complete: three separate implementation subagents were launched on the
spec's verbatim handoff and all three died the same way — `Agent stalled: no
progress for 600s (stream watchdog did not recover)`.

The stall is harness-side, not the task. Measured directly in this repository
at the point each agent died: a Tailwind-compiling probe test runs in **124ms**,
and `npx vitest run src/client/components/todo-card.test.ts app/globals.test.ts`
runs in **391ms**. No command in this story's verification set is slow enough to
trip a 600s watchdog. Attempt 3 wrote no new files at all — it stalled while
reading the existing partial work — so progress is not monotonic across retries
and a fourth identical attempt was not launched.

Step-03 mandates a fresh-context implementation subagent and forbids the parent
re-authoring the handoff (which is what splitting the story across smaller
agents would require), so there is no in-workflow route around the stall.

### Partial work left on disk, deliberately

All of it typechecks (`npx tsc --noEmit` exits 0) and matches this spec:

| File | State |
| --- | --- |
| `app/globals.css` | **Done.** `--shadow-tab-track` and `--shadow-tab-selected` added to the elevation block; `@utility filter-tab-track`; `@keyframes row-departure` and `@utility row-departing` with the 400ms delay / 180ms duration, `overflow: hidden`, the gap close, and the `[data-still="true"] > &` suppression. |
| `src/client/todos/filter-view.ts` | **Done** (129 lines). Exports `FilterView`, `FILTER_VIEWS`, `FILTER_VIEW_LABELS`, `matchesFilterView`, `countsByFilterView`, `departsOnToggle`, `departureAnnouncement` — the exact surface the task list names. |
| `src/client/todos/filter-view-context.tsx` | **Done** (189 lines). Exports `FilterViewControl`, `useFilterView`, `FilterViewProvider`. |

Not started: `filter-tabs.tsx` and its two test files, `filter-view.test.ts`,
`filter-view-context.test.tsx`, and every modification task —
`sticky-top-block.tsx` + test, `todo-card.tsx` + test, `todo-list.tsx` + its two
tests, `todo-row.tsx` + its two tests, `empty-state.tsx`, `use-create-todo.ts` +
test, `add-todo.tsx`, `motion.test.ts`, `globals.test.ts`, `deferred-work.md`.

One test fails as expected at this stage and is a task in this spec, not a
defect: `todo-card.test.ts:156` `declares no overflow in the stylesheet either`
— the assertion this story narrows to an allow-list for the departure recipe.

A scratch `probe.test.ts` left in the repository root by the second attempt was
deleted; it was a CSS-compile probe, not story work.

### To resume

`status` is `blocked`, and step-01 halts immediately on a blocked spec rather
than routing. Change it to `in-progress` to re-enter at step-03 with the partial
work above intact. `baseline_revision` is already recorded and still correct.

### Unrelated tracking change in the tree

`docs/implementation-artifacts/sprint-status.yaml` is modified — it flips
`4-2-...` to `done` and rewrites `last_updated`. It is not this story's work and
was left untouched.

## Auto Run Result

Status: done
Blocking condition: none

### What was built

The filter tabs, and the departure a toggled Todo leaves by. Slot 3 of the
sticky top block is filled, the Active and Completed empty states are reachable
for the first time, and `DEPARTURE_HOLD_MS` and `COLLAPSE_MS` have their first
consumer after being declared since Story 2.5.

| File | Change |
| --- | --- |
| `src/client/todos/filter-view.ts` | **New.** The predicate, the three counts, the departure rule and the announcement builder — pure, and the only place `todo.completed` is read outside the row. |
| `src/client/todos/filter-view-context.tsx` | **New.** The one owner of the selection and of the rows on their way out. Several may depart at once. |
| `src/client/components/filter-tabs.tsx` | **New.** Three `role="tab"` segments in an inset track, each named by its own count. |
| `src/client/components/todo-card.tsx` | Mounts `FilterViewProvider` around both occupants — their nearest common ancestor, and no DOM element of its own. |
| `src/client/components/sticky-top-block.tsx` | Slot 3's comment became `<FilterTabs />`. |
| `src/client/components/todo-list.tsx` | Filters rows, keeps departing ones until they finish, passes the live view to `EmptyState`, routes the toggle through `noteToggle`. |
| `src/client/components/todo-row.tsx` | Gains `departing`/`onDeparted`, one attribute and one `onTransitionEnd`. |
| `src/client/todos/use-create-todo.ts`, `add-todo.tsx` | An `onAdded` seam, wired to `showAll` (AC7). |
| `app/globals.css` | `--shadow-tab-track`, `--shadow-tab-selected`, `@utility filter-tab-track`, `@utility row-departing`. |
| Tests | `filter-view.test.ts`, `filter-view-context.test.tsx`, `filter-tabs.test.ts`, `filter-tabs.render.test.tsx` new; nine files updated. |

Three implementation subagents were launched on this spec's handoff before the
work was taken directly; all three died to the same harness watchdog
(`no progress for 600s`) rather than to anything in the task — measured at the
point they stopped, the repository's slowest relevant command runs in under a
second. The first two left `filter-view.ts`, `filter-view-context.tsx` and the
stylesheet's tokens and recipe, which this run built on.

### Verification

- `npm run lint` — clean at `--max-warnings=0`.
- `npm run typecheck` — clean.
- `npm test` — **47 files, 1008 tests, all passing.** Baseline at `60f4eda` was
  43 files / 934 tests. No pre-existing test changed its verdict except the
  guards this story deliberately converted: the sticky block's three ordering
  assertions (AC12), the row's handler list, the skeleton's geometry markers,
  and `todo-card.test.ts`'s stylesheet `overflow` ban.
- `todo-list.render.test.tsx` run three times consecutively to confirm the
  departure cases are stable rather than order-dependent.
- Mutation checks, all five confirmed failing and then restored: dropping the
  `listLanded` gate fails the AC8 counts case; removing `overflow: hidden` from
  `row-departing` fails the clipping case; pinning `aria-selected` to a constant
  fails the selection case; making `noteToggle` ignore `useReducedMotion()`
  fails AC16; announcing on toggle instead of marking the row fails AC13.
- Every I/O-matrix row has at least one covering test that ran and passed.

Two of those mutations initially passed, which is to say two assertions written
this pass could not fail. Both are recorded in the Spec Change Log and fixed.

### Residual risks

- **The ARIA pairing has never met a screen reader.** `role="tab"` with three
  tab stops and no `tabpanel` is two deliberate departures from the authoring
  practices, each forced by an explicit product commitment. Deferred to Story
  6.7.
- **A reduced-motion departure's announcement is replaced before it is likely
  to be read**, by the toggle's own confirmation landing in the same polite
  region. The behaviour is asserted as it actually is rather than as it should
  be, and deferred to Story 6.2.
- **The 44px segment height and the collapse's easing are asserted as CSS,
  never measured.** jsdom computes no styles and hit-tests nothing.
- **`interpolate-size` is unsupported in some browsers**, where the height
  flips rather than eases. The removal hangs off `opacity`'s `transitionend`
  precisely so that degrades to the information without the tween.
- **Epic 4 is three stories in.** Story 4.4 — reverting a toggle the server
  refused — still has to undo a departure, not merely a status change.

## Review Pass 1 — 2026-09-25

Four layers ran: blind hunter, edge-case hunter, verification-gap and
intent-alignment. Two findings were demonstrated empirically by the reviewers
rather than argued, and both were real.

**Patched — 14.** The four that mattered:

- **A refused toggle announced a departure that never happened.** Demonstrated:
  in a filtered view, a 500 on the PATCH left the row marked departing while
  the rollback restored its status, so it finished collapsing, said "book
  dentist, removed from Active", and popped back at full height. The rollback
  is a cache write and nothing else could see it — and polling the cache for it
  cannot work, because `onMutate` is `async` and there is always a commit where
  the marker is set and the optimistic write has not landed. `setCompleted`
  now reports a refusal through a seam and the list calls the departure off.
  A first attempt did poll, and the AC13 case caught it immediately.
- **A preference flipping to `reduce` mid-departure stranded the row forever.**
  The stylesheet drops the transition, so no `transitionend` was ever coming.
  The comment beside the suppression claimed it handled exactly this and did
  the opposite. The list now releases those rows, announcing each.
- **A departing *last* row over-collapsed by 9px** — a flex container emits no
  gap after its final child, so the negative `margin-bottom` pulled the list's
  own bottom edge up by the full row gap, which is the jump the declaration
  exists to prevent.
- **`interpolate-size` sat inside the rule that starts the collapse**, so the
  pre-change computed style did not carry it — the state where `height: auto`
  may not interpolate at all. Moved onto every row.

Also patched: `filter-tab-track`'s `gap: 2px` was unpinned (a reviewer changed
it to `22px` and the whole suite stayed green); the AC10 Active-branch assertion
was satisfied by the live region alone; `globals.test.ts`'s typography-naming
case could not fail; the tablist's `aria-label` was unasserted; AC11's second
half — the segments preceding the first row's checkbox — was never exercised;
the stale `animation`/`animationend` prose across six files; `sticky-top-block.tsx`'s
own header still said the last slot was a comment, and credited `z-10` to a
transform this departure does not use; a needless `require` past a lint rule;
and a `Story 6.7` pointer to a story the 2026-09-22 consolidation dissolved.

**Deferred — 3 new**, appended to `deferred-work.md`: the counts-versus-rows
window during a departure, a departing id left in the set if its row leaves the
cache first, and a re-affirmation that the sticky block's live height is now
worse for WCAG 2.4.11 without changing that entry's owner.

**Rejected — 2**, with reasons:

- *Two `endDeparture` calls for one id inside a single React batch would
  announce twice.* It would take two `opacity` `transitionend` events on one row
  in one batch; the row's own guard admits only that property and the browser
  emits it once per transition. Left as is rather than guarded with a ref.
- *`select()` dropping an in-flight departure loses its announcement.* Switching
  view makes the departure moot — the row either belongs to the new view or it
  does not — and announcing "removed from Active" to somebody now looking at All
  would be worse than silence.

**Follow-up review recommended: true.** The refusal seam is new behaviour on
Story 4.2's mutation, proved by one case at the mounted-card surface; nothing
exercises a refusal and a *second* toggle racing each other, and Story 4.4 will
rework this path when it adds the banner and the revert.
