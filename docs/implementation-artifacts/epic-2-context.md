# Epic 2 Context: See Your Todo List

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the Todo List visible for the first time, with a designed state for every way the load can go: three skeleton rows in the exact geometry of real rows while it arrives, the list itself when it lands with zero layout shift, an empty state when there is nothing, and a recoverable error with `Retry` when it fails. A Completed Todo is distinguishable from an Active one without reading a word. This epic also builds three shared modules to completion before most of their consumers exist — the single error slot with all four error kinds already modelled, the empty-state component with all three variants, and the motion module holding every duration in the product. Building them complete now is what makes Epics 4 and 5 able to run in parallel later; grown a piece at a time, they become a second definition on the first day of parallel work.

## Stories

- Story 2.1: Serve the Todo List from the server
- Story 2.2: Fetch the Todo List into the client
- Story 2.3: Build the card, the scroll model and the sticky top block
- Story 2.4: Render a Todo in both Completion Statuses
- Story 2.5: Seed the motion module and show skeleton rows while the list loads
- Story 2.6: Build the list region's resolved states — error, empty, and what they announce

## Requirements & Constraints

- **Viewing the list is the whole of this epic's user-visible scope.** A user opens the application and sees their Todos immediately, newest-first, with no sign-in and no onboarding step. Nothing here creates, toggles, or deletes.
- **State coverage is an acceptance criterion, not polish.** Every view that can be empty, slow, or fail has a designed state. No blank screens, no spinner without end, no silent failure, and no flash of the empty state on the way to content.
- **Failures are recoverable in place.** A failed load shows a message and a way to try again; retrying returns to the loading state and resolves to content or to the same message. Nothing dead-ends.
- **A load failure is not an empty list.** After a failure the list's contents are *unknown*, not known-empty — so neither the skeletons nor the empty state may be shown.
- **One responsive screen, phone and desktop.** Not two layouts and not a mobile variant. The page body never scrolls horizontally at any width, including a 500-character Todo on the smallest viewport, where the text wraps and the row grows rather than truncating or clipping.
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Client Identity`, `Filter View`. The word **Done** is banned everywhere, including identifiers and tooltips.
- **User-facing strings are exact.** Three empty-state strings, the load error string, and the `Retry` label are transcribed verbatim — short declaratives, no personality, no exclamation marks, no emoji.

## Technical Decisions

- **Ordering is `id DESC`, always.** Because a UUIDv7 is time-ordered, an optimistic row's sort position is final from the moment it is minted and the list never re-sorts when a row reconciles. The `created_at` column is server-set display metadata and is never a sort key — on the server query or in any render.
- **`GET /api/todos`** returns a bare JSON array with no envelope, scoped to the caller's identity, and returns `401` without ever issuing an identity. Failures return the shared error envelope with kind `load`; the server message is never forwarded to the interface — the client maps kind to string.
- **The repository stays the only Drizzle importer.** `listTodos(ownerId)` takes the owner first; the route handler passes the resolved identity and builds no query. The `(owner_id, id DESC)` index serves this read.
- **TanStack Query owns all server state.** Exactly one query key, `['todos']`, and it is the only one the application will ever have. No server-derived Todo data in `useState`; no component calls `fetch` — lint enforces both. Errors are classified by the operation attempted, not by the response shape, so a transport failure is still kind `load`.
- **The error slot holds `{ kind, retry } | null`** with all four kinds — `load`, `create`, `update`, `delete` — present from the outset. A newer error replaces an older one and the replaced operation is not retried. A retry closure whose target no longer exists is a no-op that clears the slot. An expired-identity failure is the one non-retryable case: `Retry` reloads the document instead of refetching.
- **The motion module is the single home for every duration** — the 1400ms skeleton pulse, the ~400ms departure hold, the ~180ms collapse, the ~600ms first-run nudge — and for the `prefers-reduced-motion` decision. Three of the four constants have no consumer in this epic, which is the point. No component inlines a duration or reads the media query itself.
- **The list region is a persistent element.** It stays in the DOM across loading, error, empty and content, so skeletons have something to mount into and the swap costs no layout shift.
- **Completed-row styling is expressed once:** the row sets a single variant marker and descendants derive from it. No component re-tests Completion Status to pick a colour.
- **Design tokens are already transcribed** into the theme; no hex literal and no arbitrary-value class may appear in any component. A value not in the theme is added there first, under its original token name.
- **Testing:** Vitest for unit and component work (jsdom is already wired). End-to-end with route interception belongs to Epic 6, but the forced-failure paths built here are what it will drive.

## UX & Interaction Patterns

- **One column, one card.** Capped at 640px and centred on the ground; below 640px it fills the viewport less 18px each side. Fixed vertical order inside it, which never reorders: add input → error banner region → filter tabs → list. Nothing sits above the input; the product name appears in the browser tab title only.
- **Scroll model:** exactly one scrolling element, the page body. The card has no fixed height and no inner scroll region; it grows downward, and nothing is added to cue "more below" — no fade, no inner shadow, no region-local scrollbar.
- **Sticky top block:** the input, banner region and tabs hold at the top of the viewport on an opaque card surface while the list runs underneath. The container already exists; the input joins it in Epic 3 and the tabs in Epic 4 by being placed inside it, never by re-implementing stickiness.
- **The banner region occupies layout whether or not it holds a message**, so a banner appearing never shifts the list. Clay/terracotta ramp, leading line icon, message, trailing pill `Retry` — the only control in the region, 44px hit area, in the tab order after the input's position and before the filter tabs.
- **Skeletons are geometry, not decoration.** Three rows in the exact fill, radius, padding, shadow and minimum height of an Active row, staggered so the pulse is not one flat beat. Under reduced motion the pulse holds still and the geometry stays. The card and sticky block are already real and interactive while skeletons show; only the list region is skeletal. Optimistic operations never show a skeleton.
- **The empty state carries no button and no control** — a centred dashed panel, a 40px mint ring with a line glyph (plus on All, check on the other two), the first line, and a second line on All only.
- **Announcements go through the one `announce(message, urgency)` function.** Empty resolutions are polite; errors are assertive, because they report a failure the user did not cause. No component renders its own `aria-live`, and there remains exactly one polite and one assertive region in the DOM.

## Cross-Story Dependencies

- **Stories 2.1–2.4 are complete.** The endpoint, the `useTodos` hook, the card with its scroll model and sticky container, and both row variants already exist; 2.5 and 2.6 build on them.
- **2.5 must land before 2.6 can finish:** the error state's `Retry` returns the list region to skeletons, and the load-failure state is defined against them. 2.5 also converts the list region from a null-return to a persistent element that 2.6's states render into.
- **2.5 unblocks Epics 4 and 5 in parallel** — both import the same collapse constant from the motion module, which is the only reason it is seeded this early.
- **2.6 models states that only later epics make reachable:** three of the four error kinds have no producer until Epics 3–5, and the Active and Completed empty-state variants are unreachable until Epic 4 ships the Filter Views. Build all of them anyway.
- **Depends on Epic 1** for the shared contract, the owner-scoped repository, the identity middleware, the query client, the design tokens, and the `announce` function.
