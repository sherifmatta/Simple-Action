---
title: 'Close the contrast gap — prove the Todo text pair from the running page'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '6c09a690ce4d34e9756203659c2a7bbc8e287320'
context:
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The conformance scan cannot decide `color-contrast` on a Todo's text. axe reports
eight `incomplete` results reading "background color could not be determined due to a pseudo
element" — the transparent 44px hit-area overlays (`app/globals.css:908`, required by
DESIGN.md:354) overlap the text span's box. So the product's primary content is the one pair
the engine does not answer, and WCAG 1.4.3 for it currently rests on
`app/globals.contrast.test.ts`, which computes declared token values rather than what the
browser paints.

**Approach:** Assert the composed pair from the running page, the way `audit-focus.spec.ts`
asserts geometry. Two claims, because "the background is what I think it is" is the half axe
could not establish: first that nothing paints over the text's box — every element and
pseudo-element intersecting it has a fully transparent background and no background image —
and second that the compositing of the ancestor backgrounds behind it clears WCAG's 4.5:1
floor for normal text, in both completion statuses.

**Decision — the product does not move.** The overlays stay exactly as they are. Giving axe a
resolvable background by painting one onto the span would be editing the product to suit an
analyser, and the overlays are DESIGN.md's requirement, not an accident.

</frozen-after-approval>

## Implementation Notes

- `e2e/support/app.ts` gains `TEXT_CONTRAST_FLOOR`, `ContrastReading`, `readTextContrast` and
  `expectTextContrast`. `todoText()` locates the span by the product's own id suffix
  (`rowTextId`), the same trade `stickyBlock()` makes.
- `readTextContrast` establishes the two things axe's `incomplete` verdict left unsettled: that
  nothing paints over the text's box (`painters`), and what the composited ancestor chain
  actually is (`background`) once that holds. The luminance formula is WCAG's own six lines,
  duplicated deliberately from `app/globals.contrast.test.ts` rather than shared — that file
  reads hex literals in Node, this one reads `rgb()` triples out of a live browser, and the two
  have no runtime in common.
- `e2e/audit-accessibility.spec.ts` gains three real tests (both completion statuses, and the
  error-banner state) and two negative fixtures.

**Run result (2026-09-27, `6c09a69` + this change):** `npm run lint` clean, `npm run typecheck`
clean, `npm test` 1345 passed, `npm run test:e2e` 151 passed / 13 skipped (one `touch`-project
journey flaked once under full parallelism and passed clean in isolation — pre-existing gesture
timing, not this change; verified by stashing this diff and reproducing the pass at baseline).
The two new real-state tests measure the composed pair directly from the browser: an Active
row's text at 15.12:1, a Completed row's at 4.69:1 — matching `app/globals.contrast.test.ts`'s
declared-token figure exactly. `painters` is empty in every state, so the transparent hit-area
overlays are confirmed not to intersect the text as currently laid out.

## Review Triage Log

One layer ran: `blind-hunter`, eleven findings.

- `high` — the painter scan gated on the *host's* bounding box, so the `::after` hit-area
  overlays it exists to catch — 44px, `transform: translate(-50%, -50%)`-centred on a 17-21px
  host — could intersect the text while the host's own box did not, and would never be
  checked. Verified with a probe. Patched: pseudo geometry is now resolved independently
  (`getComputedStyle`'s resolved `top`/`left`/`width`/`height` plus the resolved transform
  matrix) and checked in addition to the host's box. Confirmed after the fix that this
  product's actual overlays do not reach the text — `painters` stayed empty — so the fix closes
  a real blind spot without changing today's verdict.
- `high` — `other.getAttribute("aria-label") ?? other.id ?? ...` never reached the tag-name
  fallback, because `Element.id` is `""` rather than `null` when absent, and `??` does not
  fall through an empty string. Verified directly. Patched with `||`.
- `medium` — the backdrop walk never asserted it reached full opacity, though the doc comment
  claimed it was reported. Verified: no such check existed. Patched to throw if the chain
  exhausts itself below alpha 1; confirmed safe because `body` carries an opaque `bg-ground`
  background in every real state.
- `medium` — the backdrop walk read `backgroundColor` only, while the painter branch beside it
  also checked `backgroundImage`. Verified as an asymmetry; no ancestor currently has a
  background image or non-1 opacity, so today's readings were unaffected. Patched anyway —
  both are now checked, matching the painter branch's own reasoning.
- `medium` — `parse()` extracted digits positionally, so a non-`rgb()` computed colour (a
  future `oklch()`/`color-mix()` token) would silently produce a plausible-looking wrong
  number. Verified against how Chromium's `getComputedStyle` resolves colour today (always
  `rgb()`/`rgba()`), so nothing currently trips it. Patched to reject any other syntax with a
  thrown error rather than parse it optimistically.
- `medium` — `ContrastReading.foreground`'s doc comment promised "the text's own colour, as
  the browser resolved it" but the field returned the colour already composited onto the
  backdrop. Verified. Patched the doc comment to describe what is actually returned and why.
- `low` — the file header's "this file adds no new criteria of its own" became false once the
  contrast block was added. Verified. Patched with a paragraph naming the one exception and why.
- `low`, real but not actioned as suggested — only two of the states axe reported `incomplete`
  in are covered by name, and the delete dialog specifically was named as a gap, since its
  scrim paints on `::backdrop`, which the painter loop does not query. Checked: the dialog is
  opened with `showModal()`, which the HTML spec makes the rest of the page inert while it is
  open, so the row's text is not "presented" in the WCAG 1.4.3 sense during that state — testing
  its contrast then would not be a meaningful use of the criterion. The two distinct token pairs
  in the design system (`row-active`, `row-complete`) are both covered by the tests kept; "All"
  view is compositionally identical to Active+Completed and adds no new pair.
- `medium` — the negative fixtures drove `readTextContrast` directly rather than
  `expectTextContrast`, so the assertion wrapper every real test calls was itself unproven.
  Verified. Patched: both fixtures now call `expectTextContrast` inside a `try`/`catch` and
  assert that it throws, the same shape `audit-focus.spec.ts`'s clearance negative fixture uses.
- `medium` — the contrast annotation was pushed after the `painters` assertion, so a painters
  failure — the case the reading matters most for — never reached the report. Verified.
  Patched: the annotation is now pushed first, and includes the painters list when non-empty.
- `low` — the spec, at review time, was left `in-progress` with an empty Implementation Notes
  and no Review Triage Log, and its `baseline_commit` was a 7-character abbreviation where the
  house style is a full SHA. Both fixed here, along with citing both hit-area locations
  (`app/globals.css:280` for the checkbox, `:908` for delete) rather than only one.
