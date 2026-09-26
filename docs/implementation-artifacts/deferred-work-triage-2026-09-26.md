---
date: 2026-09-26
source: docs/implementation-artifacts/deferred-work.md
entries: 106
closed: 19
open: 87
genuinely_pending: 33
---

# Deferred Work — Triage

`deferred-work.md` is append-only, which is the right property for a ledger and the wrong
one for a to-do list: after six epics it holds **106 entries and 20 closure lines**, and
nothing in it answers "what is actually left?" This document answers that, once, against the
tree at `1c857b8`. It decides nothing that the ledger recorded — it sorts what is there.

Every entry was read and checked against the current source. Where a claim could not be
verified it is marked, not guessed.

## The shape of it

| | Count | What it means |
|---|---|---|
| **Closed** | 19 | A `## Closed by:` section cites the entry. Two more are closed *partially*. |
| **Open** | 87 | Everything else. Of which: |
| → `stale` | **20** | **Already fixed. The ledger just never recorded it.** |
| → `accept-forever` | **27** | A deliberate, reasoned trade-off nobody intends to change. |
| → `superseded` | **7** | A later entry carries the same problem with better context. |
| → `pending-real` | **33** | Genuine outstanding work. |

**So the honest backlog is 33 entries, not 87** — and those 33 collapse to roughly 25
distinct problems once re-affirmations and duplicate recordings of one fact are merged (the
`middleware`→`proxy` rename is two entries; the tree-walk duplication is two; the
reduced-motion announcement is two).

The single most useful number here is the **20 stale entries**: a fifth of the open ledger
describes states that no longer exist. That is what makes the raw count misleading, and it is
cheap to fix.

## Genuinely pending (33)

Grouped by theme. Each is real, verified against the tree, and would be worth someone's time.

### Server input handling — the largest cluster, and the only one with user-facing risk

Five entries, all from Story 3.1's review, all still true in both route handlers:

- **`L256`** — `POST /api/todos` parses the whole request body before the 500-character rule
  can reject it, with no size ceiling of its own. No `content-length` check exists.
- **`L276`** — the endpoint accepts any `Content-Type` and parses whatever arrives; no `415`.
- **`L272`** — a NUL character in a Todo's text answers `500` where `400` is the honest
  reply. `src/shared/contract/validation.ts` has no control-character handling.
- **`L264`** — `requestFailedResponse(method, status, message)` lets a status code and its
  message drift apart. The entry deferred this until a second endpoint existed; there are now
  **seven call sites** across two route files.
- **`L77`** — the error envelope's `message` is constrained at one endpoint by hand, and
  nothing repository-wide stops the next handler interpolating a driver error into it. This
  is the one with a security flavour: AD-10 says the client never forwards a server message,
  but nothing enforces what goes *into* it.

### Accessibility residuals

- **`L350`** *(partially closed)* — Enter and Space activation of the checkbox has still never
  been pressed in a real browser. Story 6.2's audit closed the focus-reach half and said so.
- **`L403`, `L612`** — under reduced motion a departure's announcement is replaced before a
  screen reader is likely to have read it. One polite slot, no queue — and Story 6.2 added a
  second tenant to that slot, so this got worse during Epic 6.
- **`L545`** — the delete dialog does not name the Todo it is asking about.
- **`L597`** — `placeFocusAfterDelete`'s fallback branch (a resolved row no longer in the
  document) is written and has never been reached by a test.

### Measurement gaps Epic 6 was expected to close and did not

- **`L184`** — the zero-layout-shift claim is proved structurally; nothing runs a layout
  engine. No CLS measurement exists anywhere in `e2e/`.
- **`L584`** — the delete lane's 96px reveal width and the row geometry it produces are
  stylesheet facts, never measured.
- **`L679`** — the re-timed setup path has no Epic 6 figure for `npm run db:migrate`.

### Internal duplication the ledger has tracked since Epic 1

- **`L85`, `L105`** — the generic source-tree walk is copied byte-for-byte into six test
  files. `src/test-support/` exists as the home; nothing was migrated, and Epic 6 added a
  seventh copy.
- **`L280`** — `src/client/device/pointer.ts` and `src/client/motion/motion.ts` are the same
  `useSyncExternalStore` + `matchMedia` module twice.
- **`L498`** — `todo-list.render.test.tsx`'s hand-built `mount()` assembles four of the
  shell's providers by hand, duplicating `AppProviders`.

### Toolchain

- **`L61`, `L117`** — Prettier is the repository's de facto style but is not a dependency, not
  a script and not enforced; and `app/globals.css` cannot be run through it without breaking
  two test files. Nothing records the decision either way.
- **`L169`** *(partially closed twice)* — 28 code comments across 11 files cite
  pre-consolidation story numbers. Swept opportunistically; still incomplete.
- **`L9`, `L45`** — `middleware.ts` is deprecated in favour of `proxy.ts` and prints a
  migration notice on every build. The rename lost its owner when Story 1.6 declined it.

### Correctness edges nobody has hit yet

- **`L308`** — a succeeded create protects its row from the arriving list until TanStack
  garbage-collects the mutation: a five-minute window rather than a precise one.
- **`L486`** — a departing row's id stays in the departing set if the row leaves the cache
  before its transition ends. A release path exists for reduced motion and for delete, but
  not for a refetch that removes the row mid-departure.
- **`L446`** — `useTodos()` spreads the query result, opting its consumers out of TanStack's
  tracked-properties optimisation. The entry waited for a third consumer; it has arrived.
- **`L362`** — `setCompletedMutationOptions` is exported so the mutation can be driven with no
  DOM. The entry waited for a third hook doing the same; `deleteTodoMutationOptions` is it.
- **`L155`** — the guard that `listTodos` is defined only in `todos.ts` runs over joined
  source rather than per file.
- **`L288`** — the add input declares none of the attributes that shape a software keyboard
  (`enterKeyHint`, `autoComplete`, `autoCapitalize`, `spellCheck`).
- **`L608`** — the filter tabs are a `tablist` with no `tabpanel` and no roving `tabindex`.
  *(Arguable: the original entry at `L419` documents both departures with reasons and reads as
  accept-forever; Story 6.2's re-affirmation reads as pending. Classified pending because the
  re-affirmation is the later word.)*

## Accepted forever (27)

These are decisions, not debt. They are listed so nobody re-opens them. The pattern across
them: a value with no DESIGN.md name to be added under (`L143`, `L147`, `L220`); a claim this
stack cannot test (`L558` the swipe threshold needs a thumb, `L624` a modal tab cycle passes
through browser UI where `document.activeElement` reports `body`, `L434` `interpolate-size`
degradation); a fix that edits a planning artifact and routes to defer by rule (`L260`,
`L616`); a deliberate product cut (`L165` the first-run swipe nudge, `L159` the unbounded
read); a trade-off reasoned on the record (`L41`, `L49`, `L81`, `L268`, `L316`, `L328`,
`L358`, `L459`, `L526`, `L683` Vercel's Node pin, `L687` the 320px vocabulary gap).

## Stale — fixed, never recorded (20)

**This is the cheap win.** Each describes a state that no longer exists; I verified every one
against the tree. Recording closures for them would take the open count from 87 to 67 without
any code changing.

The three most notable, because Story 6.2 fixed them in shipped product code and its own
execution list required a closure that was never written:

- **`L232`** — `Retry` dropping keyboard focus to the document body. Fixed at
  `error-banner.tsx:105-134`, which cites "Story 6.2, decision 1".
- **`L236`** — the empty list conveyed twice to assistive technology. Fixed at
  `todo-list.tsx:374` (`aria-hidden={resolvedEmpty ? true : undefined}`), cited at `:351`,
  pinned by `todo-list.render.test.tsx:674` and `:704`.
- **`L284`** — the character counter silent to assistive technology. Fixed at
  `add-input.tsx:108-135`, which quotes the entry's own wording back.

The rest: `L25` (body never painted — `layout.tsx:62` now carries `bg-ground`), `L29` and
`L296` (the hand-written UUIDv7 stand-in — `uuidv7@1.2.1` is a dependency), `L53` (AD-8 behind
a lint rule — `eslint.config.mjs` now carries the query-key selectors), `L57` (no
browser-level test — Playwright and seven specs exist), `L73`/`L127` (`epics.md` naming
`created_at` as a wire field — AC1 now says `createdAt`; the remaining occurrences correctly
name the database column), `L97`/`L252` (the sticky block's gutter bleed and missing inset —
`top-block-stack`), `L101` (no wrapping guard — `wrap-anywhere` at `todo-row.tsx:376`),
`L204` (`isPending` unable to serve the wider loading states — `listLanded` does), `L208` (the
banner's 48px from the mockup — now derived from `--spacing-touch-target-min`), `L216`/`L240`
(kind-unaware error-slot guards — `clear` takes a `kind`), `L244`/`L248`/`L300`/`L304` (work
that has since shipped), `L620` (the `persistence.spec.ts` AC3 race — now awaits the PATCH).

## Superseded (7)

`L17` → `L77`; `L33` → `L85`/`L105`; `L37` → `L81`; `L312` → `L446`; `L320` → `L328`;
`L570` → substantially answered by `audit-focus.spec.ts` AC19 (the residual is the scrim,
still only a stylesheet assertion). Each is a re-recording of a fact a later entry carries
with better context.

## Defects in the ledger itself

Found while reading it end to end. Each undermines the file's own usefulness:

1. **Three real fixes are invisible to a closure search.** `L252`, `L296` and `L324` record
   discharges inside ordinary `- source_spec:` entries rather than under a `## Closed by:`
   heading, so six fixed items cannot be found by looking for closures.
2. **Story 6.2's five closures paraphrase the summaries they close**, and one of them
   discharges two entries while naming neither by its handle. `spec-6-3` states the convention
   — "Every `summary` is quoted verbatim so the entry it closes can be found by text search" —
   but 6.2 predates it. Those five entries cannot be found that way.
3. **A closure mis-attributes its entry.** The `spec-4-3` closure at `L371` cites
   `spec-2-6-…md`; the entry it closes (`L135`) is `spec-2-3-…`.
4. **The two partial closures of `L169` never total up**, so that entry can never be closed by
   search however much of it gets swept.
5. **Story 6.2 opened no `## Deferred from:` heading**, so its five entries sit under the
   `spec-5-1-5-2` heading. `source_spec` is authoritative; the heading is not.
6. **The "Story 6.8" entry at `L674` undercounts.** It says the file routes *two* Epic 1
   entries to a pre-consolidation number. There is a third — `L117`, from Epic 2 — and unlike
   the other two it is still open.

## What I would do

1. **Record the 20 stale closures.** One append, no code, and the open ledger drops to 67 —
   which is the difference between a backlog and an archive.
2. **Take the five server-input entries as one piece of work.** They are the only cluster with
   user-facing risk, they are all in two files, and they were deferred waiting for a second
   endpoint that has since arrived.
3. **Leave the 27 accepted ones alone**, and stop re-litigating them — that is what the
   category is for.
4. **Fix the six ledger defects above** in the same pass as (1), so the next reader can trust
   a text search.

Nothing here is a blocker. The product is finished and proven; this is the difference between
"we stopped" and "we finished".
