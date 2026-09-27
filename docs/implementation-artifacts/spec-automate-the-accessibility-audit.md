---
title: 'Automate the accessibility audit — axe-core against WCAG AA'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '969ae9010ef453c02a38761e9b9467d3d98c28fa'
context:
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every accessibility guarantee this product makes is asserted by hand. Story 6.2
measured focus reach, hit areas, contrast tokens and reflow one criterion at a time, and
`e2e/audit-focus.spec.ts`, `audit-responsive.spec.ts` and `audit-vocabulary.spec.ts` are the
result. Nothing runs a conformance engine, so the whole class of WCAG AA failures nobody
thought to write a test for — an unlabelled control, a broken ARIA reference, a missing
`lang`, a role nesting violation, a contrast pair the tokens permit but the composition
breaks — is unmeasured. The ledger already names live residuals in that class
(`deferred-work-triage-2026-09-26.md:61-69`).

**Approach:** Add `@axe-core/playwright` as a dev dependency and one new
`e2e/audit-accessibility.spec.ts` that runs axe against `wcag2a`, `wcag2aa` and `wcag21aa` in
every state the existing suite can already reach — first run, populated list, each of the
three filter views, the two empty views, the error banner occupied, and the delete dialog
open. Violations fail the run. Fix what the scan finds, within the boundary below.

**Decision — the token boundary (AD-13).** A contrast violation that can only be resolved by
changing a design token is not fixed here. `app/globals.css`'s `@theme` block is the single
transcription of DESIGN.md, DESIGN.md is human-owned, and inventing a colour would put the
two out of agreement. Such a finding is recorded in `deferred-work.md` with its measured
ratio and the pair that produced it, and the scan is narrowed by an explicit, commented
exclusion naming that entry — never by dropping the rule.

</frozen-after-approval>

## Implementation Notes

- `@axe-core/playwright@4.13.0` added as a dev dependency. Its only peer is
  `playwright-core >= 1.0.0`, already satisfied by `@playwright/test@1.63.0`, and it carries
  `axe-core ~4.13.0` as a real dependency, so nothing else was installed by hand.
- `e2e/support/app.ts` gains `WCAG_AA_TAGS`, `scanPage`, `describeViolations` and
  `expectNoViolations`. The violation type is derived as
  `Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]` rather than imported from
  `axe-core`, which keeps the module's "imports nothing it does not directly depend on"
  property intact — `axe-core` is transitive here, not a declared dependency.
- `e2e/audit-accessibility.spec.ts` is new: eleven states across eight tests, plus a negative
  fixture. The frozen Intent named nine of them; the list mid-load, the refused list read and
  the refused add were added during implementation. The fixture
  injects a nameless `<button>` and asserts the scan reports `button-name`, on the same
  argument `audit-focus.spec.ts` makes about its own clearance helper — an absence proved by
  a check that cannot fail proves nothing.
- The file runs on the `pointer` and `touch` projects. `narrow`'s `testMatch` in
  `playwright.config.ts` admits only `audit-responsive.spec.ts`, and that file already owns
  the 320px reflow criterion, so the config was left alone.
- Naming constraint, not a style choice: `src/client/components/vocabulary.test.ts` scans
  `e2e/` for the banned filter-name word, so neither new file may contain it — including in
  comments.
- Review added `wcag21a` to the tag set. The original three-tag set claimed WCAG 2.1 AA while
  skipping 2.1's only level-A rule, `label-content-name-mismatch` (SC 2.5.3 Label in Name) —
  live here rather than theoretical, since the checkbox takes its name from the row text by
  `aria-labelledby` and the delete control is named `Delete {text}`. It passes.
- Review also made `incomplete` visible. `scanPage` now returns both buckets and
  `expectNoViolations` attaches the undecided ones to the test as an `axe-incomplete`
  annotation rather than asserting on them — an undecided result is not a failure and must not
  turn the suite red, but a green run that silently discarded it would be overstating what was
  proved.
- That change immediately earned itself: the bucket is **not** empty. Eight `color-contrast`
  results are undecided, all on the Todo text span, all reading "background color could not be
  determined due to a pseudo element" — the transparent 44px hit-area overlays
  (`app/globals.css:908`). Recorded in `deferred-work.md` rather than fixed; the ratios
  themselves are already asserted in `app/globals.contrast.test.ts`.
- `@axe-core/playwright` is pinned to `4.13.0` rather than caret-ranged. Every other
  build-critical dependency here is pinned exactly, and a minor axe bump adds or tightens
  rules — under a caret, an unrelated lockfile refresh would silently change what this suite
  means by "conformance".

**Run result (2026-09-27, `969ae90` + this change):** `npm run lint` clean, `npm run typecheck`
clean, `npm test` 1345 passed across 58 files, `npm run test:e2e` 143 passed / 13 skipped. The
conformance scan reports zero violations in all eleven states on both the `pointer` and `touch`
projects, and the negative fixture confirms the scan rejects a nameless button — so the zero is
measured rather than vacuous.

## Review Triage Log

One layer ran: `blind-hunter`, fifteen findings.

- `high` — `WCAG_AA_TAGS` omitted `wcag21a`. Verified against the installed engine:
  `axe.getRules(['wcag21a'])` returns exactly `label-content-name-mismatch`. Patched.
- `high` — the docstring justified the omission as reasoned. Same root cause as above; the
  comment was rewritten with the tag set.
- `medium` — `results.incomplete` discarded. Real, and the bucket turned out to be populated.
  Patched, then the contents were deferred.
- `medium` — caret range on a new dependency while its neighbours are pinned. Verified in
  `package.json`. Patched.
- `medium` — missing state: a refused list read. Reachable with existing helpers
  (`failNext(page, "GET", LIST_ROUTE)`). Patched.
- `medium` — missing state: a refused add. Reachable by hand, since `addTodo` waits for the
  server. Patched.
- `medium` — the held route leaked on assertion failure. Real. Patched with `try`/`finally`,
  plus an assertion that the release took.
- `low` — the negative fixture's baseline used raw `toEqual([])`. Real. Patched.
- `low` — `describeViolations` dropped `helpUrl` and `failureSummary`, and `join` was wrong for
  a frame-nested selector. Both real. Patched.
- `low` — a redundant `toBeVisible()` after `openDeleteDialog`, which already asserts it.
  Patched by deletion.
- `medium` — README and the support module's header comment did not mention the new engine or
  the third-party import. Real and user-facing. Patched.
- `low` — the spec said "eight states" where the file covers eleven. Patched.
- `medium`, deferred — a row mid-departure is never scanned. The state is real; the reviewer's
  suggested route is not. There is no `data-still` hook (`grep` finds none), and the departure
  is time-bound, so no deterministic fixture exists without a product change.
- `low`, deferred — nothing enforces that `disabled` is only used for an AD-13 deferral. Fair
  against this repo's house style, but the argument has no call site yet, so a guard would
  guard nothing.
- `low`, deferred — the file never runs at 320px and the config does not say so.
  `sprint-status.yaml:158` already carries `epic-6-retro-item-11` for the same problem with
  `audit-vocabulary.spec.ts`; the two want settling together.
- `false` (in part) — "no `## Verification` section, and no `sprint-status.yaml` entry". The
  oneshot route's template deletes that section by instruction, and this is not an epic story,
  so there is no sprint key to sync. The fair half — that a clean run should be stated as a
  result — is recorded above.
