---
title: 'Stories 5.1 and 5.2 — remove a Todo at the server, and reach delete three ways with one confirmation'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
baseline_revision: 'f13b8da80fbd18f57f6b69361c57a6bae0f8d023'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/docs/implementation-artifacts/epic-5-context.md'
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A Todo can be created and toggled but never removed. There is no `DELETE` endpoint, no `deleteTodo` in the repository, and no delete control on a row — so FR-5 is entirely unbuilt, and a list can only grow.

**Approach:** Two independently shippable halves of Epic 5, built together because they share no code and conflict nowhere. **5.1** adds `DELETE /api/todos/:id` beside the existing `PATCH` in the same route file, plus `deleteTodo(ownerId, id)` in the repository. **5.2** adds the delete control to `TodoRow` in its two presentations (swipe-revealed panel on touch, trailing hover icon on pointer, focusable always) and one `<dialog>`-based confirmation owned by `TodoList`. The two halves do not meet: 5.2's `Delete` button calls an `onConfirm` prop, and Story 5.3 is what wires that prop to the endpoint.

## Boundaries & Constraints

**Always:**
- The repository is the only Drizzle importer and `deleteTodo` takes `ownerId` first (AD-2); the route handler builds no query.
- Every `className` in the product stays a single static string literal — variation is carried by `data-*` attributes and derived in CSS (AR-28). `dynamicClassNames()` must keep returning only `app/layout.tsx:{poppins.variable}`.
- Design values are transcribed only into `app/globals.css` under their DESIGN.md token names (AD-13). No hex literal and no Tailwind arbitrary-value class outside it.
- Durations come from `src/client/motion/motion.ts`; no component inlines one or reads the motion media query.
- Copy is verbatim: `Delete this Todo?`, `Cancel`, `Delete`. The word *Done* is banned.
- The delete control is the **last** focusable control in its row, at least 44px in both dimensions, focusable whether or not it is visually revealed, and labelled with the Todo it acts on.

**Never:**
- No soft-delete column, no `deletedAt`, and no query that filters on deletion state.
- No optimistic removal, no `setQueryData`, no announcement, no error banner, and no call to the endpoint from the client — all of that is Story 5.3. 5.2 stops at `onConfirm`.
- No first-run swipe nudge (Story 5.D1, deferred).
- No `position: fixed` in markup or in `app/globals.css` — `todo-card.test.ts` pins both, and the confirmation must not be the thing that widens that wall.
- No third dialog button, no checkbox, no "don't ask again", nothing stacked on top of the dialog.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned row deleted | `DELETE /api/todos/:id`, caller owns the row | Row removed; `204` with no body | No error expected |
| Same delete retried | The same `DELETE` sent a second time | `204` again — the row is already gone and that is success | No error expected |
| Foreign-owner delete | `DELETE` for a row another identity owns | Row untouched; `204`, identical to the two rows above | Indistinguishable by design — the status must not disclose existence |
| Completed row deleted | Row with `completed = true` | Row removed; `204` | No error expected |
| Malformed id | Path segment is not a lowercase canonical UUIDv7 | `400`, envelope kind `delete`, message `DELETE_FAILED_MESSAGE` | Refused before any query runs |
| No identity | No valid Client Identity cookie | `401` from `unauthorizedIdentityResponse("DELETE")` | Identity gate runs first |
| Driver failure | `db.delete` throws | `500`, envelope kind `delete` | `logSafeError` only; never the error message whole |
| Dialog confirmed | `Delete` pressed | Dialog closes, `onConfirm(todo)` fires once, focus is placed by `focusTargetAfterDelete` | n/a |
| Dialog cancelled | `Cancel`, or Escape | Dialog closes, `onConfirm` never fires, Todo List untouched, focus returns to the trigger | n/a |

</intent-contract>

## Code Map

**Story 5.1 — server**
- `app/api/todos/[id]/route.ts` — holds `PATCH`; its header comment already says "Epic 5's `DELETE` joins this file for that reason". Add `DELETE` and `DELETE_FAILED_MESSAGE` beside `UPDATE_FAILED_MESSAGE` (`:45`). Copy `PATCH`'s gate order verbatim: identity → id form → repository (`:111`–`:169`).
- `src/server/repository/todos.ts` — `setTodoCompleted` (`:180`) is the shape to follow: one statement, `and(eq(todo.id, id), eq(todo.ownerId, ownerId))` is the ownership check. The module header (`:3`) already names `deleteTodo` as arriving in Epic 5.
- `src/server/http/route-failure.ts` — `errorKindForMethod` (`:36`) already maps `DELETE → "delete"`, so AC6 needs no change here. `requestFailedResponse` and `logSafeError` are used as-is.
- `src/server/identity/request-identity.ts` — `privateToTheCaller` (`:47`) wraps every response including the `204`; `unauthorizedIdentityResponse` is the `401`.
- `src/server/validation/todo-id.ts` — `isCanonicalUuidV7`, the `400` gate.
- `app/api/todos/[id]/route.test.ts` — the live-Neon test shape to extend.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:24,82` — `DELETE` is a supported export and `params` is a `Promise`; confirmed for Next 16.3.5.

**Story 5.2 — client**
- `src/client/components/todo-row.tsx` — the checkbox (`:138`) and text span (`:172`) are the two existing children; the delete control goes after both (AC7). `data-completed` (`:118`) is the marker every descendant derives from; `group-data-completed:focus-visible:shadow-focus-on-complete` (`:147`) is the exact focus-ring idiom to repeat (AC6).
- `src/client/components/todo-list.tsx` — owns one dialog for the whole list and the `pendingDelete` state; `:189` is where rows are mapped and where `onRequestDelete` is passed down. Precedent for hoisting shared machinery out of the row is the `useSetCompleted` comment at `:94`.
- `app/globals.css` — `@theme static` already declares `--color-danger-fill`, `--color-on-danger-fill`, `--color-text-muted`, `--color-danger-text`, `--radius-md`, `--radius-lg`, `--radius-full`, `--spacing-touch-target-min`, `--shadow-card`, `--shadow-focus`, `--shadow-focus-on-complete`, `--spacing-7`. Only the dialog scrim is missing. `@utility checkbox-hit-area` (`:280`) is the 44px `::after` overlay recipe to mirror; `@utility row-departing` (`:640`) is the `data-*`-gated transition idiom.
- `src/client/motion/motion.ts` — `COLLAPSE_MS` (`:58`) is the reveal/settle duration for the swipe panel. Do not add a constant.
- `src/client/components/todo-row.render.test.tsx` — the `createRoot` + `act` render-test idiom, no testing library.
- `src/client/components/todo-card.test.ts:44,48,233,237` — the walls: `CLIPPING` allows exactly `&[data-departing="true"]` in the stylesheet, `PINNED` allows exactly `sticky-top-block.tsx:sticky`, and `globalsCss` must not match `position: (sticky|fixed)`.
- `src/test-support/markup.ts` — `readMarkup`, `matches`, `dynamicClassNames`, `styleSheetMatches`; `src/test-support/tailwind.ts` — `ruleFor` compiles a class to assert its declarations.

**Read-only evidence gathered (do not re-investigate):**
- `DESIGN.md` `components.dialog-delete` and `components.delete-action` carry every value needed; the scrim is `rgba(36,36,58,.32)` and has no token name, exactly as `filter-tabs`' two shadows did.
- jsdom 30.1.1 implements **neither** `HTMLDialogElement.showModal` nor `.close` (verified by running it). Any render test of the dialog must install a shim.
- `react` 19.3.0, no testing library, no modal library. Nothing may be added.

## Tasks & Acceptance

**Execution:**

*Story 5.1*
- `src/server/repository/todos.ts` — add `deleteTodo(ownerId, id): Promise<void>`, one owner-scoped `db.delete`, no `returning`. Returning nothing is the point: the handler then has no result to branch on and cannot accidentally disclose existence.
- `app/api/todos/[id]/route.ts` — add `DELETE_FAILED_MESSAGE` and `export async function DELETE`. Gate order identical to `PATCH` minus the body step. Success is `privateToTheCaller(new Response(null, { status: 204 }))`.
- `app/api/todos/[id]/route.test.ts` — cover every row of the I/O matrix's server half against the live branch, including: delete twice → `204` twice; a second identity's row survives and still answers `204`; a Completed row deletes; a malformed id is `400` with kind `delete` and never reaches the database.

*Story 5.2*
- `app/globals.css` — add `@utility delete-lane` (the stationary, right-aligned, full-row-height `danger-fill` panel the row slides off, with its `on-danger-fill` icon), `@utility row-sliding` (the row *surface* translating left by the lane's width on `data-revealed`, at `COLLAPSE_MS`), `@utility delete-hit-area` (mirror of `checkbox-hit-area` — a non-layout `::after` overlay, never a sized box), `@utility delete-action` (hover reveal gated on `(pointer: fine)`, focus reveal outside the media query), and `@utility dialog-delete` (the `::backdrop` scrim and the width ceiling).
  - **The reveal mechanic is the mockup's and is not open to reinterpretation.** `mockups/key-delete.html:265,414` — "the swipe lane: the Delete action sits **under** the row and is uncovered", "The row slides left over a **stationary action lane** — the Delete panel is uncovered, not pushed in." `epics.md` 5.2 AC1 and `DESIGN.md:446` say the same: the panel is revealed *behind* the row. Build that: a lane pinned to the row's trailing edge, and the row's own surface translating over it. Do **not** build a control that slides into a fixed gutter inside the row while the row stays still — that is a different interaction and it costs the row's geometry (see the next bullet).
  - **No delete element may add a layout box to the row's flex line.** The row's height today is its content plus `{spacing.row-padding}`, and the mockup draws rows at `min-height: 50px` *with* the delete control present. A 44px-tall wrapper in the flex line takes the row to 72px. The 44px reach comes from the non-layout `::after` overlay, exactly as `checkbox-hit-area` does it and for the reason its own comment gives — `DESIGN.md:354`, the hit area is padded out to 44px "without changing the mark".
  - **The revealed lane's icon colour must survive hover.** `hover:text-danger-text` on the control and `[data-revealed="true"] … { color: on-danger-fill }` have equal specificity, so the later-emitted hover rule wins and paints `danger-text` on `danger-fill` — the same hex, an icon at 1:1. Scope the hover so it cannot apply while the lane is revealed.
- `src/client/components/delete-dialog.tsx` — new. A native `<dialog>` opened with `showModal()`, `aria-labelledby` the title, `Cancel` carrying `autoFocus`, `Delete` the only `bg-danger-fill` button in the product. Props: `todo: Todo | null`, `onConfirm`, `onCancel`.
- `src/client/todos/focus-after-delete.ts` — new. Pure `focusTargetAfterDelete(visible: Todo[], deletedId: string)` returning `{ kind: "row"; id: string } | { kind: "input" }`: the row that takes the deleted row's place, or the input when the list is now empty.
- `src/client/components/todo-row.tsx` — add the delete control as the last child, the lane behind the row surface, `aria-label={`Delete ${todo.text}`}`, `data-revealed`, and touch handlers. New prop `onRequestDelete` and nothing else. The gesture must:
  - compare `|dx|` against `|dy|` and latch only when the travel is dominantly horizontal, so a vertical scroll that drifts sideways cannot arm a destructive control;
  - handle `onTouchCancel` as it handles `onTouchEnd`, so a browser-cancelled gesture leaves no stale origin;
  - not move the origin when a second finger lands mid-swipe;
  - un-latch when the control is pressed, when the row starts departing, and when the control loses focus — the reveal is a step in a gesture, not a persistent row state.
- `src/client/components/todo-list.tsx` — hold the pending delete **as an id, never a `Todo`** (`use-todos.test.ts` fails any `useState` naming a Todo, AD-8) and derive the row per render; render one `DeleteDialog`; place focus on confirm via `focusTargetAfterDelete`. Two rules the previous attempt got wrong:
  - clear the pending id whenever the dialog closes, including the close the dialog performs on itself when its row leaves `visible` — otherwise the id goes stale, `setPendingDeleteId(sameId)` bails out of re-rendering, and the row can never be confirmed again, or the dialog re-opens unprompted when the row returns to view;
  - exclude departing rows from the list handed to `focusTargetAfterDelete`, and fall back to the add input when the resolved element is not in the document — `?.focus()` on a missing element silently drops focus to `document.body`, the one outcome `EXPERIENCE.md:202` forbids.
- `src/client/components/todo-card.test.ts` — extend the stylesheet `overflow` allow-list to name the lane's clipping selector alongside `&[data-departing="true"]`, with the Story 4.3 descendant-not-ancestor argument written out **about the mechanic actually built**. Change nothing else.
- `src/client/components/delete-dialog.render.test.tsx`, `src/client/components/todo-row.render.test.tsx`, `src/client/todos/focus-after-delete.test.ts`, `src/client/components/delete-dialog.test.ts` — the behaviour, the pure function, and the class/stylesheet scans.
- `src/test-support/dialog.ts` — new. Installs a minimal `HTMLDialogElement` shim (`showModal`, `show`, `close`, `open`, the `close` and `cancel` events) so the dialog's own logic is testable under jsdom 30.

**Acceptance Criteria:**
- Given a `DELETE` for a row the caller owns, a row already gone, and a row another identity owns, when each is served, then all three answer `204` with no body and the other identity's row is still present afterwards.
- Given a path segment that is not a lowercase canonical UUIDv7, when `DELETE` is served, then it answers `400` with envelope kind `delete` and no query runs.
- Given `deleteTodo`, when its signature is read, then `ownerId` is its first parameter and it returns `Promise<void>`.
- Given a row in either Completion Status, when its delete control takes focus, then the control is revealed, its ring is `shadow-focus` on Active and `shadow-focus-on-complete` on Completed, and it is the last focusable element in the row.
- Given a screen reader, when it reaches a row's delete control, then the accessible name contains both `Delete` and that row's own text.
- Given a leftward swipe past the threshold on a row, when it completes, then the row carries `data-revealed`, the row's own surface has translated left, and the stationary `danger-fill` lane with its `on-danger-fill` icon is uncovered behind it; tapping the lane calls `onRequestDelete` with that Todo.
- Given a row rendered with its delete control, when the row's own height is computed from the stylesheet, then no delete element contributes a box to the row's flex line, and the row's height is what it was before the control existed — the 44px reach comes from a `::after` overlay, as `checkbox-hit-area`'s does.
- Given a revealed lane, when the control is also hovered, then the icon stays `on-danger-fill` — no hover rule may repaint it `danger-text` on `danger-fill`.
- Given a touch that travels further vertically than horizontally, when it exceeds the latch threshold on the horizontal axis, then no row is revealed; and given a gesture the browser cancels, when the next touch begins, then it is measured from the new origin.
- Given a row whose panel is latched open, when its delete control is pressed, when the row begins departing, or when the control loses focus, then the row is no longer revealed.
- Given the dialog was cancelled on a row, when that same row's delete control is pressed again, then the dialog opens again.
- Given a Filter View in which the on-screen order differs from the cache order, when a delete is confirmed, then focus lands on a row that is actually rendered — never on a filtered-out or departing row, and never on `document.body`.
- Given every test this story adds, when it cites an acceptance criterion, then the number is `epics.md`'s for Story 5.1 or 5.2 — not this spec's re-derived ordering.
- Given a pointer device, when the row is hovered, then the trailing icon is revealed — and the reveal rule is gated on `(pointer: fine)` rather than on any width breakpoint.
- Given the dialog, when it opens, then `showModal()` was called (not `show()`), the title reads `Delete this Todo?`, it has exactly two buttons reading `Cancel` and `Delete`, and `Cancel` carries `autoFocus`.
- Given the dialog is open, when `Cancel` is pressed or the `cancel` event fires, then it closes, `onConfirm` never fires, and the Todo List is unchanged.
- Given the dialog is open, when `Delete` is pressed, then `onConfirm` fires exactly once with the pending Todo and the dialog closes.
- Given a visible list and a deleted id, when `focusTargetAfterDelete` is called, then it returns the following row's id, the preceding row's id when the deleted row was last, and `{ kind: "input" }` when it was the only row.
- Given the whole markup surface, when it is scanned, then `bg-danger-fill` appears on exactly one element in the product, `dynamicClassNames` still returns only the font variable, and `matches(markup, PINNED)` still returns only the sticky block.
- Given `app/globals.css`, when it is scanned, then it still matches no `position: (sticky|fixed)`, and its `overflow` declarations are exactly the departing row's and the delete lane's.

## Spec Change Log

Five departures taken during implementation, each recorded with its reason.

1. **`@utility dialog-delete` carries the scrim and the width ceiling only.** The
   spec listed the card fill, `--radius-lg`, `--shadow-card` and `--spacing-7`
   inside the recipe; they stay as `bg-card rounded-lg shadow-card p-7` classes
   on the element instead, per the standing rule every recipe block in
   `app/globals.css` states — "only the value with no token behind it lives
   here" — so the whole-tree class scans can still see them. The recipe holds
   the two things a class cannot say: the mockup's untokenised 400px ceiling and
   the `::backdrop` scrim.

2. **A sixth recipe, `@utility dialog-button`.** DESIGN.md gives both dialog
   buttons a `1.5px solid` border and a `{spacing.touch-target-min}` floor, and
   `min-w-*` is banned tree-wide — the same corner `retry-pill` and `input-add`
   are in. Its own recipe rather than a second consumer of `retry-pill`, which
   is documented against `components.error-banner.retry-border`.

3. **`todo-list.tsx` holds the pending delete as an id, not a `Todo`.**
   `use-todos.test.ts` scans every source file for a `useState` or `useReducer`
   that names a Todo and fails the suite for one — AD-8 keeps server state in
   the single cache entry. The id is held and the row derived per render, which
   is also the better behaviour: the dialog asks about whatever the cache
   currently holds rather than a copy taken when it opened.

4. **Two id constants were added so focus has something to reach.**
   `rowCheckboxId()` in `todo-row.tsx` and `ADD_INPUT_ID` in `add-input.tsx`.
   `focusTargetAfterDelete` answers *which Todo*, as specified; turning that into
   an element needs the two components that own those elements to name them.

5. **The `autoFocus` assertion is a source scan, not a DOM one.** React applies
   `autoFocus` imperatively on mount and renders no `autofocus` attribute, so a
   real `showModal()` never sees one and falls back to the first focusable
   element in the dialog. Both routes land on Cancel; `delete-dialog.test.ts`
   pins the prop out of the AST and `delete-dialog.render.test.tsx` pins both the
   resulting focus and the document order the fallback depends on.

Three things this story leaves open are recorded in `deferred-work.md`: the
dialog does not show the Todo's own text, the swipe threshold is a chosen number
no test can judge, and the platform guarantees the native `<dialog>` was chosen
for are asserted as markup facts rather than exercised.

### 2026-09-25 — Amendment 1 (review pass 1, `bad_spec`)

**Triggering finding.** The swipe reveal was built as a control sliding into a fixed 44px gutter at the row's trailing edge while the row itself stayed still. `mockups/key-delete.html:265,414`, `DESIGN.md:446` and `epics.md` 5.2 AC1 all specify the opposite: a stationary lane under the row, uncovered as the row's surface slides left. Two verified consequences — the gutter is a real layout box in the row's flex line, taking every row from ~50px (the mockup's `min-height`) to 72px with nothing in the suite asserting row height; and `todo-card.test.ts`'s widened `overflow` allow-list was justified in a comment describing the specified mechanic rather than the built one.

**What was amended.** Sections outside `<intent-contract>` only. The Code Map's `app/globals.css` task now names `delete-lane` and `row-sliding`, states the mechanic as non-negotiable, forbids any delete element from contributing a box to the row's flex line, and calls out the hover/specificity collision that paints the revealed icon `danger-text` on `danger-fill`. The `todo-row.tsx` and `todo-list.tsx` tasks now carry the gesture and state rules the first attempt missed. Eight acceptance criteria were added covering row geometry, the hover colour, axis discrimination, un-latching, cancel-then-reopen, focus under a non-All Filter View, and AC citation numbering.

**Known-bad state avoided.** Shipping a 44%-taller row across the whole product, a reveal that reads as a control appearing rather than a row sliding off a lane, and an invisible destructive icon on any device where `hover: hover` matches.

**KEEP — these were right and must survive re-derivation:**
- **All of Story 5.1, unchanged.** `deleteTodo(ownerId, id): Promise<void>` with no `returning`; the unconditional `204`; `PATCH`'s gate order minus the body step; `DELETE_FAILED_MESSAGE` as its own constant. The tests asserting the owned / already-gone / foreign-owner responses **byte-for-byte against each other**, and the live-Neon repository suite including the concurrent double-delete, were the strongest part of the attempt.
- **Native `<dialog>` + `showModal()`**, for the reason in Design Notes: it is the only route that satisfies the trap, Escape, focus-restore and one-level-deep criteria without a `position: fixed` scrim that `todo-card.test.ts` bans. Keep `src/test-support/dialog.ts` and its honesty about what a shim can and cannot prove.
- **The `answer()` guard** in the dialog — closing first and refusing once already closed, which makes "fires exactly once" structural rather than a race.
- **`focusTargetAfterDelete` as a pure function** over `(visible, deletedId)`, and its tests. Extracting the 5.2/5.3 seam this way was correct.
- **The pending delete held as an id, not a `Todo`** (AD-8), with the row derived per render.
- **`delete-action`'s focus reveal placed outside the `(pointer: fine)` media query** — the WCAG 2.2 AA floor, and the single most important line in the stylesheet block.
- **`aria-label={`Delete ${todo.text}`}`** on the control, and the `ADD_INPUT_ID` / `rowCheckboxId()` exports that let the focus rule reach a real element.
- The full attempt is preserved at `spec-5-1-5-2-attempt-1.patch` beside this file.

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 35 findings — high 0, medium 9, low 17, false 4, maybe-false 5
- findings:
  - `[medium]` `[bad_spec]` Vertical scroll with >32px horizontal drift latches the delete panel — verified: `onTouchMove` reads `clientX` only, no axis comparison, no `touch-action`; now an AC.
  - `[low]` `[bad_spec]` A second finger mid-swipe resets the origin — verified: `onTouchStart` assigns `touches[0]` unconditionally; now an AC.
  - `[low]` `[bad_spec]` `onTouchCancel` unhandled, leaving a stale origin — verified: only `onTouchEnd` clears `touchStartX`; now an AC.
  - `[medium]` `[bad_spec]` The panel stays latched open indefinitely — verified: `revealed` clears only on a reverse swipe; now an AC.
  - `[medium]` `[bad_spec]` Stale `pendingDeleteId` when the row leaves `visible`; dialog can re-open unprompted or never re-open — verified: the dialog's effect calls `close()` without telling the parent; now a Code Map rule.
  - `[medium]` `[bad_spec]` `document.getElementById(id)?.focus()` swallows a miss and drops focus to `document.body` — verified: no fallback branch; now a Code Map rule.
  - `[medium]` `[bad_spec]` Focus target may be a departing row about to unmount — verified: `visible` includes `isDeparting` rows; now a Code Map rule.
  - `[maybe-false]` `[bad_spec]` A close path bypassing `answer()` leaves parent state stale — the only such path today is the effect's own `close()`, which is the stale-id finding above; no independent occurrence demonstrated.
  - `[medium]` `[bad_spec]` Hover repaints the revealed lane's icon `danger-text` on `danger-fill` — **verified empirically** from compiled CSS: equal specificity (0,2,0), hover rule emitted later, so the icon renders at 1:1 contrast; now an AC.
  - `[low]` `[bad_spec]` `row-swipe`'s comment misattributes its duration guard to `motion.test.ts` — verified by the verification-gap layer's mutation run: the guard is in `delete-dialog.test.ts`.
  - `[medium]` `[bad_spec]` **Every row grows ~47%, 50px → 72px** — **verified empirically**: `.row-swipe` compiles to a 44×44 layout box in the row's flex line, contradicting `checkbox-hit-area`'s own stated reason for being an overlay. Root cause of this pass's `bad_spec` routing.
  - `[medium]` `[bad_spec]` `pendingDeleteId` cleared only by the two buttons — same root cause as the stale-id row above.
  - `[medium]` `[bad_spec]` No test covers re-opening the dialog for the same row after Cancel — same defect as the verification-gap layer's first filing; now an AC.
  - `[medium]` `[bad_spec]` The swipe never un-latches — duplicate of the latch row above.
  - `[medium]` `[bad_spec]` No axis discrimination on the swipe — duplicate of the scroll-drift row above.
  - `[low]` `[bad_spec]` `onTouchCancel` omission pinned in place by `todo-row.test.ts`'s handler list — duplicate, plus a test that locks the omission.
  - `[medium]` `[bad_spec]` **The panel is not revealed *behind* the row** — verified against `mockups/key-delete.html:265,414`; grouped with the row-height row as the same invented mechanic. Root cause of this pass's `bad_spec` routing.
  - `[low]` `[bad_spec]` Three incompatible AC numbering schemes cited across the changeset — verified by spot-checking `epics.md` against the test labels; now an AC.
  - `[false]` `[reject]` Spec frontmatter contradicts its body (`deferred: []`, `status`, `followup_review_recommended`, empty triage log) — these fields are written by this review step itself; the fix would be to edit this build's spec, which triage rejects by rule.
  - `[low]` `[defer]` Two carried-in obligations from `epic-5-context.md` (request-size guard, unconstrained envelope `message`) neither implemented nor recorded — pre-existing, not caused by this change.
  - `[low]` `[bad_spec]` Two comment blocks merged onto the wrong declaration in `todo-list.tsx` — verified in the diff; moot under re-derivation.
  - `[low]` `[bad_spec]` `placeFocusAfterDelete`'s `useCallback` memoises nothing — verified: `visible` is a fresh array each render; moot under re-derivation.
  - `[medium]` `[bad_spec]` Focus computed from a list including departing rows — duplicate of the departing-row row above.
  - `[low]` `[bad_spec]` Focus ring fits its clip window with exactly zero slack and nothing binds the three numbers — verified: 34px mark, 44px window, 5px ring spread; moot under the lane mechanic.
  - `[medium]` `[bad_spec]` No test that Cancel then re-open on the same row works (pre-verified; demonstrated by mutation) — now an AC.
  - `[medium]` `[bad_spec]` `focusTargetAfterDelete` exercised only under the All view, where `visible` equals `data` (pre-verified; demonstrated by mutation) — now an AC.
  - `[low]` `[bad_spec]` `row-swipe` comment misattribution (verification-gap filing) — duplicate of the attribution row above.
  - `[low]` `[bad_spec]` `todo-list.test.ts`'s `useState` scan only matches type-annotated calls, so an untyped `useState(false)` passes — verified against the regex; the tree-wide AD-8 guard still holds.
  - `[low]` `[defer]` Story 5.1's AC1/AC3 are never driven end-to-end through a real row — the handler suite mocks the repository and the repository suite is live; deliberate and documented, but the AC spans both surfaces and is exercised at neither as one.
  - `[low]` `[defer]` Client ACs for focus trap, Escape, focus restore, 44px measurement and contrast are tested at narrower surfaces than they are written at — already recorded for Epic 6.
  - `[false]` `[reject]` AC15's single-filled-button wall reads the class-literal surface while two surfaces carry the fill at render — `DESIGN.md:299` explicitly sanctions exactly two `danger-fill` surfaces, the lane and the confirm button, so the rendered result is correct and the wall guards the right thing.
  - `[low]` `[bad_spec]` AC13 is written at the post-removal surface and tested at the pre-removal one — inherent to the 5.2/5.3 seam; the pure function is the mitigation and it is kept.
  - `[false]` `[reject]` AC numbering divergence (intent layer's filing) — duplicate of the numbering row already routed above; no independent defect.
  - `[maybe-false]` `[defer]` Three pre-existing guards relaxed or inverted — the `todo-card.test.ts` and `client-identity.test.ts` changes were foreseen and argued; only the `useState` scan weakened, which is filed separately above.
  - `[false]` `[reject]` The dialog does not show the Todo's own text — `epics.md` 5.2 AC8 fixes the copy as `Delete this Todo?` with two buttons and asks for no text; already recorded in `deferred-work.md`.
  - `[maybe-false]` `[defer]` Remaining unverified members of the grouped gesture and focus entries — settled by driving the built interaction on a real touch device, which Epic 6 owns.

## Design Notes

**Why the `204` is unconditional.** AC2 (idempotent retry) and AC3 (foreign owner discloses nothing) pull the same way: if the handler could tell "deleted" from "nothing to delete", the status code would become an existence oracle. `deleteTodo` therefore returns `void` and the handler has nothing to branch on — the property holds structurally rather than by a branch that remembered to be careful, which is the argument `setTodoCompleted`'s doc comment already makes for its own shape.

**Why a native `<dialog>` and not a hand-built modal.** A hand-built modal needs `position: fixed` for its scrim, and `todo-card.test.ts` pins `fixed` out of both the markup (`PINNED`) and the stylesheet — walls that exist so nothing can clip or cover the sticky block. `showModal()` puts the dialog in the **top layer**, positioned by the UA stylesheet, so neither wall is touched and the dialog cannot be clipped by any ancestor. It also brings the focus trap (AC10), Escape-as-cancel (AC11) and focus restoration to the trigger (AC12) from the platform rather than from hand-written code that would have to be kept correct. This is the same trade `todo-row.tsx` took when it chose `<button>` to get Enter and Space "from the platform through one `onClick`".

The cost is that jsdom 30 implements none of it, so `src/test-support/dialog.ts` shims the element. Be honest about what that buys: the tests prove *our* logic — that `showModal` is called rather than `show`, that `autoFocus` is on `Cancel`, that the `cancel` event and the `Cancel` button take the identical path, that `Delete` fires `onConfirm` once. The trap and the focus restore are platform guarantees and are asserted as markup facts (`aria-modal` is not hand-set; the element is a real `<dialog>`), not simulated.

**Why `focusTargetAfterDelete` is a pure function.** AC13 spans the 5.2/5.3 seam: it describes where focus goes *after a row has been removed*, and 5.2 removes nothing. Extracting the rule makes it testable now against a list and an id, and leaves Story 5.3 nothing to do but delete the row — the wiring is already in place and already exercised.

**Why the swipe reveal extends the `overflow` allow-list.** DESIGN.md asks for a panel revealed *behind* the row, which means the row translates over it and its left edge leaves the wrapper. Story 4.3 already narrowed this same assertion from a flat ban to an allow-list, with the argument that a departing row is a descendant of the list region and an ancestor of nothing but its own text. The swipe wrapper is in exactly that position, so the same argument extends to it — and must be written into the test, not just relied upon.

**What is deliberately not here.** No `useDeleteTodo`, no `setQueryData`, no announcement, no banner wiring, no retry closure. `onConfirm` is the seam and Story 5.3 is its consumer.

## Verification

**Commands:**
- `npm run lint` — expected: clean, `--max-warnings=0`.
- `npm run typecheck` — expected: no errors.
- `npm test` — expected: all suites pass, including the pre-existing `todo-card.test.ts` walls and `motion.test.ts`'s stylesheet/constant agreement.
- `npx vitest run app/api/todos` — expected: the live-Neon delete cases pass; requires `DATABASE_URL`.

**Manual checks:**
- Grep the diff for `#` hex literals and `[` arbitrary values outside `app/globals.css` — expected: none.
- Confirm `src/client/motion/motion.ts` gained no constant.
