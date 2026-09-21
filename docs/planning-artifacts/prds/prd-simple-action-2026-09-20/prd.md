---
title: Simple Action
status: final
created: 2026-09-20
updated: 2026-09-20
---

# PRD: Simple Action

*Name taken from the project configuration; rename freely — no requirement depends on it.*

## 0. Document Purpose

This PRD defines what Simple Action is and what it must do, for the architecture and story-breakdown work that follows. It is written at hobby/learning stakes: short, decision-dense, and deliberately free of technology choices. Vocabulary is fixed in §3 Glossary and used verbatim throughout; Features in §4 group globally-numbered Functional Requirements; inferences are tagged `[ASSUMPTION]` inline and indexed in §10. Its sole source is `docs/input.md`.

## 1. Vision

Simple Action is a personal Todo List that opens to a usable state and asks nothing of the person using it. No sign-up, no tour, no settings. A single screen shows what needs doing; adding, completing, and removing a Todo each take one interaction, and the screen reflects the change before the network does.

The point is not feature coverage — it is that a deliberately small product can still feel finished. Empty, loading, and error states are treated as first-class screens rather than afterthoughts, because they are where most small apps reveal themselves as unfinished. Success is a product that holds up across refreshes, reads clearly on a phone and a laptop, and never leaves the user wondering what just happened.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional** — capture a task in the moment before it is forgotten, and see at a glance what is still outstanding.
- **Functional** — mark work done and get visible confirmation that it registered.
- **Emotional** — trust that the list is still there tomorrow, on the same device, without having managed an account to earn that.
- **Contextual (builder)** — serve as a complete, end-to-end full-stack build small enough to finish and polish rather than abandon.

### 2.2 Key User Journeys

- **UJ-1. Dana clears the morning list from her phone.**
  Dana opens Simple Action on her phone with four Todos from yesterday, three Active and one Completed. The list renders immediately. She taps the checkbox on "book dentist" — it moves to Completed styling instantly, before the server confirms. She taps the **Active** filter to hide the noise and sees two items left. She closes the tab. **Edge case:** if the network is down when she taps, the Todo reverts to Active and an error message explains the change did not save.

- **UJ-2. Sam adds a task at a laptop and finds it after a refresh.**
  Sam is mid-work, types "send invoice" into the input at the top, and presses Enter. The Todo appears at the top of the list and the input clears, ready for the next one. He reloads the page an hour later; "send invoice" is still there. **Edge case:** he presses Enter on an empty input — nothing is created and nothing breaks.

- **UJ-3. Dana removes something she no longer needs.**
  Dana taps delete on a stale Todo. A confirmation dialog asks her to confirm, she accepts, and the Todo disappears from the list. Choosing cancel leaves the list untouched. **Edge case:** if the deletion fails, the Todo returns to the list and an error message explains that it was not removed.

## 3. Glossary

- **Todo** — a single task. Has text, a Completion Status, and a creation timestamp. Belongs to exactly one Todo List.
- **Todo List** — the ordered collection of all Todos belonging to one Client Identity. Exactly one per Client Identity.
- **Completion Status** — a Todo's state: either **Active** or **Completed**. Every Todo has exactly one, and it can change in both directions.
- **Active** — Completion Status of a Todo not yet done.
- **Completed** — Completion Status of a Todo marked done.
- **Client Identity** — an anonymous identifier held by one browser, used to key a Todo List server-side. Not a user account; carries no credentials and no personal data.
- **Filter View** — which subset of the Todo List is displayed: **All**, **Active**, or **Completed**. Filter View names match Completion Status values exactly; no synonym ("Done") is used anywhere, including in interface copy.

## 4. Features

### 4.1 Todo Capture

**Description:** A single always-visible text input at the top of the screen creates Todos. Submitting adds the Todo to the top of the Todo List, clears the input so consecutive capture needs no extra interaction, and returns the Filter View to All so the new Todo is never created out of sight. A new Todo is always Active. Realizes UJ-2.

**Functional Requirements:**

#### FR-1: Create a Todo

A user can create a Todo by entering text and submitting it. Realizes UJ-2.

**Consequences (testable):**
- A submitted Todo appears in the Todo List without a page reload.
- The created Todo has Completion Status Active and a creation timestamp set by the server.
- The input clears on successful submission and retains focus.
- Creating a Todo sets the Filter View to All, so a newly created Todo is always visible regardless of which Filter View was active.
- Text consisting only of whitespace is rejected; no Todo is created and no error state is shown. `[ASSUMPTION: silent no-op is preferable to an error message for an obvious mis-press.]`
- Text is accepted up to 500 characters; longer input is prevented at entry. `[ASSUMPTION: no length limit was specified.]`

**Out of Scope:** due dates, priority, tags, notes, attachments, sub-tasks.

### 4.2 Todo List and Status

**Description:** The Todo List renders on load, newest first, with Completed Todos visually distinct from Active ones at a glance. Completion is a two-way toggle. Filter Views narrow the list to All, Active, or Completed. Realizes UJ-1.

**Functional Requirements:**

#### FR-2: View the Todo List

A user can see their Todo List immediately on opening the application, with no sign-in or onboarding step. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Todos are ordered newest-first by creation timestamp. `[ASSUMPTION: ordering was unspecified.]`
- A Completed Todo is visually distinguishable from an Active one without reading the text.
- With no Todos, an empty state is shown that explains how to add the first one.
- While the Todo List is loading, a loading state is shown rather than a blank screen or a flash of the empty state.
- If loading fails, an error state is shown with a way to retry.

#### FR-3: Toggle Completion Status

A user can change a Todo's Completion Status from Active to Completed and back. Realizes UJ-1.

**Consequences (testable):**
- Toggling updates the on-screen Completion Status before the server confirms.
- A failed toggle reverts the on-screen Completion Status and surfaces an error message.
- A toggled Completion Status survives a page reload.
- When the toggle makes a Todo no longer match the active Filter View, the Todo leaves that view immediately, via a brief transition that reads as departure rather than as the item vanishing.
- A toggle that fails while the Todo has already left the view returns it to the list along with the error message.

#### FR-4: Filter the Todo List

A user can switch the Filter View between All, Active, and Completed. Realizes UJ-1.

**Consequences (testable):**
- **All** shows every Todo; **Active** shows only Active Todos; **Completed** shows only Completed Todos.
- Switching Filter View requires no network request.
- Each Filter View has its own empty state (e.g. Completed with nothing completed yet).
- Filter View resets to All on reload. `[ASSUMPTION: persisting the selection was not requested and adds state for little gain.]`

**Notes:** `[NOTE FOR PM]` Filter Views add navigation to a product whose pitch is zero onboarding. At three-to-five Todos they earn nothing; they earn their place only once lists get long. Worth revisiting if the interface starts to feel heavier than the problem.

### 4.3 Todo Removal

**Description:** A Todo can be removed permanently. Because there is no undo, removal is guarded by an explicit confirmation step. Realizes UJ-3.

**Functional Requirements:**

#### FR-5: Delete a Todo

A user can delete a Todo after confirming the action. Realizes UJ-3.

**Consequences (testable):**
- Triggering delete opens a confirmation dialog naming the action; the Todo is not removed until the user confirms.
- Canceling closes the dialog and leaves the Todo List unchanged.
- Confirming removes the Todo from the Todo List and the deletion survives a reload.
- A failed deletion restores the Todo on screen and surfaces an error message.
- Deletion works on Todos in either Completion Status.

**Notes:** `[NOTE FOR PM]` A confirmation dialog on every delete is the safest option but the slowest-feeling one, and it sits against the "instantaneous" goal. An undo affordance would trade a modal for a few seconds of client state.

### 4.4 Session Continuity

**Description:** A Todo List persists server-side and is reachable again by the same browser without any account. The browser holds a Client Identity; the server holds the data. This keeps lists personal without building authentication, and leaves the door open to real accounts later. Realizes UJ-2.

**Functional Requirements:**

#### FR-6: Persist a Todo List across sessions

A user's Todo List is durable across page reloads and browser sessions on the same browser. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- All Todos and their Completion Statuses are unchanged after a reload.
- All Todos and their Completion Statuses are unchanged after closing and reopening the browser.
- A browser with no Client Identity is issued one on first use and sees an empty Todo List.
- A different browser or device sees a different, independent Todo List.

**Notes:** `[NOTE FOR PM]` Clearing browser storage orphans the Todo List with no recovery path. Acceptable at these stakes and the direct cost of having no accounts — but it is the single sharpest edge in the product, and the reason accounts are the most likely v2 addition.

## 5. Cross-Cutting NFRs

- **Perceived responsiveness** — create, toggle, and delete reflect on screen immediately, with the server reconciled behind the interaction. A failed request reverts the change and explains itself.
- **Surfaces** — one responsive web interface usable on phone and desktop. No native applications. `[ASSUMPTION: responsive web, inferred from "works across desktop and mobile devices".]`
- **State coverage** — empty, loading, and error states exist for every view that can be empty, slow, or fail. These are acceptance criteria, not polish.
- **Error handling** — failures are handled on both client and server and never leave the interface stuck or silently wrong.
- **Extensibility** — the design must not preclude adding authentication and multi-user support later. This is a constraint on structure, not a requirement to build either.
- **Maintainability and deployability** — a README takes a developer new to the codebase from clone to a running application in under five minutes with no undocumented steps, and states how to deploy it. This is the testable form of `input.md`'s "easy to understand, deploy, and extend".

## 6. Non-Goals (Explicit)

- Not a collaboration tool. No sharing, assignment, or multi-user lists.
- Not a planner. No due dates, reminders, recurrence, or notifications.
- Not a task organizer. No projects, tags, priority, search, or sort controls.
- Not an account system. No sign-up, sign-in, password reset, or profile.
- Not offline-capable. The application requires a network connection to load and change data.

## 7. MVP Scope

### 7.1 In Scope

- Create a Todo (FR-1)
- View the Todo List with empty, loading, and error states (FR-2)
- Toggle Completion Status in both directions (FR-3)
- Filter View: All / Active / Completed (FR-4)
- Delete with confirmation (FR-5)
- Per-browser server-side persistence (FR-6)
- Responsive layout for phone and desktop

### 7.2 Out of Scope for MVP

- **Editing a Todo's text** — delete and re-add instead. `[NOTE FOR PM]` This is the most likely first regret: combined with the confirmation dialog, fixing a typo becomes a three-interaction operation. First candidate for v2.
- **User accounts / authentication** — deferred to v2. Its absence is why a cleared browser loses the list.
- **Undo for deletion** — deferred pending the §9 Q1 decision on whether undo should replace the confirmation dialog rather than sit alongside it.
- **Offline support and sync** — deferred indefinitely; no conflict-resolution story at this scope.
- **Persisted Filter View, drag-to-reorder, bulk actions ("clear completed")** — deferred; each adds interface weight the current list size does not justify.

## 8. Success Metrics

**Primary**
- **SM-1**: A first-time user completes add, complete, and delete without instruction and without backtracking — no undone actions, no hunting for a control. Validates FR-1, FR-3, FR-5.
- **SM-2**: The Todo List is identical after reload and after a browser restart, every time. Validates FR-6.

**Secondary**
- **SM-3**: Every view that can be empty, slow, or fail has a designed state for it — no blank screens, no spinners without end, no silent failures. Validates FR-2.
- **SM-4**: The interface is usable one-handed on a phone and comfortable on a desktop, with no horizontal scrolling. Validates FR-2, FR-4.

**Counter-metrics (do not optimize)**
- **SM-C1**: Feature count. Adding capability to make the product feel more substantial defeats its premise. Counterbalances SM-1.
- **SM-C2**: Time-in-app or session length. A todo app succeeds when the user leaves quickly. Counterbalances SM-1.

## 9. Open Questions

1. Should the confirmation dialog be reconsidered in favor of an undo affordance once the interaction is felt in a real build? (See FR-5 notes.)
2. Is 500 characters the right ceiling for Todo text, or should the input be visibly single-line and shorter?
3. Should Filter Views ship in v1 at all, or wait until lists are long enough to need them? (See FR-4 notes.)
4. Does anything need to happen when a Client Identity is lost, or is silent orphaning acceptable?

## 10. Assumptions Index

- §4.1 FR-1 — Whitespace-only input is a silent no-op rather than a validation error.
- §4.1 FR-1 — Todo text is capped at 500 characters; no limit was specified.
- §4.2 FR-2 — Todo List is ordered newest-first; ordering was unspecified.
- §4.2 FR-4 — Filter View resets to All on reload rather than persisting.
- §5 — Delivery is a single responsive web interface, inferred from "works across desktop and mobile devices".
