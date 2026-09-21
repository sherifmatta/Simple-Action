---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/prd.md"
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/addendum.md"
  - "{planning_artifacts}/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md"
  - "{planning_artifacts}/architecture/architecture-simple-action-2026-09-21/SOLUTION-DESIGN.md"
  - "{planning_artifacts}/architecture/architecture-simple-action-2026-09-21/WORK-SPLIT.md"
  - "{planning_artifacts}/ux-designs/ux-simple-action-2026-09-20/DESIGN.md"
  - "{planning_artifacts}/ux-designs/ux-simple-action-2026-09-20/EXPERIENCE.md"
---

# Simple Action - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Simple Action, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Vocabulary is fixed by PRD §3 Glossary and used verbatim throughout, in code as well as copy: `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Client Identity`, `Filter View`. The word **Done** is banned everywhere, including in these stories.

## Requirements Inventory

### Functional Requirements

Six functional requirements, numbered as in the PRD. Each carries its testable consequences, because those consequences are the raw material for acceptance criteria.

**FR-1: Create a Todo** — A user can create a Todo by entering text and submitting it. (Realizes UJ-2)
- A submitted Todo appears in the Todo List without a page reload.
- The created Todo has Completion Status Active and a creation timestamp set by the server.
- The input clears on successful submission and retains focus.
- Creating a Todo sets the Filter View to All, so a newly created Todo is always visible regardless of which Filter View was active.
- Text consisting only of whitespace is rejected; no Todo is created and no error state is shown.
- Text is accepted up to 500 characters; longer input is prevented at entry.
- Out of scope: due dates, priority, tags, notes, attachments, sub-tasks.

**FR-2: View the Todo List** — A user can see their Todo List immediately on opening the application, with no sign-in or onboarding step. (Realizes UJ-1, UJ-2)
- Todos are ordered newest-first by creation timestamp.
- A Completed Todo is visually distinguishable from an Active one without reading the text.
- With no Todos, an empty state is shown that explains how to add the first one.
- While the Todo List is loading, a loading state is shown rather than a blank screen or a flash of the empty state.
- If loading fails, an error state is shown with a way to retry.

**FR-3: Toggle Completion Status** — A user can change a Todo's Completion Status from Active to Completed and back. (Realizes UJ-1)
- Toggling updates the on-screen Completion Status before the server confirms.
- A failed toggle reverts the on-screen Completion Status and surfaces an error message.
- A toggled Completion Status survives a page reload.
- When the toggle makes a Todo no longer match the active Filter View, the Todo leaves that view immediately, via a brief transition that reads as departure rather than as the item vanishing.
- A toggle that fails while the Todo has already left the view returns it to the list along with the error message.

**FR-4: Filter the Todo List** — A user can switch the Filter View between All, Active, and Completed. (Realizes UJ-1)
- **All** shows every Todo; **Active** shows only Active Todos; **Completed** shows only Completed Todos.
- Switching Filter View requires no network request.
- Each Filter View has its own empty state.
- Filter View resets to All on reload.

**FR-5: Delete a Todo** — A user can delete a Todo after confirming the action. (Realizes UJ-3)
- Triggering delete opens a confirmation dialog naming the action; the Todo is not removed until the user confirms.
- Canceling closes the dialog and leaves the Todo List unchanged.
- Confirming removes the Todo from the Todo List and the deletion survives a reload.
- A failed deletion restores the Todo on screen and surfaces an error message.
- Deletion works on Todos in either Completion Status.

**FR-6: Persist a Todo List across sessions** — A user's Todo List is durable across page reloads and browser sessions on the same browser. (Realizes UJ-1, UJ-2)
- All Todos and their Completion Statuses are unchanged after a reload.
- All Todos and their Completion Statuses are unchanged after closing and reopening the browser.
- A browser with no Client Identity is issued one on first use and sees an empty Todo List.
- A different browser or device sees a different, independent Todo List.

### NonFunctional Requirements

Six cross-cutting NFRs from PRD §5. Each is a testable requirement, not a sentiment.

**NFR-1: Perceived responsiveness** — Create, toggle, and delete reflect on screen immediately, with the server reconciled behind the interaction. A failed request reverts the change and explains itself.

**NFR-2: Surfaces** — One responsive web interface usable on phone and desktop. No native applications.

**NFR-3: State coverage** — Empty, loading, and error states exist for every view that can be empty, slow, or fail. These are acceptance criteria, not polish.

**NFR-4: Error handling** — Failures are handled on both client and server and never leave the interface stuck or silently wrong. Errors are recoverable in place; nothing dead-ends.

**NFR-5: Extensibility** — The design must not preclude adding authentication and multi-user support later. This is a constraint on structure, not a requirement to build either.

**NFR-6: Maintainability and deployability** — A README takes a developer new to the codebase from clone to a running application in under five minutes with no undocumented steps, and states how to deploy it.

#### Success Metrics (acceptance targets these NFRs serve)

- **SM-1**: A first-time user completes add, complete, and delete without instruction and without backtracking. (Validates FR-1, FR-3, FR-5)
- **SM-2**: The Todo List is identical after reload and after a browser restart, every time. (Validates FR-6)
- **SM-3**: Every view that can be empty, slow, or fail has a designed state for it — no blank screens, no spinners without end, no silent failures. (Validates FR-2)
- **SM-4**: The interface is usable one-handed on a phone and comfortable on a desktop, with no horizontal scrolling. (Validates FR-2, FR-4)
- **Counter-metrics (do not optimize)**: SM-C1 feature count; SM-C2 time-in-app.

### Additional Requirements

From `ARCHITECTURE-SPINE.md`. These are binding constraints on how stories are implemented, not optional guidance — the spine wins on conflict with `SOLUTION-DESIGN.md`.

**🚨 AR-1: Starter template — none is named.** The Architecture specifies a stack but no starter or greenfield template. `WORK-SPLIT.md` story 0.1 says only "Scaffold Next.js 16 / React 19 / TypeScript 6; strict mode". The implied greenfield path is Next.js's own scaffold (`create-next-app`) with the stack pins in AR-19 applied afterward. **This affects Epic 1 Story 1 and needs confirmation.**

**Architectural decisions (AD-1 … AD-17):**

- **AR-2 (AD-1)**: Every client–server interaction goes through a REST route handler under `app/api/`. Server Actions are not used anywhere in this codebase.
- **AR-3 (AD-2)**: Only modules under `src/server/repository/` may import the Drizzle client. Route handlers call repository functions and never build queries. Every repository function takes `ownerId` as its first parameter.
- **AR-4 (AD-3)**: `src/shared/contract/` is the single definition of the Todo JSON shape, the error envelope, and the validation constants. Neither side declares its own Todo type; no type is duplicated across the crossing.
- **AR-5 (AD-4)**: The client mints a UUIDv7 and sends it in the create request body. The server validates it is a well-formed UUIDv7 and never generates one. On primary-key conflict: same owner returns the existing row with `200` (idempotent retry); different owner returns `409` and discloses nothing.
- **AR-6 (AD-5)**: Every list read and every render orders by `id DESC`. `created_at` is server-set and is never a sort key. Todo ids are minted through a single monotonic generator instance.
- **AR-7 (AD-6)**: `PATCH /api/todos/:id` takes `{ "completed": boolean }` and sets that value. There is no toggle endpoint. `DELETE /api/todos/:id` returns `204` whether or not the row was present, provided the caller owns it.
- **AR-8 (AD-7)**: Client Identity is a 256-bit random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie with a long `Max-Age`. Only its SHA-256 hash is stored, in `client_identity.token_hash`. `todo.owner_id` references `client_identity.id`, never the token. The token authorizes nothing beyond its own Todo List and must never be used as, or extended into, authentication.
- **AR-9 (AD-8)**: TanStack Query owns all server state and all optimistic mutation. Exactly one query key, `['todos']`. Every mutation applies its optimistic change via `setQueryData` and, on error, **reverses only the entity it changed**. Rollback by restoring a whole-list snapshot is forbidden. No server-derived data is ever held in `useState`; client-only state (Filter View, dialog open, character count) is React state and never enters the query cache.
- **AR-10 (AD-9)**: A single error slot holds `{ kind, retry } | null`. The failing mutation supplies the `retry` closure, capturing exactly the operation that failed and its arguments. A newer error replaces an older one and the replaced operation is not retried. When the closure's target no longer exists, invoking it is a no-op that clears the slot.
- **AR-11 (AD-10)**: Every non-2xx response body is `{ "error": { "kind", "message" } }` with `kind` one of `load`, `create`, `update`, `delete`. A transport failure is classified by the operation attempted, not by the response. The client maps `kind` to the user-facing string and never composes or forwards a server message to the interface.
- **AR-12 (AD-11)**: Validation is defined once and enforced twice. Trim; reject empty-after-trim; cap at 500 characters. Constants and predicate live in `src/shared/contract/` and are imported, never retyped. The client enforces at entry; the server re-enforces as a trust boundary and returns error kind `create` on violation.
- **AR-13 (AD-12)**: Exactly one polite live region and one assertive live region are mounted at the app root. Components announce by calling a single `announce(message, urgency)` function. No component renders its own `aria-live` attribute.
- **AR-14 (AD-13)**: `DESIGN.md`'s frontmatter is transcribed into the Tailwind v4 `@theme` block in `app/globals.css` and nowhere else. No hex literal and no arbitrary-value class appears anywhere else in the codebase.
- **AR-15 (AD-14)**: `drizzle-kit generate` produces SQL migration files that are committed to the repository, and the deploy step applies them. `drizzle-kit push` is local-only and never targets preview or production.
- **AR-16 (AD-15)**: Deletion is permanent. `DELETE` removes the row. There is no soft-delete column and no query filters on deletion state.
- **AR-17 (AD-16)**: A create must not cancel the list query. The list response is **merged into the cache by id** — server rows take their place, an unconfirmed optimistic row whose id is absent is kept, and an id present in both collapses to one entry carrying the server record. Toggle and delete *may* cancel in-flight reads.
- **AR-18 (AD-17)**: Next.js middleware issues the identity cookie on the **document** request, before any API call is possible. Route handlers read the identity and never mint one; a request arriving without a valid identity returns `401`. No API route is an identity-issuing path.

**Infrastructure, structure, and conventions:**

- **AR-19: Stack pins.** Node.js 24 LTS · Next.js 16.3.x · React 19.3 · TypeScript 6.x · TanStack Query 5.103.x · Tailwind CSS 4.3.x · Drizzle ORM 0.45.x · Drizzle Kit 0.31.x · uuidv7 1.2.x · PostgreSQL (Neon) 18 · Vitest 5.x · Playwright 1.62.x. Two pins are deliberate departures from latest: TypeScript 6.x (not 7.0.2) and Drizzle 0.45.x (not the 1.0 beta).
- **AR-20: Source tree.** `middleware.ts`; `app/` (`layout.tsx`, `page.tsx`, `globals.css`, `api/todos/route.ts`, `api/todos/[id]/route.ts`); `src/shared/contract/`; `src/client/{todos,feedback,components}/`; `src/server/{identity,repository,db}/`; `drizzle/`; `e2e/`. Layers map to directories one-to-one.
- **AR-21: API surface.** `GET /api/todos` (caller's Todo List, `id DESC`, requires identity, never issues one) · `POST /api/todos` (client-supplied UUIDv7, idempotent) · `PATCH /api/todos/:id` (set `completed`, idempotent) · `DELETE /api/todos/:id` (permanent, idempotent).
- **AR-22: Data model.** Two tables. `client_identity` (uuid id PK, text token_hash UK, timestamptz created_at) and `todo` (uuid id PK, uuid owner_id FK, text text, boolean completed, timestamptz created_at). One index beyond the primary keys: `(owner_id, id DESC)`.
- **AR-23: Environments.** Three, identical in shape — local, Vercel preview (per pull request), production. Each points at its own Neon branch via `DATABASE_URL`. Local development needs no Docker and no database install. `DATABASE_URL` is the sole required secret; no config file holds a secret and no secret has a committed default.
- **AR-24: Dependency graph is closed.** No UI component calls `fetch`; no route handler imports Drizzle; nothing on the server imports from `src/client`. No arrow may be added to the graph without a new AD.
- **AR-25: Lint enforcement.** A lint rule forbids `fetch` in components and Drizzle imports outside the repository, because one deployable makes the client/server boundary a convention rather than a wall.
- **AR-26: Consistency conventions.** Files and directories kebab-case; React components PascalCase, one per file; hooks `useX`; repository functions verb-first and owner-scoped (`listTodos(ownerId)`). UUIDv7 lowercase canonical form on the wire and in the database. `timestamptz` in Postgres, ISO-8601 UTC on the wire, server-set only. `camelCase` on the wire, `snake_case` in the database, mapped by Drizzle's schema alone. Success responses are the bare resource or a bare array — no envelope. TypeScript `strict: true`, no `any` in `src/shared/contract/`. Server-side `console` logging via the platform log drain, with no Todo text in any log line.
- **AR-27: Motion constants.** Every duration in `EXPERIENCE.md` — the ~400ms hold, the ~180ms collapse, the ~600ms nudge, the 1400ms skeleton pulse — is a named constant in one motion module, and `prefers-reduced-motion` is honoured in that one place. No component reads the media query itself or inlines a duration. **The module is seeded complete in Epic 2**, with all four constants and the reduced-motion branch, even though Epics 4 and 5 are the consumers of three of them — because those two epics run in parallel and would otherwise race to create it.
- **AR-28: Completed-row styling is expressed once.** The row sets a single variant marker and every descendant derives from it. No component re-tests Completion Status to pick a colour.
- **AR-29: Fonts.** Poppins is loaded through `next/font` with the `DESIGN.md` fallback stack, so the metric-adjusted fallback prevents the layout shift the zero-shift skeleton requirement depends on.
- **AR-30: First-run nudge flag.** One named `localStorage` key, written in one place. Spent only after a successful load has rendered at least one row, and spent even when reduced motion suppresses the animation.
- **AR-31: Test tooling.** Vitest for unit work (validation predicate, merge-by-id reconciliation, per-entity rollback under concurrent mutations). Playwright for end-to-end, **with route interception**, covering UJ-1 through UJ-4 plus the four forced failure paths and the add-during-load race. This is in scope rather than optional, because the optimistic layer is the product's complexity concentrated.

### UX Design Requirements

From the `DESIGN.md` / `EXPERIENCE.md` spine pair. The UX contract is a first-class input: every item below is specific enough to carry testable acceptance criteria. There is nothing in either document labelled optional.

**Design tokens and visual foundations**

- **UX-DR1**: Transcribe the complete `DESIGN.md` frontmatter into the Tailwind v4 `@theme` block — 22 colour tokens, 10 typography roles, 4 radii (`sm` 7px, `md` 14px, `lg` 18px, `full` 999px), the 4/6/9/12/14/18/22/32px spacing scale plus 6 named structural tokens, and 12 component recipes. A value not present in `@theme` must be added there, with its `DESIGN.md` token name, before it can be used.
- **UX-DR2**: Load Poppins via `next/font` with the fallback stack `"Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif`, metric-adjusted so the fallback does not shift layout.
- **UX-DR3**: Implement exactly two shadow recipes — card shadow (card and delete dialog) and row shadow (every Todo row, the add input, the skeleton row) — plus the green re-tint `0 8px 22px -14px rgba(37,74,58,.34)` for a Completed row, and the two filter-tab inset shadows. Shadows are tinted with the ground's blue-violet, never neutral black. Elevation never encodes state.
- **UX-DR4**: Implement the focus ring as a soft glow (`0 0 0 1px accent, 0 0 0 5px rgba(38,128,235,.30)`) with exactly one variant: on a Completed row it takes `accent-deep`. Geometry, blur and opacity are identical in both; only the hue value steps down. The ring never changes the size of the element it surrounds and is never suppressed for aesthetics.

**Components (12, each with its own visual spec)**

- **UX-DR5**: `card` — the one container, `rounded.lg`, card shadow, 640px max width, centred on the ground.
- **UX-DR6**: `todo-row-active` — white fill, `rounded.md`, row shadow, 14px padding, 12px checkbox-to-text gap, 44px minimum height, text wraps to as many lines as needed.
- **UX-DR7**: `todo-row-completed` — identical geometry to Active; three simultaneous state changes (mint fill, filled checkmark, 1.5px line-through in `text-completed`) plus the green shadow re-tint. Three redundant cues so status is never carried by colour alone.
- **UX-DR8**: `checkbox` — 21px square, `rounded.sm`, 1.75px `border-control` when unchecked. Checked fill and border take `accent` on an Active row and `accent-deep` on a Completed row. Hit area padded to 44px in both dimensions without changing the mark.
- **UX-DR9**: `input-add` — pinned at the top, 1.5px `border-control`, `rounded.md`, row shadow, leading accent plus glyph, placeholder in `text-placeholder`. A pill `Enter` hint at the trailing edge on pointer-width viewports only; it is a hint, not a button, and is not in the tab order.
- **UX-DR10**: `filter-tabs` — an inset segmented control, not a row of buttons. Recessed track, three equal-width segments, raised selected chip. Each segment at least 44px tall. **All three segments carry a count** (`All 4`, `Active 2`, `Completed 2`); a count of zero renders as `0` and never hides.
- **UX-DR11**: `error-banner` — one fixed region directly under the input, present in the layout whether or not occupied, so appearing does not shift the list. Clay/terracotta ramp, leading line icon, message, trailing pill `Retry`.
- **UX-DR12**: `dialog-delete` — centred modal on a `rgba(36,36,58,.32)` scrim. Two pill buttons, each at least 44px tall: Cancel transparent with a `border-control` edge; Delete a solid `danger-fill` with a white label — the only filled button in the product. No third button, no checkbox, no "don't ask again".
- **UX-DR13**: `skeleton-row` — exact geometry of `todo-row-active` (same fill, radius, padding, shadow, minimum height). Three of them, staggered, pulsing from `hairline` toward `tab-track` over 1400ms. Zero layout shift when real content lands.
- **UX-DR14**: `empty-state` — a centred 1.5px dashed `hairline` panel holding a 40px mint ring with an 18px line glyph (a plus on All, a check on Active and Completed), then the first line, then an optional second line. It carries no button and no control.
- **UX-DR15**: `char-counter` — a bare numeral in `counter` type at the input's trailing edge. Absent below 450, fades in at 450, counts down to `0` at the 500 ceiling. Never takes the danger ramp.
- **UX-DR16**: `delete-action` — two presentations of one action: a trailing hover line icon on pointer, and a solid `danger-fill` panel revealed by leftward swipe on touch. Both at least 44px. Both take the `-on-complete` focus ring on a Completed row.

**Layout, scroll, and stickiness**

- **UX-DR17**: One column at every breakpoint. Card capped at 640px and centred on the ground; below 640px it fills the viewport less 18px each side. No breakpoint makes the layout multi-column, grows a sidebar, or gains a second region.
- **UX-DR18**: Fixed vertical order inside the card, which never reorders: add input → error banner region → filter tabs → list. Nothing sits above the input — no wordmark, no title bar, no greeting. The product name appears in the browser tab title only.
- **UX-DR19**: Scroll model — exactly one scrolling element, the page body. The card has no fixed height and no inner scroll region; it grows downward and the page scrolls. Nothing is added to cue "more below" — no fade, no inner shadow, no scrollbar of its own.
- **UX-DR20**: Sticky top block — the add input, the error banner region and the filter tabs detach from the card's flow and hold at the top of the viewport while the list scrolls underneath them on an opaque `card` surface. The list is the only part of the card that moves.
- **UX-DR21**: **WCAG 2.4.11 Focus Not Obscured (AA)** — set `scroll-padding-top`, and `scroll-margin-top` on focusable row descendants, to at least the rendered height of the whole sticky block, **measured live rather than hard-coded**, because the banner region's occupancy changes that height. A focused control must never be even partially covered, at every scroll position and in every Filter View.
- **UX-DR22**: No horizontal scrolling on the page body, ever, at any viewport width. Todo text wraps and the row grows; nothing truncates with an ellipsis and nothing clips.

**Designed states (every one is an acceptance criterion, not polish)**

- **UX-DR23**: Initial load — three skeleton rows in the list region. The card, input and filter tabs are already real and interactive; filter-tab counts render as `0` until the list resolves. No blank screen, and no flash of the empty state on the way to content.
- **UX-DR24**: **Add during initial load** — a Todo submitted before the list arrives shows its optimistic row immediately above the skeleton rows; the skeletons keep pulsing and the optimistic row does not, because it is real. The arriving list merges by id: the Todo is never dropped and never duplicated. If the load fails while the optimistic row is on screen, the row stays and the banner reports the load failure.
- **UX-DR25**: Three empty states with their exact strings, shown only once loading has resolved — never while skeletons are showing, and never after a load failure, when the list's contents are unknown rather than known-empty.
- **UX-DR26**: Load failure — the banner in its fixed region; the list region shows neither skeletons nor an empty state. `Retry` re-requests and returns to the skeleton while it runs.
- **UX-DR27**: Optimistic add — the Todo appears at the top immediately, the input clears and keeps focus, and the Filter View becomes All. On server confirmation the row's identity is reconciled silently; nothing visible changes.
- **UX-DR28**: Add revert — a failed add removes the optimistic row and **returns its text to the input with the caret at the end**, so nothing the user typed is lost by a failure they did not cause. The input is not cleared again until the add succeeds.
- **UX-DR29**: Optimistic toggle — fill, checkmark and strikethrough change together, before the server confirms. The row **does not change position**. Filter-tab counts update with the change.
- **UX-DR30**: Toggle revert — restores the previous Completion Status on screen. If the Todo had already left the view via the departure transition, it **returns to the list in its original position** along with the message.
- **UX-DR31**: Optimistic delete — the dialog closes and the row is removed immediately; the rows below close the gap with the same collapse motion as the departure transition.
- **UX-DR32**: Delete restore — a failed deletion returns the Todo to the list in its original position with the banner message. The list never holds a state the server rejected.
- **UX-DR33**: Character ceiling — at 450 the counter fades in and counts down; at 500 further keystrokes produce nothing and the counter reads `0`. **Nothing about its appearance changes at exactly 500** — no colour change, no weight change, no error, no banner, no shake.
- **UX-DR34**: Whitespace-only submit — nothing is created, nothing breaks, no error state, and the input is **not** cleared.

**Copy**

- **UX-DR35**: Implement all 14 user-facing strings verbatim from the `EXPERIENCE.md` §Voice and Tone table — placeholder `what needs doing?`, the three empty states, the three error strings, the dialog title and buttons, the three tab labels with counts, and the bare-numeral counter. Plain and unadorned: short declaratives, no personality, no encouragement, no exclamation marks, no emoji.
- **UX-DR36**: **Four error kinds, three error strings.** `Couldn't load your Todos.` for a failed load; `Couldn't add that Todo.` for a failed add; `Couldn't save that change.` shared by a failed toggle and a failed delete. The strings split where the recovery splits.
- **UX-DR37**: The word **Done** is banned — as a Filter View name, a label, an icon tooltip, or in spec prose. Filter View names match Completion Status values exactly.

**Interaction**

- **UX-DR38**: Add — Enter submits. The input clears and *keeps focus*, so consecutive capture needs no extra interaction. Focus is **never** moved to the new row.
- **UX-DR39**: Input autofocus is decided **by device capability, not by viewport width** — autofocus on pointer devices, not on touch, because on a phone it would raise the software keyboard and bury the list the user came to read.
- **UX-DR40**: The input is available from the first paint, including during load — never disabled, never read-only, never waiting on the Todo List.
- **UX-DR41**: Departure transition, ~580ms total — the row holds in its new Completion Status for ~400ms so the change is visibly *caused*, then fades and collapses its height over ~180ms while the rows below slide up. The same collapse runs on a confirmed delete, **without** the 400ms hold.
- **UX-DR42**: First-run swipe nudge — on a browser's first-ever visit, and only if the list is non-empty, the topmost row slides ~24px to expose a sliver of the delete action and settles back over ~600ms. Motion, not instruction: no tooltip, no coach mark, nothing to dismiss. It does not repeat on later visits or after a reload, and it does not fire on the empty first-run screen.
- **UX-DR43**: Delete — **three routes to one dialog**: swipe leftward on touch, trailing hover icon on pointer, and a keyboard route that is always available regardless of input modality. The keyboard route is **not a fallback**; it is the WCAG 2.2 AA floor, and a hover-only or gesture-only affordance fails the requirement outright.
- **UX-DR44**: Filter switching is local and instant: it fires no network request, has no loading state, and cannot fail.
- **UX-DR45**: **What `Retry` retries** — one control, four distinct behaviours. Load: re-request the list unchanged. Add: re-create the same Todo using the text now in the input, with the full success behaviour of a first-time submit. Toggle: set that Todo to the Completion Status the user asked for, **not** a fresh toggle of whatever it is now. Delete: re-delete the same Todo, and the dialog does **not** re-open. If the target no longer exists, `Retry` does nothing and the banner clears.
- **UX-DR46**: The banner holds one message at a time; a newer error replaces an older one and the replaced operation is not retried. The banner clears when the retried operation succeeds or when the user performs a successful operation of the same kind.
- **UX-DR47**: **Banned everywhere** — drag-to-reorder, bulk actions, long-press menus, toasts, undo affordances, infinite scroll, hover-only affordances without a keyboard equivalent, modal stacks more than one level deep, and any animation on open. The row body is not a click target.

**Accessibility floor — WCAG 2.2 AA, fully specified**

- **UX-DR48**: Contrast audit against `DESIGN.md`'s full table — every load-bearing pair verified by computation, not by eye. Special attention to `text-completed` on `row-complete` at **4.69:1**, the tightest pair in the system with no headroom, and to the three recorded 1.4.11 corrections (checked checkbox off `accent` on mint; every control boundary off `hairline`; focus ring off `accent` on mint).
- **UX-DR49**: Keyboard path with an exact tab order matching reading order: input → Retry (when the banner is occupied) → All → Active → Completed → then, per row in list order, checkbox → delete control. **The row's delete control is in the tab order whether or not it is visually revealed, and receiving focus reveals it.** No keyboard traps outside the dialog.
- **UX-DR50**: Dialog focus management — focus trapped while open, initial focus on **Cancel**, Tab cycles within the dialog only, Escape closes it as Cancel does. On close, focus returns to the control that opened it — or, when choosing Delete removed that control along with its row, to the checkbox of the row that took its place, or to the input if the list is now empty. **Focus is never dropped to the document body.**
- **UX-DR51**: Live-region announcements — six cases: on add (text + `added`), on toggle (text + `Completed`/`Active`), on departure (text + `removed from Active`/`removed from Completed`), on delete (text + `deleted`), on error (the applicable error string, **assertively**), and on empty (the empty-state text, both lines on All, the single line on the other two).
- **UX-DR52**: Roles and state — each row's checkbox exposes its Completion Status as a checked/unchecked state. The filter tabs expose which segment is selected, **and each tab's count is part of its accessible name** (`All 4`, not `All`). The delete control is labelled with the Todo it acts on, so the tab order does not read as a list of identical `Delete` buttons.
- **UX-DR53**: Every interactive element has a hit area of at least 44px in both dimensions — the checkbox whose visual mark is 21px, each filter segment, the delete control in both presentations, Retry, Cancel and Delete.
- **UX-DR54**: `prefers-reduced-motion` — the departure transition cuts straight to the end state (no hold, no fade, no collapse, no slide-up) **and the live-region announcement still fires**, so the information the motion carried is not lost. The first-run nudge is skipped entirely and **still spends its once-ever flag**. The skeleton pulse holds still; the skeleton geometry stays, because its job is preventing layout shift, not animating.

**Responsive and platform**

- **UX-DR55**: Phone and desktop are the same screen at different widths — not two layouts, not a mobile variant. On a phone everything sits within one-handed reach, and the sticky block keeps add one thumb-tap away at any scroll position. On desktop the `Enter` hint is visible at pointer widths.
- **UX-DR56**: Touch and pointer are detected **by capability, not by width** — the swipe route and the hover route are both available on a device that supports both, and the keyboard route is always available.
- **UX-DR57**: Verify long-text wrapping at the **500-character ceiling on the smallest supported viewport**, per the `DESIGN.md` flagged tension: Poppins has wide round letterforms and will wrap more aggressively than a narrower grotesque. If it fails, the lever is `todo-text` size and line-height — not truncation.

### FR Coverage Map

Every functional requirement maps to exactly one epic that owns it end to end, plus the epics that establish or verify it.

| FR | Owned by | Supported by | Verified by |
|---|---|---|---|
| **FR-1** Create a Todo | **Epic 3** — input component, `POST /api/todos`, optimistic insert, merge-by-id, add revert | Epic 1 (contract, validation predicate, repository); **Epic 4** for one consequence — see note below | Epic 6 (UJ-2, UJ-4, the add-during-load race, the forced add-failure path) |
| **FR-2** View the Todo List | **Epic 2** — `GET /api/todos`, `useTodos`, rows, skeletons, empty state, load failure | Epic 1 (repository, identity, app shell) | Epic 6 (UJ-1, the forced load-failure path) |
| **FR-3** Toggle Completion Status | **Epic 4** — `PATCH /api/todos/:id`, `useSetCompleted`, departure transition, toggle revert | Epic 2 (row and completed styling), Epic 3 (the mutation shape) | Epic 6 (UJ-1, the forced toggle-failure path) |
| **FR-4** Filter the Todo List | **Epic 4** — filter tabs, locally derived counts, per-view empty states | Epic 2 (empty-state component, all three variants modelled) | Epic 6 (UJ-1, UJ-4) |
| **FR-5** Delete a Todo | **Epic 5** — `DELETE /api/todos/:id`, three routes to one dialog, optimistic removal, restore-in-place | Epic 3 (the mutation shape), Epic 4 (the collapse motion) | Epic 6 (UJ-3, UJ-4, the forced delete-failure path) |
| **FR-6** Persist across sessions | **Epic 1** — identity cookie in middleware, token hashing, schema, owner-scoped repository | Epic 3 (the first point at which persistence is observable: add, reload, still there) | Epic 6 (SM-2 — identical after reload *and* after browser restart; independent across browsers) |

**FR-1 has one consequence that cannot land in Epic 3.** *"Creating a Todo sets the Filter View to All"* requires a Filter View, and there isn't one until Epic 4 ships the tabs. Rather than write an Epic 3 story that depends on a future epic — or stub a single-valued Filter View to satisfy an AC nothing can observe — the behaviour is an acceptance criterion on Epic 4's filter-tabs story (4.4 AC7), where it is testable the day it is written. Every other FR-1 consequence is owned by Epic 3.

**FR-6 is deliberately split.** Its mechanism is structural and lands in Epic 1, because AD-7 and AD-17 must exist before any route handler is written. Its *observable* behaviour needs something to persist, which only exists once Epic 3 can create a Todo. Its full acceptance — browser restart and cross-browser independence — has no UX surface at all and is verified in Epic 6.

### NFR Coverage Map

| NFR | Epics |
|---|---|
| **NFR-1** Perceived responsiveness | Epic 3 (establishes the optimistic mutation shape), Epics 4 and 5 (reuse it unchanged), Epic 6 (verified under concurrent mutations) |
| **NFR-2** Surfaces — one responsive web interface | Epic 2 (the responsive layout and scroll model), Epic 6 (the responsive pass and one-handed phone check) |
| **NFR-3** State coverage | Epic 2 (load, empty, load failure), Epics 3–5 (each mutation's failure path ships inside its own story), Epic 6 (all four forced failure paths) |
| **NFR-4** Error handling | Epic 2 (the single error slot, built once with all four kinds modelled), Epics 3–5 (each supplies its retry closure), Epic 6 |
| **NFR-5** Extensibility | Epic 1 (AD-2 owner-first repository and AD-7 identity indirection are the whole of it) |
| **NFR-6** Maintainability and deployability | Epic 1 (README and first deploy, timed), Epic 6 (re-verified end to end, plus the deploy runbook) |

### UX Design Requirement Coverage

All 57 UX-DRs are assigned. Grouped rather than listed one-by-one; the per-story acceptance criteria carry the detail.

| Epic | UX-DRs |
|---|---|
| **Epic 1** | 1–4 (token transcription, Poppins, the two shadow recipes, the focus ring and its one variant) |
| **Epic 2** | 5, 6, 7, 11, 13, 14, 17–20, 22, 23, 25, 26, 36, 46; 8 as static rendering only; 49 and 53 for the controls this epic creates (the input's position in reading order, Retry, the row); 51 (the announcer itself, plus empty and error announcements); 54 (skeleton pulse holds still) |
| **Epic 3** | 9, 15, 24, 27, 28, 33, 34, 38–40, 49 and 53 for the input, 51 (add); 45 (add branch); 56 (autofocus by capability) |
| **Epic 4** | 8 (interaction), 10, 25 (the Active and Completed variants become reachable), 29, 30, 41, 44, 49 and 53 for the checkbox and the three filter segments, 51 (toggle and departure), 52 (checkbox state, tab accessible names), 54 (departure under reduced motion) |
| **Epic 5** | 12, 16, 31, 32, 42, 43, 49 and 53 for the delete control in both presentations and for Cancel and Delete, 50, 51 (delete), 52 (delete control labelling), 54 (nudge under reduced motion), 56 (swipe and hover by capability) |
| **Epic 6** | 21 (live-measured 2.4.11), 47, 48 (the full contrast audit), 55, 57; plus the **end-to-end audit** of 49 (the assembled tab order across all five epics' controls) and 53 (every hit area measured) |
| **Cross-cutting** | 35 (each string ships in the story that renders it), 37 ("Done" is banned everywhere), 45 (modelled once in Epic 2, one branch per mutation epic) |

> **Epic 6 may contain only what measures a finished artifact.** UX-DR21 cannot be done earlier — the sticky block's height is not final until every control that occupies it exists. UX-DR48 and UX-DR57 likewise measure something already built. But UX-DR49 (keyboard tab order) and UX-DR53 (44px hit areas) are **construction, not measurement**: a tab order is an emergent property of five epics' worth of controls placed in reading order, and a hit area is a property of the control it belongs to. Neither can be audited into existence. Both are therefore built in the stories that create each control and only *verified* in Epic 6 — which is the same rule `WORK-SPLIT.md` already applies when it says *"no accessibility epic at the end."* Every construction task that leaks into Epic 6 converts it from "prove it" into "do it later," and "do it later" is the epic that gets cut.

## Epic List

### Epic 1: A Deployed, Runnable Foundation

A developer new to the codebase can clone the repository, set one environment variable, and have Simple Action running locally in under five minutes with no undocumented steps — and the same commit is live on Vercel. Every architectural seam the product depends on exists and is enforced by a lint rule rather than by memory: route handlers as the only server entry point, the repository as the only Drizzle importer, one shared contract, one query client, one error slot, one announcer, and the design tokens transcribed exactly once. Nothing is user-visible beyond an empty card.

This epic serves the fourth Job To Be Done in PRD §2.1 — the builder who needs a build small enough to finish rather than abandon — and NFR-6 is its acceptance criterion, with a stopwatch on it.

**FRs covered:** none directly; establishes the substrate FR-1 … FR-6 all depend on, and owns FR-6's mechanism
**NFRs covered:** NFR-5, NFR-6

### Epic 2: See Your Todo List

A user opens Simple Action and sees their Todo List, ordered newest-first, with a designed state for every way the load can go: three skeleton rows in the exact geometry of real rows while it arrives, the list when it lands with zero layout shift, an empty state when there is nothing, and a recoverable error with `Retry` when it fails. Completed Todos are distinguishable from Active ones without reading the text.

The single error region is built here, once, with all four error kinds already modelled — not grown a kind at a time across later epics. The empty-state component is built the same way, with all three variants modelled; only the All variant is reachable until Epic 4 ships the Filter Views.

**The motion module is also seeded here**, alongside the skeleton pulse that is its first consumer. AR-27 permits exactly one module holding every duration as a named constant, with `prefers-reduced-motion` honoured in that one place — so the ~400ms hold, the ~180ms collapse and the ~600ms nudge are declared here with the 1400ms pulse, even though Epic 4 and Epic 5 are the epics that consume them. Epic 5's delete collapse is Epic 4's departure collapse minus the hold: they share a constant. Without this seed, Epics 4 and 5 cannot actually run in parallel — whichever reached the module second would either import a constant that is not merged yet or declare a second one, violating AR-27 on the first day of parallel work. The cost of the seed is three constants written two epics early; the return is that the parallelism is real rather than aspirational.

**FRs covered:** FR-2 (in full)
**NFRs covered:** NFR-3, NFR-4, NFR-2 (the responsive layout and scroll model)

### Epic 3: Capture a Todo

A user types a Todo, presses Enter, and it is at the top of the list before the server has answered — the input cleared and still holding focus, ready for the next one without a second interaction. Whitespace-only submits do nothing and break nothing. Typing stops at 500 characters, with a counter that has been counting down since 450 so the stop is never mysterious. If the add fails, the text comes back to the input rather than being lost. Reload an hour later and the Todo is still there.

This epic establishes the optimistic mutation shape that Epics 4 and 5 reuse unchanged, and it contains the hardest story in the build: a create must not cancel the in-flight list query, and the arriving list merges by id.

**FRs covered:** FR-1 (in full); FR-6 becomes observable
**NFRs covered:** NFR-1, NFR-4

### Epic 4: Complete and Filter

A user marks a Todo done and sees the mint fill, the filled checkmark and the strikethrough land together before the server confirms — and marks it undone again by the same interaction. The row does not move; Completion Status never reorders the list. A user narrows the list to All, Active, or Completed with no network request, no loading state, and no way to fail, each tab carrying its own count. When a toggle takes a Todo out of the active Filter View, the row holds in its new status long enough for the change to read as caused, then collapses away.

**FRs covered:** FR-3, FR-4 (both in full)
**NFRs covered:** NFR-1, NFR-3 (the Active and Completed empty states become reachable), NFR-4

### Epic 5: Remove a Todo

A user removes a Todo they no longer need. The action is reachable three ways — swipe on touch, a trailing icon on hover, and the keyboard always — and all three open the same confirmation dialog, which traps focus, lands on Cancel, and returns focus somewhere sensible on close rather than dropping it to the document body. Confirming removes the row immediately and the rows below close the gap. If the removal fails, the Todo returns to its original position and says so. On a browser's first-ever visit, and only once, the topmost row nudges sideways to expose the gesture — motion, with nothing said.

**FRs covered:** FR-5 (in full)
**NFRs covered:** NFR-1, NFR-4

### Epic 6: Prove It Holds Up

The PRD's thesis — that a deliberately small product can still feel finished — stops being a claim and becomes a measurement. A first-time user completes add, complete and delete without instruction and without backtracking. The Todo List is identical after a reload and after a browser restart. Every view that can be empty, slow, or fail has a designed state for it, verified by forcing each failure rather than by inspection. The interface is usable one-handed on a phone with no horizontal scrolling, including at the 500-character ceiling on the smallest viewport. A focused control is never covered by the sticky block, at any scroll position.

This epic holds only what no single feature story can own — cross-cutting verification, and the one accessibility requirement that can only be measured once the sticky block is final. Error states, keyboard routes, focus management, hit areas and announcements are **not** deferred here; they ship inside the stories that create the controls. Epic 6 audits the assembled result — the tab order across every control, and every hit area measured — but builds none of it.

**FRs covered:** none new — verifies FR-1 … FR-6 end to end
**NFRs covered:** NFR-1 … NFR-4, NFR-6 re-verified
**Success metrics validated:** SM-1, SM-2, SM-3, SM-4

---

## Epic 1: A Deployed, Runnable Foundation

A developer new to the codebase can clone the repository, set one environment variable, and have Simple Action running in under five minutes — and the same commit is live on Vercel. Every architectural seam the product depends on exists and is enforced by tooling rather than by memory. Nothing is user-visible beyond an empty card.

**Requirements in scope:** NFR-5, NFR-6 · FR-6 mechanism · AR-1 … AR-8, AR-13 … AR-15, AR-19 … AR-26 · UX-DR1 … UX-DR4

### Story 1.1: Scaffold the application with its layer boundaries enforced

As a developer joining this codebase,
I want the application scaffolded with its architectural boundaries enforced by lint rules,
So that the client/server seam holds by itself instead of depending on every contributor remembering AD-1 and AD-2.

**Acceptance Criteria:**

**AC1** — **Given** a clean checkout and a valid `DATABASE_URL`, **When** `npm install && npm run dev` is run, **Then** the application starts and serves a page, **And** `npm run typecheck` passes with `strict: true` and reports no errors.

**AC2** — **Given** the installed dependencies, **When** their versions are inspected, **Then** Next.js is 16.3.x, React is 19.3, and TypeScript is 6.x, **And** TypeScript 7.x is not installed, because it drops the JavaScript Compiler API that the Next.js default backend calls into.

**AC3** — **Given** a module under `src/client/` or `app/` that is a component, **When** it calls `fetch` directly, **Then** `npm run lint` fails with a rule violation that names AD-1.

**AC4** — **Given** any module outside `src/server/repository/`, **When** it imports the Drizzle client, **Then** `npm run lint` fails with a rule violation that names AD-2.

**AC5** — **Given** any module under `src/server/`, **When** it imports from `src/client/`, **Then** `npm run lint` fails.

**AC6** — **Given** any file in the repository, **When** it declares a `'use server'` directive, **Then** `npm run lint` fails, because Server Actions are not used anywhere in this codebase.

**AC7** — **Given** the repository root, **When** the directory layout is compared to AR-20, **Then** `middleware.ts`, `app/`, `src/shared/contract/`, `src/client/`, `src/server/`, `drizzle/` and `e2e/` all exist, **And** layers map to directories one-to-one.

### Story 1.2: Transcribe the design tokens and load the typeface

As a developer implementing any part of the interface,
I want every `DESIGN.md` token available as a theme value and the typeface loaded once,
So that no component ever needs a hex literal and the fallback font cannot shift the layout out from under the skeleton rows.

**Acceptance Criteria:**

**AC1** — **Given** `app/globals.css`, **When** its Tailwind v4 `@theme` block is inspected, **Then** it contains all 22 colour tokens, all 10 typography roles, all 4 radii and the complete spacing scale from `DESIGN.md` frontmatter, **And** each is named with its `DESIGN.md` token name.

**AC2** — **Given** the whole repository excluding `app/globals.css`, **When** it is searched for hex colour literals and Tailwind arbitrary-value classes, **Then** there are none.

**AC3** — **Given** Poppins is loaded through `next/font` with the `DESIGN.md` fallback stack, **When** the page loads before the webfont resolves, **Then** the fallback is metric-adjusted, **And** the swap to Poppins contributes zero cumulative layout shift.

**AC4** — **Given** the two focus-ring variants, **When** they are defined in `@theme`, **Then** their geometry, blur and opacity are identical and only the hue value differs, **And** the `-on-complete` variant uses `accent-deep`.

**AC5** — **Given** both shadow recipes and the Completed-row re-tint, **When** they are defined, **Then** they exist as named theme values, **And** no component declares a shadow inline.

### Story 1.3: Create the schema and the first committed migration

As a developer,
I want the two tables and their index defined in Drizzle and shipped as a committed SQL migration,
So that every environment's schema comes from the repository rather than from whichever laptop last connected to it.

**Acceptance Criteria:**

**AC1** — **Given** `src/server/db/schema.ts`, **When** it is inspected, **Then** `client_identity` exists with `id uuid PK`, `token_hash text UNIQUE` and `created_at timestamptz`, **And** `todo` exists with `id uuid PK`, `owner_id uuid` referencing `client_identity.id`, `text text`, `completed boolean` and `created_at timestamptz`.

**AC2** — **Given** the Todo's text column, **When** it is named, **Then** it is `text`, matching the PRD glossary — not `title`, `content`, `task` or `item`.

**AC3** — **Given** the schema, **When** the index list is inspected, **Then** `(owner_id, id DESC)` exists, **And** it is the only index beyond the primary keys and the unique constraint.

**AC4** — **Given** the schema, **When** `drizzle-kit generate` is run, **Then** a SQL migration file is produced under `drizzle/`, **And** it is committed to the repository.

**AC5** — **Given** a fresh Neon branch and its `DATABASE_URL`, **When** the committed migration is applied, **Then** both tables, the foreign key, the unique constraint and the index exist.

**AC6** — **Given** every deploy, preview and production script, **When** they are inspected, **Then** none invokes `drizzle-kit push`; it appears only in a local-development script.

**AC7** — **Given** the schema, **When** wire-to-database name mapping is inspected, **Then** `camelCase` ↔ `snake_case` translation is owned by the Drizzle schema alone, **And** no other module translates between them.

### Story 1.4: Establish the repository as the only database module

As a developer,
I want one module that owns every database call, with owner scoping built into every signature,
So that there is exactly one place a future ownership or authentication check can clamp onto.

**Acceptance Criteria:**

**AC1** — **Given** the repository module under `src/server/repository/`, **When** the codebase is searched for imports of the Drizzle client, **Then** this module is the only importer.

**AC2** — **Given** the identity functions this epic needs, **When** they are written, **Then** the module exports a lookup by token hash and a create, **And** both are verb-first and named in the PRD's vocabulary.

**AC3** — **Given** any repository function that reads or writes a Todo, **When** its signature is inspected, **Then** `ownerId` is its first parameter, so scoping is structural rather than remembered.

**AC4** — **Given** this story's scope, **When** the repository is inspected, **Then** it contains **no Todo functions yet** — `listTodos`, `createTodo`, `setTodoCompleted` and `deleteTodo` arrive in the stories that consume them, in Epics 2 through 5.

**AC5** — **Given** any route handler, **When** it is inspected, **Then** it calls repository functions and never builds a query.

### Story 1.5: Define the shared contract

As a developer writing either side of the HTTP boundary,
I want one module defining the Todo wire shape, the error envelope and the validation rule,
So that a server response and a client expectation cannot drift apart story by story.

**Acceptance Criteria:**

**AC1** — **Given** `src/shared/contract/`, **When** it is inspected, **Then** it defines the Todo JSON shape once, **And** neither `src/client/` nor `src/server/` declares its own Todo type.

**AC2** — **Given** the error envelope, **When** it is defined, **Then** it is `{ error: { kind, message } }` with `kind` constrained to exactly `load`, `create`, `update` and `delete`, **And** all four kinds are present from the outset.

**AC3** — **Given** the validation rule, **When** it is defined, **Then** the module exports the 500-character constant and a predicate that trims, rejects empty-after-trim, and caps at 500, **And** both are imported by client and server rather than retyped.

**AC4** — **Given** the contract module, **When** it is typechecked, **Then** it contains no `any`.

**AC5** — **Given** the validation predicate, **When** Vitest runs, **Then** unit tests cover empty string, whitespace-only, a single character, exactly 500 characters, 501 characters, and text whose length only passes after trimming.

**AC6** — **Given** a success response from any endpoint, **When** its body is inspected, **Then** it is the bare resource or a bare array with no envelope; only errors are enveloped.

### Story 1.6: Issue and resolve the Client Identity

As a person opening Simple Action for the first time,
I want a Todo List of my own without creating an account,
So that my list is personal and still there tomorrow, on this browser, with nothing to sign up for.

**Acceptance Criteria:**

**AC1** — **Given** a document request carrying no identity cookie, **When** Next.js middleware runs, **Then** a 256-bit random token is minted, a `client_identity` row is created holding only its SHA-256 hash, and the cookie is set with `HttpOnly`, `Secure` and `SameSite=Lax`.

**AC2** — **Given** the identity cookie is set, **When** its attributes are inspected, **Then** it carries an explicit long `Max-Age` **and is not a session cookie**, so the Todo List survives closing and reopening the browser — which is the backend half of SM-2 and is decided here, not in the epic that tests it.

**AC3** — **Given** a document request that already carries a valid identity cookie, **When** middleware runs, **Then** no new token is minted and no new row is created.

**AC4** — **Given** a request to any route under `app/api/`, **When** it arrives without a valid identity, **Then** the route returns `401`, **And** it does not create an identity.

**AC5** — **Given** the `client_identity` table after any number of visits, **When** it is inspected, **Then** the raw token appears nowhere — only `token_hash`.

**AC6** — **Given** the codebase, **When** identity-minting code is located, **Then** it exists only in `middleware.ts`, **And** no API route is an identity-issuing path.

**AC7** — **Given** two different browsers, **When** each loads the application, **Then** each is issued a distinct Client Identity, **And** neither can read the other's rows, because every repository call is owner-scoped.

### Story 1.7: Mount the application shell

As a developer building any feature on this shell,
I want the query client, the live regions and the error slot mounted once at the root,
So that no feature has to invent its own state store, its own `aria-live` element, or its own error surface.

**Acceptance Criteria:**

**AC1** — **Given** `app/layout.tsx`, **When** it renders, **Then** a `QueryClientProvider` wraps the tree, **And** `['todos']` is the only query key the application will use.

**AC2** — **Given** the mounted root, **When** the DOM is inspected, **Then** exactly one polite live region and exactly one assertive live region exist.

**AC3** — **Given** any component in the codebase, **When** it is searched for an `aria-live` attribute, **Then** none declares one; announcing is done by calling the single `announce(message, urgency)` function.

**AC4** — **Given** the error slot provider, **When** it is inspected, **Then** it holds `{ kind, retry } | null`, **And** setting a new error replaces any existing one without retrying the replaced operation.

**AC5** — **Given** the shell with no features built, **When** the page loads, **Then** an empty card renders on the ground at the correct max width, **And** nothing else is visible.

### Story 1.8: Ship the README and the first deploy, and time the path

As a developer new to this repository,
I want a README that takes me from clone to a running application with no undocumented steps,
So that the project is one I can pick up rather than one I abandon.

**Acceptance Criteria:**

**AC1** — **Given** a developer who has never seen the repository, **When** they follow the README from `git clone`, **Then** they reach a running application having set exactly one environment variable, `DATABASE_URL`, **And** no step requires knowledge that is not in the README.

**AC2** — **Given** that path, **When** it is walked end to end, **Then** it is **timed and the measurement is recorded in the README** — NFR-6's five minutes is verified by a stopwatch, not asserted. **And** if the measured time exceeds five minutes, either the setup changes or NFR-6 is renegotiated, and that outcome is recorded here rather than discovered in Epic 6.

**AC3** — **Given** the README, **When** it is read, **Then** it states how to deploy the application.

**AC4** — **Given** a push to the default branch, **When** the Vercel deploy runs, **Then** the committed migrations are applied by the deploy step, **And** the same commit is live.

**AC5** — **Given** the three environments, **When** their configuration is compared, **Then** local, preview and production are identical in shape and differ only in which Neon branch `DATABASE_URL` points at.

**AC6** — **Given** the repository, **When** it is searched for secrets, **Then** no config file holds one and no secret has a committed default, **And** `DATABASE_URL` is the only required secret.

**AC7** — **Given** local development, **When** a developer sets up, **Then** no Docker and no local database install is required.

---

## Epic 2: See Your Todo List

A user opens Simple Action and sees their Todo List, ordered newest-first, with a designed state for every way the load can go. The single error region, the empty-state component and the motion module are all built here, complete, before most of what they serve exists.

**Requirements in scope:** FR-2 · NFR-2, NFR-3, NFR-4 · AR-6, AR-9, AR-10, AR-11, AR-27 · UX-DR5–7, 11, 13, 14, 17–20, 22, 23, 25, 26, 36, 46, 49/53 for Retry, 51, 54

### Story 2.1: Serve the Todo List from the server

As a person with a Todo List,
I want the server to return my Todos and nobody else's,
So that what I see is mine, in a stable order, without my having signed in.

**Acceptance Criteria:**

**AC1** — **Given** a request to `GET /api/todos` carrying a valid identity, **When** it is served, **Then** the response is a bare JSON array of the caller's Todos with no envelope, **And** every Todo carries `id`, `text`, `completed` and `created_at` in the shared contract's shape.

**AC2** — **Given** Todos belonging to the caller, **When** they are returned, **Then** they are ordered `id DESC`, **And** `created_at` is not used as a sort key.

**AC3** — **Given** the repository, **When** `listTodos` is added, **Then** it takes `ownerId` as its first parameter, **And** the route handler passes the resolved identity and builds no query itself.

**AC4** — **Given** two Client Identities each holding Todos, **When** one calls `GET /api/todos`, **Then** only that caller's rows are returned.

**AC5** — **Given** a request with no valid identity, **When** it reaches the route, **Then** it returns `401` without issuing one.

**AC6** — **Given** a server-side failure while reading, **When** the response is built, **Then** its body is `{ error: { kind: "load", message } }`, **And** the message is never forwarded to the interface.

### Story 2.2: Fetch the Todo List into the client

As a developer building every feature that reads Todos,
I want one query hook that owns the list,
So that no component fetches for itself and there is exactly one cache entry to reason about.

**Acceptance Criteria:**

**AC1** — **Given** the client, **When** `useTodos` is implemented, **Then** it uses the query key `['todos']`, **And** that is the only query key in the application.

**AC2** — **Given** any component, **When** the codebase is searched, **Then** none calls `fetch` — lint enforces this from Story 1.1.

**AC3** — **Given** the hook, **When** it is inspected, **Then** no server-derived Todo data is held in `useState` anywhere.

**AC4** — **Given** a successful response, **When** it lands, **Then** the cache holds the list in `id DESC` order as received.

**AC5** — **Given** a failed request or a transport failure, **When** the hook reports it, **Then** it is classified as error kind `load` by the operation attempted, not by the response.

### Story 2.3: Build the card, the scroll model and the sticky top block

As a person using Simple Action on a phone or a laptop,
I want one column that reads as a card resting on a coloured field, and never scrolls sideways,
So that the product feels like an object I can hold rather than a page I have to manage.

**Acceptance Criteria:**

**AC1** — **Given** any viewport width, **When** the page renders, **Then** there is one column, **And** the card is capped at 640px and centred on the ground, **And** below 640px it fills the viewport less 18px on each side.

**AC2** — **Given** any viewport width and any content, **When** the page is inspected, **Then** the page body never scrolls horizontally.

**AC3** — **Given** a list longer than the viewport, **When** the user scrolls, **Then** the page body is the only scrolling element, **And** no nested scroll container exists anywhere in the product.

**AC4** — **Given** a long list scrolled past the fold, **When** the card's lower edge leaves the viewport, **Then** nothing is added to cue that there is more below — no fade, no inner shadow, no region-local scrollbar.

**AC5** — **Given** the card, **When** its children are ordered, **Then** the order is add input → error banner region → filter tabs → list, **And** nothing renders above the input.

**AC6** — **Given** the sticky top block, **When** the page scrolls, **Then** the block holds at the top of the viewport on an opaque `card` surface and the list scrolls underneath it. **And** in this epic the block's only occupant is the error banner region; the add input joins it in Epic 3 and the filter tabs in Epic 4, by being placed inside the container this story creates rather than by re-implementing stickiness.

**AC7** — **Given** the product surface, **When** it is inspected, **Then** there is no wordmark, title bar or greeting; the product name appears in the browser tab title only.

### Story 2.4: Render a Todo in both Completion Statuses

As a person scanning my list,
I want a Completed Todo to look unmistakably different from an Active one,
So that I can tell what is left without reading a single word.

**Acceptance Criteria:**

**AC1** — **Given** an Active Todo, **When** its row renders, **Then** it takes the white fill, `rounded.md`, the row shadow, 14px padding and a 44px minimum height, **And** its text is `text-primary` at the `todo-text` role.

**AC2** — **Given** a Completed Todo, **When** its row renders, **Then** three cues change simultaneously — the mint fill, the filled checkmark, and a 1.5px line-through in `text-completed` — **And** the shadow re-tints to the green recipe.

**AC3** — **Given** a Completed row, **When** the interface is viewed with colour removed, **Then** its Completion Status is still readable from the checkmark and the strikethrough alone.

**AC4** — **Given** a Completed row, **When** any descendant needs the mint step-down, **Then** the row sets a single variant marker and descendants derive from it, **And** no component re-tests Completion Status to pick a colour.

**AC5** — **Given** a Todo of 500 characters, **When** its row renders at the smallest supported viewport, **Then** the text wraps to as many lines as it needs and the row grows, **And** nothing truncates, clips, or is cut off with an ellipsis.

**AC6** — **Given** the row, **When** a click lands on the row body rather than on a control, **Then** nothing happens; the row body is not a click target.

### Story 2.5: Seed the motion module

As a developer implementing any animated behaviour in this product,
I want every duration and the reduced-motion decision to live in one module from the start,
So that Epics 4 and 5 can be built in parallel without racing to create it or drifting into two definitions.

**Acceptance Criteria:**

**AC1** — **Given** the motion module, **When** it is inspected, **Then** it exports named constants for all four durations — the ~1400ms skeleton pulse, the ~400ms departure hold, the ~180ms collapse and the ~600ms first-run nudge — **And** three of the four have no consumer yet, which is the point.

**AC2** — **Given** the module, **When** `prefers-reduced-motion` is handled, **Then** it is read in this one place, **And** no component reads the media query itself.

**AC3** — **Given** any component in the codebase, **When** it is searched for an inline duration literal, **Then** there are none.

**AC4** — **Given** Epics 4 and 5 running in parallel, **When** each imports the collapse duration, **Then** both import the same constant, satisfying AR-27 without either having to create it.

### Story 2.6: Show skeleton rows while the list loads

As a person opening the application,
I want to see the shape of my list while it arrives,
So that I am never looking at a blank screen, and nothing jumps when the real rows land.

**Acceptance Criteria:**

**AC1** — **Given** the initial load is in flight, **When** the list region renders, **Then** three skeleton rows appear in the exact geometry of `todo-row-active` — same fill, radius, padding, shadow and minimum height.

**AC2** — **Given** skeleton rows are showing, **When** the real list lands, **Then** cumulative layout shift attributable to the swap is zero.

**AC3** — **Given** skeleton rows, **When** they animate, **Then** they pulse from `hairline` toward `tab-track` over the module's pulse duration, staggered so the pulse is not a single flat beat.

**AC4** — **Given** `prefers-reduced-motion: reduce`, **When** skeletons render, **Then** the pulse holds still, **And** the skeleton geometry remains, because its job is preventing layout shift rather than animating.

**AC5** — **Given** the initial load is in flight, **When** the rest of the card renders, **Then** the card and the sticky block are already real and interactive; only the list region is skeletal.

**AC6** — **Given** an add, a toggle or a delete, **When** it is in flight, **Then** no skeleton is shown — those are optimistic and have no loading state.

### Story 2.7: Build the error banner and the error slot

As a person whose request just failed,
I want one predictable place that tells me what happened and offers to try again,
So that a failure is something I can recover from in place rather than something that dead-ends the screen.

**Acceptance Criteria:**

**AC1** — **Given** the error slot, **When** it is implemented, **Then** it holds `{ kind, retry } | null` with all four kinds — `load`, `create`, `update`, `delete` — modelled from the outset, **And** it is not grown a kind at a time in later epics.

**AC2** — **Given** the banner region, **When** the slot is empty, **Then** the region is still part of the layout, **And** the banner appearing does not shift the list.

**AC3** — **Given** a load failure, **When** the banner renders, **Then** it reads `Couldn't load your Todos.` with a `Retry` control, **And** the client maps the error kind to that string rather than forwarding any server message.

**AC4** — **Given** a load failure, **When** the list region renders, **Then** it shows **neither** skeleton rows **nor** any resolved-list treatment, because the list's contents are unknown rather than known-empty.

**AC5** — **Given** a load failure, **When** the user activates `Retry`, **Then** the list request is re-attempted unchanged, **And** the list region returns to skeleton rows while it runs, **And** it resolves to content or to the same banner again.

**AC6** — **Given** an error is displayed and a second, different error occurs, **When** the slot updates, **Then** the newer error replaces the older one, **And** the replaced operation is not retried.

**AC7** — **Given** a retry closure whose target no longer exists, **When** it is invoked, **Then** it is a no-op that clears the slot.

**AC8** — **Given** the `Retry` control, **When** it is measured and tabbed to, **Then** its hit area is at least 44px in both dimensions, **And** it sits in the tab order immediately after the input's position and before the filter tabs, per the reading order this product commits to.

### Story 2.8: Build the empty state in all three variants

As a person whose list resolves to nothing,
I want the screen to tell me so plainly, and to point me at what to do only when there is something to do,
So that an empty list reads as finished rather than broken.

**Acceptance Criteria:**

**AC1** — **Given** the component, **When** it is built, **Then** all three variants exist with their exact strings: `Nothing here yet.` over `Type above to add your first Todo.` for All; `Nothing active.` alone; `Nothing completed yet.` alone. **And** only the All variant is reachable in this epic; Epic 4 makes the other two reachable by shipping the Filter Views.

**AC2** — **Given** the All variant, **When** it renders, **Then** it shows a centred dashed `hairline` panel holding a 40px mint ring with a plus glyph, the first line at `empty-message` in `text-primary`, and the second at `empty-sub` in `text-muted`.

**AC3** — **Given** the Active and Completed variants, **When** they render, **Then** each carries its first line only and a check glyph rather than a plus, **And** neither has a second line.

**AC4** — **Given** the empty state, **When** it renders, **Then** it carries no button and no control.

**AC5** — **Given** the list is still loading, **When** the list region renders, **Then** the empty state is not shown, **And** there is no flash of it on the way to content.

**AC6** — **Given** a load failure — the state built in Story 2.7 — **When** the list region renders, **Then** the empty state is not shown, because the list's contents are unknown rather than known-empty.

**AC7** — **Given** a load failure followed by a `Retry` that succeeds with zero Todos, **When** the list resolves, **Then** the All empty state appears — completing the resolution path Story 2.7 AC5 left open.

### Story 2.9: Announce what the list region is doing

As a person using a screen reader,
I want to be told when my list resolves to empty and when something fails,
So that I learn what a sighted user learns by looking.

**Acceptance Criteria:**

**AC1** — **Given** a Filter View resolves to empty, **When** the empty state renders, **Then** its text is announced politely — both lines on All, the single line on the other two.

**AC2** — **Given** an error occurs, **When** the banner appears, **Then** the applicable error string is announced **assertively**, because it reports a failure the user did not cause.

**AC3** — **Given** any announcement, **When** it is made, **Then** it goes through the single `announce(message, urgency)` function from Story 1.7, **And** no component renders its own `aria-live` attribute.

**AC4** — **Given** the two live regions, **When** the DOM is inspected at any point, **Then** there is still exactly one polite and one assertive region.

---

## Epic 3: Capture a Todo

A user types a Todo, presses Enter, and it is at the top of the list before the server has answered. This epic establishes the optimistic mutation shape that Epics 4 and 5 reuse unchanged, and it contains the hardest story in the build.

**Requirements in scope:** FR-1 · FR-6 becomes observable · NFR-1, NFR-4 · AR-5, AR-12, AR-17 · UX-DR9, 15, 24, 27, 28, 33, 34, 38–40, 45, 49/53 for the input, 51, 56

### Story 3.1: Accept a new Todo at the server

As a person capturing a task,
I want the server to store the Todo I submitted, exactly once,
So that a retry after an uncertain failure gives me one Todo rather than two.

**Acceptance Criteria:**

**AC1** — **Given** a `POST /api/todos` with a body carrying a client-supplied `id` and `text`, **When** it is served, **Then** a row is created with that id, `completed: false` and a server-set `created_at`, **And** the created Todo is returned bare with no envelope.

**AC2** — **Given** the submitted `id`, **When** the server validates it, **Then** it must be a well-formed UUIDv7 in lowercase canonical form, **And** the server never generates an id itself.

**AC3** — **Given** a `POST` whose id already exists and belongs to the same owner, **When** it is served, **Then** the existing row is returned with `200` — an idempotent retry — **And** no duplicate is created and the stored row is not modified.

**AC4** — **Given** a `POST` whose id already exists and belongs to a different owner, **When** it is served, **Then** it returns `409`, **And** the response discloses nothing about the existing row.

**AC5** — **Given** the repository, **When** `createTodo` is added, **Then** it takes `ownerId` first, **And** the route handler builds no query.

**AC6** — **Given** a request with no valid identity, **When** it reaches the route, **Then** it returns `401` without issuing one.

### Story 3.2: Enforce the validation rule at the server

As a developer trusting the boundary rather than the caller,
I want the server to re-check what the client already checked,
So that the API is safe against a caller that is not our interface.

**Acceptance Criteria:**

**AC1** — **Given** a `POST` whose text is empty after trimming, **When** it is served, **Then** it returns an error with kind `create`, **And** no row is created.

**AC2** — **Given** a `POST` whose text exceeds 500 characters, **When** it is served, **Then** it returns an error with kind `create`, **And** no row is created.

**AC3** — **Given** the server's validation, **When** it is implemented, **Then** it imports the predicate and the constant from `src/shared/contract/`, **And** neither is retyped.

**AC4** — **Given** text that is valid only after trimming, **When** it is stored, **Then** the trimmed form is what persists.

**AC5** — **Given** any log line produced by this route, **When** it is inspected, **Then** it contains no Todo text.

### Story 3.3: Build the add input

As a person with a thought I do not want to lose,
I want a single always-visible field where typing and pressing Enter is the whole interaction,
So that capture costs me one gesture and never breaks my rhythm.

**Acceptance Criteria:**

**AC1** — **Given** the input, **When** it is placed, **Then** it sits at the top of the card inside the sticky block built in Story 2.3, **And** it is never disabled, never read-only and never waits on the Todo List — it is interactive from first paint, including while skeleton rows are showing.

**AC2** — **Given** focus is in the input, **When** the user presses Enter with valid text, **Then** the Todo is submitted, **And** the input clears and **retains focus**, **And** focus is never moved to the new row.

**AC3** — **Given** the input holds only whitespace, **When** the user presses Enter, **Then** nothing is created, no error state is shown, no banner appears, **And** the input is **not** cleared.

**AC4** — **Given** the input holds 500 characters, **When** the user types again, **Then** the keystroke produces nothing, **And** nothing about the interface changes at that moment — no colour change, no weight change, no error, no shake.

**AC5** — **Given** the input passes 450 characters, **When** the counter appears, **Then** it fades in at the trailing edge as a bare numeral in `counter` type and counts down to `0` at the ceiling, **And** it never takes the danger ramp.

**AC6** — **Given** a pointer device, **When** the page loads, **Then** the input autofocuses. **And Given** a touch device, **When** the page loads, **Then** it does **not**, so the software keyboard does not bury the list. **And** the decision is made by device capability, not by viewport width.

**AC7** — **Given** a pointer-width viewport, **When** the input renders, **Then** the pill `Enter` hint shows at its trailing edge, **And** the hint is not in the tab order.

**AC8** — **Given** the input is empty, **When** it renders, **Then** its placeholder reads exactly `what needs doing?` in `text-placeholder`, **And** entered text renders in `text-primary` at the `input-text` role.

**AC8** — **Given** the input, **When** it is tabbed to and measured, **Then** it is first in the tab order, **And** its hit area is at least 44px in both dimensions.

### Story 3.4: Add a Todo optimistically, and merge the list that arrives

As a person who just pressed Enter,
I want my Todo on screen immediately, even if the list it belongs to is still loading,
So that the input is genuinely live rather than interactive in appearance only.

> **Read AD-16 before starting this story, and write the add-during-load test first.** This is the story that will be got wrong by following TanStack Query's documented optimistic-update recipe, which opens by cancelling in-flight queries. Here that deletes the user's Todo.

**Acceptance Criteria:**

**AC1** — **Given** a valid submit, **When** the mutation starts, **Then** the client mints a UUIDv7 through a single monotonic generator instance and sends it in the request body, **And** two Todos created in the same millisecond still order correctly.

**AC2** — **Given** the optimistic insert, **When** it is applied, **Then** it is written via `setQueryData` on `['todos']`, **And** the row appears at its `id DESC` position, which for a newly minted UUIDv7 is the top.

**AC3** — **Given** a create is in flight, **When** the mutation runs, **Then** it **does not cancel** the list query.

**AC4** — **Given** an unconfirmed optimistic row and a list response arriving, **When** the response lands, **Then** it is **merged into the cache by id**: server rows take their place, an optimistic row whose id is absent from the response is kept, and an id present in both collapses to one entry carrying the server record. **And** the list response never wholesale-replaces cache entries while an unconfirmed create exists.

**AC5** — **Given** a Todo submitted before the list arrives, **When** the screen renders, **Then** the optimistic row shows immediately above the still-pulsing skeleton rows, **And** the optimistic row does not pulse, because it is real.

**AC6** — **Given** the add-during-load race, **When** it is exercised, **Then** the Todo is **never dropped and never duplicated**.

**AC7** — **Given** the server confirms the create, **When** the response lands, **Then** the row's identity is reconciled silently and nothing visible changes — no flash, no re-sort, no position change.

**AC8** — **Given** a successful add, **When** it completes, **Then** the Todo text followed by `added` is announced politely.

**AC9** — **Given** a successful add, **When** the list is reloaded an hour later, **Then** the Todo is still present — the first point at which FR-6 is observable.

### Story 3.5: Return the user's text when an add fails

As a person whose Todo failed to save,
I want my words back in the input rather than gone,
So that a failure I did not cause does not cost me what I typed.

**Acceptance Criteria:**

**AC1** — **Given** a failed create, **When** the rollback runs, **Then** it removes **only the row this mutation inserted**, **And** it does not restore a whole-list snapshot, because with a concurrent mutation in flight that would undo a change this mutation never made.

**AC2** — **Given** a failed create, **When** the input is updated, **Then** it holds the submitted text with the caret at the end, **And** it is not cleared again until the add succeeds.

**AC3** — **Given** a failed create, **When** the banner renders, **Then** it reads `Couldn't add that Todo.` with `Retry` — its own string, not the save string.

**AC4** — **Given** the add-failure banner, **When** the user activates `Retry`, **Then** the creation is re-attempted **using the same id**, so the server treats it as an idempotent retry, **And** the text used is the text now sitting in the input.

**AC5** — **Given** a `Retry` that succeeds, **When** it completes, **Then** the Todo appears at the top, the input clears and keeps focus, exactly as a first-time submit does.

**AC6** — **Given** a transport failure with no response, **When** the error is classified, **Then** it takes kind `create` from the operation attempted.

**AC7** — **Given** an optimistic row on screen and the **load** fails, **When** the banner renders, **Then** it reports the load failure, the optimistic row stays, **And** `Retry` re-requests the list, which merges the same way.

---

## Epic 4: Complete and Filter

A user marks a Todo done and sees it change before the server confirms, marks it undone the same way, and narrows the list to All, Active or Completed with no network request and no way to fail.

**Requirements in scope:** FR-3, FR-4 · FR-1's Filter-View-to-All consequence · NFR-1, NFR-3, NFR-4 · AR-7, AR-9, AR-27, AR-28 · UX-DR8, 10, 25, 29, 30, 41, 44, 45, 49/53 for the checkbox and segments, 51, 52, 54

### Story 4.1: Set a Todo's Completion Status at the server

As a person marking work done,
I want the server to store the status I asked for,
So that a retry sets the same value rather than flipping it a second time.

**Acceptance Criteria:**

**AC1** — **Given** `PATCH /api/todos/:id` with a body of `{ "completed": boolean }`, **When** it is served, **Then** the row's `completed` is **set** to that value, **And** the updated Todo is returned bare.

**AC2** — **Given** the API surface, **When** it is inspected, **Then** there is no toggle endpoint and no endpoint whose result depends on the current state.

**AC3** — **Given** the same `PATCH` sent twice, **When** both are served, **Then** the second produces the same stored value as the first.

**AC4** — **Given** a `PATCH` for a Todo the caller does not own, **When** it is served, **Then** it does not modify the row, **And** it discloses nothing about it.

**AC5** — **Given** the repository, **When** `setTodoCompleted` is added, **Then** it takes `ownerId` first.

**AC6** — **Given** a server-side failure, **When** the response is built, **Then** its body carries error kind `update`.

### Story 4.2: Apply the status change before the server answers

As a person tapping a checkbox,
I want the change on screen immediately,
So that the product answers me rather than the network.

**Acceptance Criteria:**

**AC1** — **Given** a toggle, **When** the mutation starts, **Then** the new Completion Status is written via `setQueryData` on `['todos']` before the request resolves.

**AC2** — **Given** the optimistic change, **When** it renders, **Then** the row **does not change position**, because ordering is `id DESC` and Completion Status never moves a row.

**AC3** — **Given** a toggle in flight, **When** the mutation runs, **Then** it **may** cancel in-flight reads, because it acts on a row the server already knows about — unlike create.

**AC4** — **Given** a failure, **When** rollback runs, **Then** it restores **only that one row's** previous `completed` value, **And** no whole-list snapshot is restored.

**AC5** — **Given** two mutations in flight and one failing, **When** rollback runs, **Then** the change made by the other mutation is untouched.

**AC6** — **Given** a successful toggle, **When** it completes, **Then** the Todo text followed by `Completed` or `Active` is announced politely.

**AC7** — **Given** a successful toggle, **When** the page is reloaded, **Then** the Todo's Completion Status is the toggled one — the server confirmation actually persisted rather than only the optimistic change having rendered.

### Story 4.3: Make the checkbox the control that toggles

As a person with one thing to do per Todo,
I want a single tap or click to mark it done, and the same one to undo it,
So that completion costs exactly one interaction in both directions.

**Acceptance Criteria:**

**AC1** — **Given** a row, **When** the user taps or clicks its checkbox, **Then** the Completion Status toggles, **And** Completed returns to Active by the same interaction.

**AC2** — **Given** the checkbox is focused, **When** the user presses Enter or Space, **Then** it activates.

**AC3** — **Given** the checkbox, **When** a screen reader reads it, **Then** its Completion Status is exposed as a checked/unchecked state rather than as colour or decoration.

**AC4** — **Given** a checked checkbox on an **Active** row, **When** it renders, **Then** its fill and border are `accent`. **And Given** a checked checkbox on a **Completed** row, **Then** they are `accent-deep`, because `accent` on mint measures 2.97:1 and fails WCAG 1.4.11.

**AC5** — **Given** the checkbox receives keyboard focus, **When** the ring renders, **Then** it takes the `-on-complete` variant on a Completed row and the standard variant elsewhere, **And** the ring's geometry is identical in both.

**AC6** — **Given** the checkbox's 21px visual mark, **When** its hit area is measured, **Then** it is at least 44px in both dimensions, **And** the mark itself is unchanged.

**AC7** — **Given** the tab order, **When** a user tabs through a row, **Then** the checkbox comes first within that row, in list order.

### Story 4.4: Build the filter tabs

As a person with a list longer than what is left to do,
I want to narrow it to what matters right now,
So that the screen is the size of the problem rather than the size of the history.

**Acceptance Criteria:**

**AC1** — **Given** the tabs, **When** they render, **Then** there are three equal-width segments in an inset track — `All`, `Active`, `Completed` — **And** no synonym for Completed appears anywhere.

**AC2** — **Given** a Filter View is selected, **When** the list renders, **Then** All shows every Todo, Active shows only Active, and Completed shows only Completed.

**AC3** — **Given** a Filter View switch, **When** it happens, **Then** no network request is fired, there is no loading state, and it cannot fail.

**AC4** — **Given** each segment, **When** it renders, **Then** it carries its own count derived locally from the loaded list, **And** a count of zero renders as `0` and never hides.

**AC5** — **Given** an optimistic add, toggle or delete, **When** it changes the list, **Then** the counts update instantly with it.

**AC6** — **Given** a screen reader, **When** it reads a segment, **Then** the count is part of the accessible name — `Active 2`, not `Active`.

**AC7** — **Given** a successful add, **When** it completes, **Then** the Filter View is forced to **All**, so a newly created Todo is never created out of sight. **And** this is the one FR-1 consequence that lands in this epic, because the Filter View does not exist before it.

**AC8** — **Given** the initial load is still in flight, **When** the tabs render, **Then** every count reads `0` until the list resolves.

**AC9** — **Given** a reload, **When** the page renders, **Then** the Filter View is All; the selection is not persisted.

**AC10** — **Given** a Filter View that resolves to nothing, **When** the list region renders, **Then** the matching empty-state variant from Story 2.8 appears — making the Active and Completed variants reachable for the first time.

**AC11** — **Given** the tab order and hit areas, **When** they are checked, **Then** the three segments follow `Retry` in the tab order, **And** each is at least 44px tall.

### Story 4.5: Make a departing Todo leave visibly

As a person who just completed something while filtered to Active,
I want to see the change happen before the row goes,
So that the Todo reads as having left rather than as having vanished.

**Acceptance Criteria:**

**AC1** — **Given** a toggle makes a Todo no longer match the active Filter View, **When** the transition runs, **Then** the row holds in its **new** Completion Status for the module's hold duration, then fades and collapses its height over the collapse duration while the rows below slide up.

**AC2** — **Given** the transition, **When** its durations are read, **Then** they come from the motion module seeded in Story 2.5, **And** no duration is inlined.

**AC3** — **Given** a departure, **When** it completes, **Then** the Todo text followed by `removed from Active` or `removed from Completed` is announced politely.

**AC4** — **Given** `prefers-reduced-motion: reduce`, **When** a departure occurs, **Then** it cuts straight to the end state — no hold, no fade, no collapse, no slide-up — **And** the live-region announcement still fires, so the information the motion carried is not lost.

**AC5** — **Given** the Filter View is All, **When** a Todo is toggled, **Then** no departure runs, because the row still matches.

### Story 4.6: Revert a toggle the server refused

As a person whose change did not save,
I want the screen to go back to what is actually true, and to say so,
So that I am never looking at a state the server rejected.

**Acceptance Criteria:**

**AC1** — **Given** a failed toggle, **When** the revert runs, **Then** the row's previous Completion Status is restored on screen.

**AC2** — **Given** a failed toggle, **When** the banner renders, **Then** it reads `Couldn't save that change.` with `Retry`.

**AC3** — **Given** a failed toggle on a Todo that had already **departed** the view, **When** the revert runs, **Then** the Todo returns to the list **in its original position** along with the message — the reversal is as visible as the change was.

**AC4** — **Given** the toggle-failure banner, **When** the user activates `Retry`, **Then** it re-attempts setting that Todo to **the Completion Status the user asked for** — not a fresh toggle of whatever it is now.

**AC5** — **Given** a `Retry` that succeeds, **When** it completes, **Then** the row moves to the requested status optimistically again, **And** departs the view again if the Filter View no longer matches.

**AC6** — **Given** the row the retry closure refers to has since been deleted, **When** `Retry` is activated, **Then** it does nothing and the banner clears.

**AC7** — **Given** a failure, **When** the error is announced, **Then** `Couldn't save that change.` is announced assertively.

---

## Epic 5: Remove a Todo

A user removes a Todo they no longer need — reached by swipe, by hover, or by keyboard — confirmed once, gone immediately. If the removal fails, it comes back exactly where it was.

**Requirements in scope:** FR-5 · NFR-1, NFR-4 · AR-7, AR-9, AR-16, AR-30 · UX-DR12, 16, 31, 32, 42, 43, 49/53 for the delete control and dialog buttons, 50, 51, 52, 54, 56

### Story 5.1: Remove a Todo at the server

As a person deleting something,
I want it gone for good,
So that the list holds what I meant it to hold.

**Acceptance Criteria:**

**AC1** — **Given** `DELETE /api/todos/:id` for a Todo the caller owns, **When** it is served, **Then** the row is **removed** — there is no soft-delete column and no query filters on deletion state.

**AC2** — **Given** the same `DELETE` sent twice, **When** both are served, **Then** both return `204`, because the endpoint is idempotent and a retry must not fail because the row is already gone.

**AC3** — **Given** a `DELETE` for a Todo the caller does not own, **When** it is served, **Then** the row is not removed, **And** the response discloses nothing about it.

**AC4** — **Given** the repository, **When** `deleteTodo` is added, **Then** it takes `ownerId` first.

**AC5** — **Given** a Todo in **either** Completion Status, **When** it is deleted, **Then** the deletion succeeds.

**AC6** — **Given** a server-side failure, **When** the response is built, **Then** its body carries error kind `delete`.

### Story 5.2: Reach the delete action three ways

As a person on a phone, at a laptop, or on a keyboard,
I want the delete action available by the means I am already using,
So that the product does not require a mouse, a gesture, or a guess.

**Acceptance Criteria:**

**AC1** — **Given** a touch device, **When** the user swipes a row leftward, **Then** a solid `danger-fill` panel is revealed behind it with a white icon, **And** tapping the revealed action opens the confirmation dialog.

**AC2** — **Given** a pointer device, **When** the user hovers a row, **Then** a trailing line icon appears in `text-muted`, moving to `danger-text` on its own hover, **And** clicking it opens the same dialog.

**AC3** — **Given** a keyboard, **When** the user tabs through a row, **Then** the delete control is reachable **whether or not it is visually revealed**, **And** receiving focus reveals it, **And** Enter or Space opens the same dialog. This route is mandatory and is not a fallback — it is the WCAG 2.2 AA floor.

**AC4** — **Given** a device supporting both touch and pointer, **When** the routes are offered, **Then** both are available, **And** availability is decided by capability rather than by viewport width.

**AC5** — **Given** a screen reader, **When** it reads the delete control, **Then** the control is labelled with the Todo it acts on, so the tab order does not read as a list of identical `Delete` buttons.

**AC6** — **Given** the delete control on a Completed row, **When** it takes focus, **Then** its ring uses the `-on-complete` variant, because a Todo can be deleted in either Completion Status and the ring must clear 3:1 on mint.

**AC7** — **Given** the delete control in either presentation, **When** its hit area is measured, **Then** it is at least 44px in both dimensions, **And** it is the **last** focusable control within its row — which places it after the checkbox once Epic 4 ships one, and makes it the row's only focusable control before then. *(Stated as a position rule rather than as "after the checkbox" so this epic does not depend on Epic 4, which may be built in parallel.)*

### Story 5.3: Ask once before removing

As a person about to delete something I cannot get back,
I want to be asked once, with the safe choice under my hands,
So that a mis-tap does not cost me a Todo.

**Acceptance Criteria:**

**AC1** — **Given** any of the three routes, **When** the dialog opens, **Then** it reads `Delete this Todo?` with `Cancel` and `Delete`, **And** nothing is removed until the user chooses `Delete`.

**AC2** — **Given** the dialog is open, **When** the user chooses `Cancel`, **Then** it closes and the Todo List is untouched.

**AC3** — **Given** the dialog is open, **When** focus is managed, **Then** it is trapped within the dialog, **And** initial focus lands on **Cancel**, not Delete.

**AC4** — **Given** the dialog is open, **When** the user presses Escape, **Then** it closes exactly as `Cancel` does.

**AC5** — **Given** the dialog closes by `Cancel` or Escape, **When** focus returns, **Then** it goes to the control that opened it.

**AC6** — **Given** the dialog closes by `Delete` and that removed the trigger along with its row, **When** focus returns, **Then** it goes to the **first focusable control of the row that took its place** — the checkbox once Epic 4 has shipped it, the delete control before then — **or** to the input if the list is now empty. **And** focus is never dropped to the document body.

**AC7** — **Given** the dialog, **When** it renders, **Then** it stacks exactly one level deep, nothing opens on top of it, **And** it has no third button, no checkbox and no "don't ask again".

**AC8** — **Given** `Cancel` and `Delete`, **When** they are measured, **Then** each is at least 44px tall, **And** `Delete` is the only filled button in the product.

### Story 5.4: Remove the Todo before the server answers

As a person who just confirmed,
I want the row gone immediately,
So that confirming is the end of the interaction rather than the middle of it.

**Acceptance Criteria:**

**AC1** — **Given** the user chooses `Delete`, **When** the mutation starts, **Then** the dialog closes and the row is removed from the cache via `setQueryData` before the request resolves.

**AC2** — **Given** the removal, **When** the rows below move, **Then** they close the gap over the motion module's **collapse** duration, **with no hold** — a deleted Todo has no new state to show. **And** the duration is imported from the module seeded in Story 2.5, not redeclared, which is what lets this story be built without Epic 4's departure transition existing.

**AC3** — **Given** `prefers-reduced-motion: reduce`, **When** the removal runs, **Then** it cuts to the end state.

**AC4** — **Given** a delete in flight, **When** the mutation runs, **Then** it **may** cancel in-flight reads.

**AC5** — **Given** a successful delete, **When** it completes, **Then** the Todo text followed by `deleted` is announced politely.

**AC6** — **Given** a successful delete, **When** the page is reloaded, **Then** the Todo is still gone.

**AC7** — **Given** the filter-tab counts, **When** the row is removed optimistically, **Then** they update instantly.

### Story 5.5: Restore a Todo the server would not remove

As a person whose deletion failed,
I want the Todo back where it was, and to be told,
So that the list never shows a state the server rejected.

**Acceptance Criteria:**

**AC1** — **Given** a failed delete, **When** the restore runs, **Then** the Todo returns to the list **in its original position**, re-inserted at its `id DESC` position.

**AC2** — **Given** a failed delete, **When** rollback runs, **Then** it re-inserts **only that one row**, **And** no whole-list snapshot is restored.

**AC3** — **Given** a failed delete, **When** the banner renders, **Then** it reads `Couldn't save that change.` with `Retry` — sharing the toggle's string because they share a shape.

**AC4** — **Given** the delete-failure banner, **When** the user activates `Retry`, **Then** the deletion of the same Todo is re-attempted, **And** the row is removed optimistically again, **And** **the dialog does not re-open** — the user already confirmed, and asking twice would make `Retry` a second confirmation.

**AC5** — **Given** the Todo the retry closure refers to no longer exists, **When** `Retry` is activated, **Then** it does nothing and the banner clears.

**AC6** — **Given** a failure, **When** the error is announced, **Then** it is announced assertively.

### Story 5.6: Teach the swipe once, with motion

As a person on a phone who has never used this before,
I want to discover that a row can be swiped without being told,
So that the product explains itself without a tour, a tooltip, or anything to dismiss.

**Acceptance Criteria:**

**AC1** — **Given** a browser's first-ever visit **and** a non-empty list, **When** the nudge fires, **Then** the topmost row slides ~24px to expose a sliver of the delete action and settles back over the module's nudge duration.

**AC2** — **Given** the nudge, **When** it plays, **Then** there is no tooltip, no coach mark, no tour, nothing to dismiss and nothing that can be dismissed wrongly.

**AC3** — **Given** the once-ever flag, **When** it is written, **Then** it uses one named `localStorage` key written in exactly one place.

**AC4** — **Given** the flag, **When** it is spent, **Then** it is spent only after a successful load has rendered **at least one row** — so a first visit that loads empty, or fails to load, does not consume it.

**AC5** — **Given** a later visit or a reload, **When** the page loads, **Then** the nudge does not fire again.

**AC6** — **Given** `prefers-reduced-motion: reduce`, **When** the first-ever visit occurs, **Then** the nudge is skipped entirely **and still spends its flag**, so it cannot fire later if the preference changes. **And** the keyboard route to delete is unaffected.

**AC7** — **Given** an empty first-run screen, **When** it renders, **Then** the nudge does not fire — there must be a row for there to be anything to nudge.

---

## Epic 6: Prove It Holds Up

The PRD's thesis stops being a claim and becomes a measurement. Every story here measures a finished artifact; none builds one.

**Requirements in scope:** SM-1 … SM-4 · NFR-1 … NFR-4, NFR-6 re-verified · AR-31 · UX-DR21, 47, 48, 55, 57, plus the end-to-end audit of 49 and 53

### Story 6.1: Keep a focused control out from under the sticky block

As a keyboard user tabbing down a long list,
I want the control I just focused to be visible,
So that the sticky input and tabs do not hide the thing I am about to act on.

**Acceptance Criteria:**

**AC1** — **Given** the sticky block, **When** its height is used for scroll offsetting, **Then** it is **measured live** — input plus banner region plus tabs plus the gaps between them — **And** it is not hard-coded, because the banner region's occupancy changes that height.

**AC2** — **Given** the measured height, **When** it is applied, **Then** `scroll-padding-top` is set on the scroll container **and** `scroll-margin-top` on each focusable row descendant.

**AC3** — **Given** a list long enough to scroll, **When** the user tabs to a row's checkbox or delete control below the fold, **Then** the control comes to rest **below** the sticky block, **And** it is **never even partially covered**.

**AC4** — **Given** the banner becomes occupied while a control is focused, **When** the sticky block grows, **Then** the offset updates and AC3 still holds.

**AC5** — **Given** every scroll position and every Filter View, **When** AC3 is re-tested, **Then** it holds in all of them.

### Story 6.2: Walk the four journeys end to end

As a stakeholder deciding whether this is finished,
I want the product's own journeys executed against a running build,
So that SM-1 and SM-2 are demonstrated rather than asserted.

**Acceptance Criteria:**

**AC1** — **Given** Playwright, **When** the suite runs, **Then** UJ-1, UJ-2, UJ-3 and UJ-4 each pass as a scripted journey against a running application.

**AC2** — **Given** UJ-4, **When** it runs, **Then** it completes add, complete and delete **without any instruction step** and without backtracking, which is the executable form of SM-1.

**AC3** — **Given** UJ-2 step 6, **When** the page is reloaded, **Then** the Todo List is identical and the Filter View has returned to All.

**AC4** — **Given** SM-2's second half, **When** the browser context is closed and reopened carrying persisted cookies, **Then** the Todo List is identical — confirming the identity cookie's `Max-Age` from Story 1.6 AC2 is doing its job.

**AC5** — **Given** two independent browser contexts, **When** each loads the application, **Then** each sees a different, independent Todo List.

**AC6** — **Given** the suite, **When** it runs in CI, **Then** it passes against the same commit that deploys.

### Story 6.3: Force every failure and the race

As a person who will meet this product on a bad network,
I want every failure path exercised deliberately,
So that SM-3 is proven by forcing failures rather than by looking at the happy path.

**Acceptance Criteria:**

**AC1** — **Given** Playwright route interception, **When** the list request is failed, **Then** the banner reads `Couldn't load your Todos.`, no skeletons and no empty state are shown, **And** `Retry` returns to skeletons and re-requests.

**AC2** — **Given** the create request is failed, **When** the revert runs, **Then** the row is removed, the text is back in the input with the caret at the end, the banner reads `Couldn't add that Todo.`, **And** `Retry` re-sends the same id.

**AC3** — **Given** the update request is failed, **When** the revert runs, **Then** the row returns to its previous status in its original position — including when it had already departed the view — **And** the banner reads `Couldn't save that change.`

**AC4** — **Given** the delete request is failed, **When** the restore runs, **Then** the Todo returns in its original position, the banner reads `Couldn't save that change.`, **And** `Retry` does not re-open the dialog.

**AC5** — **Given** the list request held open and a Todo submitted during it, **When** the list finally lands, **Then** the optimistic row rendered above the skeletons and the merge leaves the Todo **present exactly once**.

**AC6** — **Given** a create retried after an uncertain failure, **When** both requests reach the server, **Then** exactly one Todo exists.

**AC7** — **Given** a newer error arriving while an older one is displayed, **When** the banner updates, **Then** it shows the newer one and the replaced operation is not retried.

### Story 6.4: Unit-test what only breaks under a race

As a developer maintaining the optimistic layer,
I want the reconciliation and rollback rules tested directly,
So that the product's concentrated complexity has a test that does not need a browser.

**Acceptance Criteria:**

**AC1** — **Given** Vitest, **When** merge-by-id is tested, **Then** cases cover: a server row replacing its optimistic twin, an optimistic row absent from the response being kept, an id in both collapsing to one entry carrying the server record, **And** ordering remaining `id DESC` throughout.

**AC2** — **Given** per-entity rollback, **When** it is tested, **Then** a failing create removes only its own row, a failing toggle restores only that row's previous value, and a failing delete re-inserts only that row at its `id DESC` position.

**AC3** — **Given** two mutations in flight, **When** one fails, **Then** the test asserts the other's change survives — the case a whole-list snapshot rollback would break.

**AC4** — **Given** the validation predicate, **When** its Vitest suite from Story 1.5 runs, **Then** it still passes.

**AC5** — **Given** the full suite, **When** it runs, **Then** 100% of tests pass before the epic is accepted.

### Story 6.5: Verify the product on a phone and at a desktop

As a person using this one-handed on a phone,
I want the interface to fit the hand and the screen,
So that SM-4 is true at the sizes people actually hold.

**Acceptance Criteria:**

**AC1** — **Given** the smallest supported viewport, **When** the product is used one-handed, **Then** every primary action is within reach, **And** the sticky block keeps add one thumb-tap away at any scroll position.

**AC2** — **Given** any viewport width, **When** the page is inspected, **Then** the body never scrolls horizontally.

**AC3** — **Given** a Todo at the **500-character ceiling** on the **smallest** supported viewport, **When** its row renders, **Then** the text wraps and the row grows, nothing truncates or clips, **And** the result is judged acceptable — this is the `DESIGN.md` flagged tension on Poppins' wide letterforms, and if it fails the lever is `todo-text` size and line-height, never truncation.

**AC4** — **Given** desktop width, **When** the card exceeds 640px of available space, **Then** it stops growing and the ground widens around it, **And** no sidebar, second column or second region appears at any breakpoint.

**AC5** — **Given** a phone's address-bar collapse, **When** the effective viewport changes, **Then** the sticky block re-seats to the new viewport height.

### Story 6.6: Audit every contrast pair against the table

As a person with low vision,
I want the contrast promises checked by computation,
So that the palette's claims are verified rather than believed.

**Acceptance Criteria:**

**AC1** — **Given** `DESIGN.md`'s contrast table, **When** each load-bearing pair is measured against the rendered product, **Then** every computed ratio matches the tabulated value.

**AC2** — **Given** `text-completed` on `row-complete`, **When** it is measured, **Then** it is **4.69:1** — the tightest pair in the system, with no headroom — **And** any drift below 4.5:1 fails this story.

**AC3** — **Given** the three recorded 1.4.11 corrections, **When** they are checked in the running product, **Then** the checked checkbox on mint uses `accent-deep` at 4.33:1, every control boundary uses `border-control` at 3.28:1, **And** the focus ring on a Completed row uses `accent-deep`.

**AC4** — **Given** the whole product surface, **When** it is searched, **Then** `accent` never appears on mint — the 2.97:1 pair this design does not use.

**AC5** — **Given** `hairline`, **When** its uses are located, **Then** it appears only on the empty-state dashed panel and the skeleton resting fill, **And** never as the boundary of anything operable.

### Story 6.7: Audit the assembled keyboard path and target sizes

As a keyboard and switch user,
I want the finished product's tab order and hit areas verified as a whole,
So that five epics' worth of controls add up to one coherent path rather than five local decisions.

> Every control's tab position and hit area was **built** in the story that created it. This story only **measures** the assembled result.

**Acceptance Criteria:**

**AC1** — **Given** the finished product, **When** a user tabs from the top, **Then** the order is input → `Retry` when the banner is occupied → All → Active → Completed → then, per row in list order, checkbox → delete control, **And** it matches reading order.

**AC2** — **Given** every row, **When** it is tabbed through, **Then** the delete control is reachable whether or not it is visually revealed, **And** focusing it reveals it.

**AC3** — **Given** the whole surface, **When** every interactive element is measured, **Then** each has a hit area of at least 44px in both dimensions.

**AC4** — **Given** the product, **When** keyboard traps are sought, **Then** none exists outside the dialog, **And** the dialog's trap is escapable by Escape.

**AC5** — **Given** every interactive element, **When** it receives keyboard focus, **Then** the focus ring is visible and has not been suppressed anywhere.

**AC6** — **Given** the finished product, **When** it is audited against the banned list, **Then** there is no drag-to-reorder, no bulk action, no long-press menu, no toast, no undo affordance, no infinite scroll, no hover-only affordance lacking a keyboard equivalent, no modal stack deeper than one, and no animation on open.

### Story 6.8: Re-verify the README and write the deploy runbook

As a developer inheriting this project,
I want the setup path re-walked against the finished codebase,
So that NFR-6 is true of what shipped, not of what existed in Epic 1.

**Acceptance Criteria:**

**AC1** — **Given** the finished codebase, **When** a developer follows the README from clone, **Then** they reach a running application with one environment variable and no undocumented step.

**AC2** — **Given** that walk, **When** it is timed, **Then** the measurement is **re-recorded** against the final dependency set, **And** it is compared to the Epic 1 measurement so any regression is visible.

**AC3** — **Given** the deploy runbook, **When** it is written, **Then** it states how migrations are applied, how the three environments differ, and how to roll back.

**AC4** — **Given** the repository, **When** it is searched, **Then** no secret has a committed default, **And** `DATABASE_URL` is still the only required secret.

**AC5** — **Given** the product surface and the codebase, **When** both are searched for the word "Done", **Then** it appears nowhere as a Filter View name, a label, a tooltip, or in prose.
