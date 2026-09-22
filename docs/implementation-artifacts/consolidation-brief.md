# Epic consolidation brief — input for `bmad-correct-course`

Written 2026-09-22. Hand this to `bmad-correct-course` in a fresh context window,
or point the skill at this path.

## The ask

The epic list is exhaustive and slow to get through. Consolidate the remaining
stories so the build reaches the finish line faster, without dropping acceptance
criteria.

**Chosen depth: moderate — 30 remaining stories → 14.** Two alternatives were
considered and declined:

- *Aggressive (30 → 11)* — also merges all four server-endpoint stories (3.1,
  3.2, 4.1, 5.1) into one. Declined because it makes Epics 4 and 5 sequential,
  and Story 2.5 exists specifically to make them parallel.
- *Epic 6 only (30 → 25)* — declined as too small a gain.

## Where the build actually is

Epic 1: `done` (8 stories). Epic 2: `in-progress` — 2.1 through 2.4 are `done`
as of 2026-09-22, 2.5 through 2.9 are `backlog`. Epics 3–6: `backlog`.

Stories 2.1–2.4 were closed out by a four-layer code review on 2026-09-22
(14 patches applied, 3 decisions resolved, 9 deferred, 6 rejected). Gate at
close: lint clean, typecheck clean, 435 tests passing.

**One open caveat:** 8 tests fail with `password authentication failed for user
'neondb_owner'`. Stale credentials in `.env`, not code. They are the live-branch
repository tests, so Story 2.1's four repository ACs are currently asserted
rather than demonstrated. Refresh `DATABASE_URL` and re-run before treating them
as proven.

## The consolidation

### Epic 2 — 5 remaining → 2

| Merge | Stories | Rationale |
|---|---|---|
| **Motion module + skeleton rows** | 2.5 + 2.6 | 2.5 is 4 ACs of constants and the skeleton pulse is its only consumer. Keep 2.5's AC4 intact — the whole point of the module is that Epics 4 and 5 import the same collapse constant (AR-27). |
| **The three list-region outcomes** | 2.7 + 2.8 + 2.9 | Already interlocked: 2.8's AC6 and AC7 cross-reference 2.7's load-failure state, and 2.9 is two `announce()` calls on states built in both. 19 ACs, one coherent story. |

### Epic 3 — 5 → 3

| Merge | Stories | Rationale |
|---|---|---|
| **Accept and validate a new Todo at the server** | 3.1 + 3.2 | Same POST handler, same test harness. 3.2's ACs are the validation rules of the endpoint 3.1 creates. |
| *(unchanged)* | 3.3, 3.4, 3.5 | 3.4 is named in the epic list as the hardest story in the build — the create must not cancel the in-flight list query, and the arriving list merges by id. Do not bulk it up. |

### Epic 4 — 6 → 3

| Merge | Stories | Rationale |
|---|---|---|
| **The checkbox and what it does before the server answers** | 4.2 + 4.3 | The control and its optimistic effect are one behaviour. |
| **Filter views, with departures that read as caused** | 4.4 + 4.5 | The departure collapse only exists because filters do. 16 ACs. |
| *(unchanged)* | 4.1, 4.6 | 4.1 is the server endpoint; 4.6 is the refusal path. |

Note: this leaves 4 entries, not 3 — 4.1, the 4.2+4.3 merge, the 4.4+4.5 merge,
and 4.6. Treat 4.1 as a candidate to fold into 4.2+4.3 if the totals need to hit
14 exactly.

### Epic 5 — 6 → 3, with one cut

| Merge | Stories | Rationale |
|---|---|---|
| **Reach delete three ways, confirm once** | 5.2 + 5.3 | All three entry points open the same dialog. |
| **Remove before the server answers, restore if refused** | 5.4 + 5.5 | Same optimistic/revert pattern as 4.2/4.6. |
| *(unchanged)* | 5.1 | Server endpoint. |
| **CUT or defer** | 5.6 | The first-run swipe nudge. A one-time affordance, pure polish, and the only AC set dropped by this consolidation. |

### Epic 6 — 8 → 3

| Merge | Stories | Rationale |
|---|---|---|
| **One verification story** | 6.2 + 6.3 + 6.4 | Journeys end to end, forced failures, race unit tests. |
| **One audit pass** | 6.1 + 6.5 + 6.6 + 6.7 | Sticky-block focus, phone and desktop, contrast table, keyboard path and target sizes — all one pass over the finished app with four checklists. |
| *(unchanged)* | 6.8 | README re-verify and deploy runbook. |

Epic 6 builds almost nothing; it measures. That is why it collapses hardest.

## Constraints to preserve

1. **No AC is dropped except Story 5.6's.** Every merge carries its members' ACs
   forward.
2. **Epics 4 and 5 must stay parallelizable.** This is why the server stories are
   not merged across epics, and why Story 2.5's motion module keeps its own AC4.
3. **The FR / NFR / UX-DR coverage maps in `epics.md` must be regenerated** to
   match the new story numbering — they are why this goes through Correct Course
   rather than a hand edit.
4. **`sprint-status.yaml` must be regenerated** after the epic file changes. Run
   `bmad-sprint-planning` with the `fix` action. Epic 1 and stories 2.1–2.4 are
   `done` and must stay `done`.

## Decisions already made that later stories inherit

Three came out of the 2026-09-22 review and are implemented:

- **A `401` is not retryable.** `identityExpired()` is exported from
  `src/client/todos/todo-list-query.ts`; Story 2.7's `Retry` must consult it and
  reload the document rather than refetch. Epics 3–5 reach the same `401` from
  their own mutations.
- **Reads have a 15s deadline.** `READ_DEADLINE_MS` in the same module.
- **`listTodos` is deliberately unbounded.** Recorded in `deferred-work.md` as an
  accepted ceiling, not an oversight.

## Deferred items that bear on the consolidation

From `deferred-work.md`, section `## Deferred from: code review of stories
2.1–2.4 (2026-09-22)`:

- **The list region unmounts while loading and after a failure**
  (`todo-list.tsx:42`). Stories 2.6 and 2.7 own this. Whichever merged story
  absorbs them must keep it — 2.6 would otherwise mount skeletons into a region
  that does not exist, and 2.9 would announce a region that unmounts.
- **The sticky block's three-slot ordering is pinned by a comment regex only.**
  Converts to a real element-order assertion when 2.7, 3.3 and 4.4 fill the
  slots. Keep that conversion attached to whichever merged stories inherit it.
- **UUIDv7 time-ordering is untested and `mintIdentityId` is a hand-written
  stand-in.** Epic 3's optimistic insert depends on it. Whichever story becomes
  Epic 3's optimistic-add work should pick up the real `uuidv7` package.
- **`epics.md:509` still says `created_at`** where the contract and code say
  `createdAt`. Fix it during this restructure — it is a planning-document edit,
  which is exactly what Correct Course is for.

## Expected output

An updated `docs/planning-artifacts/epics.md` with the merged story list and
regenerated coverage maps, plus a sprint change proposal recording what merged,
what was cut (5.6), and why.
