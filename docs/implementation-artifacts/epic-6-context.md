# Epic 6 Context: Prove It Holds Up

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 6 turns the product's central claim — that a deliberately small todo app can still feel finished — from an assertion into a measurement. Five epics built every control, state, error path and animation; this epic measures the assembled result and builds nothing. Its three stories execute the product's four user journeys against a running build, force every failure path deliberately rather than inspecting for it, unit-test the reconciliation rules that only break under a race, audit the finished surface for focus visibility, one-handed reach, contrast and hit-target size, and re-walk the setup path against the final codebase. The hard scoping rule is that **Epic 6 may contain only what measures a finished artifact** — any construction that leaks in converts "prove it" into "do it later," and "do it later" is the epic that gets cut. Two exceptions are explicit and allowed: the live-measured sticky-block scroll offset (it cannot be built earlier, because the block's height is not final until every occupant exists), and fixes surfaced by an audit.

## Stories

- Story 6.1: Verify the product end to end, under failure, and under race
- Story 6.2: Audit the assembled product — focus, reach, contrast and targets
- Story 6.3: Re-verify the README and write the deploy runbook

## Requirements & Constraints

**Success metrics this epic validates (the epic's real acceptance bar):**
- A first-time user completes add, complete and delete with no instruction step and no backtracking. This is the executable form of the primary metric, and is the criterion that would first reveal the cost of the deferred first-run swipe nudge — if it fails on touch, that deferred story is the first thing to bring back.
- The Todo List is identical after a page reload **and** after a browser restart carrying persisted cookies, and two independent browser contexts see two independent, unrelated lists.
- Every view that can be empty, slow or fail has a designed state, proven by forcing each failure rather than by reading code.
- The interface is usable one-handed on a phone and comfortable at desktop width, with no horizontal scrolling anywhere, ever.

**Verification scope:** four scripted journeys; four forced failure paths (load, create, update, delete), each asserting its exact banner copy, its revert-in-place behaviour and its retry semantics; the add-during-load race; the retry-after-uncertain-failure idempotency case; and error-slot replacement when a newer failure arrives while an older is displayed. Unit-level coverage targets merge-by-id reconciliation, per-entity (never whole-list) rollback, and rollback isolation when two mutations are in flight and only one fails.

**Gate:** 100% of tests pass before the epic is accepted. One inherited caveat must be closed rather than allowed to close silently — the live-database repository tests have been failing on stale credentials and so were asserted rather than demonstrated; they must run green against a working database connection string.

**Audit constraints:** a focused control must never be even partially covered by the sticky block, at any scroll position and in every filter view; every interactive element must measure at least 44px in both dimensions; contrast must be computed against the design system's table rather than judged by eye, with the completed-text-on-completed-row pair the tightest in the system and having no headroom; the tab order must match reading order across all five epics' controls; and the banned-pattern list must still hold (no drag-to-reorder, bulk actions, long-press menus, toasts, undo affordances, infinite scroll, hover-only affordances without a keyboard equivalent, modal stacks deeper than one, or animation on open).

**Documentation:** the setup path is re-walked and re-timed against the final dependency set and compared with the Epic 1 measurement so regression is visible; the deploy runbook must state how migrations are applied, how the three environments differ, and how to roll back; no secret may have a committed default and the database connection string must still be the only required one; and the word "Done" must appear nowhere in the product surface or the codebase as a filter name, label, tooltip or prose.

## Technical Decisions

- **Test tooling is fixed and in scope, not optional:** Vitest for unit work, Playwright for end-to-end **with route interception** as the mechanism for forcing failures. Rationale: the optimistic layer is where the product's complexity is concentrated.
- **End-to-end specs live in a dedicated top-level directory**, outside the client/server layer boundaries the lint rules enforce.
- **The suite must pass in CI against the same commit that deploys.** A CI workflow does not exist today; establishing one is Epic 6's to resolve, together with the question of how the live-database tests get their connection string.
- **Three environments, identical in shape** — local, per-PR preview, production — differing only in which database branch the connection string points at. Migrations ship as committed SQL files applied by the deploy step; the push-style schema sync is local-only and never targets preview or production.
- **Sticky-block offset must be measured live, not hard-coded** — the error banner region's occupancy changes the block's height. Apply it as scroll padding on the scroll container plus scroll margin on each focusable row descendant, and re-apply when the block grows.
- Ordering is newest-first throughout, and reconciliation must preserve it.

## UX & Interaction Patterns

- The four journeys are specified in full in the UX experience document, including each one's edge case. The fourth (a first-ever session on a browser with no identity) is the one that carries the no-instruction metric; note that its first-run swipe-nudge beat corresponds to deferred work and is not present in the shipped product.
- Layout: one column at every width, capped at 640px, then the ground widens around it — no sidebar, second column or second region at any breakpoint. On a phone the card fills the viewport less a margin on each side.
- The page body is the only scrolling element; there is no nested scroll region. Once the list is long the card has no visible bottom edge — that is specified behaviour, not a defect.
- Long-text wrapping must be verified at the 500-character ceiling on the smallest supported viewport. The typeface's wide letterforms are a flagged tension here; if it fails, the lever is text size and line height — never truncation.
- A phone's address-bar collapse changes the effective viewport, and the sticky block must re-seat to the new height.

## Cross-Story Dependencies

- All three stories depend on Epics 1–5 being complete; every one of them measures shipped behaviour. Story 6.2 is the only story permitted to add code, and only for the live-measured sticky offset and for defects its audits surface.
- Stories 6.1 and 6.2 both need a real browser at real viewport sizes; several claims from earlier epics were reasoned from specifications rather than observed (sticky positioning under the body's horizontal-overflow rule, text wrapping at the ceiling, the checkbox's 44px hit area, layout-shift and reserved-height claims, keyboard activation of the checkbox). The project's deferred-work log records these with Epic 6 named as their owner — consult it and close what these stories' criteria cover.
- Several accessibility gaps are likewise logged against Story 6.2's audit: where focus goes after the banner's retry unmounts it, the empty list region being announced twice, and the character counter's ceiling being silent to screen readers. Each needs a decision made, not a guess.
- Story 6.3 inherits two documentation items routed forward from Epic 1: the absent CI workflow, and agent-context instructions that never learned the codebase's layer boundaries.
- Story 6.1's no-instruction criterion is the tripwire for the deferred first-run swipe nudge, which is the only non-keyboard discovery route for delete on a touch-only device.
