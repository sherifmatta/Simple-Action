# Epic 4 Context: Complete and Filter

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the list answer to the user. A person marks a Todo done and sees the mint fill, the filled checkmark and the strikethrough land together before the server confirms — and marks it undone again by the same interaction. The row does not move: Completion Status never reorders the list. A person narrows the list to All, Active or Completed with no network request, no loading state and no way to fail, each tab carrying its own count derived locally and updating the instant any optimistic change lands. When a toggle takes a Todo out of the active Filter View, the row holds in its new status long enough for the change to read as caused, then collapses away — and if the server refuses the change, the row comes back where it was and says so. This epic owns completion and filtering end to end, reuses Epic 3's optimistic mutation shape unchanged, and makes the Active and Completed empty states reachable for the first time.

## Stories

- Story 4.1: Set a Todo's Completion Status at the server
- Story 4.2: The checkbox, and the status change it applies before the server answers
- Story 4.3: Build the filter tabs, and make a departing Todo leave visibly
- Story 4.4: Revert a toggle the server refused

## Requirements & Constraints

- **Completion is a set, never a toggle, on the wire.** The endpoint takes the value the user asked for and stores it, so a retry produces the same value rather than flipping a second time. No endpoint's result may depend on current state. A request for a Todo the caller does not own changes nothing and discloses nothing.
- **The change is on screen before the server confirms, and the row never moves.** Ordering is newest-first by id; Completion Status is not a sort key and no secondary sort exists.
- **Filtering is local, instant, and cannot fail.** No request, no loading state, no error state. The selection is not persisted and resets to All on reload, and a successful add forces it to All so a new Todo is never created out of sight — the one create consequence that lands in this epic, because Filter Views do not exist before it.
- **Counts are part of the interface and part of the accessible name.** All three segments carry a count derived from the loaded list; zero renders as `0` and never hides; counts read `0` until the list resolves and update with every optimistic add, toggle and delete.
- **A refused change is as visible as the change was.** The previous status is restored; if the Todo had already departed the view it returns in its original position with the message. `Retry` re-attempts *the status the user asked for*, not a fresh toggle of whatever is current, and if the target no longer exists it does nothing and clears the banner.
- **State coverage and error handling ship inside these stories, not in a later audit** — the failure path, the keyboard route, the announcements and the 44px hit areas belong to the controls built here.
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Filter View`. The word **Done** is banned everywhere — labels, tooltips, identifiers, prose. Filter View names match Completion Status values exactly.
- **User-facing strings are exact.** The toggle-failure message is the shared save string, not a new one; the three tab labels carry their counts; the two empty-state lines for Active and Completed are single lines.

## Technical Decisions

- **`PATCH /api/todos/:id`** takes `{ completed: boolean }` and sets it, returning the updated Todo bare in the shared contract's shape with no envelope. Failures return the shared error envelope with kind `update`. The repository stays the only Drizzle importer and `setTodoCompleted` takes `ownerId` first; the route handler builds no query.
- **The optimistic change is written via `setQueryData` on the single `['todos']` key.** Unlike create, a toggle *may* cancel in-flight reads, because it acts on a row the server already knows about.
- **Rollback reverses only the one row this mutation changed.** Restoring a whole-list snapshot is forbidden — with a second mutation in flight it would undo a change this mutation never made.
- **Filter View is client-only state** and never enters the query cache; no server-derived data lives in `useState`. Counts are derived from the cached list, not stored.
- **Completed-row styling is expressed once.** The row sets a single variant marker and descendants derive from it; no component re-tests Completion Status to pick a colour.
- **Colour steps down on mint, for a measured reason.** A checked checkbox and a focus ring take the standard accent on an Active row and the deepened accent on a Completed one, because the standard accent on mint measures 2.97:1 and fails WCAG 1.4.11. The ring's geometry, blur and opacity are identical in both variants; only the hue changes.
- **Design tokens only.** No hex literal and no arbitrary-value class in any component; a value not in the theme is added there first under its original token name.
- **Every duration comes from the motion module seeded in Epic 2** — the hold and the collapse are named constants there, and `prefers-reduced-motion` is honoured in that one place. No component inlines a duration or reads the media query itself.
- **Announcements go through the single `announce(message, urgency)` function** — toggle and departure politely, errors assertively. No component renders its own live region.
- **The error slot holds one entry**; the failing mutation supplies a retry closure capturing exactly the operation and its arguments, a newer error replaces an older one, and the replaced operation is not retried.
- **Testing:** Vitest for per-entity rollback under concurrent mutations and for count derivation; end-to-end coverage of the forced toggle-failure path belongs to Epic 6.

## UX & Interaction Patterns

- **The checkbox is the only toggle.** One tap or click, two-way; Enter or Space activates it when focused; the row body is not a click target. Its 21px mark is padded to a 44px hit area without changing the mark, and it is first in the tab order within its row.
- **Completion is three simultaneous, redundant cues** — mint fill, filled checkmark, strikethrough, plus the green shadow re-tint — so status is never carried by colour alone, and it is exposed to assistive technology as a checked/unchecked state rather than as decoration.
- **The tabs are an inset segmented control, not a row of buttons** — a recessed track holding three equal-width segments with a raised selected chip, each segment at least 44px tall, each label followed by its count on one line. They occupy the third slot of the existing sticky top block; the block's fixed order is input → banner region → tabs → list and never reorders.
- **Tab order follows reading order:** input → `Retry` when the banner is occupied → All → Active → Completed → then per row, checkbox → delete control.
- **Departure reads as caused.** The row holds in its *new* status for the hold duration, then fades and collapses its height over the collapse duration while the rows below slide up. Under reduced motion it cuts straight to the end state — no hold, fade, collapse or slide-up — and the announcement still fires, so the information the motion carried is not lost. In the All view no departure runs, because the row still matches.
- **An emptied Filter View shows the matching empty-state variant** built in Epic 2 — a centred dashed panel with no button and no control, whose text is announced.
- **Switching Filter View does not scroll the page**; a shorter view simply ends higher.

## Cross-Story Dependencies

- **Story 4.1 is independent** and can run alongside 4.2. **Story 4.3 depends on 4.2** for a toggle to depart from, and **Story 4.4 depends on both** — its revert must undo a departure, not just a status change.
- **Epic 4 and Epic 5 are meant to run in parallel**, which is why each keeps its server endpoint as its own story and why the motion module was seeded early: Epic 5's delete collapse is this epic's departure collapse minus the hold, sharing one constant. Do not create a second duration module.
- **Depends on Epic 3** for the optimistic mutation shape, the retry-closure convention and per-entity rollback — reuse them unchanged rather than inventing a second shape. **Depends on Epic 2** for the row and its completed styling, the sticky block container, the error slot and banner with all four kinds modelled, the empty-state component's three variants, the motion module, the announcer and the `['todos']` hook. **Depends on Epic 1** for the contract, the owner-scoped repository, identity middleware and design tokens.
- **Obligations carried in from earlier work, each becoming actionable here:** the row's Completed status currently reaches assistive technology as nothing at all — the decorative glyph is a placeholder that the real checkbox replaces, and the existing row test asserts the accent-on-Active spelling is *absent*, which this epic's checkbox changes; the sticky block's three-slot ordering is still asserted by a comment regex and converts to an element-order assertion once the tabs fill the last slot; the empty-state variant *selection* has never been exercised, because only the All variant was reachable; the server's failure helper does not structurally tie a status code to its message, and this epic's endpoint is the second caller where that pairing can be designed; the error envelope's `message` field is still unconstrained by anything but precedent; and the lint wall forbidding a stray `useQuery` outside the todos module has no rule yet, which the second hook in that directory makes writable.
- **Beware stale story numbers in older documents and code comments.** The 2026-09-22 consolidation renumbered Epic 4's stories — earlier references to "4.3" usually mean today's 4.2, and "4.4"/"4.5" mean today's 4.3. Fix such references opportunistically in files you are already touching.
- **The epics file spells one contract field in snake_case; the contract wins.** Todo fields are camelCase on the wire.
