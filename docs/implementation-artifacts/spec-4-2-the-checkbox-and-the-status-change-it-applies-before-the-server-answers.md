---
title: 'Story 4.2: The checkbox, and the status change it applies before the server answers'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: '6a0253af48e706a734953943d6157eae38a6ad38'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/planning-artifacts/epics.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Two toggles of the same row have no ordering guarantee, and a rollback
      restores the whole row rather than only the field the mutation changed.
    evidence: |-
      One hook serves every row and nothing scopes or serialises mutations, so
      two PATCHes on one id can settle out of order and the cache keeps
      whichever answered last. The rollback compounds it: `onError` upserts the
      `Todo` held in the variables, which carries `text` and `createdAt` as well
      as `completed`. Inert today — nothing in this product mutates those two
      fields client-side — but it means the per-entity guarantee holds across
      rows, not within one. A fix needs a version column or a mutation `scope`,
      i.e. state this pass did not demonstrate the need for.
    location: >-
      src/client/todos/use-set-completed.ts (onError)
    severity: medium
  - summary: >-
      AC9's Enter/Space case is satisfied by the click the test itself
      dispatches, because jsdom performs no button activation at all.
    evidence: |-
      `press()` in `todo-row.render.test.tsx` dispatches a real keydown and
      keyup, asserts neither was intercepted, then calls `element.click()`
      itself — so the only thing the keys prove is that nothing calls
      `preventDefault`. The platform behaviour the `<button role="checkbox">`
      decision rests on is assumed, not observed. Only a real browser can settle
      it; Epic 6's keyboard audit owns that.
    location: >-
      src/client/components/todo-row.render.test.tsx (AC9)
    severity: medium
  - summary: >-
      Toggling a Todo whose create has not yet landed sends a PATCH the server
      answers 404, which this story reverts silently.
    evidence: |-
      An optimistic create writes the row to the cache immediately, so its
      checkbox is live before the POST confirms. The PATCH then names a row the
      server does not hold. The silent revert is this story's deliberate
      boundary — the banner is Story 4.4's — so the case belongs with the story
      that gives a refusal a voice. Nothing exercises it today.
    location: >-
      src/client/todos/use-set-completed.ts
    severity: medium
  - summary: >-
      Rollback re-inserts a row that is no longer in the cache, rather than
      leaving it out.
    evidence: |-
      `upsertTodoById` inserts when the id is absent, so a rollback for a row an
      arriving list had dropped would resurrect it. Unreachable today: nothing
      removes a row from the cache until Epic 5 ships delete, which is the story
      that makes this testable.
    location: >-
      src/client/todos/use-set-completed.ts (onError)
    severity: low
  - summary: >-
      A 200 body that is an object but not a Todo is cached as one.
    evidence: |-
      `setCompleted` checks only that the body is a non-array object, then casts
      — exactly as `createTodo` does. AD-3 places per-field trust in the
      deployment, so tightening it here would be a second contract alongside the
      shared one rather than a fix.
    location: >-
      src/client/todos/set-completed.ts
    severity: low
  - summary: >-
      `app/globals.test.ts` now reads `@utility` blocks two incompatible ways.
    evidence: |-
      The new nesting-aware `recipe()` helper exists because the older
      `@utility text-*` regex truncates at the first `}`; the broken reader is
      still in use for the ten typography roles, which have no nested rules so
      it happens to work. Pre-existing, and not caused by this story.
    location: >-
      app/globals.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `PATCH /api/todos/:id` shipped in Story 4.1 with no caller, and the row's checkbox is a decorative `<span aria-hidden="true">` (`todo-row.tsx:56-81`) — so FR-3 is unreachable from the interface, Completion Status reaches assistive technology as nothing at all, and the product still behaves identically for a user whether or not Epic 4 has started. This is the story that makes the epic's headline sentence true.

**Approach:** Turn the glyph into a real control and give it a mutation to fire. The control is a `<button role="checkbox" aria-checked>` carrying the row's text as its accessible name, padded to a 44px hit area by a new `@utility` recipe that leaves the 21px mark untouched. The mutation is `useSetCompleted` in `src/client/todos/`, built on Epic 3's shape unchanged — `setQueryData` on the single `['todos']` key through `upsertTodoById`, no whole-list snapshot, one polite announcement on confirmation. `TodoList` holds the one hook instance and passes the handler down, so `TodoRow` stays presentational and its tests still need no providers.

## Boundaries & Constraints

**Always:** Exactly one query key, `TODOS_QUERY_KEY` (AD-8); the optimistic write and the rollback both go through `upsertTodoById` from `merge-todo-list.ts`, which is already the narrowest per-entity operation. Every request failure carries the kind of the operation attempted via `TodoRequestError("update", …)` (AD-10). `fetch` lives only in `src/client/todos/` (lint wall). One `announce(message, urgency)` (AD-12) — polite here. Design tokens only, and a value with no token becomes an `@utility` recipe in `app/globals.css` rather than an arbitrary-value class (AD-13); the theme's colour/radius/spacing counts are pinned by `globals.test.ts:171-196` and must not change. The row keeps one variant marker and every descendant derives from an attribute, never from a class picked in JavaScript (AR-28). `todo.completed` is read in `todo-row.tsx` and in no other file of the markup surface (`todo-row.test.ts:230-235`).

**Never:** No toggle request — the client sends the value it wants set, so a retry is idempotent (AD-6). No whole-list snapshot in `onMutate` and no whole-list restore in `onError`: with a second mutation in flight it undoes a change this mutation never made (AD-8, AD-16). No re-sort — `byIdDescending` sorts on id alone, so AC2 needs no code and must not acquire any. No error banner, no assertive announcement, no `Retry` closure and no departure transition: those are Stories 4.4 and 4.3, and half-building them here would leave two owners for one behaviour. No Filter View, no counts, no tabs (Story 4.3). No second live region, no `setTimeout`, no `duration-`/`transition-` class, no `\d+ms` literal outside `motion.ts` (`motion.test.ts:252-287`). No new spacing or colour token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Mark Completed | Pointer click on an Active row's checkbox | `PATCH /api/todos/:id` with body `{"completed":true}`; cache row flips to `completed:true` before the request resolves; row keeps its index | No error expected |
| Mark Active | Same interaction on a Completed row | Body `{"completed":false}`; cache row flips back | No error expected |
| Keyboard | Checkbox focused, `Enter` or `Space` pressed | Identical to a click — one activation path | No error expected |
| Confirmation | Server answers `200` with the updated Todo | The server row replaces the optimistic one by id, in place; `<text>, Completed` or `<text>, Active` announced politely | No error expected |
| Refusal | Server answers `404`/`401`/`500`, or the request throws | Only that row is restored to the `Todo` the mutation started from; every other row, including one a concurrent mutation changed, is untouched | `TodoRequestError("update")`; nothing announced and no banner — Story 4.4 |
| Concurrent toggles | Two rows toggled, the first failing | The first row reverts, the second keeps its optimistic value | Per-entity rollback only |
| Read in flight | A list refetch is running when a toggle starts | The read is cancelled, so the arriving list cannot overwrite the optimistic value | No error expected |

</intent-contract>

## Code Map

- `src/client/components/todo-row.tsx:50-86` -- **The file this story is about.** `{ todo }` today; gains `onToggle`. `<span aria-hidden="true">` at `:56-81` becomes the control; `checkbox-box` (21px/1.75px), `rounded-sm`, `border-border-control`, `bg-row-active`, `text-on-accent` and the `<svg>` at `:70-80` all survive verbatim. `data-completed` on the `<li>` at `:53` stays. Header comment at `:28-36` says "Story 4.3 makes it the thing that toggles" — stale after the 2026-09-22 renumbering (`epics.md:898`); correct it in place.
- `src/client/components/todo-row.test.ts` -- Six guards this story inverts, each deliberately: `:69` tag sequence `["li","span","svg","path","span"]`; `:215` `not.toContain("group-data-completed:bg-accent")`; `:242-253` the status-class regex and its gate prefixes; `:289-290` the `h-`/`overflow-` ban over the row's own classes; `:303-313` "no handler, no tabIndex, no role" and "no `button`/`input`/`label`"; `:315-320` "hides the decorative glyph from assistive technology"; `:353-361` the two statuses differ by the marker alone. Helpers `elements()` `:45-55`, `attributeNames()` `:57-65`, `tailwindCompiler()`/`ruleFor` `:37-43` — `ruleFor` throws when Tailwind emits nothing, which is the check that a variant spelling is real.
- `src/client/components/todo-list.tsx:1,95-135` -- `"use client"`, already holds `useTodos`. Holds the one `useSetCompleted()` and passes it to each `TodoRow` at `:118`. Must not read `.completed`.
- `src/client/components/todo-list.render.test.tsx:80-122` -- `mount(client)` wraps `QueryClientProvider` only and will now throw, because the list reaches `useAnnounce`; `mountCard()` at `:117` already wraps `AppProviders`. Thin `createRoot` + React `act`, no testing library; `matchMedia` stub at `:183-212`.
- `src/client/todos/use-create-todo.ts:105-261` -- **The shape to mirror.** `useMutation<Todo, Error, Todo>` with `retry:false, networkMode:"always"`; `onMutate` at `:131-135` is one `setQueryData`+`upsertTodoById` line; `onSuccess` at `:150-170` upserts the server row then announces; `addedAnnouncement` at `:57-59` is the exported message builder whose comment at `:53-55` names this story's sibling. There is no `onSettled` and no `invalidateQueries` anywhere in the product — do not add one.
- `src/client/todos/merge-todo-list.ts:42-71` -- `upsertTodoById(list, todo)` replaces by id or inserts at the `id DESC` position; `byIdDescending` at `:25-28` sorts on id alone. `:50-71` carries the standing argument against whole-list snapshots.
- `src/client/todos/create-todo.ts:37-101` -- The fetch to mirror: `TODOS_ENDPOINT = "/api/todos"` `:53`, a body builder that sends only what the server accepts `:48-50`, `AbortSignal.timeout`, `!response.ok` → `TodoRequestError`, shape-only guard on the parsed body, and a `catch` tail that re-kinds every failure. No caller `signal` is threaded.
- `src/client/todos/todo-list-query.ts:74-84,100,273` -- `TodoRequestError(kind, {cause,status})`, `READ_DEADLINE_MS = 15_000`, `identityExpired(error)`.
- `src/client/todos/pending-creates.ts:8-36` -- `CREATE_TODO_MUTATION_KEY = ["create-todo"]`. Its comment at `:10-12` is explicit: a toggle's id must **not** protect a row from an arriving list, so register nothing here.
- `src/client/todos/query-keys.ts:15-17` -- `TODOS_QUERY_KEY = ["todos"] as const`. `providers.test.ts` fails any second key literal starting `"todos"`, so the mutation key must not.
- `src/client/feedback/announcer.tsx:29,40` -- `Announce = (message, urgency) => void`, `useAnnounce()`.
- `app/globals.css:95,113-114,215-220` -- `--spacing-touch-target-min: 44px`; `--shadow-focus` and `--shadow-focus-on-complete`, the latter declared with **zero consumers** — this story is its first. `@utility checkbox-box` is the 21px recipe. `retry-pill` `:375-387` and `input-add` `:458-469` are the precedent for a recipe reading `var(--spacing-touch-target-min)` because `min-w-*` is banned tree-wide (`todo-card.test.ts:51,190`).
- `app/globals.test.ts:171-207,325-380` -- Pins 21 colours / 4 radii / 14 spacing tokens and exactly 10 `@utility text-*` roles (a non-`text-*` recipe is free); `:325-380` already proves the two focus rings differ in hue alone.
- `app/api/todos/[id]/route.ts:45,57,76,111` -- `UPDATE_FAILED_MESSAGE`, `SetCompletedRequest = { completed: boolean }`, the boolean-not-merely-present guard, and `PATCH`. Read-only; the client mirrors this body exactly.
- `src/client/motion/motion.ts` / `motion.test.ts:227-250` -- `DEPARTURE_HOLD_MS` and `COLLAPSE_MS` exist and stay unconsumed (Story 4.3). `:227-250` pins the exact set of exported `*_MS` declarations and is designed to be extended deliberately.
- `eslint.config.mjs:19-23,94-123,335-354` / `eslint.config.test.ts` -- The FULL-RESTATEMENT invariant for any new `src/client` block; `noUnapprovedQueryKey` already forces `queryKey`/`setQueryData` onto the identifier `TODOS_QUERY_KEY`; the `src/client` block ignores `src/client/todos`. `deferred-work.md:90` names the second hook in that directory as the moment the `useQuery` wall becomes writable, with one violating and one allowed fixture per rule.
- `docs/implementation-artifacts/deferred-work.md:90,110,122,153,171` -- Four entries this story closes or answers, plus the renumbering-drift rule.

## Tasks & Acceptance

**Execution:**
- `src/client/todos/set-completed.ts` -- create; `setCompleted({todo, completed})` issuing `PATCH ${TODOS_ENDPOINT}/${todo.id}` with body `{completed}` only, `SET_COMPLETED_DEADLINE_MS = READ_DEADLINE_MS`, and a `catch` tail re-kinding every failure as `"update"` -- mirrors `create-todo.ts` line for line so the two mutations fail the same way.
- `src/client/motion/motion.test.ts` -- add `SET_COMPLETED_DEADLINE_MS` to the pinned exported-`*_MS` list -- that list exists to be extended deliberately rather than silently.
- `src/client/todos/use-set-completed.ts` -- create; `useSetCompleted(): (todo: Todo, completed: boolean) => void`, `SET_COMPLETED_MUTATION_KEY = ["set-completed"]`, and the exported `toggledAnnouncement(text, completed)` builder -- one hook, many rows, exactly as `useCreateTodo` is one hook and many submits.
- `src/client/todos/set-completed.test.ts`, `src/client/todos/use-set-completed.test.ts` -- create; cover every I/O-matrix row, including the concurrent-toggles row and the cancelled-read row, and pin each module's export surface -- the matrix is the contract and nothing else exercises it.
- `app/globals.css` -- add `@utility checkbox-hit-area`: `position: relative` plus an `&::after` of `var(--spacing-touch-target-min)` square, centred on the mark -- 44px of hit area without moving the 21px mark or the text beside it, and without an `h-*` or `min-w-*` class the row's own guards ban.
- `app/globals.test.ts` -- assert the recipe reads the token in both dimensions -- the `retry-pill` precedent, and the only place the number is checkable.
- `src/client/components/todo-row.tsx` -- turn the glyph into `<button type="button" role="checkbox" aria-checked={todo.completed} aria-labelledby={`${todo.id}-text`}>` carrying `group/box`, the hit-area recipe, the checked fill/border gated on `aria-checked`, and the focus ring gated on `focus-visible`; give the text span that same `id`, which is unique because the Todo id is; call `onToggle(todo, !todo.completed)`; correct the stale story numbers -- the control and its accessible name are one change.
- `src/client/components/todo-row.test.ts` -- invert the six guards named in the Code Map and extend the status-class regex to cover `bg-accent`/`border-accent`/the two ring spellings, admitting `aria-checked:` and `focus-visible:` as gates alongside the marker -- the guards' purpose was never "no controls", it was "no class picked in JavaScript", and that survives.
- `src/client/components/todo-list.tsx` -- hold `useSetCompleted()` and pass it to each `TodoRow` -- the `add-todo.tsx` split, applied one level up, so `TodoRow` keeps needing no providers.
- `src/client/components/todo-list.render.test.tsx` -- wrap `mount()` in `AnnouncerProvider`, and add the through-the-list toggle: click, assert the request, resolve it, then remount against a fresh `QueryClient` whose `GET` returns the persisted row -- the closest a unit suite gets to a reload.
- `src/client/components/todo-row.render.test.tsx` -- create (jsdom, no providers); click, `Enter`, `Space`, the accessible name, and that the checkbox is the row's first focusable -- behaviour a markup scan cannot see.
- `eslint.config.mjs`, `eslint.config.test.ts` -- add the `use(Suspense)?Quer(y|ies)` denial to every block but `src/client/todos`, restating the baseline rules the flat-config invariant requires, with a violating and an allowed fixture -- `deferred-work.md:90` names this story's second hook as what makes the rule writable.
- `docs/implementation-artifacts/deferred-work.md` -- close the `useQuery`-wall, assistive-technology-status and `checked-*-on-active` entries, recording how each was answered -- three entries name this story as their owner.

**Acceptance Criteria:**
- Given an Active row, when its checkbox is activated by pointer, `Enter` or `Space`, then the cached `['todos']` entry for that id carries `completed:true` before the request resolves, and the row's index in the list is unchanged (AC1, AC2, AC8, AC9).
- Given a Completed row, when the same interaction runs, then the request body is `{"completed":false}` and the row returns to Active — one control, two directions (AC8).
- Given a toggle starts while a list read is in flight, when `onMutate` runs, then that read is cancelled, so the arriving list cannot overwrite the optimistic value (AC3).
- Given two rows toggled and the first request failing, when rollback runs, then only the first row is restored to the `Todo` its mutation started from, the second row keeps its optimistic value, and no whole-list snapshot is taken or restored anywhere in the hook (AC4, AC5).
- Given a confirmed toggle, when it settles, then the cache holds the **server's** row rather than the optimistic one, and remounting against a fresh `QueryClient` whose `GET` returns that row renders the same Completion Status (AC7).
- Given a confirmed toggle, when it settles, then `announce` is called exactly once with the Todo text followed by `, Completed` or `, Active`, at `"polite"` (AC6).
- Given a screen reader, when it reaches the control, then it is a checkbox whose checked state tracks Completion Status and whose accessible name is the Todo's text — not a decorative glyph (AC10).
- Given the row's class strings, when they are compiled, then a checked checkbox carries `accent` fill and border gated on its own `aria-checked`, and `accent-deep` when that row is also Completed; every status-dependent class is still gated on an attribute variant and none is chosen in JavaScript (AC11, AR-28).
- Given the checkbox is focused, when the ring renders, then it is `shadow-focus` on an Active row and `shadow-focus-on-complete` on a Completed one, and `globals.test.ts`'s existing geometry-identity assertion covers both (AC12).
- Given the compiled `checkbox-hit-area` recipe, when it is read back, then it sizes a 44px square from `var(--spacing-touch-target-min)` in both dimensions while `checkbox-box` still reads 21px (AC13).
- Given a rendered row, when its focusable descendants are enumerated in document order, then the checkbox is first and carries no `tabIndex` (AC14).
- Given the markup surface, when it is scanned, then `todo-row.tsx` is still the only file matching `/\.completed\b/`, and `npm run lint` rejects a `useQuery` call outside `src/client/todos`.

## Spec Change Log

**2026-09-23 — implementation, five recorded departures.** Each is a deviation from the frozen task list, taken during the build and recorded rather than negotiated away.

1. **`use-set-completed.ts` exports a fourth symbol, `setCompletedMutationOptions(client, announce)`.** The task list names three exports and asks `use-set-completed.test.ts` to "cover every I/O-matrix row, including the concurrent-toggles row and the cancelled-read row" in a `.ts` file. Those three rows are not reachable through a React hook in the `node` environment the file's extension implies, and reaching them through jsdom would have put the epic's hardest case behind a mounted card. The options are therefore exported as values and driven by a real `MutationObserver` — which is `todo-list-query.ts`'s own argument (`todoListQueryOptions`) reached from the mutation side. `useSetCompleted` is three lines over them. Recorded in `deferred-work.md` as a widened surface with no lint rule behind it.

2. **The glyph's reveal moved to `group-aria-checked/box:block`.** The Code Map says the `<svg>` "survives verbatim" while the Design Notes' code block spells `group/box` on the button and `group-aria-checked/box:block` on the glyph. The Design Notes won: `group/box` exists for nothing else, and the story's own argument — one attribute driving both the picture and the accessible state — applies to the glyph exactly as it applies to the fill. The svg's geometry, stroke and path are unchanged. This inverts a seventh guard (`todo-row.test.ts:176-200`, the display-cue and source-order pair) beyond the six the Code Map lists.

3. **The `h-`/`overflow-` ban (`todo-row.test.ts:289-290`) was honoured, not inverted.** It is listed among the six guards "this story inverts", but the hit-area recipe exists precisely so that no `h-*` or `min-w-*` class is needed; nothing in the new markup trips it. Left standing, and it now also covers the button's classes.

4. **`src/test-support/tailwind.ts` — `ruleFor` escapes `/`.** Not in the task list. The first named group in the product (`group/box`) is the first class whose emitted selector carries an escaped slash, and `ruleFor` escaped `:` but not `/` — so it reported "Tailwind emitted no rule" for a class Tailwind had emitted, which is the one error message guaranteed to send a reader to the wrong file.

5. **`todo-list.test.ts` mocks `@/client/todos/use-set-completed`.** Not in the task list. That file mocks `useTodos` and `useAnnounce` and renders with `renderToStaticMarkup`; the list's second hook reaches for a `QueryClient`, which throws outside its provider by design. One mock, plus one new assertion that the list holds exactly one hook instance and hands it down.

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 36 findings — high 0, medium 7, low 24, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` `aria-checked:bg-accent` is unreachable, so the `checked-*-on-active` entry was closed by relocation — verified: `aria-checked` and `data-completed` are both `todo.completed`, so the (0,3,0) deep rule always beats the (0,2,0) one. Classes kept (AC11 requires the spelling); the header comment and the deferred-work closure were corrected to say the state stays unreachable and what the story settles is the question.
  - `[medium]` `[patch]` `app/globals.test.ts` never asserted `content: ""` — grouped with the centring gap below; both are the same incomplete recipe assertion.
  - `[low]` `[defer]` `onError` restores every field, not only `completed` — real but inert today: nothing in this product ever mutates `text` or `createdAt` client-side, so the restored fields are always equal. Deferred with the same-row ordering entry.
  - `[low]` `[defer]` no test covers two toggles of the same row — grouped with same-row ordering; the fix needs a version column or mutation `scope`, which is Story 4.4's to design.
  - `[low]` `[patch]` the `useQuery` wall is bypassed by an aliased import — verified: the selector matches the called identifier, so `import { useQuery as readList }` passes. A `no-restricted-imports` clause naming the four hooks was added with a fixture.
  - `[low]` `[patch]` "holds one toggle hook" asserts nothing distinguishing one hook from N — verified against its own conceding comment; renamed to what it proves.
  - `[low]` `[patch]` `stubTransport`'s single `pending` resolver is overwritten by a second PATCH — verified at `todo-list.render.test.tsx:417`; resolvers are now keyed by request URL.
  - `[medium]` `[patch]` the mounted suite never exercised a refused toggle — AC4/AC5 were proved only at the cache layer; a mounted refusal case now asserts `aria-checked` returns to `"false"` and the live regions stay empty.
  - `[low]` `[patch]` cwd-relative `readFileSync` and brittle occurrence counts — verified; path now resolved from `import.meta.url`, counts dropped.
  - `[low]` `[patch]` `toBeGreaterThan(5)` under a comment stating ten — verified at `todo-row.test.ts:336`; now an exact count.
  - `[medium]` `[patch]` the new fill and ring pairs had no cascade assertion — grouped with the deletion finding below.
  - `[low]` `[patch]` `app/globals.test.ts` duplicates an existing spacing-count assertion — verified character-for-character; the duplicate was deleted.
  - `[low]` `[defer]` `globals.test.ts` holds two incompatible `@utility` readers — the truncating regex predates this change; not caused by this story.
  - `[low]` `[patch]` `motion.test.ts` comment says "the fourth" where the constant is the third — verified; corrected.
  - `[low]` `[reject]` spec frontmatter and Verification disagree with the shipped work — rejected: the only fix edits this build's spec.
  - `[low]` `[patch]` `id` starts with a digit, so it is an invalid CSS identifier — verified; prefixed `todo-`, and the render test dropped its `CSS.escape` workaround.
  - `[low]` `[patch]` the deferred-work hit-area entry overstates the overlap — verified: 11.5px spill against a 12px gap clears by 0.5px; the measurement was corrected.
  - `[medium]` `[patch]` a toggle cancels a never-re-issued initial read — verified by probe: after `cancelQueries` the query sits at `fetchStatus: idle`, `status: pending`, `data: undefined` and the queryFn is not re-issued, so the list never lands. Reachable because an optimistic create renders a live checkbox during the first GET. Gated on the already-exported `listHasLanded`.
  - `[medium]` `[defer]` same-row toggles have no ordering guarantee — real; the fix needs a version column or mutation `scope`, which adds state this pass did not demonstrate. Recorded for Story 4.4, which owns what a failure means for a queued sibling.
  - `[low]` `[defer]` repeated activation fires N concurrent PATCHes on one row — same root cause as the ordering entry.
  - `[low]` `[defer]` rollback re-inserts a row absent from the cache — unreachable today: nothing removes a row from the cache until Epic 5's delete. Deferred to that epic.
  - `[low]` `[defer]` a `200` body that is an object but not a `Todo` — the client trusts the deployment per AD-3, exactly as `createTodo` does; a shape validator here would be a second contract.
  - `[low]` `[patch]` `todo.id` is interpolated into the URL unencoded — ids are client-minted UUIDv7 so nothing needs encoding, but the fix is one call; applied.
  - `[medium]` `[defer]` toggling a row whose create is unconfirmed 404s and reverts silently — real and untested; the silent revert is this story's deliberate boundary and the banner is Story 4.4's, so the case belongs with it.
  - `[medium]` `[patch]` the removed assertion left `aria-checked:bg-accent` matching Completed rows, prevented only by untested specificity — verified; a flip would paint `accent` on mint at 2.97:1, the exact WCAG 1.4.11 failure the design exists to prevent. Source-order assertions added for both the fill and the ring pairs.
  - `[low]` `[patch]` the forbidden-tag loop lost `a` and `select` — verified; both restored.
  - `[low]` `[patch]` the header claim that gating on `aria-checked` gives `checked-*-on-active` a home — same entry as the first row; corrected.
  - `[low]` `[patch]` the comment "cannot reach any row but its own" overstates the guarantee — verified: it holds across rows, not within one. Reworded with the same-row case named.
  - `[medium]` `[patch]` the hit area's centring is never asserted — pre-verified by the layer and re-demonstrated here: deleting `transform: translate(-50%, -50%)` left all 930 tests green while the 44px square slid off the mark onto the Todo's text. The recipe assertion now covers `content`, `top`, `left` and `transform`.
  - `[medium]` `[patch]` nothing binds the new classes to the element that carries them — pre-verified by two demonstrations: moving `checkbox-hit-area` onto the text span, and the accent fill onto the `<li>`, both kept 930/930 green. The render test now asserts the mounted control's own `className`.
  - `[low]` `[defer]` AC9's Enter/Space test is satisfied by the click the test itself dispatches — real and unfixable here: jsdom performs no button activation at all. Already recorded and assigned to Epic 6.
  - `[medium]` `[patch]` the AC7 reload case could not fail for the reason its comment gives — pre-verified: `confirm()` wrote a row indistinguishable from the optimistic guess, so the case passed with `onSuccess`'s cache write deleted. It now confirms with a distinct `createdAt` and asserts it survives the remount.
  - `[low]` `[patch]` which accent paints a checked box on a Completed row is settled only by specificity — same entry as the cascade finding; assertions added.
  - `[medium]` `[defer]` a toggle against an unconfirmed create is untested — same entry as the 404 finding above.
  - `[false]` `[reject]` `ruleFor` has no direct test file — refuted by the layer itself: `todo-row.test.ts:199` calls it with a named-group class, which throws if the escaping is wrong.
  - `[false]` `[reject]` AC3/AC4/AC5 live only at a surface the diff created for itself — the exported options are a real seam, and the mounted refusal case added this pass exercises rollback through the interface. The widened export stays recorded as a deferral.
  - `[false]` `[reject]` `sprint-status.yaml` still reads `backlog` and the work is uncommitted — refuted by sequence: the commit is this workflow's Finalize step, which had not run when the diff was read.

## Design Notes

**`<button role="checkbox">`, not `<input type="checkbox">`.** AC9 requires `Enter` *and* `Space`, and EXPERIENCE.md:194 commits the product to both. A native checkbox activates on `Space` only — `Enter` fires nothing — so meeting AC9 with one means hand-writing a second activation path in `onKeyDown` and keeping it in step with the first. A button gets both keys from the platform through one `onClick`. It also keeps the 21px mark exactly as `checkbox-box` already draws it, with no `appearance-none` reset, and exposes state through `aria-checked` — an attribute, which is the same idiom `data-completed` already uses, so the styling can key off the attribute the assistive technology reads. The cost is that `role="checkbox"` must be spelled explicitly and the accessible name supplied by `aria-labelledby`; a wrapping `<label>` is not available, because it would make the row body a click target and EXPERIENCE.md:105 forbids that.

**Why the fill keys on `aria-checked` and not on the row marker.** Today `checked ⟺ completed`, so gating the fill on `group-data-completed:` would render identically and `deferred-work.md:122` is right that checked-on-Active is unreachable. Keying on the control's own state is still the better transcription of DESIGN.md:412, for a reason that is not stylistic: if the visual fill and the accessible state are driven by one attribute they cannot disagree, and a bug that breaks `aria-checked` breaks the picture too rather than hiding behind it. That is also what finally gives `checked-*-on-active` a home and closes the entry:

```tsx
<button
  role="checkbox"
  aria-checked={todo.completed}
  className="checkbox-box checkbox-hit-area group/box … border-border-control bg-row-active
             aria-checked:border-accent aria-checked:bg-accent
             group-data-completed:aria-checked:border-accent-deep
             group-data-completed:aria-checked:bg-accent-deep
             focus-visible:shadow-focus group-data-completed:focus-visible:shadow-focus-on-complete"
>
  <svg className="hidden group-aria-checked/box:block" … />
</button>
```

`ruleFor` throws when Tailwind emits nothing for a class, so a variant spelling that does not exist fails the test rather than rendering nothing.

**Cancelling the read is necessary, not merely permitted.** AC3 says a toggle *may* cancel. It must: `mergeTodoListById` keeps a cached row against an arriving list only when an unconfirmed **create** protects it, and `pending-creates.ts:10-12` is explicit that a toggle's id must not join that set. Without the cancel, a refetch that lands mid-toggle overwrites the optimistic value and the change visibly un-happens.

**What this story deliberately leaves silent.** A refused toggle reverts the row and says nothing — no banner, no announcement, no `Retry`. That is Story 4.4, whose AC1 re-covers the restore and adds the rest. Splitting the banner across two stories would leave one behaviour with two owners; this is the same discipline that let Story 4.1 ship an endpoint with no caller.

## Verification

**Commands:**
- `npm run lint` -- expected: clean at `--max-warnings=0`, including the new `useQuery` denial over every block but `src/client/todos`.
- `npm run typecheck` -- expected: clean.
- `npx vitest run src/client/todos src/client/components app/globals.test.ts src/client/motion eslint.config.test.ts` -- expected: green, with the inverted `todo-row.test.ts` guards failing before the component changes and passing after.
- `npm test` -- expected: no pre-existing test changes its verdict against the `6a0253a` baseline of 40 files / 876 tests; record both totals.
- Mutation check: revert the `onError` rollback to a whole-list `setQueryData` and confirm the concurrent-toggles test fails; revert `aria-checked` to a constant and confirm both the accessible-state test and the fill test fail.

## Auto Run Result

Status: done
Blocking condition: none

### What was built

The checkbox, and the status change it applies before the server answers. The
row's decorative glyph is now a real control, and Story 4.1's endpoint has its
first caller — which is what makes Epic 4's headline sentence true for a user
rather than only for the API.

| File | Change |
| --- | --- |
| `src/client/components/todo-row.tsx` | The `<span aria-hidden>` becomes `<button type="button" role="checkbox" aria-checked aria-labelledby>`. Fill, border and focus ring key on the control's own `aria-checked`; the 21px mark and its glyph survive verbatim. |
| `src/client/todos/use-set-completed.ts` | **New.** `useSetCompleted`, its mutation key, the `toggledAnnouncement` builder, and the mutation as exported options. Optimistic write, per-row rollback, one polite announcement. |
| `src/client/todos/set-completed.ts` | **New.** The `PATCH` request, mirroring `create-todo.ts` line for line so both mutations fail the same way. |
| `src/client/components/todo-list.tsx` | Holds the one hook instance and passes the setter to every row. |
| `app/globals.css` | `@utility checkbox-hit-area` — a centred transparent `::after` sized from `{spacing.touch-target-min}`, so the hit area grows without the mark or the row moving. |
| `eslint.config.mjs`, `eslint.config.test.ts` | The `useQuery` wall `deferred-work.md` had been waiting on a second hook in `src/client/todos/` to make writable, in both the call and the import spelling. |
| `src/test-support/tailwind.ts` | `ruleFor` escapes `/`, needed by the story's first named group. |
| Tests | `set-completed.test.ts`, `use-set-completed.test.ts`, `todo-row.render.test.tsx` new; `todo-row.test.ts`, `todo-list.test.ts`, `todo-list.render.test.tsx`, `motion.test.ts`, `globals.test.ts`, `eslint.config.test.ts` updated. |

`--shadow-focus-on-complete` has been declared since Story 1.2 with nothing
keyed to it; this story is its first consumer.

### Review findings

Four layers ran: blind hunter, edge-case hunter, verification-gap and
intent-alignment. 36 findings — high 0, medium 7, low 24, false 3,
maybe-false 0. No `intent_gap` and no `bad_spec`, so no code was re-derived.

**Patched — 18 entries** (medium 6, low 12). The four that mattered:

- A toggle cancelled the list read unconditionally, which stranded the *initial*
  read. Probed directly: after `cancelQueries` the query sits at
  `fetchStatus: idle`, `status: pending`, `data: undefined` and the queryFn is
  never re-issued, so the list never lands. Reachable because an optimistic
  create renders a live checkbox during the first GET. Now gated on
  `listHasLanded`, which is what AC3's own reasoning already implied.
- Nothing bound the checkbox's classes to the checkbox. `classNamesOf` flattens
  every `className` literal in a file into one array, so moving
  `checkbox-hit-area` onto the text span, or the accent fill onto the `<li>`,
  left all 930 tests green while rendering AC13 and AC11 inert.
- Two tests could not fail for the reasons they claimed: deleting the hit area's
  centring `transform` kept the suite green while the 44px square slid onto the
  Todo's text, and the AC7 reload case confirmed with a row indistinguishable
  from the optimistic guess.
- The new fill and ring pairs were resolved by untested specificity. A flip
  would paint `accent` on mint at 2.97:1 — the exact WCAG 1.4.11 failure the
  whole `accent-deep` argument exists to prevent.

**Deferred — 6**, each in frontmatter `deferred` rather than half-done: same-row
toggle ordering; AC9's Enter/Space being unobservable in jsdom; a toggle against
an unconfirmed create; rollback re-inserting a dropped row; an unvalidated `200`
body; and `globals.test.ts`'s two `@utility` readers.

**Rejected — 3**, with reasons:

- `ruleFor` has no direct test file — refuted by the layer itself: a named-group
  call exercises the escaping and throws if it is wrong.
- AC3-AC5 live only at a surface the diff created for itself — the exported
  options are a real seam, and the refusal case added this pass exercises
  rollback through the mounted interface.
- The spec's frontmatter and `sprint-status.yaml` disagree with the shipped work
  — the only fix edits this build's spec, and the commit is this workflow's own
  Finalize step, which had not run when the diff was read.

**Follow-up review recommended: true.** Six `medium` entries were patched on a
first pass, four of them test-integrity failures found only by mutation. The
specific unverified risk: the `listHasLanded` gate is new behaviour on the
*read* path, proved by a single test at the options surface — no test exercises
a toggle during an unlanded read through a mounted list, and nothing covers what
re-issues a read that was cancelled and abandoned.

### Verification

- `npm run lint` — clean at `--max-warnings=0`, including the new `useQuery` wall.
- `npm run typecheck` — clean.
- `npx vitest run src/client/todos src/client/components app/globals.test.ts src/client/motion eslint.config.test.ts` — 22 files, 460 tests, green.
- `npm test` — **43 files, 934 tests, all passing.** Baseline at `6a0253a` was 40 files / 876 tests. No pre-existing test changed its verdict except the guards this story deliberately inverted.
- Mutation checks, all confirmed: a whole-list snapshot rollback fails the concurrent-toggle test; pinning `aria-checked` to a constant fails four tests; deleting the hit area's `transform` now fails the recipe assertion; moving `checkbox-hit-area` off the control now fails the attachment test; removing the `listHasLanded` gate now fails the initial-read test.
- Every I/O-matrix row has at least one covering test that ran and passed.

Note on process: three review patches were lost mid-run when `git checkout --`
was used to undo mutation probes against unstaged changes, and were re-applied
before the final verification above. No code shipped in that intermediate state.

### Residual risks

- **AC9 rests on an assumption.** That `Enter` and `Space` activate a
  `<button role="checkbox">` is the reason the control is a button rather than
  an `<input type="checkbox">`, and no test in this repository observes it.
- **The 44px hit area is asserted as CSS, never measured.** The overlay clears
  the neighbouring text by 0.5px against a 12px gap; jsdom hit-tests nothing.
- **A refused toggle is silent by design.** The row reverts and says nothing
  until Story 4.4 adds the banner, the assertive announcement and `Retry`.
- **Epic 4 is two stories in.** Story 4.3 (filter tabs and departure) and 4.4
  (revert a refused toggle) remain; the departure constants `DEPARTURE_HOLD_MS`
  and `COLLAPSE_MS` are still unconsumed.
