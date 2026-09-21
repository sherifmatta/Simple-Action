---
name: Simple Action
description: Experience spine for a single-screen personal Todo List. Optimistic by default, every state designed, no onboarding.
status: final
sources:
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/prd.md"
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/addendum.md"
updated: 2026-09-20
---

# Simple Action — Experience Spine

> How Simple Action works. Visual identity, tokens and colour values live in `DESIGN.md`. Tokens are referenced here by name only; no hex value appears in this document.
>
> Rendered references are listed below and linked inline at the sections they illustrate. **The spines win on conflict with any mock, wireframe, or import.**

**What's where.** Colour, type, spacing and component recipes are in `DESIGN.md` frontmatter; per-colour rationale is in its §Colors, per-component visual specs in its §Components, and every load-bearing contrast ratio in its §Dos and don'ts. Behavioural rules per component are in §Component Patterns; every designed non-resting state is in §State Patterns. Every user-facing string is tabulated in §Voice and Tone. Flagged tensions and accepted costs are marked **Flagged tension.** and **Accepted cost.**, and this document's two both sit in §Interaction Primitives. §Coverage closes the document, mapping every FR and SM to the sections that specify it.

**Rendered references.**

| File | What it shows |
|---|---|
| [`mockups/key-main.html`](mockups/key-main.html) | The screen at rest at phone and desktop width: card on ground, input, filter tabs, a populated list. |
| [`mockups/key-states.html`](mockups/key-states.html) | Every non-resting state: loading, all three empties, both failures, both character-ceiling thresholds, and the focus ring on each control. |
| [`mockups/key-delete.html`](mockups/key-delete.html) | The delete path end to end: row at rest, swipe revealed, dialog open, first-run nudge. |
| [`imports/dribbble-22456682-todo-list-app.png`](imports/dribbble-22456682-todo-list-app.png) | The supplied Dribbble import, accounted for in `DESIGN.md` §Brand & Style. |

## Foundation

Single-surface responsive web. One screen serves phone and desktop; there are no native applications and no second screen.

**No UI system, framework, or component library is named**, deliberately; `DESIGN.md` defines every visual token from scratch and this document specifies behaviour only. A downstream implementation that adopts a component library inherits the behaviour specified here and the tokens specified in `DESIGN.md`, not the library's defaults.

The PRD states the stakes verbatim: hobby and learning. One anonymous user per browser, non-sensitive data, no authentication, no accounts, no settings. The application requires a network connection to load and change data; it is not offline-capable.

The product has three operations: add, toggle, delete. Each takes a single interaction, and each appears on screen before the server confirms.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| The list screen | Opening the application. There is no other entry point. | Add a Todo, see the Todo List, toggle Completion Status, filter, trigger delete |
| Delete confirmation dialog | Triggering delete on any row | Confirm or cancel a permanent removal |

That is the whole map. The list screen is composed, top to bottom, in a fixed order that never reorders: add input (pinned, always visible) → error banner region → filter tabs → Todo list, newest first. The screen at rest, at phone and desktop width, is rendered in [`mockups/key-main.html`](mockups/key-main.html).

Nothing sits above the input. There is no wordmark, no title bar and no greeting on the surface; the product name appears in the browser tab title only, so the card opens straight into the input.

**List order is newest-first by creation timestamp, and Completion Status never moves a row.** Completing a Todo does not sink it to the bottom, un-completing it does not raise it, and there is no secondary sort. Within a Filter View a row occupies the same position until it is deleted or until a toggle takes it out of that view entirely.

**Scroll model — the page scrolls, the card grows, and the top of the card is sticky.** There is exactly one scrolling element in the product and it is the page body. The card has no fixed height and no inner scroll region: it grows downward as the list grows, and when it outgrows the viewport the page scrolls. A visible consequence, stated so it is not read as a defect: once the list is long the card has no visible bottom edge — its lower corners and shadow are below the fold. Nothing is added to cue that there is more below; the page's own scrollbar does that job, as it does on any web page.

**The add input, the error banner region and the filter tabs are sticky to the top of the viewport.** "Pinned, always visible" means sticky, not merely first in order: they hold at the top of the viewport while the list scrolls underneath them on an opaque surface. This is what makes add one tap away however long the list runs — a user far down a long list captures the next Todo without scrolling back up. UJ-2's type-Enter-type rhythm depends on this; without it, a list of 200 Todos would break that rhythm. The list is the only part of the card that moves. Switching Filter View does not scroll the page; a shorter view ends higher.

**Focus is not obscured by the sticky block (WCAG 2.4.11, AA).** §Accessibility Floor owns that requirement and its mechanics, and `DESIGN.md` §Layout & Spacing carries the layout side of it.

There is no navigation, no routing, no settings, no onboarding, no tour, no tooltips, no first-run wizard, no profile, no second screen. The Filter View is the only view state on the surface, and it resets to All on reload.

The dialog is the only thing that ever stacks on the list screen, and it stacks exactly one level deep. Nothing opens on top of it.

## Voice and Tone

Plain and unadorned. Short declaratives. No personality, no encouragement, no exclamation marks, no emoji. The interface states what is true and stops.

**"Done" is banned.** Filter View names match Completion Status values exactly — All, Active, Completed — and no synonym for Completed is used anywhere in interface copy.

Every user-facing string in the product:

| Where | String |
|---|---|
| Input placeholder | `what needs doing?` |
| Empty — All, first line | `Nothing here yet.` |
| Empty — All, second line | `Type above to add your first Todo.` |
| Empty — Active | `Nothing active.` (first line only; there is no second line) |
| Empty — Completed | `Nothing completed yet.` (first line only) |
| Error banner — load failure | `Couldn't load your Todos.` + `Retry` |
| Error banner — add failure | `Couldn't add that Todo.` + `Retry` |
| Error banner — toggle failure | `Couldn't save that change.` + `Retry` |
| Error banner — delete failure | `Couldn't save that change.` + `Retry` |
| Dialog title | `Delete this Todo?` |
| Dialog buttons | `Cancel` · `Delete` |
| Filter tabs | `All` · `Active` · `Completed`, each followed by its count — `All 4` · `Active 2` · `Completed 2` |
| Character counter | the remaining count as a bare numeral — `38` |

The two empty-state lines are separate strings in separate roles, not one sentence that happens to wrap; `{components.empty-state}` in `DESIGN.md` gives each its own type role and colour. Only the All view carries a second line.

**Four error kinds, three error strings — one string per kind of failure.** `Couldn't load your Todos.` is used when the Todo List could not be fetched, and nothing else uses it — saying "save" about a failed load would describe an operation that never happened. `Couldn't add that Todo.` is used when a submitted Todo could not be created, and nothing else uses it: an add is not a change to something that exists; it is a creation that never completed, and the user is looking at their own text back in the input rather than at a row that reverted. `Couldn't save that change.` is used for a failed toggle and a failed delete, which share a string because they share a shape — an existing Todo the user acted on, restored on screen to what it was. The strings split where the recovery splits; they do not split one per operation for its own sake.

| Do | Don't |
|---|---|
| `Nothing active.` | `All caught up! 🎉` |
| `Couldn't save that change.` | `Oops! Something went wrong.` |
| `Delete this Todo?` | `Are you sure you want to permanently delete this item?` |
| `what needs doing?` | `Add a task to crush today!` |
| State the fact, then stop | Congratulate, reassure, or coach |

## Component Patterns

Behavioural only. Visual specs live in `DESIGN.md.Components`. The resting components are rendered in [`mockups/key-main.html`](mockups/key-main.html); the ones that only exist in a non-resting state in [`mockups/key-states.html`](mockups/key-states.html); the delete path in [`mockups/key-delete.html`](mockups/key-delete.html).

| Component | Use | Behavioural rules |
|---|---|---|
| `{components.input-add}` | Top of the list screen, always visible | Enter submits. Whitespace-only input is a silent no-op — nothing is created, no error is shown, the input is not cleared. A successful submit clears the input, retains focus, sets the Filter View to All, and places the new Todo at the top of the list. Hard ceiling of 500 characters, enforced at entry: keystrokes beyond 500 produce nothing. **Autofocuses on pointer devices and not on touch** — UJ-2 has Sam typing straight in at a laptop, where a caret costs nothing, while UJ-1 has Dana opening her phone to read her list, where autofocus would raise the software keyboard and bury the list she came to read. |
| `{components.char-counter}` | Trailing edge of the input | Absent below 450 characters. Fades in at 450 and counts down remaining characters to 0, rendered as a bare numeral with no unit or label. Its only job is to make the hard stop at 500 predictable rather than mysterious. It is not validation and never reports an error, and nothing about it changes at exactly 500. |
| `{components.todo-row-active}` | List, in All and Active | The checkbox toggles Completion Status. The row body is not a click target — there is no editing, so there is nothing for a row click to open. Hovering reveals `{components.delete-action}` on pointer devices. |
| `{components.todo-row-completed}` | List, in All and Completed | Same as Active in every behaviour. Toggling returns the Todo to Active. Delete works on a Todo in either Completion Status. |
| `{components.checkbox}` | Every row | One tap or click toggles. Optimistic: the row changes before the server confirms. Two-way — Completed can go back to Active by the same interaction. |
| `{components.filter-tabs}` | Below the error banner region | Three segments, all three visible from first run. Each carries a count of the Todos in its own view — `All 4`, `Active 2`, `Completed 2`. Counts are derived locally from the loaded list, fire no network request, and update the instant an optimistic add, toggle or delete changes the list. A count of zero shows as `0` rather than hiding. **Each count is part of the tab's accessible name**, so a screen-reader user hears "Active 2", not "Active". Switching Filter View is local: it fires no network request and cannot fail. Selection resets to All on reload and is forced to All by a successful add. |
| `{components.error-banner}` | One fixed region, directly under the input | Owns every error in the product: load failure, failed add, failed toggle, failed delete. Occupied or empty, its region is part of the layout, so appearing does not shift the list. Carries `Retry`, whose behaviour is defined per error kind below. The region holds one message at a time; a newer error replaces an older one, and the replaced operation is not retried. The banner clears when the retried operation succeeds or when the user performs a successful operation of the same kind. |
| `{components.empty-state}` | List region, replacing the list when the active Filter View resolves to nothing | Shown only once loading has resolved — never while skeletons are showing and never after a load failure, when the list's contents are unknown rather than known-empty. A first line in every view; a second line, pointing at the input, on the All view only. It carries no button and no control: the next step is the input already visible above it. |
| `{components.dialog-delete}` | Triggered from `{components.delete-action}` | Modal. Nothing is removed until the user chooses `Delete`. Cancel closes and leaves the Todo List untouched. Focus is trapped while open, lands on `Cancel` rather than `Delete`, and returns to the trigger on close. |
| `{components.skeleton-row}` | List region, during initial load only | Three of them, shown in place of rows while the Todo List is loading. Never shown for an add, toggle, or delete — those are optimistic and have no loading state. |
| `{components.delete-action}` | Every row | Swipe-to-reveal on touch, trailing hover icon on pointer, and a keyboard route that is always available regardless of input modality. All three open the same dialog. |

**What `Retry` retries.** One control, four error kinds, and it does something different in each. Stated here so it is never guessed:

| Error kind | Banner string | `Retry` re-attempts | What the user sees |
|---|---|---|---|
| Load failure | `Couldn't load your Todos.` | The Todo List request, unchanged | The list region returns to `{components.skeleton-row}` while the request runs, then resolves to content, to `{components.empty-state}`, or to the same banner again |
| Add failure | `Couldn't add that Todo.` | The creation of the same Todo, using the text now sitting in the input | On success the Todo appears at the top of the list, the input clears and keeps focus, and the Filter View is forced to All, exactly as a first-time submit does |
| Toggle failure | `Couldn't save that change.` | Setting that Todo to the Completion Status the user asked for — not a fresh toggle of whatever it is now | The row moves to the requested status optimistically again, and departs the view again if the Filter View no longer matches |
| Delete failure | `Couldn't save that change.` | The deletion of the same Todo | The row is removed again optimistically. The dialog does **not** re-open; the user already confirmed, and asking twice would make `Retry` a second confirmation |

`Retry` operates on the one failed operation the banner is currently reporting, and that operation only. If the row it referred to has since been deleted, or the Todo has since been changed by another interaction, `Retry` does nothing and the banner clears — there is nothing left to re-attempt.

## State Patterns

Every state below is an acceptance criterion, not polish. A view that can be empty, slow, or fail has a designed state for it, or the product is not finished. Every non-resting state in this table is rendered in [`mockups/key-states.html`](mockups/key-states.html).

| State | Surface | Treatment |
|---|---|---|
| **Initial load** | List region | Three `{components.skeleton-row}` in the exact geometry of real rows, pulsing gently. The card, input and filter tabs are already real and interactive — the user can start typing before the list arrives. Filter-tab counts render as `0` until the list resolves. Zero layout shift when content lands. No blank screen, and no flash of the empty state on the way to content. |
| **Add during initial load** | List region + input | A Todo submitted before the list arrives shows its optimistic row immediately above the skeleton rows, and the arriving list merges by id. The add-during-load paragraph below this table states the race in full. |
| **Empty — All** | List region | `{components.empty-state}` reading `Nothing here yet.` over `Type above to add your first Todo.` Shown only once loading has resolved with zero Todos. The second line points at the input, which is already visible directly above it. |
| **Empty — Active** | List region | `Nothing active.`, first line only. Reached when every Todo is Completed. No second line and no call to action — the user has nothing outstanding and needs nothing from the interface. |
| **Empty — Completed** | List region | `Nothing completed yet.`, first line only. Reached when no Todo has been completed. No second line, no call to action. |
| **Load failure** | `{components.error-banner}` | `Couldn't load your Todos.` with `Retry` — the load string, not the save string, because nothing was being saved. The banner appears in its fixed region; the list region shows no skeletons and no empty state, because the list's contents are unknown rather than known-empty. `Retry` re-requests the Todo List and returns to the initial-load skeleton while it runs. Nothing dead-ends. |
| **Optimistic add** | List + input | The Todo appears at the top of the list immediately, the input clears and keeps focus, and the Filter View becomes All so the new Todo is never created out of sight. On server confirmation the row's identity is reconciled silently — nothing visible changes. |
| **Add revert** | List + input + banner | A failed add removes the optimistically added Todo from the list and **returns its text to the input**, so nothing the user typed is lost by a failure they did not cause. The input holds that text with the caret at the end, and is not cleared again until the add succeeds. The banner shows `Couldn't add that Todo.` with `Retry`, which re-attempts the creation using the text now in the input. The capture is recoverable in place: the text is put back rather than left for the user to remember. |
| **Optimistic toggle** | Row | The row changes to the other Completion Status immediately: fill, checkmark and strikethrough all together. It does not change position — the list is ordered newest-first and Completion Status never moves a row. If the new status no longer matches the active Filter View, the departure transition runs and the row leaves. The filter-tab counts update with the change. |
| **Toggle revert** | Row + banner | A failed toggle restores the previous Completion Status on screen and the banner shows `Couldn't save that change.` with `Retry`. If the Todo had already left the view via the departure transition, it returns to the list in its original position along with the message — the reversal is as visible as the change was. |
| **Optimistic delete** | Row | When the user chooses `Delete` the dialog closes and the row is removed from the list immediately; the rows below close the gap with the same collapse motion as the departure transition. |
| **Delete restore** | Row + banner | A failed deletion returns the Todo to the list in its original position and the banner shows `Couldn't save that change.` with `Retry`. The list never holds a state the server rejected. If the server rejects a change, the banner says so. |
| **Character ceiling — approach** | Input | At 450 characters `{components.char-counter}` fades in and counts down. Nothing else changes; typing continues normally. |
| **Character ceiling — stop** | Input | At 500 characters further keystrokes produce nothing. The counter reads `0`. Nothing about its appearance changes at the ceiling — no colour change, no weight change, no error, no banner, no shake. The count reaching 0 is the explanation. |
| **Whitespace-only submit** | Input | Nothing is created, nothing breaks, no error state is shown. A whitespace-only submit is treated as a mis-press. |
| **Focus** | Every interactive element | The `DESIGN.md` focus ring, always visible on keyboard focus, never suppressed. On a Completed row the ring takes the `-on-complete` variant — same geometry, deeper hue — because `{colors.accent}` on `{colors.row-complete}` is below the 1.4.11 floor. A focused control is never obscured by the sticky top block. |

**The add-during-load race, stated once and relied on everywhere above.** The initial-load state makes the card, input and filter tabs real and interactive while only the list is skeletal. That is a deliberate choice — it is what lets a user capture a thought the instant the page paints — and it makes one race reachable: a submit that lands before the Todo List does. The resolution is that **the optimistic row renders immediately, above the skeletons, and the arriving list merges by id.** It renders where the newest Todo belongs, at the top of a list whose older entries are still loading, which is exactly where it will sit once they land; the skeletons stay and keep pulsing, and the optimistic row does not pulse, because it is real. Nothing is held back waiting for the response, because holding would make the input interactive in appearance only; and nothing is thrown away when the response arrives, because the response was issued before the Todo existed, so the response omitting it is not evidence that it is gone. Merge-by-id is the rule, and it is a merge rather than a wholesale replacement: the skeletons are dropped, the fetched Todos are matched into the list by identity and take their place, and the optimistic row keeps its place if the response does not yet contain it and collapses into its own entry if it does, reconciled with its server identity and kept. **The Todo is never dropped and never duplicated**, and if the add itself then fails, the ordinary add-revert path runs — the row is removed and its text is returned to the input, exactly as it would be after a load that had already resolved. If the *load* fails while the optimistic row is on screen, the row stays, the banner reports the load failure, and `Retry` re-requests the list, which merges the same way.

## Interaction Primitives

The delete path in full is rendered in [`mockups/key-delete.html`](mockups/key-delete.html), which is the reference for the three routes and the nudge described below.

**Add — Enter to submit, focus retained.** Typing into `{components.input-add}` and pressing Enter creates the Todo. The input clears and *keeps focus*, so consecutive capture needs no extra interaction — type, Enter, type, Enter. Focus is never moved to the new row, because moving it would break the rhythm that makes capture one interaction.

**Add is available from the first paint, including during load.** The input is never disabled, never read-only and never waiting on the Todo List: `{components.input-add}` is interactive while `{components.skeleton-row}` are still showing, so that a capture surface accepts a thought the moment the thought arrives. A submit in that window places its optimistic row directly above the skeletons, and §State Patterns owns that race in full. This is the only place the list's ordering rule needs restating; it is the same rule — newest first by creation timestamp — applied to a list that is still only partly known.

**Toggle — one interaction, optimistic, two-way.** One tap or click on `{components.checkbox}`. The screen changes first; the server reconciles behind it.

**Departure transition — ~580ms total.** When a toggle makes a Todo no longer match the active Filter View, the row does not vanish. It holds in its new Completion Status for ~400ms so the change is visibly *caused*, then fades and collapses its height over ~180ms while the rows below slide up to close the gap. Cause and effect are both visible. The same collapse runs on a confirmed delete, without the 400ms hold — a deleted Todo has no new state to show.

**First-run swipe nudge — once ever.** On a browser's first-ever visit, and only if the list is non-empty, the topmost row slides ~24px to expose a sliver of `{components.delete-action}` and then settles back, over ~600ms. It is motion, not instruction: there is no tooltip, no coach mark, no tour, nothing to dismiss and nothing that can be dismissed wrongly. It does not repeat on later visits or after a reload, and it does not fire on the empty first-run screen — a row must exist for there to be anything to nudge.

**Delete — three routes to one dialog.**
- *Touch:* swipe a row leftward to reveal `{components.delete-action}`; tapping the revealed action opens the dialog.
- *Pointer:* hovering a row reveals a trailing delete icon; clicking it opens the dialog.
- *Keyboard:* the delete control for each row is reachable in the tab order — it is focusable whether or not it is visually revealed, and focusing it reveals it. Enter or Space opens the dialog. This route is mandatory and is not a fallback: it is the WCAG 2.2 AA floor, and a pointer-hover-only or gesture-only affordance would fail it.

**Filter — local, instant, cannot fail.** Switching Filter View fires no network request, so it has no loading state and no error state.

**Banned everywhere:** drag-to-reorder, bulk actions, long-press menus, toasts, undo affordances, infinite scroll, hover-only affordances without a keyboard equivalent, modal stacks more than one level deep, and any animation on open.

**Flagged tension.** Swipe-to-reveal is a hidden gesture. The PRD's source material forbids tours, tooltips and onboarding, and SM-1 requires a first-time user to complete add, complete and delete *without instruction and without backtracking*. Those two facts pull against each other. The resolution chosen is the once-ever nudge above — discoverability delivered as motion rather than as instruction, which satisfies SM-1 without amending the PRD. The hidden-gesture cost is real and is accepted knowingly; it is the first thing to re-measure if SM-1 fails in practice.

**Accepted cost.** There is no text editing, and delete is guarded by a confirmation dialog. Fixing a typo is therefore a three-interaction operation: open the dialog, confirm, retype. This is the PRD's own sharpest usability trade. An undo toast was considered and rejected for v1. Inline editing is the first candidate for v2.

## Accessibility Floor

WCAG 2.2 AA across the single responsive surface. Fully specified, not aspirational.

### Contrast

Every text pair clears 4.5:1 for 1.4.3. Every non-text graphic that carries information or identifies a control clears 3:1 for 1.4.11 — which is a requirement met by design, not a property the palette happened to have: three pairs failed it and were changed. All three are now stated as rules:

- The checked checkbox must clear 3:1 against the row it sits on. On a Completed row that means `{colors.accent-deep}` on `{colors.row-complete}`, not `{colors.accent}`, which measures below the floor on mint.
- Every boundary that identifies a control — the unchecked checkbox, the input, the Cancel button, the `Enter` hint — uses `{colors.border-control}` and clears 3:1. `{colors.hairline}` is decorative only, does not clear 3:1, and may **never** be the edge of anything operable.
- **The focus ring must clear 3:1 against the surface it is drawn on**, because a focus indicator is a non-text graphic that identifies the currently focused control. On a Completed row it takes `{colors.accent-deep}` — the same step-down as the checkbox, for the same measured reason, since `{colors.accent}` on mint is the identical failing pair. On an Active row, and on every control not sitting on mint, it stays `{colors.accent}`. Only the hue changes; the ring's geometry and weight are the same everywhere, so focus never looks like two different things. The 4px bloom does not rescue the ring on mint: a low-opacity bloom is fainter than the edge that already failed.

The claim is not that every non-text graphic in the product clears 3:1 unconditionally: `{colors.hairline}` at 1.28:1 and the mint row fill against white at 1.32:1 do not, and neither has to — one is a decorative separator, exempt under 1.4.11, and the other is never the only cue for the state it accompanies. Every ratio, including the two that fail and the reason each is permitted, is tabulated in `DESIGN.md` §Dos and don'ts, which owns the numbers and carries an explicit warning on the one text pair with no headroom.

### Keyboard path

Every interactive element is reachable and operable by keyboard, in a tab order that matches reading order: input → Retry (when the banner is occupied) → All → Active → Completed → then, per row in list order, checkbox → delete control. The row's delete control is in the tab order whether or not it is visually revealed, and receiving focus reveals it. Enter submits from the input. Enter or Space activates checkboxes and buttons. There are no keyboard traps outside the dialog, and the dialog's trap is deliberate and escapable.

### Focus is never obscured (2.4.11, AA)

The input, banner region and filter tabs are sticky to the top of the viewport, which is precisely the arrangement that hides a focused row from a keyboard user tabbing down a long list: the browser scrolls the focused control flush to the top of the viewport, and the sticky block lands on top of it. The scroll container's `scroll-padding-top` — and `scroll-margin-top` on each focusable row control — must therefore account for the full rendered height of the sticky block, input plus banner region plus tabs plus the gaps between them, measured live rather than hard-coded, because the banner region's occupancy changes that height. A focused checkbox or delete control must then always come to rest *below* the sticky block and **must never be even partially covered**. The requirement holds at every scroll position and in every Filter View. `DESIGN.md` §Layout & Spacing states the layout mechanics; the behavioural commitment is here — the focused control is always visible, at every scroll position.

### Dialog

`{components.dialog-delete}` traps focus while open. Initial focus lands on Cancel, the safe choice. Tab cycles within the dialog only. Escape closes it as Cancel does. On close — by `Cancel`, Escape, or `Delete` — focus returns to the control that opened it, or, when choosing `Delete` removed that control along with its row, to the checkbox of the row that took its place, or to the input if the list is now empty. Focus is never dropped to the document body.

### Live-region announcements

A polite live region announces:

- *On add* — the Todo text, then `added`.
- *On toggle* — the Todo text, then `Completed` or `Active`.
- *On departure* — the Todo text, then `removed from Active` or `removed from Completed`, so a screen-reader user learns what the departure transition shows visually.
- *On delete* — the Todo text, then `deleted`.
- *On error* — whichever of the three error strings applies to the error kind: `Couldn't load your Todos.`, `Couldn't add that Todo.`, or `Couldn't save that change.` for a toggle or a delete. Announced assertively, because it reports a failure the user did not cause and would otherwise not know about. The banner's Retry is reachable immediately after.
- *On empty* — when a Filter View resolves to empty, its empty-state text is announced: both lines on the All view, `Nothing here yet. Type above to add your first Todo.`, and the single line on the other two, `Nothing active.` or `Nothing completed yet.`

### Roles and state

Each row's checkbox exposes its Completion Status as a checked/unchecked state, not as colour or decoration. The filter tabs expose which segment is selected, **and each tab's count is part of its accessible name** — the name is `All 4`, `Active 2`, `Completed 2`, so a screen-reader user gets the at-a-glance number sighted users get rather than a count rendered as decoration beside an unlabelled control. The delete control is labelled with the Todo it acts on, so the tab order does not read as a list of identical `Delete` buttons.

### Targets

Every interactive element has a hit area of at least 44px in both dimensions, including the checkbox whose visual mark is smaller, each filter segment, the delete control in both its revealed and hover presentations, Retry, Cancel and Delete.

### `prefers-reduced-motion`

Two behaviours change, both specified:

- *Departure transition* — cuts straight to the end state. No 400ms hold, no fade, no collapse, no slide-up. The row is gone from the view it no longer matches, and the live-region announcement still fires, so the information the motion carried is not lost.
- *First-run swipe nudge* — skipped entirely. It does not play, and it still spends its once-ever flag so it cannot fire later if the preference changes. The keyboard route to delete is unaffected and remains the guaranteed path.

The skeleton pulse also holds still under reduced motion; the skeleton geometry stays, because its job is preventing layout shift, not animating.

## Responsive & Platform

One responsive web interface. Phone and desktop are the same screen at different widths — not two layouts, not a mobile variant.

| Width | Behaviour |
|---|---|
| Phone | Single column. Below `{spacing.card-max-width}` the card fills the viewport minus `{spacing.margin-phone}` on each side. Filter segments divide the track equally, carry their counts, and stay at the 44px minimum. Delete is reached by swipe. Everything the user needs — input at the top, list below — sits within one-handed reach; the interface never requires a second hand or a reach past the top of the card for a primary action. The sticky top block keeps that true on a long list: the page scrolls, the input and tabs stay, and add stays one thumb-tap away at any scroll position instead of requiring a scroll back to the top. |
| Desktop | The same single column, centred on the ground, capped at `{spacing.card-max-width}`. It is one column at every breakpoint: past the cap the card stops growing and the ground widens around it. No sidebar, no multi-column list, no second region, no hover-only controls that lack a keyboard equivalent. Delete is reached by the trailing hover icon or by keyboard. The `Enter` hint in the input is visible at pointer widths. Same scroll model, same sticky block — a taller viewport means more of the list is visible before the page starts scrolling. |

Vertical scrolling is the page's at both widths; §Information Architecture owns the model. There is no nested scroll region to trap a wheel gesture, no inner scrollbar, and no case where the page and a region disagree about which one a swipe belongs to. The sticky input and tabs behave identically on touch and pointer; the phone's address-bar collapse is the only thing that changes the effective viewport, and the sticky block re-seats to the new viewport height.

No horizontal scrolling at any width. Long Todo text wraps and the row grows; nothing truncates and the page body **never** scrolls sideways.

Touch and pointer are detected by capability, not by width: the swipe route and the hover route are both available on a device that supports both, and the keyboard route is available always. Input autofocus follows the same capability test — pointer yes, touch no — not a width breakpoint; §Component Patterns carries the rule and its rationale.

Both widths are rendered side by side in [`mockups/key-main.html`](mockups/key-main.html).

## Inspiration & Anti-patterns

The import ([`imports/dribbble-22456682-todo-list-app.png`](imports/dribbble-22456682-todo-list-app.png)), what it did and did not license, and the item-by-item reconciliation ([`reconcile-dribbble-shot.md`](reconcile-dribbble-shot.md)) are accounted for in `DESIGN.md` §Brand & Style. This section states only what a reader of this document needs.

**Rejected — undo toast in place of the confirmation dialog.** It has a better feel-to-safety ratio on paper, but it costs transient client state and a deferred server call, and the PRD fixes the dialog in FR-5 and UJ-3. Kept as a live open question for v2, not built into v1.

**Partly recovered — the at-a-glance layer.** The reconciliation records the import's stat tiles as the single largest loss: the import's screen answers "how much is left" before a row is read, and a plain list does not. The counts on the filter tabs are the cheapest honest version of that and the only number the interface carries. They do not recover the rest of it.

**Adopted partly by convention, and worth noting as such.** The All / Active / Completed filter tabs are the TodoMVC convention. Familiarity is real value, but familiarity is also how a pattern gets adopted without being needed. The PRD notes that at three-to-five Todos filter tabs earn nothing. They ship in v1 anyway, all three, visible from first run, because UJ-1 depends on Active — the note is recorded here and knowingly overruled, not ignored.

## Key Flows

Four journeys. The PRD has three: UJ-1 through UJ-3 mirror its protagonists and titles verbatim. UJ-4 is authored here and rewinds the same protagonist to day one.

### UJ-1 — Dana clears the morning list from her phone

1. Dana opens Simple Action on her phone. The card, input and filter tabs are there immediately; `{components.skeleton-row}` occupy the list region for the moment it takes the Todo List to arrive.
2. Four Todos land with zero layout shift — three Active, one Completed from yesterday. All is the selected Filter View, and the tabs read `All 4`, `Active 3`, `Completed 1`.
3. She taps the checkbox on `book dentist`. The row turns mint, the checkmark fills and the text takes a strikethrough — all three at once, before the server confirms. The row stays where it is; completing something does not move it. The counts become `All 4`, `Active 2`, `Completed 2`. The live region announces `book dentist, Completed`.
4. She taps the **Active** segment. The Filter View narrows with no network request.
5. **Climax:** two Todos remain, and nothing else is on screen — no counts, no chrome, no congratulation. The list is now exactly the size of what is left to do. She closes the tab without having managed anything.

*Edge case — network down when she taps.* The toggle fails. `book dentist` reverts to Active on screen, and `Couldn't save that change.` appears in the banner under the input with `Retry`. If she had already switched to Active and the row had departed the view, it returns to the list in its original position alongside the message. The reversal is as visible as the change was.

### UJ-2 — Sam adds a task at a laptop and finds it after a refresh

1. Sam is mid-work. He opens Simple Action at his laptop and the input already has focus — it autofocuses on pointer devices, where a caret costs nothing and he types straight in. On a phone it would not; the keyboard would cover the list before he had read it.
2. He types `send invoice` and presses Enter.
3. The Todo appears at the top of the list immediately, the input clears and keeps focus, and the Filter View snaps to All so the new Todo cannot be created out of sight. The live region announces `send invoice, added`.
4. He types the next one straight away. No mouse, no second interaction.
5. An hour later he reloads the page.
6. **Climax:** `send invoice` is still there, at the top, Active. He did not create an account, did not sign in, and did not agree to anything to earn that. The Filter View is back to All, as it always is on reload — nothing else has been remembered *at* him.

*Edge case — Enter on an empty input.* Nothing is created and nothing breaks. No error, no banner, no shake, no flash. The same is true of an input holding only whitespace.

### UJ-3 — Dana removes something she no longer needs

Every beat of this journey is rendered in order in [`mockups/key-delete.html`](mockups/key-delete.html): row at rest, swipe revealed, dialog open, and the first-run nudge that teaches the gesture.

1. Dana finds a stale Todo in the list.
2. On her phone she swipes the row leftward; `{components.delete-action}` is revealed behind it. (At a laptop she would hover the row and click the trailing icon, or tab to the row's delete control and press Enter — all three open the same dialog.)
3. She taps the revealed action. `{components.dialog-delete}` opens over the list: `Delete this Todo?` with `Cancel` and `Delete`. Focus is trapped, and lands on Cancel.
4. She chooses `Delete`.
5. **Climax:** the dialog closes and the row is gone immediately, the rows below closing the gap with the same collapse motion a completed Todo uses to depart. The live region announces the Todo text and `deleted`. Focus returns to the list rather than being dropped. The removal survives a reload — there is no pending state to worry about and nothing to confirm twice.

*Edge case — the deletion fails.* The Todo returns to the list in its original position and the banner reports `Couldn't save that change.` with `Retry`. Choosing `Cancel` at step 4 instead closes the dialog, returns focus to the delete control that opened it, and leaves the Todo List untouched.

### UJ-4 (UX-authored) — Dana's first ever session

**Not in the PRD.** The PRD has three journeys; this fourth one was added here to close the first-run gap, and it reuses UJ-1's protagonist so the PRD's cast is unchanged.

Same protagonist as UJ-1 and UJ-3, rewound to day one: a browser with no Client Identity, no Todos, and no instructions.

1. Dana opens Simple Action for the first time. The browser has no Client Identity, so it is issued one and sees an empty Todo List.
2. The list region shows `{components.skeleton-row}` for the moment the request takes, then resolves — not to content, and not to a blank screen, but to the empty first-run state: `Nothing here yet.` over `Type above to add your first Todo.` The input is directly above it, and all three tabs read `0`. There is no tour, no tooltip, no welcome modal, and nothing to dismiss. The first-run swipe nudge does not fire — there is no row to nudge.
3. She types `pick up keys` and presses Enter. The empty state is replaced by one row at the top of the list; the input clears and keeps focus.
4. She adds a second — `call the landlord` — without touching the mouse or the screen again.
5. She taps the checkbox on `pick up keys`. It turns mint, the checkmark fills, the text strikes through. She taps **Completed**, sees only that one Todo, taps **Active**, sees only the other. The three segments explain themselves by being used once.
6. She reloads, to see whether it is real. The Todo List comes back identical; the Filter View is back to All.
7. Because this is still her first ever visit, the topmost row slides ~24px and settles back over ~600ms, exposing a sliver of `{components.delete-action}` — motion, with nothing said.
8. **Climax:** she swipes the row the rest of the way, taps the revealed action, and `Delete this Todo?` asks her once. She confirms, and the Todo is gone. She has added, completed and deleted a Todo without a single instruction and without backtracking — which is SM-1: the screen had to explain itself or fail.

*Edge case — the initial load fails on a first-ever visit.* The banner shows `Couldn't load your Todos.` with `Retry`, and the list region shows neither skeletons nor the empty state: with the request failed, the list's contents are unknown rather than known-empty, and showing `Nothing here yet.` would be a lie on a first visit — the one moment a user has no way to tell the difference. `Retry` re-requests and returns to the skeleton. The nudge's once-ever flag is not spent until a successful load has rendered at least one row.

---

## Coverage

| Requirement | Where |
|---|---|
| FR-1 Create a Todo | Component Patterns (`{components.input-add}`, `{components.char-counter}`), State Patterns (optimistic add, add revert, whitespace-only submit, character ceiling ×2), Interaction Primitives (Enter-to-submit), UJ-2, UJ-4 |
| FR-2 View the Todo List | Information Architecture (order), State Patterns (initial load, empty ×3, load failure), Component Patterns (`{components.empty-state}`), Voice and Tone, UJ-1, UJ-4 |
| FR-3 Toggle Completion Status | Component Patterns (`{components.checkbox}`), State Patterns (optimistic toggle, toggle revert), Interaction Primitives (departure transition), UJ-1, UJ-4 |
| FR-4 Filter the Todo List | Information Architecture, Component Patterns (`{components.filter-tabs}`, counts), State Patterns (empty ×3), Interaction Primitives (filter), UJ-1, UJ-4 |
| FR-5 Delete a Todo | Component Patterns (`{components.delete-action}`, `{components.dialog-delete}`), State Patterns (optimistic delete, delete restore), Interaction Primitives (three routes), Accessibility Floor (dialog), UJ-3, UJ-4 |
| FR-6 Persist a Todo List across sessions | Foundation, State Patterns (initial load), UJ-2 step 6, UJ-4 steps 1 and 6 |
| SM-1 A first-time user completes add, complete, and delete without instruction and without backtracking | UJ-4 in full; Interaction Primitives (flagged tension, first-run nudge) |
| SM-2 Identical after reload | UJ-2 step 6, UJ-4 step 6 — **reload only.** Browser restart and cross-browser independence have no distinct UX surface and are specified nowhere in this document; they are backend behaviour under FR-6 |
| SM-3 Every view that can be empty, slow, or fail has a designed state for it | State Patterns in full |
| SM-4 Usable one-handed on a phone and comfortable on a desktop, with no horizontal scrolling | Responsive & Platform, Accessibility Floor (targets) |

Both surfaces in the Information Architecture are reachable — the list screen on open, the dialog from any row — and every journey lands on one of them.
