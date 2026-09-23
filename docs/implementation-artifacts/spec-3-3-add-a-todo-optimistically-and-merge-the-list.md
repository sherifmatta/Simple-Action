---
title: 'Story 3.3: Add a Todo optimistically, and merge the list that arrives'
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

**Problem:** The field accepts a Todo and throws it away — `SUBMIT_NOT_YET_WIRED` is the live submit handler, so Enter clears the input and creates nothing. Story 3.1 built the endpoint and Story 3.2 built the field; nothing joins them. Joining them is the hardest problem in the build, because the input is live before the list has arrived: a create raised while the `GET` is still in flight must neither cancel that read nor be erased by the response it eventually brings.

**Approach:** Mint the Todo's id in the browser, insert it into the `['todos']` cache with `setQueryData`, and let the list query keep running. Give the list query a merge-by-id step so an arriving response takes its place beside an unconfirmed optimistic row rather than replacing it, and give the list region a loading signal that survives an optimistic write, so skeletons keep pulsing beneath a row that is already real. Confirmation is silent: the id, and therefore the sort position, was decided the moment the user pressed Enter.

**Decisions recorded at planning time** (all agent decisions — the epic's acceptance criteria settled the user-visible behaviour):

1. **`uuidv7@1.2.1` is added as a dependency, and the hand-written generator in `identity-token.ts` is deleted in the same change.** AC2 requires the real package; `ARCHITECTURE-SPINE.md:204` pins `1.2.x`; `deferred-work.md` records that `mintIdentityId` is a stand-in that must become a re-export "or the two generators drift". Two generators in one repo is the failure, so both sides move together. Client minting lives in `src/client/todos/todo-id.ts` and uses the package's own global generator — that is the "single monotonic generator instance" AD-5 names, and monotonicity within a millisecond is exactly what the local version deliberately does not have.

2. **The merge runs inside the list query's `queryFn`, not in `structuralSharing` and not in an `onSuccess`.** `QueryFunctionContext` carries `client`, so the query can read both the current cache and the pending creates; `structuralSharing` sees neither, and v5 removed query-level `onSuccess`. The rule itself is a pure `mergeTodoListById(cached, incoming, unconfirmedIds)` so the race is unit-testable without a component, and every refetch — including Story 3.4's `Retry` — merges the same way for free.

3. **The unconfirmed ids come from TanStack's own mutation cache**, read through the create mutation's key and `status: "pending"`, rather than a second registry kept beside it. One source of truth for "this create has not been answered yet", and Epics 4 and 5 extend it by adding their own mutation keys rather than by maintaining a parallel set.

4. **The skeleton signal becomes a latch on `fetchStatus`, held in `useTodos`.** `deferred-work.md` records that `isPending` cannot serve this and that the replacement must not be derived from cache contents. `query-core` dispatches a *manual* success for `setQueryData` and deliberately leaves `fetchStatus` alone for it, returning it to `idle` only when a real fetch settles — so "a list has landed" is exactly "the query was idle with data at some point", which an optimistic write cannot fake and a background refetch cannot un-say. This discharges that entry.

5. **The list region renders optimistic rows and skeletons together, rows first.** The `<ul>`'s contents stop being a ternary: cached rows render, and the three skeletons follow them while the list has not landed. The `data === undefined` disjunct goes, `aria-busy` stays keyed to the same signal, and the empty state stays gated on a landed list so an optimistic row never races it.

6. **A new client wrapper `AddTodo` owns the mutation; `AddInput` stays presentational.** `StickyTopBlock` is a Server Component that cannot pass a function prop (spec 3.2's change log), and putting `useCreateTodo()` inside `AddInput` would drag three providers into twenty-two provider-free render tests. So the block renders `<AddTodo />`, `AddTodo` renders `<AddInput onSubmit={…} />`, `SUBMIT_NOT_YET_WIRED` is deleted, and `onSubmit` becomes required — the state Story 3.2 called "one named constant to replace", reached one file over.

7. **A successful add announces `<text>, added` politely** through `useAnnounce()` — `EXPERIENCE.md:277`'s literal form, comma included, matching the `book dentist, Completed` shape Epic 4 will reuse.

8. **A failed create is Story 3.4's, and is not partly built here.** No rollback, no banner, no text return: 3.4 AC1–AC4 own all four, and half a rollback is worse than none. The window in which a failed add leaves a phantom row with no banner is recorded in `deferred-work.md` rather than papered over.

9. **The add-during-load test is written first**, as the epic instructs, and AC10's "still there an hour later" is verified as the endpoint's persistence already proven in Story 3.1, not rebuilt.

</frozen-after-approval>

## Implementation Notes

### What was built

- **`src/client/todos/merge-todo-list.ts`** (new) — `mergeTodoListById` and `upsertTodoById`, both pure. AD-16's rule as a function of three values, and the single-row upsert the mutation uses twice: once to insert, once to confirm.
- **`src/client/todos/pending-creates.ts`** (new) — `CREATE_TODO_MUTATION_KEY` and `unconfirmedCreateIds(client)`, read out of TanStack's mutation cache rather than a registry beside it.
- **`src/client/todos/todo-id.ts`** (new) — `mintTodoId()`, one line over the `uuidv7` package's global monotonic generator.
- **`src/client/todos/create-todo.ts`** (new) — the `POST`, its two-field body, and `create`-kind error classification.
- **`src/client/todos/use-create-todo.ts`** (new) — `useCreateTodo()` and `addedAnnouncement()`. No `cancelQueries`, no whole-list snapshot, no failure handling.
- **`src/client/components/add-todo.tsx`** (new) — the client component between the Server-Component block and the field.
- **`src/client/todos/todo-list-query.ts`** — the `queryFn` merges rather than returns.
- **`src/client/todos/use-todos.ts`** — adds `listLanded`.
- **`src/client/components/todo-list.tsx`** — rows and skeletons render together, rows first; `loading` and the empty state are keyed on `listLanded`.
- **`src/client/components/add-input.tsx`**, **`sticky-top-block.tsx`** — `onSubmit` required, `SUBMIT_NOT_YET_WIRED` deleted, slot 1 is `<AddTodo />`.
- **`src/server/identity/identity-token.ts`** — the hand-written RFC 9562 generator deleted; `mintIdentityId` is `uuidv7()`.
- **`package.json`** — `uuidv7` at `1.2.1`, the pinned `1.2.x`.
- **Tests** — `merge-todo-list.test.ts` (10), `todo-id.test.ts` (5), `create-todo.test.ts` (11), `add-todo.render.test.tsx` (5, jsdom), and updates to `todo-list.test.ts`, `add-input.test.ts`, `add-input.render.test.tsx` and `sticky-top-block.test.ts`.

### Decisions taken during the build

**The merge's cache read had to move after the `await`, and getting it wrong was a real failure rather than a hypothetical one.** The first version read the cache and the response in one argument list: `mergeTodoListById(client.getQueryData(...), await fetchTodoList(...), ...)`. JavaScript evaluates arguments left to right, so the cache was read when the request *started* — before the optimistic row existed — and the merge dutifully kept nothing. The mounted race test caught it, and `create-todo.test.ts`'s "reads the cache after the response, not before it" now pins it with a stub that writes into the cache while the request is in flight.

**An unconfirmed create is one that has not failed, not one that is still pending.** The narrower reading is the obvious one and it is wrong in the story's own scenario reversed: a `GET` that left before the `POST` can answer after the `POST` has already succeeded, and it still knows nothing about the new Todo. With a pending-only filter the row is dropped at that moment, which is precisely the "never dropped" AC7 forbids. Both orders are now tested, in `add-todo.render.test.tsx` and again at the query layer. The cost — a settled create protecting its row for the mutation's `gcTime` — is in `deferred-work.md`.

**The skeleton signal is a `useState` adjusted during render, not a ref.** The plan said "a latch on `fetchStatus`, held in `useTodos`", and the first implementation was a `useRef` written during render. `react-hooks/refs` rejects that outright ("Cannot access refs during render"), and it is right to: the value is rendered. React's own answer for this shape is state adjusted during rendering, which applies before the commit and so produces no frame in which a landed list still has skeletons under it — an effect would produce exactly that flash. The behaviour the plan described is unchanged; only its storage is.

**`AddInput` keeps its `onSubmit` prop rather than calling the hook itself, and the prop became required.** Planning decision 6 said the wrapper existed to keep three providers out of the field's tests; building it showed a second reason worth more. Deleting the default rather than replacing it means the "accepts a Todo and discards it" state is now a type error rather than a convention — `<AddInput />` does not compile.

**`todo-id.test.ts` restates the canonical UUIDv7 form instead of importing the server's validator.** Importing `isCanonicalUuidV7` was the better test and `eslint.config.mjs` forbids it: client code may not import from `src/server/`, and a test is not an exception to a dependency graph. Both sides are RFC 9562 §4 written out, and `route.test.ts` owns the handshake where a real request meets the real validator.

**`add-todo.render.test.tsx` flushes three macrotasks where `todo-list.render.test.tsx` flushes one.** A read now goes through the response, its `.json()`, the merge and TanStack's scheduled notification before it reaches the tree. One macrotask lands inside that chain and reads a commit-old tree, which fails for a reason the product does not have.

### Surprises

- **`setQueryData` leaves `fetchStatus` alone, and that is load-bearing rather than incidental.** `query-core` dispatches a manual success for it (`query.js`, `case "success"`: `...!action.manual && { fetchStatus: "idle" }`), so an optimistic write cannot make a query look settled. Every other field it touches — `status`, `data`, `dataUpdateCount`, `dataUpdatedAt`, `isFetched` — is indistinguishable from a real response, which is why each of those was rejected as the loading key.
- **The `git checkout` used to undo a mutation test reverted the file's real changes too**, since the story's edits to `todo-list.tsx` were uncommitted. Re-applied and re-verified; the mutation checks themselves are recorded below.
- **Three mutation checks were run against the race test and all three failed it**: disabling the merge (returning the response wholesale), adding `cancelQueries` to `onMutate`, and rendering skeletons above rows. The first two fail two cases each, the third one.

### Verification

`npm run lint` and `npm run typecheck` are clean. `npx vitest run` — **745 passed, 0 failed** across 38 files, the live repository tests included.

### Review fixes

Twelve findings from one context-free review pass. Two were confirmed against the running code before anything was changed, and both are defects this story introduced:

**1. The load-failure banner disappeared the moment the user added a Todo.** `setQueryData` dispatches a *manual* success, and `query-core`'s `successState` sets `error: null` for a manual write exactly as it does for a real response — verified by probing a real `QueryClient`: after a failed read and one optimistic insert, the state reads `status: "success"`, `error: null`. `error-banner.tsx` reads that field, so its effect took the banner and its `Retry` down, leaving a Todo on screen and no indication the list had failed to load. The field that *is* untouched by a manual write is `fetchFailureReason` (`query.js`, `case "success"`, which restores it only when `!action.manual`), so `useTodos` now exposes `readFailure: query.error ?? query.failureReason` and the banner reads that. `error` is still preferred where both are set, so the one state they disagree about — a refetch started over a list that already carries an error — reads as it did before.

**2. `listLanded` could be faked by the same write, which is the one thing its own comment claimed was impossible.** The first implementation computed it as "idle with data", and after a *failed* read the query is already idle with no data — so the optimistic write supplied the data and the signal flipped true although no list had arrived. Consequences: no skeletons while `Retry` re-ran that read (Story 2.6 AC5), and, once Story 3.4's rollback empties the list, the All empty state standing over contents nobody knows. It is no longer derived from the query at all. `todo-list-query.ts` keeps a `WeakSet` of the clients whose `queryFn` has actually returned a list, and `useTodos` reads it back. That also removes a second finding: the signal was per-consumer component state for what is a fact about the cache, so a consumer mounting during a background refetch would have started at `false` and rendered skeletons under a list already in hand.

`loading` fell out simpler as a result — `isFetching && !listLanded`, with Story 2.6's error branch no longer needing a disjunct of its own.

Also patched: the trim assertion in the race test submitted a string with no whitespace in it and passed with `text.trim()` deleted; `todo-id.test.ts`'s same-millisecond case guarded on elapsed time, which is flaky on a loaded machine and vacuous at exactly 1ms, and now *finds* two mints sharing a timestamp field instead; `mergeTodoListById` cast `readonly Todo[]` to `Todo[]` on both return paths, and now takes the response as the mutable, freshly-parsed array it is; nothing exercised two unconfirmed creates at once, which is the epic's own typing rhythm, and two cases now do; the `Deferred` test type declared a `signal` for the create that nothing read; and three assertions pinned implementation text closely enough that a Prettier reflow would fail a working build, so two were replaced by the behavioural fixtures already above them and one by a pair of claims that do not depend on how the parameter list wraps.

Both fixes were mutation-checked: pointing the banner back at `query.error` fails one case, and removing the arrival record fails three across two files.

Untouched, and recorded in `deferred-work.md`: the announcement firing on confirmation rather than on appearance (AC9 says one thing and EXPERIENCE.md UJ-2 the other, and Story 3.4 has to settle what a rolled-back add announces), and the create carrying no `AbortSignal`, which compounds the missing deadline rather than standing alone. One finding was rejected: `upsertTodoById` walks its list twice and re-sorts an already-sorted array, which is real, developer-only, and not worth rewriting the function three epics reuse for no user-visible gain.

`npm run lint` and `npm run typecheck` are clean. `npx vitest run` — **748 passed, 0 failed** across 38 files.

## Spec Change Log

### 2026-09-23 — Planning decision 3 names a narrower filter than the one that is correct. Not edited; flagged.

The approved decision reads: the unconfirmed ids come from the mutation cache, "read through the create mutation's key and **`status: "pending"`**".

Pending alone is wrong, and the story's own race is what shows it. A `GET` that left the browser before the `POST` can answer after the `POST` has already succeeded, still carrying a list that predates the Todo. At that moment a pending-only filter reports nothing unconfirmed, the merge lets the response win, and the Todo the user just watched appear disappears — the "never dropped" AC7 forbids. `pending-creates.ts` therefore counts a create as unconfirmed while its mutation is in the cache and has not *failed*, which covers both orders; both are tested, in `add-todo.render.test.tsx` and again at the query layer in `create-todo.test.ts`.

**Everything the decision was for survives** — one source of truth, read from TanStack's own mutation cache, extended by Epics 4 and 5 through their own keys. What changed is one predicate inside it. **This wants no decision from you**; it is recorded because only you may change the frozen block, and the block's wording now names a filter the code deliberately does not use. The cost of the wider filter — a settled create protecting its row until the mutation is garbage-collected — is recorded in `deferred-work.md`.

## Review Triage Log

One review layer ran (Blind Hunter, context-free, over the worktree). Twelve findings; each was checked against the cited file, and the two most serious were confirmed by probing a real `QueryClient` before anything was changed.

**Patched**

- `high` — **The load-failure banner is cleared by the first optimistic write.** Confirmed empirically: a manual `setQueryData` sets `error: null`. The banner and its `Retry` vanished, leaving the new Todo on screen and the failed load unreported. Fixed by reading `fetchFailureReason`, which a manual success does not restore.
- `high` — **`listLanded` was forgeable by the same write.** After a failed read the query is idle with no data, so the optimistic insert made it look landed: no skeletons under `Retry`, and an empty state waiting to stand over unknown contents once Story 3.4 rolls back. Fixed by recording arrival where only the `queryFn` can reach it.
- `medium` — **`listLanded` was per-consumer component state for a fact about the cache.** Latent today (both consumers mount at app start), reachable as soon as Epic 4 adds a third. Removed by the same fix.
- `medium` — **The trim assertion did not exercise trimming.** The submitted string had no surrounding whitespace, so it passed with `text.trim()` deleted. Now submits a padded string, and also pins that the optimistic row carries the trimmed text.
- `medium` — **The same-millisecond id test was flaky and possibly vacuous.** Guarded on `Date.now()` elapsing less than 2ms, which a GC pause fails and which at exactly 1ms lets the two ids straddle a boundary while still passing. Now finds a pair sharing the leading 48-bit timestamp field.
- `medium` — **Nothing exercised two unconfirmed creates at once**, though nothing makes the second Enter wait for the first `POST`. Two cases added: both kept, and only the confirmed one collapsed.
- `low` — **`mergeTodoListById` cast away `readonly` on both return paths**, telling callers it may mutate an array it promised not to. `incoming` is now typed as the mutable array it is.
- `low` — **Three assertions pinned implementation text.** A Prettier reflow, an extracted props type or a De Morgan rewrite would have failed a working build. Two are covered by the behavioural fixtures directly above them; the required-prop claim is now two assertions that do not depend on wrapping.
- `low` — **Dead scaffolding**: the create half of the test transport declared a `signal` nothing read.

**Deferred** (each has an entry in `deferred-work.md`)

- `medium` — The add announces on confirmation rather than on appearance. AC9 and EXPERIENCE.md UJ-2 read differently; the reviewer's refutation of the code's stated reason was correct and the comment was fixed, but the behaviour follows the criterion until Story 3.4 settles what a rolled-back add announces.
- `medium` — The create carries no `AbortSignal`, so a hung `POST` keeps its id unconfirmed indefinitely rather than for the mutation's `gcTime`. Compounds the missing deadline already recorded; the three want settling together.

**Rejected**

- `low` — `upsertTodoById` walks its list twice and re-sorts an already-sorted array. Real and developer-only, and the fix is a rewrite of the function the spec says Epics 4 and 5 reuse unchanged — more than a simple correction, for no user-visible gain.
- `false` — "Bookkeeping lags the work: the spec reads `in-progress` and sprint-status reads `in-progress`." Both are set after the review pass by the workflow that runs it; the reviewer saw them mid-flight.
