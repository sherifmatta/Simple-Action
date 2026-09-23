# Epic 3 Context: Capture a Todo

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make capture real. A user types a Todo, presses Enter, and it is at the top of the list before the server has answered — the input cleared and still holding focus, ready for the next one without a second interaction. Whitespace-only submits do nothing and break nothing. Typing stops at 500 characters, with a counter that has been counting down since 450 so the stop is never mysterious. If the add fails, the text comes back to the input rather than being lost. Reload an hour later and the Todo is still there — the first point at which durable persistence is observable rather than merely built. This epic also establishes the optimistic mutation shape that Epics 4 and 5 reuse unchanged, and it holds the hardest problem in the build: a create must not cancel the in-flight list query, and the arriving list merges by id.

## Stories

- Story 3.1: Accept and validate a new Todo at the server
- Story 3.2: Build the add input
- Story 3.3: Add a Todo optimistically, and merge the list that arrives
- Story 3.4: Return the user's text when an add fails

## Requirements & Constraints

- **Creation is the whole of this epic's user-visible scope.** Nothing here toggles, deletes, or filters. A created Todo is Active with a server-set creation timestamp, and it appears without a page reload.
- **Validation is defined once and enforced twice.** Trim; reject empty after trimming; cap at 500 characters. The client enforces at entry so the ceiling is never reached by surprise; the server re-enforces as a trust boundary, because the API must be safe against a caller that is not our interface. The predicate and the constants are imported from the shared contract, never retyped on either side.
- **A retry must produce one Todo, not two.** The client mints the id and sends it; the server never generates one. A create for an id that already exists and belongs to the same owner returns the existing row unchanged with `200`. One that belongs to a different owner returns `409` and discloses nothing about the row.
- **Failures are recoverable in place and cost the user nothing they typed.** A failed add removes only its own optimistic row and returns the submitted text to the input with the caret at the end; the input is not cleared again until the add succeeds. `Retry` re-creates the same Todo, with the same id, using the text now in the input.
- **A whitespace-only submit is a mis-press, not an error.** Nothing is created, no error state, no banner, no shake — and the input is *not* cleared.
- **No Todo text appears in any server log line.**
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Client Identity`, `Filter View`. The word **Done** is banned everywhere, identifiers and tooltips included.
- **User-facing strings are exact.** The add-failure message is its own string, distinct from the save string, because an add is a creation that never completed rather than a change that reverted.

## Technical Decisions

- **`POST /api/todos`** takes a client-supplied id and text, returns the created Todo bare with no envelope in the shared contract's shape, and returns `401` without ever issuing an identity. Validation failures return the shared error envelope with kind `create`.
- **The repository stays the only Drizzle importer.** `createTodo` takes `ownerId` first; the route handler builds no query.
- **Ids are lowercase canonical UUIDv7, minted through a single monotonic generator instance** using the real `uuidv7` package — the hand-written stand-in currently in the codebase must go, or the two generators drift. Because ids are time-ordered and every read and render sorts by `id DESC`, an optimistic row's position is final from the moment it is minted and nothing re-sorts on reconciliation. A test must assert that two ids from the product's own minting function compare in time order under that sort.
- **The optimistic insert is written via `setQueryData` on the single `['todos']` key**, and **the create must not cancel the list query** — the documented TanStack Query optimistic recipe opens by cancelling in-flight queries, and here that deletes the user's Todo.
- **The arriving list is merged into the cache by id**, never wholesale-replaced while an unconfirmed create exists: server rows take their place, an optimistic row whose id is absent is kept, and an id present in both collapses to one entry carrying the server record. Confirmation reconciles identity silently — no flash, no re-sort, no position change.
- **Rollback reverses only the entity this mutation changed.** Restoring a whole-list snapshot is forbidden, because with a concurrent mutation in flight it would undo a change this mutation never made.
- **Errors are classified by the operation attempted, not by the response shape**, so a transport failure with no response is still kind `create`. The error slot holds one entry; a newer error replaces an older one and the replaced operation is not retried. The banner clears when the retried operation succeeds or on a later success *of the same kind*.
- **Announcements go through the one `announce(message, urgency)` function** — a successful add is polite, errors are assertive. No component renders its own live region.
- **Design tokens only.** No hex literal and no arbitrary-value class in any component; a value not in the theme is added there first under its original token name. Durations come from the motion module, never inlined.
- **Testing:** Vitest for the validation predicate, the merge-by-id reconciliation, and per-entity rollback under concurrent mutations. Write the add-during-load test first. End-to-end coverage of the race belongs to Epic 6.

## UX & Interaction Patterns

- **The input sits in the sticky top block at the top of the card** — placed into the existing container, never re-implementing stickiness. It is interactive from first paint: never disabled, never read-only, never waiting on the Todo List, including while skeletons show.
- **Enter submits; the input clears and keeps focus.** Focus is never moved to the new row, because moving it breaks the type-Enter-type rhythm that makes capture one interaction.
- **Autofocus is decided by device capability, not viewport width** — on pointer devices yes, on touch no, where it would raise the software keyboard and bury the list the user came to read.
- **Visual spec:** card fill, 1.5px control border, medium radius, row shadow, a thin accent plus glyph leading, placeholder `what needs doing?` in the placeholder colour, entered text in primary at the `input-text` role, focus-within painting the ring. A pill `Enter` hint sits at the trailing edge at pointer widths only — a hint, not a button, and not in the tab order.
- **The character counter is a bare numeral** in `counter` type at the trailing edge, absent below 450, fading in there and counting down to `0` at the ceiling. It never takes the danger ramp. **Nothing about the interface changes at exactly 500** — keystrokes simply stop producing characters, and the count reaching `0` is the whole explanation.
- **Add during initial load:** the optimistic row renders immediately *above* the still-pulsing skeletons and does not pulse itself, because it is real. If the *load* then fails while it is on screen, the row stays, the banner reports the load failure, and `Retry` re-requests the list, which merges the same way.
- **Tab order and reach:** the input is first in the tab order, ahead of `Retry` and the filter tabs, with a hit area of at least 44px in both dimensions.

## Cross-Story Dependencies

- **Story 3.1 is independent** and can be built alongside 3.2. **Story 3.3 needs both** — the endpoint to confirm against and the input to submit from. **Story 3.4 builds on 3.3's mutation** and is the first story in the product to raise a second error kind.
- **Depends on Epic 2** for the sticky block container, the persistent list region and its skeletons, the error slot with all four kinds already modelled and its banner, the motion module, the `announce` function, the `['todos']` query hook, and the card and scroll model. Depends on Epic 1 for the shared contract, the owner-scoped repository, the identity middleware, the query client, and the design tokens.
- **The Filter-View-to-All consequence of a create belongs to Epic 4**, which is where the Filter Views first exist. Do not build a filter here.
- **Epics 4 and 5 reuse this epic's optimistic mutation shape unchanged**, so its seams — per-entity rollback, retry closure capture, merge behaviour — are being set for three epics, not one.
- **Obligations carried in from earlier work**, each becoming reachable for the first time here: the loading branch is keyed on a signal that goes false the moment an optimistic row enters the cache, so keeping skeletons pulsing beneath one needs a different signal; the error slot's raise-and-clear guards are only correct while a single kind exists and need a kind-aware transition once a second kind can displace the first; the gap above the banner region and the sticky block's own top and gutter padding become visible once the input fills the block's first slot, and neither value exists as a token yet; focus after `Retry` is activated currently drops, and the input is the first focusable neighbour that could take it; and what may appear in the error envelope's `message` is still unconstrained by anything but precedent.
- **Confirm `DATABASE_URL` is current before trusting Story 3.1's repository tests** — the live-branch repository tests were last seen failing on stale credentials, an inherited condition rather than a defect in the code under test.
