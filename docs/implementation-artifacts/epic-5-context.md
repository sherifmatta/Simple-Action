# Epic 5 Context: Remove a Todo

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a person get rid of a Todo they no longer need, without a mouse, a gesture, or a guess — and without a mis-tap costing them anything. The action is reachable three ways: swipe leftward on touch, a trailing icon on hover, and the keyboard, always. All three open one confirmation dialog that traps focus, lands on Cancel, and hands focus somewhere sensible on close rather than dropping it to the document body. Confirming closes the dialog and removes the row immediately, the rows below closing the gap with the same collapse motion a departing Todo uses; the deletion is permanent and survives a reload. If the server refuses it, the Todo comes back in its original position and the banner says so, with a `Retry` that re-attempts the same deletion and does not ask for confirmation a second time. This epic owns deletion end to end and reuses the optimistic mutation shape established for add and toggle, unchanged.

## Stories

- Story 5.1: Remove a Todo at the server
- Story 5.2: Reach delete three ways, confirm once
- Story 5.3: Remove before the server answers, restore if refused
- Story 5.D1: Teach the swipe once, with motion — **DEFERRED post-MVP, not in this sprint**

## Requirements & Constraints

- **Deletion is permanent and idempotent.** The row is removed; there is no soft-delete column and nothing filters on deletion state. The same delete sent twice succeeds twice, because a retry must not fail for a row already gone. A delete for a Todo the caller does not own removes nothing and discloses nothing about it. Deletion works on a Todo in either Completion Status.
- **The confirmation is mandatory and singular.** Nothing is removed until the user chooses `Delete`. Cancel leaves the Todo List untouched. One dialog, one level deep, nothing stacks on top of it, no third button, no checkbox, no "don't ask again".
- **The keyboard route is not a fallback** — it is the WCAG 2.2 AA floor. A hover-only or gesture-only affordance fails the requirement outright. With the first-run nudge deferred, the keyboard route is also the only *taught* route on a touch-only device; that risk is accepted and is the first thing Epic 6's end-to-end journey would expose.
- **The removal is on screen before the server answers, and a refusal is as visible as the removal was.** The Todo returns to its original position and the shared save-failure message appears with `Retry`. The list never holds a state the server rejected.
- **Failure handling, keyboard routes, focus management, announcements and 44px hit areas ship inside these stories** — they are acceptance criteria here, not work for a later audit epic.
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Filter View`. The word **Done** is banned everywhere.
- **User-facing strings are exact:** the dialog reads `Delete this Todo?` with `Cancel` and `Delete`; the failure message is the shared save string used by a failed toggle, not a new one. Plain declaratives, no personality, no exclamation marks.

## Technical Decisions

- **`DELETE /api/todos/:id` returns `204` whether or not the row was present, provided the caller owns it.** Failures return the shared error envelope with kind `delete`; the server message is never forwarded to the interface. The repository stays the only Drizzle importer, `deleteTodo` takes `ownerId` first, and the route handler builds no query.
- **The optimistic removal is written via `setQueryData` on the single `['todos']` key.** Unlike create, a delete *may* cancel in-flight reads, because it acts on a row the server already knows about.
- **Rollback re-inserts only the one row this mutation removed**, back at its `id DESC` position. Restoring a whole-list snapshot is forbidden — with a second mutation in flight it would undo changes this mutation never made.
- **Every duration comes from the motion module seeded in Epic 2.** The delete collapse is the departure collapse *minus the hold* — the same named constant, not a second one — and `prefers-reduced-motion` is honoured in that one place. No component inlines a duration or reads the media query itself.
- **Design tokens only.** No hex literal, no arbitrary-value class; a value not in the theme is added there first under its original token name. The filled destructive surface is its own token, distinct from the de-escalated banner text colour that happens to share its value today.
- **Announcements go through the single `announce(message, urgency)` function** — the deletion politely, the failure assertively. No component renders its own live region.
- **The error slot holds one entry**; this mutation supplies a retry closure capturing exactly the Todo it tried to delete. A newer error replaces an older one and the replaced operation is not retried. If the target no longer exists, `Retry` does nothing and clears the banner.
- **Testing:** Vitest for per-entity rollback and re-insertion position under concurrent mutations; end-to-end coverage of the forced delete-failure path belongs to Epic 6.

## UX & Interaction Patterns

- **Two presentations of one action.** On pointer, a thin trailing line icon appears on row hover, muted at rest and taking the danger hue on its own hover. On touch, a leftward swipe reveals a solid filled panel behind the row with a white icon — the same filled treatment as the dialog's confirm button, so the two surfaces on the delete path read as one escalation. Touch and pointer are decided by *capability*, not viewport width; a device supporting both offers both.
- **The delete control is in the tab order whether or not it is visually revealed, and receiving focus reveals it.** It is the last focusable control in its row (after the checkbox), at least 44px in both dimensions, and labelled with the Todo it acts on so the tab order does not read as a list of identical `Delete` buttons. On a Completed row it takes the deepened-accent focus ring, because the standard accent fails contrast on mint.
- **The dialog** is a centred modal on a translucent scrim, card-shadowed, with two pill buttons at least 44px tall: Cancel transparent with a control-border edge, Delete a solid filled button with a white label — the only filled button in the product, because it is the only interaction that cannot be taken back.
- **Focus management is explicit.** Trapped while open; initial focus on Cancel, not Delete; Tab cycles within the dialog only; Escape closes exactly as Cancel does. On close by Cancel or Escape, focus returns to the control that opened it. On close by Delete, focus goes to the first focusable control of the row that took its place — the checkbox — or to the input if the list is now empty. Focus is never dropped to the document body.
- **The removal itself:** the dialog closes, the row goes, the rows below close the gap over the collapse duration with **no hold** — a deleted Todo has no new state to show. The filter-tab counts update instantly. Under reduced motion it cuts to the end state and the announcement still fires.
- **Banned:** undo toasts, long-press menus, bulk actions, drag-to-reorder, modal stacks deeper than one, any animation on dialog open. The row body is not a click target.

## Cross-Story Dependencies

- **Story 5.1 is independent** and was deliberately kept separate so Epic 5's server work could start in parallel with Epic 4. **Story 5.2 depends on 5.1** only loosely (the dialog can be built against a stubbed mutation), and **Story 5.3 depends on both** — it needs the endpoint to call and the dialog's `Delete` to fire it.
- **Epic 4 is complete**, so this epic's position rules resolve concretely: the checkbox exists, so the delete control is second in each row's tab order and focus-after-delete lands on the replacement row's checkbox. The filter tabs exist, so the tab counts must update on optimistic removal. The departure collapse exists — reuse its constant rather than declaring a second.
- **Depends on Epic 3** for the optimistic mutation shape, the retry-closure convention and per-entity rollback; reuse them unchanged. **Depends on Epic 2** for the error slot and banner with all four kinds modelled, the empty-state component, the motion module, the announcer, the sticky block and the `['todos']` hook. **Depends on Epic 1** for the contract, the owner-scoped repository, identity middleware and design tokens.
- **Obligations carried in from earlier work, each becoming actionable here:**
  - The departing-row set releases entries on the row's own `transitionend`, so a row that leaves the cache mid-transition leaks a dead id. Delete is the first thing that removes rows for real and needs the same release path — answer both together.
  - The optimistic-create guard protects an unconfirmed id for the mutation's garbage-collection window, which was harmless while nothing removed rows. Delete changes that; the precise fix needs request-ordering information the query does not yet carry.
  - A request-size guard ahead of JSON parsing was deferred from the create endpoint on the reasoning that the update and delete endpoints would want the same one — this is the last endpoint where writing it once is still cheap.
  - The error envelope's `message` field is still unconstrained by anything but precedent, and this is the fourth and final endpoint to follow it.
  - There is no lint rule keeping mutation hooks inside the todos module; this epic adds the third such hook, which is the point at which the rule becomes worth writing.
  - The oldest render-test helper hand-assembles every shell provider one story behind the real one; this epic's delete hook adds the next provider-bound dependency, so converting those cases to the real provider tree belongs here.
- **Beware stale story numbers in older documents and code comments.** The 2026-09-22 consolidation renumbered several stories; references to `5.1` are unaffected, but earlier `5.2`–`5.6` references may not map to today's numbering. Fix such references opportunistically in files you are already touching.
- **The epics file spells one contract field in snake_case; the contract wins.** Todo fields are camelCase on the wire.
