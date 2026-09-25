---
title: 'Story 5.3: Remove before the server answers, restore if refused'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '4ea45d341ea7927b8321727685ff00aa13c2c847'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/implementation-artifacts/epic-5-context.md'
  - '{project-root}/docs/implementation-artifacts/spec-5-1-5-2-delete-at-the-server-and-three-routes-to-one-dialog.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A confirmed delete reaches the cache write and the request only through
      `transitionend`; a transition that never reports leaves it undelivered.
    evidence: |-
      `endCollapse` (src/client/components/todo-list.tsx) is reachable only from
      `todo-row.tsx`'s `onTransitionEnd`. Under `row-departing` a swallowed
      event was cosmetic; here it silently loses a confirmed destructive action.
      Not demonstrated: no reviewer produced a reachable case, and the obvious
      backstop (a `setTimeout` of COLLAPSE_MS + slack) is banned tree-wide by
      `motion.test.ts`'s no-timer scan over app/ and src/client/. What would
      settle it: a browser-level case where the row's transition is interrupted
      or replaced mid-collapse and no `transitionend` arrives.
    location: >-
      src/client/components/todo-list.tsx:270-279
    severity: medium (unverified)
  - summary: >-
      `endDeparture` unmarks the row a commit before `onMutate`'s cache write,
      so a fully collapsed row may repaint at full height for one frame.
    evidence: |-
      `endCollapse` calls `endDeparture(id)` (a setState, flushed at the end of
      the handler) and then `remove(deleted)`, whose `onMutate` awaits
      `cancelQueries` before `setQueryData`. In the common case both commits
      land before paint, because the await is a microtask; with a read actually
      in flight the cancellation can span a frame and the un-marked, still-cached
      row would paint at full height. Not demonstrated — jsdom paints nothing.
      What would settle it: a browser-level check with a list refetch in flight
      at the moment a collapse ends.
    location: >-
      src/client/components/todo-list.tsx:270-279
    severity: medium (unverified)
  - summary: >-
      A list refetch that starts after the optimistic removal resurrects the
      deleted row while the DELETE is still in flight.
    evidence: |-
      `onMutate` cancels reads already in flight, but `todo-list-query.ts` leaves
      `staleTime: 0` and `refetchOnWindowFocus` at their defaults, and
      `mergeTodoListById` protects unconfirmed creates only. A reviewer probe
      confirmed a `refetchQueries` landing mid-request puts the row back. Not
      caused by this story: the same exposure exists for the toggle, and
      `merge-todo-list.ts:86-90` records the narrow merge as deliberate, on the
      grounds that widening it would make a Todo deleted in another tab
      immortal. Epic 6 AC11-AC13 own the race verification.
    location: >-
      src/client/todos/use-delete-todo.ts (onMutate) + src/client/todos/merge-todo-list.ts
    severity: medium
  - summary: >-
      A refused toggle re-inserts a Todo whose DELETE has already succeeded.
    evidence: |-
      Toggle a row, confirm its delete, let the collapse end and the DELETE
      succeed, then let the toggle's PATCH be refused: `use-set-completed`'s
      `onError` calls `upsertTodoById` unconditionally and puts the deleted row
      back until the next refetch. Real, but the fix belongs in
      `use-set-completed.ts` — an existence check on its own rollback — which
      this story does not touch.
    location: >-
      src/client/todos/use-set-completed.ts (onError rollback)
    severity: medium
  - summary: >-
      States reachable only because the request is issued at the end of the
      collapse rather than at the confirm.
    evidence: |-
      The intent-alignment audit enumerated three: a cancel path that drops the
      departure (fixed this pass), a refetch merging the row away (deferred
      above), and unmount or navigation inside the 180ms window, which is
      guarded nowhere and was not demonstrated. Recorded together because they
      share one cause — the 180ms gap between confirming and sending.
    location: >-
      src/client/components/todo-list.tsx (onConfirm -> endCollapse)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 5.2 built the delete control and the confirmation dialog, and stopped at a seam: `todo-list.tsx:325-328`'s `onConfirm` closes the dialog and places focus, and changes no Todo. `delete-dialog.tsx:46-48`, `focus-after-delete.ts:8-12` and `todo-list.tsx:319-320` all name this story as the consumer. `DELETE /api/todos/:id` has shipped and no client calls it. Choosing `Delete` today does nothing.

**Approach:** Wire that seam to the endpoint as an optimistic mutation in the shape `useSetCompleted` already established: the row leaves the cache before the request resolves, and a refusal re-inserts exactly that one row at its `id DESC` position with the shared save-failure banner and a `Retry` that does not ask for confirmation again. The confirmed row fades and collapses on its way out over the departure's collapse **with no hold**, which is the one piece of genuinely new CSS.

## Boundaries & Constraints

**Always:**
- The rollback value rides in the **mutation variables**, never in React state. `use-todos.test.ts:103-130` fails any `useState`/`useReducer` whose type or value names a Todo, tree-wide (AD-8), and `todo-list.test.ts:265-279` pins that file's `useState` census to exactly `["<string | null>"]`.
- One query key. The mutation key must not begin with `"todos"` (`pending-creates.ts:26-35`), and `TODOS_QUERY_KEY` is declared only in `query-keys.ts`.
- Rollback is per-entity: `upsertTodoById(cached, todo)`. No whole-list snapshot — `onMutate` returns no context, and the source contains at most one `getQueryData`, matching the toggle's `?.find(` idiom.
- Every `className` stays a single static string literal; variation is carried by `data-*` attributes and derived in CSS (AR-28). `dynamicClassNames()` must keep returning only `app/layout.tsx:{poppins.variable}`.
- Durations come from `src/client/motion/motion.ts`. `COLLAPSE_MS` (180) is reused verbatim; `DEPARTURE_HOLD_MS` (400) is simply not applied. **No constant is added** — `motion.test.ts:240-251` pins the product's `*_MS` set.
- `(prefers-reduced-motion: reduce)` is read in exactly one place, `useReducedMotion()`. The stylesheet contains no `@media (prefers-reduced-motion)`; stillness is suppressed off `[data-still="true"]`.
- `fetch` is called only from `src/client/todos/` (AD-1, eslint).
- Copy is reused, never re-written: `ERROR_COPY.delete` is already `Couldn't save that change.` and `RETRY_LABEL` is already `Retry`. The word *Done* is banned.

**Never:**
- Never announce the failure from the hook — `error-banner.tsx:150` already announces the slot assertively for all four kinds. A second call speaks the sentence twice.
- Never call `clearError()` unconditionally; clear by kind (`clearError("delete")`).
- Never register the deleted id in `unconfirmedCreateIds` (`pending-creates.ts:10-12`) and never widen `mergeTodoListById` (`merge-todo-list.ts:86-90`) — either makes a deleted Todo immortal across a refetch.
- Never add a second `useState` or a new JSX element to `todo-list.tsx`; `todo-list.test.ts:290-297` pins its element list to `["ul","TodoRow","SkeletonRow","EmptyState","DeleteDialog"]`.
- Never parse a body from the `204`, and never surface a server message (AD-10).
- Never re-open the dialog from `Retry`; only `setPendingDeleteId` opens it.
- Never add a Tailwind motion utility — `delete-dialog.test.ts:346-353` asserts `duration-|delay-|animate-|transition` appear nowhere in the markup. The collapse is an `@utility` recipe.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Confirmed delete, motion allowed | `Delete` pressed on a row | Dialog closes, focus placed, row collapses over `COLLAPSE_MS` with **no delay**, then leaves the cache and the request is sent | n/a |
| Confirmed delete, reduced motion | Same, `useReducedMotion()` true | Cuts to the end state: the row leaves the cache and the request is sent at once, no departure recorded | n/a |
| Server answers `204` | Request resolves ok | `announce` with `${text}, deleted` and `"polite"`, `clearError("delete")`. Nothing is re-written to the cache — there is no body | n/a |
| Server refuses | `400`/`500`/transport/timeout | `upsertTodoById(cached, todo)` restores the one row at its `id DESC` position; `raiseError({kind:"delete", retry})` | Banner reads `Couldn't save that change.` with `Retry`, announced assertively by `error-banner.tsx` |
| Identity expired | `401` | Retry closure reloads the page, as the toggle's does | `window.location.reload()` |
| `Retry` pressed | Banner holds a delete entry | Slot empties, the same Todo is deleted again optimistically, **no dialog** | n/a |
| `Retry` on a vanished row | Cache no longer holds the id | Does nothing; banner is already cleared by `retryCurrentError` | n/a |
| Delete retried after it in fact succeeded | Second `DELETE` for a gone row | `204` again — the route is unconditionally idempotent | No error expected |

</intent-contract>

## Code Map

**The seam (read these first)**
- `src/client/components/todo-list.tsx:318-329` — `onConfirm` is the insertion point, verbatim: `setPendingDeleteId(null); placeFocusAfterDelete(confirmed.id);`. `confirmed` is the full `Todo` (`delete-dialog.tsx:73`), which is the rollback value. `:319-320` says "Story 5.3 is what makes it also remove the Todo."
- `todo-list.tsx:155` — `pendingDeleteId`, the file's **only** `useState`. `:161-163` `visible` derived per render. `:169-170` `pendingDelete` derived. `:216-234` `placeFocusAfterDelete`, already wired, already excludes departing rows (`:221`) — **5.3 must not touch focus**, only preserve the ordering: place focus from the same synchronous handler, against the pre-removal list.
- `todo-list.tsx:141,243-254` — `still = useReducedMotion()`, `data-still`, and the release effect for a preference flipped mid-departure.
- `src/client/todos/focus-after-delete.ts:61-70` — done. Uses `rowCheckboxId()` (`todo-row.tsx:180-182`) and `ADD_INPUT_ID`.

**The mutation (copy this shape)**
- `src/client/todos/use-set-completed.ts` — the template. `:197-214` exported `setCompletedMutationOptions(client, seams)` with `retry:false`, `networkMode:"always"`; `:216-250` the `listHasLanded(client)`-gated `cancelQueries` and its reason; `:267-276` `onSuccess` → announce + `clearError(kind)`; `:294-338` `onError` → restore, then `raiseError` with the retry closure (`identityExpired → reload`; cache lookup; `if (current === undefined) return;`); `:354-388` the thin hook returning **only a setter**, with `reattempt: (v) => mutate(v)` closed over later binding (`:362-381`).
- `src/client/todos/merge-todo-list.ts:42-48` `upsertTodoById` — replaces in place or appends and sorts `byIdDescending`; **already the AC8 "re-insert at its `id DESC` position" helper**. `:66-71` `removeTodoById` — already the AC1 write, currently unused by any mutation. **No new pure helper is needed.**
- `src/client/todos/set-completed.ts:84-122` — the HTTP idiom to mirror: one `try`, `!response.ok → throw new TodoRequestError(kind, {status})`, catch re-throws a `TodoRequestError` untouched and wraps anything else. `TODOS_ENDPOINT` and `READ_DEADLINE_MS` (15_000) from `todo-list-query.ts:53`; `identityExpired` at `:273-275`.
- `src/client/feedback/error-slot.tsx:32-59,95-106` — `{ raiseError, clearError(kind?), retryCurrentError }`; retry **empties the slot before invoking**, so a retry that does nothing still takes the banner down. `error-copy.ts:37-42` — `delete: "Couldn't save that change."` already present.
- `src/client/feedback/announcer.tsx:29,40` — `announce(message, urgency)`. House convention is `` `${text}, <verb>` `` (`use-create-todo.ts:57-59`, `use-set-completed.ts:104-106`).

**The collapse (the one new piece)**
- `app/globals.css:640-703` `@utility row-departing` — the six transitioned properties (`opacity`, `height`, `min-height`, `padding-block`, `margin-bottom`, `margin-top`), each written `180ms ease-out 400ms`; `interpolate-size: allow-keywords` at `:648` declared on every row, not in the collapsing rule; negative-margin gap close at `:682-688`; stillness override at `:702`. **The 400ms hold is baked in, so a delete cannot reuse this selector** — `motion.test.ts:364-389` pins those literals against `motion.ts`.
- `app/globals.css:799-820` `@utility row-sliding` — the precedent: `transition: transform 180ms ease-out`, no delay, with the comment "It is the departure's collapse reused rather than a duration of its own", plus its own `[data-still="true"]` suppression.
- `src/client/components/todo-row.tsx:184-199` props; `:233` `data-departing={departing ? true : undefined}`; `:243` `data-revealed={revealed && !departing ? true : undefined}` (un-latch by derivation); `:296-300` `onTransitionEnd` guarded on `event.target === event.currentTarget && event.propertyName === "opacity"` → `onDeparted(todo.id)`; `:301` the class list.
- `src/client/todos/filter-view-context.tsx:76,135` — `type Departure = { id: string; announcement: string }` and the `departures` state (deliberately never a `Todo`, `:66-75`); `:78-110` the API; `:150-183` `noteToggle`, which is Filter-View-shaped and **is not a delete entry point**; `:169-176` the reduced-motion branch that skips the departure set entirely, because with `transition: none` no `transitionend` ever fires.

**Test walls that will bite (do not rediscover)**
- `todo-list.test.ts:261-263` no `fetch`/`useQuery` in the list; `:301-329` pins `useSetCompleted(` to one occurrence and regex-matches its wiring — **add the matching assertions for the delete hook**; `:328` the list never reads `.completed`; `:368-380` story-reference assertions — rewrite the `Story 5.3` forward references rather than leaving them.
- `todo-card.test.ts:186-193` — the stylesheet `overflow` allow-list is asserted as **exactly** `['&[data-departing="true"]', '&[data-revealed="true"]']`; the new recipe's selector must be added. `:120-128` no computed `className`. `delete-dialog.test.ts:385-402` a new `@utility` must not start with `text-`.
- `todo-list.render.test.tsx:1643,1664,1677,1703` press `Delete` and then assert on rows/focus under a seam that removed nothing. **Re-read all four under real removal** and update expectations; `:553` and `:1319` are the existing rollback-and-banner tests to copy.
- `providers.test.ts:80-140` — no second query key, no composite `["todos", id]`.

**Read-only evidence (do not re-investigate):**
- `EXPERIENCE.md:161` — "fades and collapses its height over ~180ms while the rows below slide up to close the gap. The same collapse runs on a confirmed delete, without the 400ms hold." `:142`, `:292` say the row is removed "immediately" and the rows below close the gap with that motion. The deleted row therefore **renders through its own collapse**; it does not vanish on the click.
- `EXPERIENCE.md:122` — on `Retry` "the row is removed again optimistically. The dialog does **not** re-open." `:211` — on delete, "the Todo text, then `deleted`". `:108` — counts "update the instant an optimistic add, toggle or delete changes the list".
- `app/api/todos/[id]/route.ts:195-257` — `DELETE` answers `400` on a malformed id, `401` with no identity, `204` unconditionally otherwise, `500` on driver failure. `new Response(null, {status: 204})` at `:215` — **there is no body to parse**.
- `filter-tabs.tsx:48-58` + `filter-view.ts:82-92` — counts are `countsByFilterView(data)`, derived per render from the same cache. **AC7 is satisfied by construction**; assert it, do not build it.

## Tasks & Acceptance

**Execution:**

- `src/client/todos/delete-todo.ts` — **new**. `deleteTodo({ todo }: DeleteTodoVariables): Promise<void>` sending `DELETE ${TODOS_ENDPOINT}/${encodeURIComponent(todo.id)}` with `accept: "application/json"`, no body, `AbortSignal.timeout(DELETE_DEADLINE_MS)` where `DELETE_DEADLINE_MS = READ_DEADLINE_MS`. `!response.ok → throw new TodoRequestError("delete", { status: response.status })`; on ok return `undefined` **without reading the body**; catch re-throws a `TodoRequestError` untouched and wraps anything else. Mirror `set-completed.ts` so the two read as one family.
- `src/client/todos/use-delete-todo.ts` — **new**, modelled on `use-set-completed.ts`. Export `deleteTodoMutationOptions(client, seams)` so the options are exercisable under `environment: "node"` with a bare `MutationObserver`, and `useDeleteTodo(): (todo: Todo) => void`. `mutationKey: ["delete-todo"]`, `retry: false`, `networkMode: "always"`. `onMutate`: gated `cancelQueries` when `listHasLanded(client)` — a delete acts on a row the server already knows, so unlike create it may cancel — then `setQueryData(TODOS_QUERY_KEY, (cached) => removeTodoById(cached, todo.id))`; return nothing. `onSuccess`: `announce(deletedAnnouncement(todo.text), "polite")` and `clearError("delete")`. `onError`: `setQueryData(... upsertTodoById(cached, todo))` then `raiseError({ kind: "delete", retry })`, the closure reloading on `identityExpired` and otherwise looking the row up in the cache — where the rollback above has just put it back — and returning without re-sending when it is not there (AC12). Export `deletedAnnouncement(text)` = `` `${text}, deleted` ``, matching its two siblings.
- `src/client/todos/filter-view-context.tsx` — add a delete-flavoured departure: `noteDelete(id: string)` and `isDeleting(id: string): boolean`, recording a `Departure` with **no announcement** so `endDeparture` speaks nothing for it (the delete's announcement belongs to `onSuccess`, where the server has actually agreed). Under `still`, record nothing and return `false`, exactly as `noteToggle` does at `:169-176` and for the same reason. Keep `Departure` free of any `Todo`.
- `src/client/components/todo-row.tsx` — add a `deleting: boolean` prop → `data-deleting={deleting ? true : undefined}` on the `<li>` and `row-deleting` in the static class list; extend the reveal derivation at `:243` so a deleting row un-latches its swipe lane as a departing one does. The existing `onTransitionEnd` guard already fires `onDeparted` for this recipe, since `opacity` is among its properties. No other change.
- `src/client/components/todo-list.tsx` — call `useDeleteTodo()` once; in `onConfirm`, after `setPendingDeleteId(null)` and `placeFocusAfterDelete(confirmed.id)` (order preserved — focus is placed against the pre-removal list), either `remove(confirmed)` when `still`, or `noteDelete(confirmed.id)`; pass `deleting={isDeleting(todo.id)}` to each row; and in the `onDeparted` handler, when the ending departure is a delete, look the row up in `data` **before** calling `endDeparture` and hand it to `remove`. **No new `useState` and no new JSX element.** Rewrite the two forward-referencing comments at `:202-206` and `:319-320`.
- `app/globals.css` — add `@utility row-deleting`: the same six properties at `COLLAPSE_MS` with **no delay**, the same end-state values, `overflow: hidden`, the same `:not(:last-child)`/`:last-child` negative-margin gap close, and a `[data-still="true"]` override to `transition: none`. Reuse the `interpolate-size` already declared on every row. Do not touch `row-departing`.
- `src/client/components/todo-card.test.ts` — extend the `overflow` allow-list to name `&[data-deleting="true"]` alongside the two existing selectors, with the Story 4.3 descendant-not-ancestor argument restated for this recipe. Change nothing else.
- `src/client/motion/motion.test.ts` — pin `row-deleting`'s literals against `COLLAPSE_MS` **and assert the absence of any delay**, so a later edit cannot silently reintroduce the hold on the delete path.
- `src/client/todos/delete-todo.test.ts`, `src/client/todos/use-delete-todo.test.ts` — the I/O matrix's client half: method and URL, no body read on `204`, each failure status mapped to `TodoRequestError("delete")`, the gated cancel, the per-entity removal and re-insertion, `context` being `undefined`, at most one `getQueryData` in the source, the retry closure's three branches, and `clearError` being called with `"delete"` and never bare.
- `src/client/components/todo-list.test.ts`, `src/client/components/todo-list.render.test.tsx` — the wiring assertions mirroring the `useSetCompleted` ones, and the mounted behaviour: removal, restoration in position, the banner, `Retry` without a dialog, counts, and the reduced-motion cut. Update the four existing `Delete`-pressing focus cases to expect a row that actually leaves.

**Acceptance Criteria:**
- Given a confirmed delete under allowed motion, when the row leaves, then it carries `data-deleting`, its collapse runs for `COLLAPSE_MS` with **no `transition-delay` on any of the six properties**, the rows below close the gap, and the row is removed from the cache only once that transition has ended. *(AC1, AC2)*
- Given `prefers-reduced-motion: reduce`, when a delete is confirmed, then no departure is recorded, the row leaves the cache and the request is sent in the same tick, and nothing waits on a `transitionend` that will never fire. *(AC3)*
- Given the delete mutation, when `onMutate` runs and the list has landed, then in-flight reads are cancelled; and when the list has **not** landed, then they are not — the skeletons must still be able to resolve. *(AC4)*
- Given a delete the server accepts, when it resolves, then `announce` is called exactly once with `` `${text}, deleted` `` and `"polite"`, and `clearError` is called with `"delete"` and never bare. *(AC5)*
- Given the filter tabs, when a delete removes a row, then all three counts and the rows on screen change in the same commit, with no count held in state. *(AC7)*
- Given a refused delete, when rollback runs, then exactly one `setQueryData` re-inserts that one row at its `id DESC` position, `onMutate` returned no context, no whole-list snapshot was taken, and a second Todo toggled while the delete was in flight keeps its new value. *(AC8, AC9)*
- Given a refused delete, when the banner renders, then it reads `Couldn't save that change.` with `Retry`, and the hook itself called `announce` **not at all** — the assertive announcement is `error-banner.tsx`'s. *(AC10, AC13)*
- Given the delete-failure banner, when `Retry` is activated, then the same Todo is deleted again and removed from the cache again, `setPendingDeleteId` is not called and no dialog is rendered open. *(AC11)*
- Given a `401`, when `Retry` is activated, then the page reloads and no request is re-sent.
- Given a retry closure whose Todo is no longer in the cache, when `Retry` is activated, then nothing is re-sent and the banner is empty. *(AC12)*
- Given the whole source tree, when it is scanned, then no `useState`/`useReducer` names a Todo, `todo-list.tsx` still holds exactly one `useState` typed `<string | null>`, its JSX element list is unchanged, `motion.ts` gained no constant, and `dynamicClassNames()` still returns only the font variable.
- Given every test this story adds, when it cites an acceptance criterion, then the number is `epics.md`'s for Story 5.3, not this spec's re-derived ordering.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 27 findings — high 0, medium 9, low 15, false 1, maybe-false 2
- findings:
  - `[medium]` `[patch]` `cancelDepartures` and `noteToggle`'s toggled-back branch drop a `kind: "delete"` departure, silently losing a confirmed delete — verified at `filter-view-context.tsx:206-210,254-261`: only `select()` carried the exemption. **Fixed** — both filters now match on id *and* `kind === "toggle"`, with two cases added to `filter-view-context.test.tsx`; reverting either filter fails its case.
  - `[low]` `[patch]` `use-delete-todo.ts`'s module header claims the retry closure does not re-read the cache, which the code contradicts — verified at `:35-40` against `:254-258`. **Fixed** — the bullet now describes the existence check and why it is not the toggle's freshness lookup.
  - `[maybe-false]` `[defer]` `transitionend` is the only route to the cache write and the request, with no backstop — real dependency, but no reachable case was produced and the named fix (a timer) is banned by `motion.test.ts`. Deferred with what would settle it.
  - `[low]` `[reject]` A row collapsing for deletion stays interactive (checkbox and delete control live) — real, but with the kind-blind cancel fixed the toggle case is benign and a second confirm converges on one idempotent removal; disabling them adds props and guards for a state no reviewer showed to hurt.
  - `[low]` `[patch]` The mounted AC12 case never reaches the `current === undefined` branch — verified: its assertions held with the check deleted. **Fixed** — the row is now genuinely dropped from the cache before the asserted `Retry`, and `transport.sent` is asserted unchanged; deleting the check now fails it.
  - `[low]` `[patch]` Stale Story 5.2 framing and a forward reference to 5.3 in the render tests — verified at `todo-list.render.test.tsx:1601-1602`. **Fixed** — describe retitled to cover both stories, comment rewritten to the present tense.
  - `[low]` `[reject]` The spec's AC list omits epics.md AC6 — real, but the fix is to edit this build's spec. The code satisfies AC6 and a `keeps it gone across a reload (AC6)` case exists.
  - `[low]` `[reject]` The spec's "No constant is added" reads tree-wide but means motion constants; frontmatter stale — fix is to edit this build's spec; the frontmatter is the workflow's own sequencing.
  - `[low]` `[patch]` `rowFor`/`endCollapse` duplicated verbatim across two describes, so the `propertyName === "opacity"` contract must be mirrored twice. **Fixed** — lifted to module scope, duplicates deleted.
  - `[low]` `[patch]` `todo-list.tsx` quotes EXPERIENCE.md:161 as "without the departure's hold"; the source reads "400ms". **Fixed** — quoted with the literal bracket-elided, since `motion.test.ts:262` bans a millisecond literal outside the motion module, and the elision is stated.
  - `[medium]` `[patch]` `filter-view-context.test.tsx` covers the `select()` clear-site only — same root cause as the first row; the two uncovered sites were the broken ones. **Fixed** with that row.
  - `[low]` `[patch]` No case drives two deletes collapsing at once, though `endDeparture`'s updater form exists for that interleaving. **Fixed** — a case now confirms two deletes and ends the second-confirmed row's collapse first.
  - `[medium]` `[patch]` `noteToggle` drops a delete departure for a row toggled inside its own collapse — same root cause as the first row. **Fixed** with it.
  - `[medium]` `[patch]` `cancelDepartures` ignores `kind` — same root cause as the first row. **Fixed** with it.
  - `[maybe-false]` `[defer]` `endDeparture` unmarks the row before `onMutate`'s cache write, so a collapsed row may repaint at full height — both commits normally land before paint because the await is a microtask; only a read actually in flight could stretch it across a frame, and jsdom paints nothing. Deferred with what would settle it.
  - `[low]` `[reject]` `isDeleting` true but `data` no longer holds the row at collapse end — the only route there is a merge that dropped the row, which means the server no longer has it; the silent no-op is correct, and guarding it adds a branch for a benign state.
  - `[medium]` `[defer]` A refetch started after the optimistic removal resurrects the row — reviewer-demonstrated, but the same exposure exists for add and toggle and `merge-todo-list.ts:86-90` records the narrow merge as deliberate. Epic 6 owns the race.
  - `[medium]` `[defer]` A refused toggle re-inserts a Todo whose DELETE already succeeded — real; the fix belongs in `use-set-completed.ts`'s rollback, which this story does not touch.
  - `[low]` `[reject]` The spec's Design Note claims there is no "cancel the departure" case to keep correct — the claim was false and is what misled the implementation, but the fix is to edit this build's spec; the code half is the first row.
  - `[medium]` `[patch]` (verification-gap, pre-verified) `cancelDepartures` never adopted the `kind` rule; probe showed a refused toggle leaves the row rendered, `data-deleting` null, and only the PATCH ever sent. **Fixed** with the first row.
  - `[medium]` `[defer]` A refetch after `onMutate` resurrects the deleted row — duplicate of the deferred race above.
  - `[low]` `[patch]` The module header contradicts its own code — duplicate; **fixed** with the header row.
  - `[low]` `[patch]` The mounted AC12 case does not exercise AC12 — duplicate; **fixed** with that row.
  - `[low]` `[patch]` The focus-before-removal ordering is pinned only by a source regex and the comments overclaim it as behaviourally load-bearing — verified: moving the call fails only that regex. **Fixed** — both comments softened to what is true.
  - `[false]` `[reject]` The diff implements the "row collapses, then the cache write" reading where "remove at confirm" was also defensible — the intent does select this reading: EXPERIENCE.md:161 reads "The same collapse runs on a confirmed delete, without the 400ms hold", and `motion.ts:53-55` already quotes that line verbatim as this behaviour's contract. Under the other reading "the same collapse minus the hold" has no referent, since the gap close in this codebase is produced by the departing row's own height collapse.
  - `[low]` `[reject]` AC7's "instantly" becomes "at the end of the collapse" — the counts change in the same commit the row leaves, so they match what is on screen; updating them while the row is still visible would be the worse behaviour and would diverge from the toggle departure.
  - `[low]` `[reject]` Many new assertions sit at the source-text and compiled-CSS surface while AC2's "rows below close the gap" is exercised nowhere — accurate, but it is this repo's established convention (the walls), and jsdom runs no transitions; the behavioural form of AC2 belongs to Epic 6's Playwright suite.
  - `[medium]` `[defer]` States reachable only because the request is issued at the end of the collapse — its cancel-path member is fixed above; the refetch and unmount-during-collapse members are deferred.

## Design Notes

**Why the cache write waits for the collapse.** `EXPERIENCE.md:161` commits the deleted row to the same fade-and-height-collapse a departing Todo uses, minus the hold. A row removed from the cache in `onMutate` unmounts on the click and can animate nothing — the cache is the only thing `visible` is derived from (`todo-list.tsx:161-163`), and the alternative, parking the departing `Todo` outside the cache so it can keep rendering, is precisely what AD-8 and `use-todos.test.ts:103-130` forbid. So the order is: collapse, then remove, then send. AC1 asks that the removal precede the *server's answer*, not the next frame, and it does — the request is issued at the end of a 180ms collapse and resolves later still. This also collapses the failure path to one branch: by the time a refusal can arrive the row is genuinely out of the cache, so `upsertTodoById` is the only restore, and there is no "cancel the departure" case to keep correct.

**Why the departing row is re-derived rather than held.** The confirm handler has the `Todo`; the `onDeparted` handler 180ms later has only an id. It looks the row up in `data`, where it still is, because nothing has removed it yet. That is what lets this story add no state at all to `todo-list.tsx` — which `todo-list.test.ts:265-279` requires, having pinned the census to one entry during 5.2.

**Why `Retry` does not re-collapse.** The retry closure lives in the error slot, not in the list, so it removes the row from the cache directly and the row vanishes without motion. `EXPERIENCE.md:122` asks only that it "be removed again optimistically"; a second 180ms collapse would also mean a second `transitionend` the closure has no way to await. Deliberate, and worth a sentence in the code.

**Why the retry closure keeps the toggle's cache lookup.** `use-set-completed.ts:302-337` re-reads the row for two reasons, and only one of them carries over. It re-sends the *current* value rather than a stale one — a delete has no value to go stale, so that half is moot. But it also uses the lookup as an existence check, and that half is exactly AC12: the rollback in `onError` has just put the row back, so the ordinary retry finds it, and a miss means something else removed it in between and there is no longer an operation to re-attempt. Dropping the check does not merely re-send a harmless idempotent `DELETE` — it re-attempts with an `undefined` Todo, which throws inside `onMutate` and raises a second banner for a failure the user did not cause.

**Why a second recipe rather than a parameterised one.** `row-departing` writes `180ms ease-out 400ms` inline on all six properties and `motion.test.ts:364-389` asserts those exact literals against the two constants. Factoring the delay out to a custom property would change the compiled text those assertions read. `row-sliding` already set the precedent for a sibling recipe reusing `COLLAPSE_MS` with no delay of its own.

## Verification

**Commands:**
- `npm run lint` — expected: clean at `--max-warnings=0`.
- `npm run typecheck` — expected: no errors.
- `npm test` — expected: all suites pass, including `use-todos.test.ts`'s tree-wide Todo-in-state scan, `todo-list.test.ts`'s `useState`/element censuses, `todo-card.test.ts`'s `overflow` allow-list and `motion.test.ts`'s stylesheet/constant agreement.
- `npx vitest run src/client/todos` — expected: the new delete request and mutation suites pass.

**Manual checks:**
- Grep the diff for `#` hex literals and `[` arbitrary-value classes outside `app/globals.css` — expected: none.
- Confirm `src/client/motion/motion.ts` gained no constant and `src/client/feedback/error-copy.ts` is untouched.
- Confirm no `Story 5.3` forward reference survives in `todo-list.tsx`, `delete-dialog.tsx` or `focus-after-delete.ts` as a promise of future work.

## Auto Run Result

Status: done

**What was implemented.** The delete seam Story 5.2 stopped at is wired to `DELETE /api/todos/:id` as an optimistic mutation. Confirming closes the dialog, places focus against the pre-removal list, and marks the row `data-deleting`; it fades and collapses over `COLLAPSE_MS` with no hold, and only at the end of that collapse does the Todo leave the cache and the request go out. A refusal re-inserts exactly that row at its `id DESC` position and raises a `delete` entry into the error slot, whose `Retry` re-attempts the same removal without re-opening the dialog and does nothing when the row has since vanished. Under `prefers-reduced-motion` the whole thing cuts to the end state in the confirming tick.

**Files changed.**
- `src/client/todos/delete-todo.ts` — new: the `DELETE` request, mirroring `set-completed.ts`; reads no body from the `204`.
- `src/client/todos/use-delete-todo.ts` — new: the mutation, its options exported for DOM-free exercise; gated `cancelQueries`, per-entity removal and rollback, announcement, banner and retry closure.
- `src/client/todos/filter-view-context.tsx` — `noteDelete`/`isDeleting`, `Departure` as a discriminated union, and the `kind: "delete"` exemption in all three writers of the departure set.
- `src/client/components/todo-list.tsx` — the confirm handler, `endCollapse`, and delivery of a delete released by a mid-collapse motion-preference change.
- `src/client/components/todo-row.tsx` — the `deleting` prop, `data-deleting`, and un-latching the swipe lane for a deleting row.
- `app/globals.css` — `@utility row-deleting`: the departure's six properties at `COLLAPSE_MS` with no delay.
- `src/client/components/delete-dialog.tsx`, `src/client/todos/focus-after-delete.ts` — forward references to this story rewritten.
- Tests: new `delete-todo.test.ts` and `use-delete-todo.test.ts`; Story 5.3 blocks in `todo-list.render.test.tsx` and `filter-view-context.test.tsx`; `motion.test.ts` pins the new recipe's literals and the absence of any delay; `todo-card.test.ts`'s `overflow` allow-list extended; `todo-list.test.ts` wiring assertions; `todo-row.test.ts` / `todo-row.render.test.tsx` updated for the new prop.

**Review findings.** 27 findings across four layers — high 0, medium 9, low 15, false 1, maybe-false 2. Eight entries patched (1 medium, 7 low); five deferred (see frontmatter); the rest rejected.

Patched: the kind-blind departure cancels (medium — `cancelDepartures` and `noteToggle` both dropped a confirmed delete, losing it silently); the contradicted module header; the mounted AC12 case that never reached the branch it named; stale Story 5.2 framing in the render tests; duplicated test helpers; a misquotation of EXPERIENCE.md:161; a missing concurrent-deletes case; and two comments that overclaimed the focus-before-removal ordering as behaviourally load-bearing.

Rejected, with reasons: a deleting row staying interactive (benign once the cancel paths were fixed; disabling adds surface for a state nobody showed to hurt); the spec omitting AC6 from its own list, the spec's over-broad "no constant is added" rule, and the spec's false "no cancel the departure case" Design Note (all three fixes are edits to this build's spec — the code satisfies AC6 and the Design Note's code half was patched); a silent no-op when `data` has already lost the row (only reachable when the server no longer has it either); AC7's "instantly" landing at the end of the collapse (the counts match what is on screen, which is the better behaviour); the source-text-heavy assertions and AC2's gap-close going unexercised (this repo's established convention, and jsdom runs no transitions — Epic 6 owns the behavioural form); and the claim that the "remove at confirm" reading should have been taken (EXPERIENCE.md:161, already quoted verbatim in `motion.ts:53-55`, selects this one).

**Follow-up review recommended: false.** First pass; one medium entry patched and seven low. The threshold is a patched high or two or more patched mediums, and neither was met.

**Verification.** `npm run lint` clean at `--max-warnings=0`; `npm run typecheck` no errors; `npm test` 1203 passed across 52 files; `npx vitest run src/client/todos` 182 passed across 12 files. Manual checks: no hex literal or arbitrary-value class outside `app/globals.css`; `motion.ts` gained no constant and `error-copy.ts` is untouched; no Story 5.3 forward reference survives as a promise of future work. Every row of the I/O matrix is covered by a named test that ran and passed. The existence check in the retry closure and both new departure filters were mutation-checked — each fails its own case when removed.

**Residual risks.** The five deferred items, of which two matter most: a confirmed delete reaches the server only through `transitionend`, so a transition that never reports would lose it silently, and the obvious backstop is banned by the tree-wide no-timer scan; and a list refetch starting after the optimistic removal can resurrect the row before the `DELETE` lands, which is the same exposure add and toggle already carry and which Epic 6's race coverage owns. Neither was demonstrated as reachable in this pass.
