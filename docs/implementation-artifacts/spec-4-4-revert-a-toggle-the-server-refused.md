---
title: 'Story 4.4: Revert a toggle the server refused'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'oneshot'
baseline_revision: 'b6b9555b8c94507d662d4dc55671f97f6e39d673'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `use-set-completed.ts:193-200` rolls a refused toggle's row back in the cache
and then deliberately says nothing — no banner, no `Retry`, no assertive announcement. The
comment at `:36-40` names this story as the owner of all three. So today a toggle the server
refuses is silently undone: the mint fill, the checkmark and the strikethrough reverse
themselves with no explanation, and a row that had already departed a Filter View reappears
for no stated reason.

**Approach:** Give the refusal the two seams it is missing and let the existing machinery do
the rest. `onError` raises an `update` entry into the one error slot, which is all AC2 and
AC7 need — `ERROR_COPY.update` is already `Couldn't save that change.`, and
`error-banner.tsx:148-151` already announces whatever the slot holds, assertively. The entry
carries a closure that re-attempts *the status the user asked for* (AC4), reading the row as
the cache now holds it and doing nothing when it is gone (AC6).

The departure has to survive the round trip, which is the one structural change: Story 4.3's
`noteToggle` currently lives in a wrapper in `todo-list.tsx`, so a retry driven from the
banner would set the status again without ever telling the Filter View about it — AC5's "and
departs the view again" would not happen. Move that call into the mutation's own `onMutate`,
ahead of the optimistic write, as an `onRequested` seam. One request path then serves the
checkbox and the banner alike, the retry sees the *current* view rather than the one that
was showing when the failure landed, and `todo-list.tsx` loses its wrapper.

AC1 and AC3 need no new code and are covered by tests instead: the per-row rollback
(`:193-200`) restores the status, and `onRefused` → `cancelDepartures` plus the cache write
put a departed row back in its id-sorted position.

</frozen-after-approval>

## Implementation Notes

**What was built.** Six files, and only two of them are the product.

- `src/client/todos/use-set-completed.ts` — the story. The three positional
  callbacks the options builder had grown became a `SetCompletedSeams` object
  (`announce`, `raiseError`, `clearError`, `onRequested`, `onRefused`,
  `reattempt`), `onError` now raises one `update` entry after the rollback, and
  `onSuccess` clears the banner by kind the way the create does.
- `src/client/components/todo-list.tsx` — lost its `toggle` wrapper; `noteToggle`
  goes into the mutation as `onRequested` instead.

**The one structural decision.** AC5 ("and departs the view again") is the reason
`noteToggle` moved. Story 4.3 called it from a wrapper in `todo-list.tsx`, which a
`Retry` pressed in the banner never goes through — a retried toggle would have set
the status and silently skipped the departure. Moving it to the first line of
`onMutate`, ahead of the `await`, makes one request path serve the checkbox and the
banner alike. It also removed a staleness trap for free: the seam is read off the
options on every render, so a retry consults the Filter View that is showing when it
is pressed, not the one that was showing when the failure landed.

**`mutate` closing over itself.** The options need `mutate` (a `Retry` re-sends), and
`mutate` does not exist until the call they are passed to returns. The first attempt
used a `useRef` written during render; `react-hooks/refs` rejects that, and rightly —
there is nothing to carry between renders, only a name to use later within one. The
shipped shape is `reattempt: (variables) => mutate(variables)` referring to the
`const` being declared: nothing invokes it during render, so by the time a button can
be pressed it is bound. `use-set-completed.test.ts`'s harness already wired its
observer the same way.

**Things that needed no code.** AC2 and AC7 are `ERROR_COPY.update` plus
`error-banner.tsx:148-151`, which already announces whatever the slot holds,
assertively, from one site for all four kinds. AC3 is the existing per-row rollback
plus Story 4.3's `cancelDepartures`: the row is back in the cache with its old status,
so it matches the view again and renders in id order, which nothing touched. Both are
covered by tests rather than by lines.

**One thing outside the ACs, deliberately.** `Retry` consults `identityExpired` and
reloads instead of re-sending on a `401`, which is what the read and the create both
do. `middleware.ts` never mints a Client Identity under `app/api/`, so a `401` on the
`PATCH` means re-sending yields `401` for as long as the page is open — a dead button
on the one control whose whole job is to work.

**A guard narrowed, on the record.** `use-set-completed.test.ts` banned `getQueryData`
outright in this module, on the grounds that in a mutation which never reads the cache
it could only be a snapshot being taken (AD-16). AC6's "the row has since been deleted"
needs one lookup, so the ban became a ban on the shape: exactly one call, ending in
`.find(`, which is a single row and not a list anybody could restore.

**Surprise.** `todo-list.render.test.tsx`'s hand-assembled `mount()` helper now needs a
fourth provider (`ErrorSlotProvider`). Every case added since Story 4.3 uses
`mountCard()` and the real `AppProviders`; the hand-built stack survives only for the
cases that predate it.

**Verification.** `npm run lint` clean at `--max-warnings=0`; `npm run typecheck`
clean; `npm test` 47 files / 1023 tests green, against a `b6b9555` baseline of
47 files / 1012 (measured by stashing this work). No pre-existing test changed its
verdict except the two guards this story deliberately converts: the `getQueryData`
ban above, and `todo-list.test.ts`'s wrapper assertion, which now asserts the wrapper
is *gone*.

## Review Triage Log

One layer ran (blind-hunter, context-free, on the worktree diff). Eleven findings;
nine patched, one deferred, one false.

- **medium — `useSetCompleted` kept a positional signature the seams object was
  introduced to kill.** Confirmed by compiling a probe: `(todo: Todo) => void` is
  assignable to the `(todo, completed) => void` first slot, so passing the refusal
  seam alone type-checks into `onRequested` and the refusal seam is simply never
  called. No ordering a test could pin was protecting it. *Patched* — the hook takes
  a named `SetCompletedCallbacks`, and the guard in `todo-list.test.ts` now asserts
  `onRequested: noteToggle` rather than an argument position.
- **medium — `todo-list.test.ts` pinned the argument order in a source regex.** Same
  root cause as the above; *patched with it*.
- **medium — `todo-list.tsx`'s comment above `const departing` still said a refused
  toggle "says nothing to anybody".** True at line 148 and false as of this change,
  and it duplicated the seam comment 25 lines above while sitting over code that does
  the reduced-motion release. *Patched* — rewritten to describe what it is over.
- **medium — AC6's second half ("and the banner clears") was asserted nowhere.**
  Confirmed: the node case proved only that nothing was re-sent. *Patched* — a mounted
  case drives a focus refetch that drops the row, presses `Retry`, and asserts the
  banner region is empty. Both AC6 cases fail when the guard is removed (checked).
- **medium — the AC4 case could not tell a cache read from reusing the closure.**
  Confirmed: the rollback restores exactly `ACTIVE`, so both implementations produce
  the same object. *Patched* — the cached row now drifts between the failure and the
  press, and the assertion pins the row to the cache's value and the status to the
  closure's.
- **low — a test titled "and only its own (AC5)" proved neither half.** Confirmed:
  the kind-scoping lives in `errorSlotReducer`, and AC5 is the departure criterion.
  *Patched* — retitled, re-attributed to EXPERIENCE.md:109, and the comment now says
  what the argument is for.
- **low — the module header did not gain AD-9 or Story 4.4.** Confirmed; the test
  file's header was updated and the source's was not. *Patched*.
- **low — `refusingServer`'s JSDoc named a parameter that does not exist, and an id
  miss threw from inside the stub.** Confirmed. *Patched* — doc corrected, a miss now
  fails an assertion. The suggested `new URL(...)` fix was **not** taken: the request
  is relative (`/api/todos/<id>`) and `new URL` throws on it; a query-string split
  does the same job.
- **low — a stray double blank line.** Confirmed at line 594. *Patched*.
- **medium, deferred — the hand-built `mount()` stack now duplicates
  `AppProviders`.** Real, and this story added the fourth provider to it. Converting
  the eight cases that use it needs a `mountCard(client)` seam and edits eight
  passing tests to prove nothing new. Entered in `deferred-work.md`, owner Epic 5.
- **false — "status metadata is inconsistent with the work being finished".** The
  reviewer read `status: 'in-progress'` and `sprint-status.yaml`'s `in-progress` as a
  defect. They are the workflow's own sequencing: `in-progress` is set before
  implementation and both move on at the finalize step, which runs after this review.
  Nothing to fix.
