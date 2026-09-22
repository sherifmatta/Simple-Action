# Epic 2 Context: See Your Todo List

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the Todo List visible for the first time, with a designed state for every way the load can go: three skeleton rows in the exact geometry of real rows while it arrives, the list itself when it lands with zero layout shift, an empty state when there is nothing, and a recoverable error with `Retry` when it fails. A Completed Todo is distinguishable from an Active one without reading a word. This epic also builds three shared modules to completion before most of their consumers exist — the single error region with all four error kinds already modelled, the empty-state component with all three variants, and the motion module holding every duration in the product. Building them complete now is what makes Epics 4 and 5 able to run in parallel later; grown a piece at a time, they become a merge conflict and a second definition on the first day of parallel work.

## Stories

- Story 2.1: Serve the Todo List from the server
- Story 2.2: Fetch the Todo List into the client
- Story 2.3: Build the card, the scroll model and the sticky top block
- Story 2.4: Render a Todo in both Completion Statuses
- Story 2.5: Seed the motion module
- Story 2.6: Show skeleton rows while the list loads
- Story 2.7: Build the error banner and the error slot
- Story 2.8: Build the empty state in all three variants
- Story 2.9: Announce what the list region is doing

## Requirements & Constraints

- **Viewing the list is the whole of this epic's user-visible scope.** A user opens the application and sees their Todos immediately, newest-first, with no sign-in and no onboarding step. Nothing here creates, toggles, or deletes.
- **State coverage is an acceptance criterion, not polish.** Every view that can be empty, slow, or fail must have a designed state. No blank screens, no spinner without end, no silent failure, and no flash of the empty state on the way to content.
- **Failures are recoverable in place.** The interface never dead-ends and never goes silently wrong. A failed load shows a message and a way to try again; retrying returns to the loading state and resolves to content or to the same message.
- **A load failure is not an empty list.** After a failure the list's contents are *unknown*, not known-empty — so neither the skeletons nor the empty state may be shown.
- **One responsive screen, phone and desktop.** Not two layouts and not a mobile variant. The page body never scrolls horizontally at any width, including a 500-character Todo on the smallest viewport, where the text wraps and the row grows rather than truncating or clipping.
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Client Identity`, `Filter View`. The word **Done** is banned everywhere, including identifiers and tooltips.
- **User-facing strings are exact.** Three empty-state strings, the load error string, and the `Retry` label are transcribed verbatim — short declaratives, no personality, no exclamation marks, no emoji.

## Technical Decisions

- **Ordering is `id DESC`, always.** Because a UUIDv7 is time-ordered, an optimistic row's sort position is final from the moment it is minted, and the list never re-sorts when a row reconciles. `created_at` is server-set display metadata and is never a sort key — on the server query and in every render.
- **`GET /api/todos`** returns a bare JSON array with no envelope, scoped to the caller's identity, and returns `401` when no valid identity is present without ever issuing one. Failures return the shared error envelope with kind `load`, and the server-side message is never forwarded to the interface — the client maps kind to string.
- **Repository stays the only Drizzle importer.** `listTodos(ownerId)` takes the owner first; the route handler passes the resolved identity and builds no query itself. The `(owner_id, id DESC)` index serves this read.
- **TanStack Query owns all server state.** Exactly one query key, `['todos']`, and it is the only one the application will ever have. No server-derived Todo data lives in `useState`; no component calls `fetch` — lint enforces both. Errors are classified by the operation attempted, not by the response shape, so a transport failure is still kind `load`.
- **The error slot holds `{ kind, retry } | null`** with all four kinds — `load`, `create`, `update`, `delete` — present from the outset. A newer error replaces an older one and the replaced operation is not retried. A retry closure whose target no longer exists is a no-op that clears the slot.
- **The motion module is the single home for every duration** — the 1400ms skeleton pulse, the ~400ms departure hold, the ~180ms collapse, the ~600ms first-run nudge — and for the `prefers-reduced-motion` decision. Three of the four constants have no consumer in this epic, which is the point. No component inlines a duration or reads the media query itself.
- **Completed-row styling is expressed once:** the row sets a single variant marker and descendants derive from it. No component re-tests Completion Status to pick a colour.
- **Design tokens are already transcribed** into the theme; no hex literal and no arbitrary-value class may appear in any component. A value not in the theme is added there first, under its original token name.
- **Testing:** unit work is Vitest; the first component test in this epic is the one that adds jsdom and the `.tsx` test glob. End-to-end coverage with route interception is Epic 6's, but forced-failure paths built here are what it will drive.

## UX & Interaction Patterns

- **One column, one card.** Capped at 640px and centred on the ground; below 640px it fills the viewport less 18px each side. Fixed vertical order inside it, which never reorders: add input → error banner region → filter tabs → list. Nothing sits above the input — no wordmark, no title bar, no greeting; the product name appears in the browser tab title only.
- **Scroll model:** exactly one scrolling element, the page body. The card has no fixed height and no inner scroll region; it grows downward. Once the list is long the card has no visible bottom edge, and nothing is added to cue "more below" — no fade, no inner shadow, no region-local scrollbar. The page's own scrollbar is the cue.
- **Sticky top block:** the input, banner region and tabs detach from the card's flow and hold at the top of the viewport on an opaque `card` surface while the list runs underneath. Build the container now; the input joins it in Epic 3 and the tabs in Epic 4 by being placed inside it, never by re-implementing stickiness. In this epic its only occupant is the banner region.
- **The banner region occupies layout whether or not it holds a message**, so a banner appearing never shifts the list. It carries the clay/terracotta ramp, a leading line icon, the message, and a trailing pill `Retry` — the only control in the region, with a 44px hit area, sitting in the tab order after the input's position and before the filter tabs.
- **Skeletons are geometry, not decoration.** Three rows in the exact fill, radius, padding, shadow and minimum height of an Active row, staggered so the pulse is not one flat beat, pulsing from the hairline tone toward the tab-track tone. Under reduced motion the pulse holds still and the geometry stays — its job is preventing layout shift, not animating. The card, input and tabs are already real and interactive while skeletons show; only the list region is skeletal.
- **The empty state carries no button and no control** — a centred dashed panel, a 40px mint ring with a line glyph (plus on All, check on the other two), the first line, and a second line on All only.
- **A Completed row changes three cues simultaneously** — mint fill, filled checkmark, 1.5px line-through — plus the green shadow re-tint, so status survives colour being removed. The row body is not a click target.
- **Announcements go through the one `announce(message, urgency)` function.** Empty resolutions are polite; errors are assertive, because they report a failure the user did not cause. No component renders its own `aria-live`, and there remains exactly one polite and one assertive region in the DOM.

## Cross-Story Dependencies

- **Server-to-client chain:** 2.1 → 2.2 → (2.6, 2.7, 2.8). The endpoint must exist before the hook, and the hook's loading/error/empty resolution is what the three state stories render against.
- **Layout first:** 2.3 creates the card and the sticky container that 2.4, 2.6, 2.7 and 2.8 all render inside. Start it early; it unblocks the widest set.
- **2.5 blocks 2.6** (the pulse duration) and is otherwise independent — it can be built in parallel with the server chain.
- **2.7 and 2.8 are coupled by the resolution path:** a load failure suppresses the empty state, and a `Retry` that succeeds with zero Todos is what makes the All empty state appear. Build 2.7 first.
- **2.9 depends on 2.7 and 2.8** for the strings it announces and on the app shell's announcer.
- **Carried over from Epic 1:** the first endpoint built here owns constraining the error envelope's `message` so no driver text reaches the wire; the first query hook here owns the lint rule that forbids an unapproved `queryKey`; and the first component test here adds jsdom and proves the live regions survive hydration rather than only server render.
- **Downstream:** Epic 3 adds the input to the sticky block and depends on the merge-by-id behaviour the list query is shaped for — a create must never cancel the list read. Epic 4 fills the filter tabs and makes the Active and Completed empty variants reachable. Epics 4 and 5 both import collapse timing from the module seeded here.
