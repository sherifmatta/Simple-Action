---
title: "Story 2.6 — Build the list region's resolved states: error, empty, and what they announce"
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-2-context.md'
  - '{project-root}/docs/implementation-artifacts/spec-2-5-seed-the-motion-module-and-show-skeleton-rows-while-the-list-loads.md'
---

<frozen-after-approval>

## Intent

**Problem:** Two of the four ways a load can end have no designed state. A failed read renders an empty list region and nothing else — no message, no `Retry`, nothing to press (`todo-list.tsx:82-84`); a read that resolves to zero Todos renders the same empty region, so "your list is empty" and "your list failed to load" are the same blank rectangle. Neither is announced: `useAnnounce()` has no production caller anywhere in the repository, so a screen-reader user learns neither. The slot that should hold the failure already exists and is wired to nothing — Story 1.7 built `error-slot-state.ts` and `error-slot.tsx` and said in a comment that the banner is Epic 2's.

**Approach:** Build the two missing states and give both a voice. The banner takes sticky slot 2, which `sticky-top-block.tsx:39` has reserved for it since Story 2.3, and reads the one error slot — so Epics 3 through 5 raise into the same region rather than inventing their own. The empty state is a separate component with all three variants built now, of which only `All` is reachable until Epic 4 ships the Filter Views. Both announce through the single `announce(message, urgency)` function: errors assertively, empty resolutions politely.

## Boundaries & Constraints

**Always:**
- **The banner region reserves 48px whether or not it is occupied** (decided 2026-09-23). DESIGN.md:426 and EXPERIENCE.md:109 both require the region to be part of the layout occupied or empty "so appearing does not shift the list", and reserving is the only way that holds; the number is the mockup's `min-height:48px` (`key-states.html:258`), which is the only one in the corpus — `components.error-banner` has no `min-height` key. The guarantee is honest for a one-line message and no wider: a message that wraps to two lines still shifts the list, and that is recorded as a residual rather than asserted away. Reserving costs a permanent empty band on every error-free screen, which was weighed and accepted.
- The four error kinds, the slot, its replace-without-retry transition and its clear-on-retry are **already built** (`error-slot-state.ts`, `error-slot.tsx`, `ErrorKind` in `src/shared/contract/errors.ts`). AC1, AC7 and AC8 are satisfied by construction — consume them, prove them from this story's call site, and do not re-model them.
- Every `className` is a static string literal: `dynamicClassNames(markup)` must stay exactly `["app/layout.tsx:{poppins.variable}"]` (`todo-card.test.ts:125`) and `opaqueMarkup(markup)` must stay `[]` (`todo-card.test.ts:310`). No `style={{…}}`, no spread attribute, no computed class.
- No hex literal and no arbitrary-value class in any `.tsx` under `app/` or `src/client/` — `app/page.test.ts:88-93` scans raw source, **comments included**.
- Untokenised literals go into `app/globals.css` as `@utility` recipes, beside `checkbox-box` and `skeleton-bar`. Do **not** grow `@theme static` — `app/globals.test.ts:170-198` pins it to exactly 21 colours, 4 radii, 14 spacing tokens, and `:200-209` to exactly 10 `text-*` roles. Every token this story needs already exists.
- Do not run `app/globals.css` through Prettier: it lowercases hex values two test files pin uppercase. Append by hand.
- Split pure values from React wiring, as `announcement.ts`/`announcer.tsx` and `error-slot-state.ts`/`error-slot.tsx` already do — the suite is `environment: "node"` (`vitest.config.mts:34`) and jsdom is opt-in per file.
- Sweep pre-consolidation story numbers in every file this story opens (`deferred-work.md` renumbering entry): old 2.7/2.8/2.9 are all 2.6, old 3.3 is 3.2, old 4.4 is 4.3.

**Never:**
- Never use `role="alert"`, `role="status"`, `role="log"` or a declared `aria-live`. `eslint.config.mjs:136-174` bans all four everywhere but `announcer.tsx`, and names this banner as the reason the rule exists — the mockup is `role="alert" aria-live="polite"` (`key-states.html:525`). The banner announces by calling `announce(message, "assertive")`.
- Never add a `*_MS` export, a `\d+ms` literal outside `motion.ts` (comments included), a `setTimeout`/`setInterval`, or a `duration-`/`delay-`/`animate-`/`transition-` class — `motion.test.ts:171-227` scans all four. The banner has no entrance animation; EXPERIENCE.md bans "any animation on open".
- Never use a `min-w-*` class: `todo-card.test.ts:190` bans the whole family. `Retry`'s 44px minimum width belongs in its recipe.
- Never hold a Todo in `useState`/`useReducer`, and never name a state variable `todo*` — `use-todos.test.ts:187-225` scans the tree and matches on the prefix.
- Never forward or compose a server `message` (AD-10); the client maps `kind` to copy.
- Never build the add input, the filter tabs, the inter-slot gap in the sticky block, or any mutation's error path. Never make the Active/Completed empty variants reachable — Epic 4 does that.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial load in flight | `isPending` | Three skeleton rows; region carries `aria-busy`; banner region present and unoccupied; no empty state | No error expected |
| Resolved with Todos | `data.length > 0` | One row per Todo; no skeletons, no empty state; region not busy | No error expected |
| Resolved empty | `data` is `[]` | The `All` empty panel; `Nothing here yet. Type above to add your first Todo.` announced politely | No error expected |
| Read failed | `error` set, `data` undefined | Banner reads `Couldn't load your Todos.` with `Retry`; string announced assertively; region holds **no** skeletons and **no** empty state | The failure is the designed state |
| `Retry` on a load failure | Slot occupied, kind `load`, not a `401` | Slot clears, the list request re-runs unchanged, region returns to skeletons, resolves to rows, the empty panel, or the same banner | A second failure raises a fresh entry |
| `Retry` on an expired identity | `identityExpired(error)` is true | The document reloads; no refetch is issued | A `401` is the one non-retryable case |
| A second, different error arrives | Slot occupied, a new entry raised | The newer entry is shown; the replaced operation is not retried; the new string is announced | Already true of `errorSlotReducer` |

</frozen-after-approval>

## Code Map

- `src/client/components/sticky-top-block.tsx:36-41` — the change site for the banner. Slot 2's comment `{/* 2. error banner region — Story 2.7 */}` becomes `<ErrorBannerRegion />`; slots 1 and 3 stay comments. This file is the only place in the product allowed to declare `sticky` (`todo-card.test.ts:212`) and its `bg-*` set is pinned to exactly `["bg-card"]` (`sticky-top-block.test.ts:106`) — which is why the banner must be its own file.
- `src/client/components/todo-list.tsx:69-85` — the change site for the empty state and the widened loading branch. The `<ul>` is already unconditional. Its comment at `:74-81` correctly records that the banner is **not** a branch of this region.
- `src/client/feedback/error-slot.tsx:29-56` — `useErrorSlot()` returns `{ error, raiseError, clearError, retryCurrentError }`. `retryCurrentError` (`:92-96`) dispatches `clear` **before** invoking the closure, so a retry that fails again keeps its new entry. Read-only.
- `src/client/feedback/error-slot-state.ts:22-31` — `ErrorSlotEntry = { kind: ErrorKind; retry: () => void }`, `ErrorSlot`, `EMPTY_ERROR_SLOT`. Read-only; AC1/AC7/AC8 live here already.
- `src/client/feedback/announcer.tsx:29-46` — `useAnnounce(): (message: string, urgency: "polite"|"assertive") => void`. Stable identity (`useCallback([])`), so it is safe in a dependency array. It calls `setState`, so it **must** be called from an effect or a handler, never during render. Mounted innermost in `providers.tsx:58-63`.
- `src/client/todos/todo-list-query.ts:42,217` — `TodoRequestError` (carries `kind` and `status`) and `identityExpired(error)` → `error.status === 401`. `identityExpired` is **not** re-exported through `use-todos.ts`; import it from here.
- `src/client/todos/use-todos.ts:41` — `useTodos()` returns the whole `useQuery` result, so `isPending`, `isFetching`, `data`, `error` and `refetch` are all available. Its doc comment names "Story 2.7" — sweep.
- `src/shared/contract/errors.ts:15` — `ErrorKind = "load" | "create" | "update" | "delete"`. The union exists; import it.
- `app/globals.css:127-213` — the ten `text-*` roles, including `text-banner-message`, `text-empty-message` and `text-empty-sub`, all already present. `:215-300` — `checkbox-box`, `strikethrough-completed` and the `skeleton-*` recipes are the precedent for a recipe holding untokenised literals.
- `src/test-support/markup.ts` / `tailwind.ts` — `readMarkup`, `matches`, `matchesWithElement`, `classNamesOf`, `dynamicClassNames`, `opaqueMarkup`, `styleSheetMatches`; `tailwindCompiler()` / `ruleFor(css, className)` (throws when Tailwind emitted nothing). Use these rather than new walkers.
- `src/client/components/todo-list.render.test.tsx` — the repository's only jsdom mount (`// @vitest-environment jsdom`, `createRoot` + React `act`, `vi.stubGlobal("fetch", …)`, `stubMotionPreference()` at `:109-138`). It wraps in `QueryClientProvider` only — never `AppProviders`. `:289-323` asserts `region.parentElement === card`, so `TodoList` may gain a **fragment** sibling but never a wrapper element.
- Tests this story invalidates: `todo-list.test.ts:89-94` (empty data renders nothing), `:162-166` (`elements()` equals `["ul","SkeletonRow","TodoRow"]`), `:204-215` (the file must still name "Story 2.6" as a future owner), `:227-237` (renders no JSX text), `:240-256` (every state's markup starts `<ul `); `sticky-top-block.test.ts:44-46` (renders exactly `["div"]`), `:48-62` (no JSX text), `:64-76` (the slot-comment regex must yield all three slots).
- `docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md:173-184,217-233,424-428,438` — the two component blocks and their prose. `EXPERIENCE.md:72-79` (the exact strings), `:109,117-124` (banner behaviour), `:194` (tab order), `:204-213` (the announcements).
- `docs/planning-artifacts/epics.md:688-744` — the 20 acceptance criteria this story answers.

## Tasks & Acceptance

**Execution:**
- [ ] `src/client/feedback/error-copy.ts` — new: `ERROR_COPY: Record<ErrorKind, string>` mapping all four kinds to EXPERIENCE.md's three strings (`load` → `Couldn't load your Todos.`, `create` → `Couldn't add that Todo.`, `update`/`delete` → `Couldn't save that change.`), plus the `Retry` label. Pure values — AD-10 puts the map on the client, and modelling all four now is the same doctrine that seeded the slot and the motion module complete.
- [ ] `src/client/feedback/error-copy.test.ts` — new: assert the map is total over `ErrorKind`, that the four kinds yield exactly three distinct strings, and that each string matches EXPERIENCE.md verbatim; scan the tree to prove no component composes or forwards a server `message`.
- [ ] `app/globals.css` — append by hand: `@utility banner-region` (the reserved 48px), `@utility retry-pill` (the 1.5px border and the 44px `min-width`, which cannot be a class), `@utility empty-panel` (the 1.5px dashed edge) and `@utility empty-ring` (the 40px circle). Every colour, radius and spacing value in both components has a token and stays a utility class on the element.
- [ ] `src/client/components/error-banner.tsx` — new, `"use client"`: `ErrorBannerRegion` renders the region unconditionally and the banner when the slot is occupied — leading line icon, message from `ERROR_COPY[kind]`, trailing `Retry` pill wired to `retryCurrentError`. One effect raises a failed read into the slot with its retry closure (`identityExpired(failed)` → reload the document, else `refetch`); a second announces the slot's current string assertively. Both effects, never during render.
- [ ] `src/client/components/error-banner.test.ts` — new: the three strings by kind, the 44px `Retry` geometry and the region's reserved 48px compiled through `ruleFor`, the raise-and-retry closure for both the refetch and the `401` reload paths, replacement without retry, and the assertive urgency.
- [ ] `src/client/components/empty-state.tsx` — new: `EmptyState` with all three variants — dashed panel, 40px mint ring, plus glyph on `All` and check on the other two, first line at `text-empty-message`, second line on `All` only at `text-empty-sub`. No button and no control. Announces its own text politely on mount.
- [ ] `src/client/components/empty-state.test.ts` — new: all three variants' exact strings and glyphs, the absence of any control, the compiled panel and ring rules, and the polite announcement including the `All` variant's two lines as one utterance.
- [ ] `src/client/components/sticky-top-block.tsx` / `.test.ts` — place `<ErrorBannerRegion />` in slot 2; keep slots 1 and 3 as comments. Convert the slot-order assertion for the filled slot from the JSX-comment regex to element order, leaving the regex covering the two that remain — the conversion Story 4.3 AC12 completes.
- [ ] `src/client/components/todo-list.tsx` — widen the loading branch to `isPending || (isFetching && data === undefined)` so `Retry` returns the region to skeletons; render `<EmptyState variant="all" />` as a fragment sibling after the `<ul>` when `data` is `[]`; mark the region busy while loading and give it an accessible name; sweep the stale comments.
- [ ] `src/client/components/todo-list.test.ts` — update the six assertions this story invalidates and add the resolved-empty and retry-to-skeletons branches.
- [ ] `src/client/components/todo-list.render.test.tsx` — add the empty-state mount, the failed-read-then-`Retry` round trip through `AppProviders`, and the epic's outstanding obligation: one mount through `hydrateRoot` proving both live regions survive hydration and that an announcement reaches the assertive one.
- [ ] `src/client/components/todo-card.tsx`, `src/client/todos/use-todos.ts` — comment-only: correct the claim that the banner is a branch inside the list region, and sweep "Story 2.7".
- [ ] `docs/implementation-artifacts/deferred-work.md` — close the two Story 2.5 entries this story owns and record what it leaves open.

**Acceptance Criteria:**
- Given a read that failed, when the card renders, then the banner reads `Couldn't load your Todos.` with a `Retry` control, and the list region holds neither skeleton rows nor an empty state.
- Given a failed read whose status is `401`, when `Retry` is activated, then the document is reloaded and no refetch is issued; given any other failure, then the list request re-runs unchanged and the region returns to skeleton rows while it does.
- Given a load that resolves to zero Todos — including one reached by retrying a failure — when the region renders, then the `All` empty panel appears with both its lines, carrying no button and no control.
- Given the list is still loading or has just failed, when the region renders, then the empty state is not shown and there is no frame in which it is.
- Given any error is raised into the slot, when the banner appears, then its string is announced assertively; given a Filter View resolves to empty, then the empty text is announced politely, both lines on `All` as one utterance.
- Given the whole tree, when it is scanned, then `announce()` is the only announcement mechanism, no file but `announcer.tsx` declares `aria-live` or an implicit live-region role, and there is still exactly one polite and one assertive region.
- Given `Retry`, when its compiled rule is read, then it declares at least 44px in both dimensions, and it sits between the input's slot and the filter tabs' slot in the sticky block's element order.
- Given the slot is empty, when the banner region renders, then the region is present and declares its reserved height, so a one-line banner appearing occupies space the layout had already given it.
- Given the repository's existing whole-tree scans, when the suite runs, then `dynamicClassNames`, `opaqueMarkup`, `arbitraryProperties`, the AD-13 hex scan, the motion scans and the theme token counts all still report nothing new.

## Implementation Notes

**What was already there, and what that changed.** AC1, AC7 and AC8 needed no code: Story 1.7's `errorSlotReducer` already replaces without reading the entry it displaces, and `retryCurrentError` already clears before invoking. Both are asserted from this story's side as *absences* in `error-banner.tsx` — no `.retry()` call, no `clearError` — because the way to break them from here is to route around the slot rather than to change it.

**The list region imports no error type.** Gating the empty state on `data !== undefined && data.length === 0` was enough for AC4, AC14 and AC15 together; the failure case is excluded because a failed read leaves `data` undefined, not because a condition names it. `todo-list.tsx` ended up with no knowledge of failure at all.

**One announcement site, keyed on the slot.** `error-banner.tsx` announces `ERROR_COPY[slot.kind]` rather than its own read's error, so Epics 3 through 5 get their announcement by raising an entry. The reporting effect that puts a failed *read* into the slot is separate and exists only because `useQuery` has no `onError` in v5 and `providers.tsx` records why a cache-level handler cannot reach the slot's context.

**Two test mechanics that cost time and are worth knowing.**
- `renderToStaticMarkup` escapes the apostrophe in every error string to `&#x27;`, so `toContain("Couldn't …")` fails on copy that is correct. Both new component tests decode before asserting.
- Every "this file does not contain X" scan had to strip comments first, the way `announcer.test.ts` already does. These files *discuss* `aria-live`, `role="alert"` and the polite urgency at length — explaining why the banner uses none of them is the point of the comments.

**The mount test needed the real shell.** `todo-list.render.test.tsx` wrapped only `QueryClientProvider`; the card now contains the banner, which reads the slot and the announcer, and both throw outside their providers by design. The card cases now mount `AppProviders`, which also made this the first test in the repository to prove the three singletons compose.

**Three things the mount test revealed that no unit test would have.**
- Unmounting a `createRoot` root empties its container, so the hydration case had to unmount *before* writing the server markup, not after.
- `window.location.reload` is a non-configurable own property in this jsdom; `window.location` itself is configurable, so the whole object is swapped.
- After `Retry`, TanStack's `fetchStatus: "fetching"` lands one scheduled microtask after the click commits, so the assertion needs the same flush tick the initial mount uses. Without it the region reads as resolved-and-empty.

**A defect this story introduced, found and fixed before review.** Raising a failed read into the slot has a second half that no AC names: taking it back out. `Retry` clears the slot itself before refetching, so that path was fine — but `refetchOnWindowFocus` is left at its default of `true`, so returning to the tab after a failure resolved the list *underneath* a banner still reporting that it could not be loaded. Reproduced by driving `focusManager`: the empty state and `Couldn't load your Todos.` rendered at the same time. EXPERIENCE.md:109 states the rule ("the banner clears when the retried operation succeeds"); nothing had implemented it. The fix clears the slot when the read succeeds, guarded on this component having raised something rather than on what the slot currently holds — reading the slot inside the effect that writes to it is a loop. In this epic the two are equivalent, because a `load` error is the only thing anything raises; Epic 3 is where they diverge, and that is deferred rather than guarded, since nothing can reach it until the first mutation exists.

**A live region keeps its text until the next announcement replaces it,** which is correct and made one assertion wrong: after `Retry` clears the banner, `container.textContent` still contains the error string because the assertive region is still holding it. The banner's absence is asserted as the absence of its control instead.

**Files changed.** New: `src/client/feedback/error-copy.ts` and its test; `src/client/components/error-banner.tsx`, `empty-state.tsx` and their tests. Changed: `app/globals.css` (four recipes, appended by hand), `todo-list.tsx`, `sticky-top-block.tsx`, and the three test files those invalidate; comment-only sweeps in `todo-card.tsx`, `use-todos.ts`, `todo-list-query.ts` and `app/api/todos/route.ts`.

**Deliberately not done.** The inter-slot gap in the sticky block (the mockup's `margin-top:10px` has no token and no DESIGN.md source; invisible while slots 1 and 3 are empty — it belongs to the story that fills slot 1). The `scroll-padding-top` sized to the sticky block's live height, which EXPERIENCE.md:198 requires now that the banner changes that height: no AC here names it and Epic 6 owns the audit.

## Spec Change Log

### 2026-09-23 — The frozen block's 48px is superseded by 70px. Not edited; flagged.

The approved decision reads "**The banner region reserves 48px** … the number is the mockup's `min-height:48px` (`key-states.html:258`)". Review established that 48px does not reserve the banner: its row is `items-center`, so its height is its tallest child, and that child is `Retry` at the 44px floor DESIGN.md:354 sets and AC9 requires — 44 + 2×12 padding + 2×1 border = **70px**. The mockup's 48px pairs with a 32px pill (`key-states.html:266`) that this product cannot ship, so it was never this banner's height. (The citation was also off by one: `:258` is `padding:11px 12px`; the `min-height` is `:259`.)

**The decision itself is unchanged and was implemented as chosen** — option (C): reserve the banner's height so a one-line banner appearing shifts nothing, and accept a wrapped message as a recorded residual. Only the arithmetic behind the number was wrong, and it was mine, not the user's. `@utility banner-region` now derives the value from the tokens that produce it rather than transcribing any literal, so it cannot drift from `Retry`'s floor again.

The frozen block is left exactly as approved, per this workflow's rule that only the human changes it. **This wants a one-line confirmation**, because the cost the user weighed was a permanent empty band on every error-free screen and that band is now 70px rather than 48px — a larger cost than the one presented, against the same benefit. If 70px is too much to give up, the alternatives are to shrink the banner (which means renegotiating AC9's 44px, a WCAG 2.5.5 floor) or to move to option (B) and accept the shift.

## Review Triage Log

### 2026-09-23 — Review pass (one layer: blind-hunter, context-free). 12 findings.

**Patched.**

- `high` — **The 48px reservation was 22px short, so AC2 was false.** Verified by arithmetic against the shipped classes: the banner is `p-4` (12px × 2) + a 1px border on each side + a row whose height is its tallest child, and that child is `Retry` at `min-h-touch-target-min` = 44px. Total 70px, reserved 48px. The mockup's 48px is a trap — `key-states.html:266` pairs it with `.retry { min-height:32px }`, a pill that fails the 44px floor DESIGN.md:354 sets and AC9 requires, so it was never this banner's height. The recipe now derives the reservation from the tokens that produce it, `calc(var(--spacing-touch-target-min) + 2 * var(--spacing-4) + 2px)`, and two tests pin it: one computes 44 + 2×12 + 2 = 70 from the theme's own values and forbids the literal `48px`, the other pins the region's rule and `Retry`'s against each other so dropping the touch target from either side fails.
- `high` — **The mount test was flaky in the full suite** (reviewer reproduced 9 failures instead of 8 in 2 of 6 runs). Two real causes, both fixed. `IS_REACT_ACT_ENVIRONMENT` was never set anywhere in the repository, so React was not treating `act` as a flush boundary at all — that is the source of the `not configured to support act(...)` warning this file has emitted since Story 2.5, and of assertions reading a tree React had not finished committing. And `focusManager` is a TanStack module singleton that the new background-refetch test mutated without restoring; it is now reset in a `finally`, the discipline the adjacent `401` test already used for `window.location`. Single-tick flushes became a shared `settle()` used twice where a response has to be read and then committed. Six consecutive full runs now report 8 failures, stably.
- `medium` — **The banner icon did not match the mockup it claimed to transcribe.** Verified at `key-states.html:526`: the mockup is two paths, `M12 7.5v5` and `M12 16.2h.01`; the shipped icon was one merged path with a longer stem and a differently placed dot. In a repository that pins DESIGN.md values byte-for-byte, a comment claiming a verbatim transcription that is not one is the drift the surrounding discipline exists to catch. Paths replaced with the mockup's.
- `medium` — **Stale pre-consolidation story numbers in prose.** Verified against `epics.md`: the focus audit is Story 6.2 (`:1188`) not 6.1, the departure animation is 4.3 (`:930`) not 4.5, the add input is 3.2 and the filter tabs 4.3. The sweep had been applied to the JSX slot comments and not to the prose around them, against this spec's own rule. Corrected in `sticky-top-block.tsx` and `sticky-top-block.test.ts`.
- `medium` — **A named AC path had no test.** The reviewer's analysis of the raise effect surfaced that AC5's "resolves to content **or to the same banner again**" was untested: `retryCurrentError` clears the slot before refetching, so a second failure has to raise a second time or `Retry` silently empties the region. It does, because each failure is a new `TodoRequestError`; now proved by a mount test that fails twice and asserts the banner and its control return.
- `low` — **`error-banner.tsx` failed `prettier --check`.** The reviewer's framing was too strong: three *untouched* test files fail it too, so it is not a repository invariant. But every other `.tsx` component is clean, so this one is now too. Test files left as authored, matching their neighbours.
- `low` — **Source-regex assertions pinned spellings rather than outcomes.** Fair for the subset that duplicated the mount test. The multi-line `reload(); return; … void refetch()` regex, the `kind: readFailure.kind` match and the `onClick` match were replaced by behaviour that is already driven end to end; what was kept pins structure nothing else can see — the `[slot, announce]` dependency list, the `reported` ref guard, and that `identityExpired` is delegated rather than a `status === 401` re-derived here.

**Deferred** (entries appended to `deferred-work.md`).

- `medium` — **`Retry` drops focus to `<body>`**, because the control unmounts itself when the slot clears. Real and caused by this change, but no AC covers focus after activation and neither DESIGN.md nor EXPERIENCE.md says where it should go — EXPERIENCE.md's "focus is never dropped" commitments are written for the delete dialog. The fix needs that decision, so it is recorded rather than guessed.
- `medium`, unverified in this epic — **the mirror of the clear-on-success guard**: a `load` failure displaced from the slot by another kind is never re-raised, because `readFailure`'s identity has not changed. Correct reasoning, and unreachable until Epic 3 ships the first mutation, so guarding it now would guard a path not shown to be reachable. Both halves want one fix — a slot that can be cleared or queried by kind — which belongs in `error-slot-state.ts` and is Story 3.4's.
- `low` — **a resolved-empty list is conveyed twice** to assistive technology, by the named persistent region and by the empty state's announcement. Both are individually required by ACs this story had to meet; which one should give way is a design decision with no source in the corpus. Story 6.2's audit owns it.

**Rejected.**

- **"`deferred-work.md` was never touched, and four places claim it was"** — `false` as of triage, and the reviewer was right at the moment it looked: the file was written after the review agent had already inspected the worktree. It now carries nine entries from this story. The sub-claim that "the two Story 2.5 entries the spec says to close are still open" is `false` on its own terms: the file's header declares it append-only, and Story 2.5 "closed" a Story 2.4 entry the same way — by doing the work, not by deleting the record. That entry is still in the file.
- **"WCAG 2.4.11 regression with no owner and no record"** — the analysis is right and is why the entry exists; `false` only as to the record, which was written before triage. The regression itself is real and is now carried to Epic 6 explicitly.
- **"`aria-label="Todo List"` is a new user-facing string with no source"** — `false`. `Todo List` is the product's fixed vocabulary, which `epic-2-context.md` requires be "used verbatim in code as well as copy". It is an accessible name for a region, not display copy, so the one-module rule `error-copy.ts` enforces for error strings does not reach it. The reviewer's *second* point in the same finding — that the name and the empty-state announcement duplicate each other — is real and was deferred separately above.
- **"The spec's own metadata was not advanced"** — `false`. Finalizing the frontmatter, the triage log and the sprint status is the step that runs after review; the reviewer inspected the worktree mid-workflow.

## Design Notes

**The list region never reads the error, and that is what makes AC4 and AC15 structural.** A failed read leaves `data` `undefined`, so gating the empty state on `data !== undefined && data.length === 0` excludes the failure case without the region importing an error type or testing one. The three branches are then keyed on two facts — is a read in flight, and is `data` defined — and "a load failure is not an empty list" is true because there is no code path that could make it false, rather than because a condition remembered to exclude it. The same fact removes any flash risk for AC14: during loading `data` is `undefined`, so the empty panel has no frame to appear in.

**Why the loading branch widens rather than being re-keyed.** `isPending` is true only with no data and no error, which is false the moment a read fails — so after `Retry` the query is `status: "error"`, `fetchStatus: "fetching"` and the region would show a blank rectangle rather than skeletons. `isPending || (isFetching && data === undefined)` covers both, and deliberately stays keyed to `data` being absent so an optimistic row written into the cache still never shows a skeleton (Story 2.5 AC10). Story 3.3's case — skeletons pulsing *beneath* an optimistic row during load — is still not covered by this and still needs a key that is not derived from cache contents; leave it named in a comment.

**One announcement site for four kinds.** The banner announces from the slot rather than from the failing operation, so Epics 3 through 5 raise an entry and get their announcement for free — the same reason AD-9 put the retry closure in the slot. Announcing is an effect keyed on the slot's entry, never a render-time call: `announce` is `setState` behind a stable identity, and calling it during render is a cross-component update React rejects.

**`Retry`'s 44px, and why half of it is in CSS.** `min-h-touch-target-min` is a class, as it is on `todo-row.tsx`; the matching `min-w-*` is not available, because `todo-card.test.ts:190` bans that whole family to stop anything growing wider than the card. So the width floor is declared in the recipe, against the same token:

```css
@utility retry-pill {
  /* DESIGN.md `components.error-banner.retry-border` — `1.5px solid`. */
  border-width: 1.5px;
  /* `{spacing.touch-target-min}` (DESIGN.md:354, which names Retry). The
     class form is `min-w-*`, which todo-card.test.ts:190 bans tree-wide to
     catch anything wider than the card; the token is the same value. */
  min-width: var(--spacing-touch-target-min);
}
```

**The reserved region, and the honest size of its claim.** The region is always rendered and always 48px tall; the banner fills it when the slot is occupied. That makes AC2 true for a one-line message, which is every string this story ships — the longest, `Couldn't load your Todos.`, is 25 characters at 13.5px and does not wrap even at the 500px-minus-gutters worst case. It is *not* true in general: a longer string from a later epic, or a user zoomed past 200%, wraps and pushes the list down. Assert the reservation, not the absence of shift, and record the wrap as a residual — the same discipline Story 2.5 used for AC6's zero-layout-shift claim, which is a structural proof rather than a measurement because nothing in this suite runs a layout engine. Epic 6 owns both measurements.

**What the mockup gives that DESIGN.md does not.** DESIGN.md fixes the banner icon's colour and nothing else; the only geometry is the mockup's `width="17" height="17" stroke-width="1.6"` (`key-states.html:526`). Transcribe it as SVG attributes with the citation in a comment, exactly as Story 2.4 did for the checkbox glyph's `13px`, and record it as a deferral rather than pretending it has a token. The same applies to the banner's `margin-top:10px`: it is the gap between sticky slots, Story 2.3 already declined to invent one, and with slots 1 and 3 still empty it is invisible — leave it to the story that fills slot 1.

## Verification

**Commands:**
- `npm run lint` — expected: clean, zero warnings. This is also the AD-12 proof: the banner would fail it on `role="alert"`.
- `npm run typecheck` — expected: clean.
- `npm test` — expected: every suite green except the eight pre-existing failures in `src/server/repository/todos.test.ts` and `client-identity.test.ts` (`password authentication failed for user 'neondb_owner'`, an expired `.env` credential). Confirm the count is still eight and the reason unchanged before attributing any failure to it.
- `npx next build` — expected: succeeds, and the production CSS carries the `retry-pill`, `empty-panel` and `empty-ring` rules.

**Manual checks (if no CLI):**
- Mutate and re-run, one at a time: change one error string by a character (the verbatim test must fail); return `false` from `identityExpired` (the reload path's test must fail); drop the `data === undefined` guard from the empty-state condition (the failed-read test must fail); swap the announcement urgency to `polite` (the assertive test must fail).
