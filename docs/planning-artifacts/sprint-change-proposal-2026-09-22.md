# Sprint Change Proposal — Backlog Consolidation

**Project:** Simple Action
**Date:** 2026-09-22
**Raised by:** Lead
**Workflow:** `bmad-correct-course`
**Trigger input:** `docs/implementation-artifacts/consolidation-brief.md`
**Scope classification:** **Moderate** — backlog reorganization, no change to product scope or architecture
**Status:** Approved and applied to `epics.md`

---

## 1. Issue Summary

**The epic list is exhaustive and slow to get through.** Simple Action's planning artifacts
decompose six functional requirements into 46 stories across six epics. Epic 1 (8 stories) and
Stories 2.1–2.4 are `done`; 30 stories remain. At the granularity the epic list uses, many of
those remaining stories are not independently demonstrable — Story 2.9 was two `announce()` calls
on states built in Stories 2.7 and 2.8; Story 4.5's departure transition has nothing to depart
from until Story 4.4 ships the Filter Views; Story 2.6's skeleton pulse was the only consumer of
Story 2.5's motion module.

The cost is not planning overhead. It is that a story which cannot be demonstrated alone still
carries the full ceremony of a story: a spec, a context handoff, a review gate. Epic 6 is the
clearest case — eight stories that between them build nothing and measure one finished artifact.

**How it was discovered.** Raised by Lead after Stories 2.1–2.4 closed on 2026-09-22 following a
four-layer code review (14 patches applied, 3 decisions resolved, 9 deferred, 6 rejected). The
review's own output was the evidence: several deferred items had no natural owner because the
story that should own them was too small to hold them, and one was a planning-document error
(`epics.md:509`) that no code story could fix.

**Depth chosen.** Moderate. Two alternatives were considered and declined in the brief:

- **Aggressive (30 → 11)** — also merges all four server-endpoint stories (3.1, 3.2, 4.1, 5.1)
  into one. **Declined:** it makes Epics 4 and 5 sequential, and Story 2.5 exists specifically to
  make them parallel.
- **Epic 6 only (30 → 25)** — **declined** as too small a gain.

---

## 2. Impact Analysis

### 2.1 Epic Impact

| Epic | Status | Before | After | Change |
|---|---|---|---|---|
| Epic 1 | `done` | 8 | 8 | None — not touched |
| Epic 2 | `in-progress` | 9 (4 done) | 6 (4 done) | 5 remaining → 2 |
| Epic 3 | `backlog` | 5 | 4 | 5 → 4 |
| Epic 4 | `backlog` | 6 | 4 | 6 → 4 |
| Epic 5 | `backlog` | 6 | 3 + 1 deferred | 6 → 3 active |
| Epic 6 | `backlog` | 8 | 3 | 8 → 3 |
| **Remaining** | | **30** | **16 active + 1 deferred** | **−47%** |

**No epic is added, removed, resequenced or redefined.** Every epic keeps its goal statement, its
requirements-in-scope line, and its position in the build order. The consolidation operates
entirely at story granularity.

**Epic ownership of requirements is unchanged.** This is why the FR, NFR and UX-DR coverage maps —
which assign at epic level — survive the change intact. A new **Requirement Ownership, Resolved to Stories**
table was added to `epics.md` to resolve them to the new story numbers.

### 2.2 Story Impact

Full mapping is in `epics.md` → **Consolidation Map — 2026-09-22**. Summary:

| New | Was | ACs |
|---|---|---|
| 2.5 | 2.5 + 2.6 | 11 |
| 2.6 | 2.7 + 2.8 + 2.9 | 20 |
| 3.1 | 3.1 + 3.2 | 11 |
| 3.2 | 3.3 | 9 |
| 3.3 | 3.4 | 10 |
| 3.4 | 3.5 | 7 |
| 4.1 | 4.1 | 6 |
| 4.2 | 4.2 + 4.3 | 14 |
| 4.3 | 4.4 + 4.5 | 17 |
| 4.4 | 4.6 | 7 |
| 5.1 | 5.1 | 6 |
| 5.2 | 5.2 + 5.3 | 15 |
| 5.3 | 5.4 + 5.5 | 13 |
| 5.D1 | 5.6 | 7 — **deferred** |
| 6.1 | 6.2 + 6.3 + 6.4 | 18 |
| 6.2 | 6.1 + 6.5 + 6.6 + 6.7 | 21 |
| 6.3 | 6.8 | 5 |

**Acceptance criteria accounting.** The 30 remaining stories carried **193** criteria. The 16 active
stories plus Story 5.D1 carry **197**. No criterion was dropped. Four were added, each carrying a
deferred item into the story that inherits it (§4.3). Story 3.2 also corrects a numbering defect
in the previous revision, where two distinct criteria were both labelled `AC8`.

### 2.3 Artifact Conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `epics.md` | Story list, numbering, coverage-map story pointers | **Rewritten.** Applied in this change. |
| `epics.md:509` | Says `created_at`; the shipped contract and `listTodos` say `createdAt` | **Fixed** to `createdAt`. The AC2 reference below it was disambiguated to "the `created_at` column", which is the DB column and correct as written. |
| `sprint-status.yaml` | 30 backlog entries keyed by old story slugs | **Must be regenerated** — see §5. Epic 1 and Stories 2.1–2.4 stay `done`. |
| PRD | None | No requirement changed. MVP scope is unaffected. |
| `ARCHITECTURE-SPINE.md` | `Motion` and `First-run nudge flag` conventions | **No change.** Both stay live because Story 5.D1 is deferred rather than cut. |
| `WORK-SPLIT.md:111` | Maps a work item to the first-run nudge | **No change** — the story still exists, as 5.D1. |
| `DESIGN.md` / `EXPERIENCE.md` | None | No UX specification changed. UX-DR42 is deferred with its story, not withdrawn. |
| Shipped source | 28 code comments cite pre-consolidation story numbers | **Follow-up** — see §5.3. Documentation drift only; no behaviour depends on them. |

### 2.4 Technical Impact

**None.** No code changes, no schema changes, no API changes, no dependency changes. The
consolidation is a planning-document restructure. The only technical obligations it creates are the
four carried-forward deferred items (§4.3), each of which was already owed and now has a named owner.

---

## 3. Recommended Approach

**Selected path: Direct Adjustment** — modify stories within the existing epic structure.

Rollback was evaluated and rejected: nothing completed is wrong, and Stories 2.1–2.4 shipped with a
clean gate (lint clean, typecheck clean, 435 tests passing). PRD MVP review was evaluated and
rejected: the MVP is intact and every functional requirement keeps its owner.

**Rationale.** The merges follow the seams already in the material. Every merge joins stories that
already cross-reference each other, share a test harness, or cannot be demonstrated apart:

- **2.7 + 2.8 + 2.9** — 2.8's AC6 and AC7 already cited 2.7's load-failure state; 2.9 was two
  `announce()` calls on states built in both.
- **2.5 + 2.6** — the skeleton pulse was the motion module's only consumer in Epic 2.
- **3.1 + 3.2** — same `POST` handler, same test harness. 3.2's criteria *were* the validation rules
  of the endpoint 3.1 creates.
- **4.2 + 4.3** — the control and its optimistic effect are one behaviour.
- **4.4 + 4.5** — the departure transition only exists because Filter Views do.
- **5.2 + 5.3** — all three routes open the same dialog.
- **5.4 + 5.5** — the same optimistic/revert pattern as 4.2 and 4.4.
- **Epic 6** collapses hardest because it builds almost nothing; it measures.

**Three constraints were treated as inviolable, and two stories were deliberately left unmerged to honour them:**

1. **Story 3.3** (was 3.4) stays alone. It is the hardest story in the build — the create must not
   cancel the in-flight list query, and the arriving list merges by id. It was not bulked up.
2. **Stories 4.1 and 5.1** stay separate from their client stories. Each epic keeps its own server
   endpoint so **Epics 4 and 5 remain parallelizable** — which is the entire purpose of Story 2.5 AC4.
3. **No acceptance criterion was dropped.**

**Correction to the brief's arithmetic.** The brief's headline was 30 → 14. Its own merge tables sum
to **16**: Epic 3's table lists four entries under a "5 → 3" heading, and Epic 4's lists four under
"6 → 3" (which the brief catches itself). Reaching 14 would have required two further merges not
specified — and the only one available in Epic 3 was 3.4 + 3.5, which collides with the brief's own
instruction not to bulk up 3.4. **16 was chosen, preserving all three constraints.**

**Effort:** Low — a planning-document edit, applied.
**Risk:** Low, with one accepted exception (§3.1).
**Timeline:** 30 story cycles become 16. The saving is in ceremony, not in acceptance criteria.

### 3.1 The one accepted risk — Story 5.D1

The brief proposed cutting Story 5.6 (the first-run swipe nudge) as "pure polish, and the only AC set
dropped by this consolidation." Impact analysis found this understated:

> `EXPERIENCE.md:174` — *"Swipe-to-reveal is a hidden gesture. The PRD's source material forbids
> tours, tooltips and onboarding, and SM-1 requires a first-time user to complete add, complete and
> delete without instruction and without backtracking. Those two facts pull against each other. **The
> resolution chosen is the once-ever nudge above.**"*

Story 5.2 ships three routes to delete: swipe on touch, a trailing icon on hover, and the keyboard.
On a **touch-only device with no keyboard**, the swipe is the only non-keyboard route and it is
invisible without the nudge. Cutting it would also have left **UX-DR42 unassigned** (the coverage map
claims all 57 are assigned), dropped UX-DR54's nudge clause, and made two `ARCHITECTURE-SPINE.md`
conventions dead.

**Decision: deferred, not cut.** Story 5.D1 stays in `epics.md` with all seven criteria under a
`Deferred — post-MVP` heading, and stays out of `sprint-status.yaml`. The build reaches 16 active
stories at the same pace; UX-DR42 stays assigned; the architecture conventions stay live; and the
motion module keeps its four durations. **Story 6.1 AC2 is the criterion that would first reveal the
cost**, and 5.D1 is the first thing to bring back if it does. Both stories now say so.

---

## 4. Detailed Change Proposals

### 4.1 `epics.md` — story bodies

All 30 remaining story definitions replaced with 16 active plus Story 5.D1. Each merged story
carries a provenance note naming its members and the AC ranges each contributed, so every criterion
remains traceable to the story it came from. Each unmerged story carries a note saying it is
unchanged and why.

### 4.2 `epics.md` — new and corrected sections

**Added: `### Consolidation Map — 2026-09-22`** — the full old → new table, the four added
criteria and what each carries, and the rationale for the two four-entry epics.

**Added: `### Requirement Ownership, Resolved to Stories`** — resolves every FR, NFR and load-bearing UX-DR
to the new story numbers, and records that 56 of 57 UX-DRs are assigned to an active story with
UX-DR42 travelling with Story 5.D1's deferral.

**Corrected, `epics.md:509`** — Story 2.1 AC1, the wire shape:

```
OLD: ... every Todo carries `id`, `text`, `completed` and `created_at` in the shared contract's shape.
NEW: ... every Todo carries `id`, `text`, `completed` and `createdAt` in the shared contract's shape.
```

> *Rationale: the shipped contract (`src/shared/contract/todo.ts:24`) and `listTodos` both project
> `createdAt`. `spec-2-1`'s Implementation Notes already settled it — "the contract wins" — and
> `contract.test.ts:416` pins the drift in both spellings. Story 2.1 is `done`; this corrects the
> planning document to match what shipped, it does not reopen the story.*

**Corrected, `epics.md:511`** — Story 2.1 AC2, disambiguated: `created_at` → "the `created_at`
column", which is the database column and is correct as written. The wire field is `createdAt`; the
column is `created_at`. Both spellings are right in their own place, and the document now says which
is which.

**Corrected, FR Coverage Map** — the FR-1 note's pointer to the filter-tabs story updated from
`4.4 AC7` to `4.3 AC7`.

**Corrected, Epic List → Epic 5** — the narrative's closing sentence about the first-run nudge now
names Story 5.D1 and its deferral rather than describing the behaviour as shipping.

**Corrected, Epic 5 requirements-in-scope** — UX-DR42 moved out of the active list and annotated as
deferring with Story 5.D1.

### 4.3 Deferred items carried forward

Four items from `deferred-work.md` § *Deferred from: code review of stories 2.1–2.4 (2026-09-22)*
had owners that were about to be merged away. Each is now an acceptance criterion on the story that
inherits it — which is what makes the merge safe rather than lossy:

| New AC | Carries | Source |
|---|---|---|
| **2.5 AC11** | The list region must stay in the DOM while loading — `todo-list.tsx:42` is `if (data === undefined) return null` today, so skeletons would mount into a region that does not exist | `spec-2-4` |
| **2.6 AC6** | `Retry` consults `identityExpired()` from `todo-list-query.ts` and reloads the document — a `401` is not retryable | 2026-09-22 review decision |
| **3.3 AC2** | Replace the hand-written `mintIdentityId` stand-in with the real `uuidv7` package, and test that two ids from the product's own minting function compare in time order | `spec-2-2` |
| **4.3 AC12** | Convert the sticky block's three-slot ordering from a JSX-comment regex (`sticky-top-block.test.ts:64`) to an element-order assertion, now that Stories 2.6, 3.2 and 4.3 fill all three slots | `spec-2-3` |

Two further review decisions are already implemented and are referenced in-place rather than
re-specified: reads have a 15s deadline (`READ_DEADLINE_MS`), and `listTodos` is deliberately
unbounded — recorded in `deferred-work.md` as an accepted ceiling, not an oversight.

### 4.4 No changes proposed

**PRD** — no requirement added, modified or removed. MVP scope unaffected.
**Architecture** — no component, pattern, technology choice, data model, API or integration point
changes. Both motion-related conventions stay live because 5.D1 is deferred rather than cut.
**UI/UX** — no screen, flow, wireframe, interaction pattern or accessibility commitment changes.

---

## 5. Implementation Handoff

**Scope: Moderate** — backlog reorganization. No PM or Architect involvement required; no
fundamental replan. Routed to **Product Owner / Developer**.

### 5.1 Done in this change

- [x] `docs/planning-artifacts/epics.md` — 30 remaining stories → 16 active + 1 deferred
- [x] Consolidation Map and Requirement Ownership sections added
- [x] `epics.md:509` `created_at` → `createdAt`; `:511` disambiguated
- [x] FR Coverage Map story pointer, Epic 5 narrative, Epic 5 requirements-in-scope updated
- [x] Four deferred items assigned to inheriting stories as acceptance criteria
- [x] Story 3.2's duplicate `AC8` numbering corrected
- [x] This proposal

### 5.2 Next — required before the next story starts

**Regenerate `sprint-status.yaml`.** Run `bmad-sprint-planning` with the `fix` action. It must:

- keep `epic-1` and its 8 stories `done`;
- keep `2-1` … `2-4` `done` and `epic-2` `in-progress`;
- replace the 30 old backlog entries with the 16 new ones, keyed by the new slugs;
- **omit Story 5.D1** — it is deferred, not backlog;
- leave the `epic-N-retrospective: optional` entries as they are.

### 5.3 Follow-up — not blocking

**Stale story numbers in code comments.** 28 comment references across 11 files cite
pre-consolidation numbers. The renumbering leaves these stale: `2.6`→`2.5`, `2.7`/`2.8`/`2.9`→`2.6`,
`3.3`→`3.2`, `4.3`→`4.2`, `4.4`/`4.5`→`4.3`, `6.1`→`6.2`. `2.1`–`2.4`, `2.5`, `3.1`, `4.1` and `5.1`
are unaffected.

Affected files: `sticky-top-block.tsx` and its test, `todo-list.tsx` and its test, `todo-row.tsx` and
its test, `todo-card.tsx`, `todo-list-query.ts` and its test, `use-todos.ts`, `app/api/todos/route.ts`.

These are documentation drift, not defects — no behaviour depends on them. **Fix them opportunistically
as each file is next touched**, rather than as a sweep, so the correction rides along with work that
is already reviewing the file.

**Record the deferral.** Add Story 5.D1 and its SM-1 exposure to `deferred-work.md` so the accepted
risk lives alongside every other accepted absence in this build.

### 5.4 Open caveat — inherited, not created by this change

**8 tests fail with `password authentication failed for user 'neondb_owner'`.** Stale credentials in
`.env`, not code. They are the live-branch repository tests, so **Story 2.1's four repository
acceptance criteria are currently asserted rather than demonstrated.** Refresh `DATABASE_URL` and
re-run before treating them as proven. Story 6.1 AC18 now carries this forward explicitly so it
cannot close silently.

### 5.5 Success criteria

1. `sprint-status.yaml` lists exactly 16 active remaining stories; Epic 1 and 2.1–2.4 still `done`.
2. Every one of the 193 pre-consolidation acceptance criteria is present in `epics.md`, in an active
   story or in Story 5.D1.
3. The four carried-forward deferred items each have a named owning criterion.
4. Epics 4 and 5 can still be built in parallel — both import the collapse constant from Story 2.5's
   motion module, and neither depends on the other's server story.
5. Story 6.1 AC2 passes on touch. If it does not, Story 5.D1 comes back before the epic is accepted.
