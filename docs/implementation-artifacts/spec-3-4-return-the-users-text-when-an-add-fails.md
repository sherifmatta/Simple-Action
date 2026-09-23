---
title: "Story 3.4: Return the user's text when an add fails"
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

**Problem:** A failed add is silent. `use-create-todo.ts` has no `onError`, so the optimistic row stays in the cache as a Todo that does not exist, no banner says why, and the text the user typed was cleared from the input on Enter and is gone. `create-todo.ts` already throws `TodoRequestError("create", …)` and `error-copy.ts` already holds `Couldn't add that Todo.`; nothing raises the one into the slot that would render the other. This is also the first story in the product to raise a *second* error kind, which makes two kind-unaware guards in the banner reachable for the first time.

**Approach:** Give the create an `onError` that removes exactly its own row, hands the submitted text back to the field with the caret at the end, and raises a `create` entry whose retry closure re-sends the *same id* with the text now in the field. Make the error slot's clear conditional on kind, and key the banner's raise on the slot being empty rather than on a ref recording what it last raised. Give the create the deadline the read already has, so a connection that is accepted and never answered fails into this story's recovery instead of hanging under it.

**Decisions recorded at planning time** (all agent decisions — the epic's acceptance criteria settled the user-visible behaviour):

1. **The field keeps its own text, and exposes an imperative handle.** AC4 needs the text *now* in the input at click time and AC2 needs text written back with the caret at the end — a focus-and-selection job React's own guidance names as the sanctioned use of `useImperativeHandle`. `AddInput` therefore gains a `ref` whose handle is `currentText()`, `restore(text)` and `clearAndFocus()`, and keeps the `useState` that its counter, its ceiling and its twenty-odd tests are written against. Lifting the value into `AddTodo` instead would mirror one string in two places and rewrite tests that have nothing to do with failure.

2. **`useCreateTodo` takes three callbacks, not the handle.** `useCreateTodo({ currentText, restoreText, clearAndFocus })`, supplied by `AddTodo` from its ref. Each maps to one criterion (AC4, AC2, AC5), and a hook under `src/client/todos/` stays free of a component type.

3. **Rollback is `removeTodoById(list, id)`**, a third pure function beside `upsertTodoById` and `mergeTodoListById` — AC1's "only the row this mutation inserted", with no snapshot to restore (AD-16). A failed create already protects nothing in `pending-creates.ts`, so the merge would drop the row at the next read; this removes it now, which is what the user is owed.

4. **A retry is not a fresh submit, and does not clear the field when it is fired.** AC2 keeps the text in the input "until the add succeeds", so `Retry` re-sends with the row optimistic on screen *and* the text still in the field; AC5's clear-and-focus happens in `onSuccess`, and only for a create whose text was returned. A `Retry` whose field no longer holds valid text — the user typed a different Todo in the meantime — does nothing and lets the banner clear, which is EXPERIENCE.md:115's standing rule for a retry with nothing left to re-attempt.

5. **The slot's clear becomes kind-aware and the banner's `reported` ref goes.** `errorSlotReducer` takes `{ type: "clear", kind? }`, clearing unconditionally without a kind and only a matching entry with one; `clearError(kind?)` passes it through. `error-banner.tsx` then raises `load` when `readFailure !== null` **and the slot is empty**, and clears with `"load"` on a healthy read. That is stable rather than looping — the raise makes the slot non-empty, which is the condition that stops it — and it discharges both deferred guards at once: a background read no longer wipes a `create` banner, and a `load` failure displaced by one is raised again when that one is cleared. `error-banner.test.ts`'s source greps for the old shape are rewritten with it.

6. **A rolled-back add announces the failure and nothing else.** The add stays announced in `onSuccess`; the banner already announces every kind assertively through one site. Moving the announcement to `onMutate` — the open tension in `deferred-work.md` — would read `send invoice, added` out for a Todo that then vanishes, so this story settles it against the move and discharges the entry.

7. **`CREATE_DEADLINE_MS` is added, at the read's 15s.** Without it the create this story is about can hang forever: no failure, no rollback, no banner, no text returned, and a row left unconfirmed indefinitely — the stuck interface NFR-4 forbids, reached through the one path this story exists to close. It requires widening `motion.test.ts`'s `*_MS` scan from one named exception to two. The create still carries no caller `AbortSignal` (cancelling on unmount would abandon a Todo the user asked for), and the `gcTime` window in `pending-creates.ts` stays deferred.

</frozen-after-approval>

## Implementation Notes

### What was built

- **`src/client/todos/merge-todo-list.ts`** — `removeTodoById`, the third pure function. Filters one id and returns the survivors by identity.
- **`src/client/feedback/error-slot-state.ts`**, **`error-slot.tsx`** — `{ type: "clear", kind? }` and `clearError(kind?)`. A conditional clear that does not match returns the slot itself, so a no-op dispatch re-renders nothing.
- **`src/client/components/error-banner.tsx`** — the `reported` ref is gone. The raise is guarded on `slot !== null || isFetching`, the clear names `"load"`, and `slot` and `isFetching` joined the dependency list.
- **`src/client/components/add-input.tsx`** — `AddInputHandle` (`currentText`, `restore`, `clearAndFocus`) over a `ref` prop. All three read the DOM node, so the handle is built once.
- **`src/client/todos/use-create-todo.ts`** — `useCreateTodo(field: AddField)` with `onError` (rollback, restore, raise) and a `returned` ref so `onSuccess` clears the field for a retried create and not for a plain one.
- **`src/client/components/add-todo.tsx`** — the ref, the three callbacks as one memoised object.
- **`src/client/todos/create-todo.ts`** — `CREATE_DEADLINE_MS` and the `AbortSignal.timeout` on the `POST`; `motion.test.ts`'s exemption list names it beside `READ_DEADLINE_MS`.
- **Tests** — 25 new: `merge-todo-list.test.ts` (4), `error-slot.test.ts` (5), `create-todo.test.ts` (3), `add-todo.render.test.tsx` (13, jsdom), plus `error-banner.test.ts` rewritten where it pinned the old guard's shape.

### Decisions taken during the build

**The banner's raise needed a second guard, and finding out why took a mutation check rather than a reading.** Keying the raise on an empty slot is what discharges the displaced-`load` entry: clear the add's banner and the still-failing read is reported again. But `retryCurrentError` clears the slot *before* it calls the closure, so pressing `Retry` on the load banner leaves exactly that state — and the banner the user just dismissed comes straight back. The separator is `isFetching`: a read retry has a request in flight that is about to answer, and a create retry starts no read at all. Removing the guard failed no test at first, because on a list that has never landed TanStack nulls `error` when the refetch starts (`dataUpdatedAt === 0`) and the question never arises; the case only exists over a list already in hand, and `add-todo.render.test.tsx` now drives it through a focus refetch.

**`useImperativeHandle` rather than a lifted value, and the parent holds no text at all.** The three things the mutation needs from the field are two selection operations and one read, and `AddInput`'s own state stays the single owner of the string. What this bought beyond decision 1's reasoning: `AddTodo` re-renders on nothing the user types, and the twenty-two provider-free field tests were untouched by this story.

**`flushSync` is load-bearing in one case and belt-and-braces in the other.** After a submit the field is empty, so `setSelectionRange` without a flush clamps to 0 — and the caret still lands at the end, because setting an `<input>`'s `value` moves it there. No test separates the two, which is recorded in the comment rather than left for a reader to discover. The case where only the explicit call is left is a retry failing on the *same* string: React re-renders nothing, the value setter never runs, and the user has been sitting mid-sentence since the last failure. That is pinned, and deleting `setSelectionRange` fails it.

**The clear on confirmation is guarded on the id whose text was returned.** AC2 holds the text until the add succeeds, so a retry does not clear on Enter and `onSuccess` has to. Clearing for *every* confirmation instead would eat the next Todo the user had started typing while the first was in flight — which is this epic's own rhythm, and is now a test.

**A `Retry` whose field no longer holds a valid Todo sends nothing.** `isValidTodoText` against the trimmed current text, then return. EXPERIENCE.md:115's standing rule, reached here by the user emptying the field rather than by a deleted row, which is the only form of it this epic can produce. The slot has already cleared by then, so the banner goes with it.

### Surprises

- **jsdom clamps `setSelectionRange` to the current value's length**, which is what made the `flushSync` question answerable at all: an empty field takes `(12, 12)` as `(0, 0)`. Confirmed directly rather than assumed, and it is why the caret assertions above are worth making.
- **`error-banner.test.ts` pinned the old guard by source grep** — `/if \(reported\.current !== null\)/` and a negative match forbidding `slot` in the effect deps. Both were correct descriptions of a shape this story replaces, so both were rewritten rather than deleted: the file now pins the empty-slot guard and the kind on the clear.

### Verification

`npm run lint` and `npm run typecheck` are clean. `npx vitest run` — **774 passed, 0 failed** across 38 files, the live repository tests included.

Ten mutation checks, all of which failed the suite: dropping the kind from `clearError` (4 cases), dropping the `isFetching` guard (1), dropping the rollback (2), dropping the text restore (3), clearing the field on every confirmation (1), dropping `setSelectionRange` (1), dropping the `401` escape (1), returning the arriving list wholesale (4), restoring unconditionally (1), minting a fresh id for every Enter (1), and reading the field for a retry whose text was never put there (1).

### Review fixes

Fifteen findings from one context-free review pass. Two were user decisions rather than corrections, and both changed behaviour:

**1. A failed add overwrote a Todo the user had started typing.** `restoreText` ran unconditionally, so submitting `send invoice`, typing `book flights` and then having the create fail destroyed `book flights` — the exact hazard `onSuccess`'s clear is guarded against, with no guard, no test and no note on the failure side. The text now goes back only into a field that is empty or already holds this Todo's own text; where it does not, the submitted string stays in the retry closure and `Retry` re-sends it from there. Nothing is lost either way, which is what AC2 is for; that the text is not *visible* in the input in that case is the criterion's letter yielding to its purpose.

**2. Enter on the returned text minted a new id, where `Retry` reused it.** Returning the text to the input invites Enter, and Enter is the key the user's hands are already on — so the one route the interface actually suggests was the one without the idempotency the story exists to provide. If the original create had arrived and only its response was lost, that produced two Todos. Enter now re-sends under the failed create's id while the field holds its text, which is the same operation `Retry` performs.

Also patched: a create refused with `401` had a `Retry` that could never succeed, where the read has had `identityExpired` → `window.location.reload()` since Story 2.6 — the create reaches the same refusal and now takes the same escape; AC7's third clause was asserted only as far as the banner and now presses that `Retry`, resolves a list that predates the unconfirmed create, and watches the merge keep the row; `expect(CREATE_DEADLINE_MS).toBe(READ_DEADLINE_MS)` was a tautology over an alias and now pins the real 15s on both; a test asserting the absence of an unqualified `clearError()` would have passed on a file that never cleared at all, and now asserts both halves; `returned.current` kept a dead id after an abandoned retry and its comment claimed an invariant the code did not hold; `politeAnnouncement` was a duplicate of the new `liveRegion("polite")`; `bannerMessage` hard-coded `Retry` where `RETRY_LABEL` is exported; the `REFUSED` fixture sat among the helpers rather than with the other fixtures; and a comment in `create-todo.ts` was rewrapped past the block's width.

Rejected: that no mounted test drives a create failing through the *deadline* — `create-todo.test.ts` proves a `TimeoutError` produces a kind-`create` rejection, and everything downstream of a rejection is identical whatever produced it and is driven four ways already. And that the spec frontmatter and `sprint-status.yaml` read `in-progress` for finished work: both are set by the workflow after this pass, so the reviewer saw them mid-flight — the same finding Story 3.3's review produced, and false for the same reason.

Not this story's, and reported rather than fixed: `sprint-status.yaml` still reads `review` for Story 3.3, whose own spec reads `done`.

`npm run lint` and `npm run typecheck` are clean. `npx vitest run` — **774 passed, 0 failed** across 38 files.

## Review Triage Log

One review layer ran (Blind Hunter, context-free, over the worktree). Fifteen findings, each checked against the cited file before anything was changed.

**Escalated to the human** (both behaviour changes, both taken)

- `medium` — **A failed add overwrote in-progress typing.** Confirmed by reading `onError`: `restoreText` was unconditional. The smallest fix traded AC2's letter against the epic's own promise, so it was put to the user, who chose to restore only where there is room.
- `medium` — **Enter on returned text minted a new id.** Confirmed: the submit callback always called `optimisticTodo`, which mints. The duplicate window is real on an uncertain failure, and the user chose to reuse the failed id.

**Patched**

- `medium` — **A `401` on the create gave a `Retry` that could never succeed.** Confirmed against the route handler's refusal and `createTodo`'s `status`. `onError` discarded the failure entirely; it now delegates to `identityExpired` exactly as the read does.
- `medium` — **`deferred-work.md` was not updated** though three of its entries were claimed discharged in code comments and in the spec. Appended.
- `medium` — **AC7's third clause was untested.** The test labelled AC7 stopped at the banner's re-raise and never pressed `Retry`. A case now does, and keeps an unconfirmed row through the list that comes back.
- `low` — **The deadline-parity assertion was a tautology** over `CREATE_DEADLINE_MS = READ_DEADLINE_MS`. Both now pin 15s as a number.
- `low` — **`returned.current` kept a dead id** after a retry that declined to send, against a comment claiming it holds "the id whose text is currently sitting in the field". Released on that path; the one-slot limit is now stated rather than implied.
- `low` — **A clear-by-kind test passed on a file that never cleared.** Both halves asserted now.
- `low` — **A duplicated live-region helper, a hard-coded `Retry`, a misplaced fixture, a misindented block and a rewrapped comment.** All cosmetic, all simple corrections.

**Rejected**

- `false` — "The spec frontmatter and `sprint-status.yaml` say `in-progress` for finished work." Both are set by the workflow after the review pass; the reviewer saw them mid-flight. Story 3.3's review produced the same finding.
- `low` — No mounted test drives a create failing through the deadline. Real as a gap in coverage and not worth a fifth copy of the same assertions: `create-todo.test.ts` proves a `TimeoutError` becomes a kind-`create` rejection, and every path downstream of a rejection is identical whatever produced it.
