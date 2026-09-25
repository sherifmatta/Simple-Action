// One Todo, in either Completion Status (epics.md Story 2.4 AC1-AC6;
// DESIGN.md:404, 408, 412; EXPERIENCE.md:105).
//
// Active and Completed are one element with one variant marker, not two
// components and not a conditional class string. `data-completed` is set on
// the row and everything below it derives from that through Tailwind's
// `data-` and `group-data-` variants — AR-28's "the row sets a single variant
// marker and every descendant derives from it. No component re-tests
// Completion Status to pick a colour" (AC4).
//
// That shape is also what keeps the whole-tree scans Story 2.3 built from
// going blind. `src/test-support/markup.ts` reads `className` string literals
// out of the AST, and `dynamicClassNames()` asserts the only computed
// `className` in the product is `<html>`'s font variable; a row that picked
// its colours with `clsx` would contribute zero classes to every scan and
// fail none of them. Here both class strings stay literal and the only thing
// that varies is an attribute.
//
// Three cues change together, never colour alone (AC2, AC3): the fill goes
// mint, the checkbox fills, and the text takes a 1.5px line-through. Remove
// colour and the filled box and the strikethrough still carry the state,
// which is the 1.4.1 argument DESIGN.md:493 makes for the 1.32:1 fill pair.
// The shadow re-tints to the green recipe with them — DESIGN.md:373, so the
// mint surface's shadow belongs to it rather than sitting under it as a
// lavender bruise. It is a re-tint and not a lift: elevation never encodes
// state (DESIGN.md:376).
//
// The checkbox is the control (Story 4.2 AC8-AC14). Story 2.4 shipped it as a
// decorative `<span aria-hidden="true">` and named this story as the one that
// makes it real; the row body is still not a click target, because "there is
// no editing, so there is nothing for a row click to open" (EXPERIENCE.md:105)
// — the one thing here that is reachable by pointer or keyboard is the box.
//
// A `<button role="checkbox">` rather than an `<input type="checkbox">`. AC9
// requires Enter *and* Space, and a native checkbox activates on Space only —
// Enter fires nothing — so meeting AC9 with one means hand-writing a second
// activation path in `onKeyDown` and keeping it in step with the first. A
// button gets both keys from the platform through one `onClick`, which is why
// there is no key handler in this file at all. It also keeps the 21px mark
// exactly as `checkbox-box` already draws it, with no `appearance-none` reset,
// and exposes the state through `aria-checked` — an attribute, which is the
// same idiom `data-completed` already uses, so the styling keys off the very
// attribute assistive technology reads. The cost is that `role` must be
// spelled explicitly and the accessible name supplied by `aria-labelledby`; a
// wrapping `<label>` is not available, because it would make the row body a
// click target.
//
// That closes `deferred-work.md`'s "Completion Status reaches no assistive
// technology": a screen reader now hears a checked or unchecked checkbox named
// with the Todo's text, rather than the same word for both statuses.
//
// The fill and border key on the control's own `aria-checked`, not on the row
// marker. Today checked and Completed are the same fact — `Todo.completed` is
// the one boolean — so both attributes are always set together, and the
// `accent`-on-Active pair below is written but never painted: whenever
// `aria-checked:bg-accent` (0,2,0) matches, `group-data-completed:aria-checked:bg-accent-deep`
// (0,3,0) matches too and wins. DESIGN.md's `checked-*-on-active` therefore
// remains the unreachable state `deferred-work.md` recorded; what this story
// settles is the *question*, not the state — the pair has a spelling now, and
// it is the spelling that would light up the day a status other than
// `completed` could check this box.
//
// The gate moved for one reason and it is not stylistic: with a single
// attribute driving both the picture and the accessible state they cannot
// disagree, so a bug that breaks `aria-checked` breaks the picture too rather
// than hiding behind it. The Completed row's `accent-deep` is the value that
// is actually drawn, because `accent` on mint is 2.97:1 and fails WCAG 1.4.11
// on the one control the row's whole meaning turns on (DESIGN.md:412).
//
// The focus ring steps down the same way and for the same measurement, which
// is `--shadow-focus-on-complete`'s first consumer: it has been declared since
// Story 1.2 with nothing keyed to it.
//
// The 44px hit area is `@utility checkbox-hit-area` rather than a padding or a
// height class — see `app/globals.css`, and `todo-card.test.ts`'s tree-wide
// `min-w-*` ban and this file's own `h-*` ban for why it cannot be a class.
//
// `wrap-anywhere` rather than `break-words` is AC5, and the difference is not
// cosmetic. `overflow-wrap: anywhere` is the spelling that also shrinks the
// element's min-content contribution, so the text cell in this flex row can
// actually narrow; `break-word` breaks the glyphs but leaves the intrinsic
// minimum wide, and the 500-character unbroken Todo still pushes the row past
// the card. The usual companion fix, `min-w-0`, is unavailable on purpose:
// `todo-card.test.ts` bans `min-w-` across the whole tree as something that
// can outgrow the card. This closes the `deferred-work.md` entry Story 2.3
// left naming this story as its owner.
//
// --- The delete control (Story 5.2) ------------------------------------------
//
// Three routes, one control, and one dialog beyond it. The row holds the
// control and the swipe; it holds no dialog and removes no Todo — pressing the
// control calls `onRequestDelete`, and `todo-list.tsx` owns the single
// confirmation for the whole list. The seam is the one `onToggle` already
// draws: this component stays presentational and needs no provider to render.
//
// The control is the last child of the row's surface, so it is the last
// focusable thing in the row (EXPERIENCE.md:194 — "per row in list order,
// checkbox → delete control"), and that order is document order rather than a
// `tabIndex` arranging something already arranged.
//
// It is reachable whether or not it is visible, which is the whole of the
// keyboard route: the control is always rendered and always focusable, and
// `@utility delete-action` reveals it on `:focus-visible` outside the
// `(pointer: fine)` block that reveals it on hover. Nothing here decides
// whether it shows — a hidden control is hidden by the stylesheet, never by a
// branch, because a branch that did not render it could not be tabbed to.
//
// --- Why the row is now two elements -----------------------------------------
//
// "The row slides left over a stationary action lane — the Delete panel is
// uncovered, not pushed in" (mockups/key-delete.html:414; DESIGN.md:446;
// epics.md Story 5.2 AC1). Something has to stay still and something has to
// move, so the `<li>` became the lane that stays and gained one child that is
// the surface that moves. The lane itself is the wrapper's `::before` — see
// `@utility delete-lane` — so the markup gains a wrapper and nothing else.
//
// The `<li>` keeps everything that is about the row's *identity*: the variant
// marker, the `group` the whole subtree derives from, the departure hook and
// the departure's gap-closing margins, which have to be on the flex `<ul>`'s
// own child. The surface keeps everything that is about the row's *picture*:
// the fill, the radius, the shadow, the padding, the minimum height and the
// flex line. `skeleton-row.tsx` matches the surface class for class, which is
// what keeps the skeleton-to-row swap free of layout shift.
//
// The control travels back by exactly what the surface travels forward, so it
// stands still while the row slides out from under it and ends up over the
// uncovered lane. One icon serves both presentations rather than a second one
// drawn inside the panel, which is what makes AC8's colour question — what the
// icon is painted when the lane is revealed *and* hovered — a question with one
// answer instead of two elements that have to agree.
//
// Nothing here is 44px tall. The row's height is its tallest child plus
// `{spacing.row-padding}`, and a 44px box in this flex line takes every row
// from the 50px mockups/key-delete.html draws to 72px; the drawn mark is a 17px
// glyph, smaller than the checkbox that already governs the line, and the 44px
// reach is `@utility delete-hit-area`'s `::after` — "padded out to 44px without
// changing the mark" (DESIGN.md:354), exactly as `checkbox-hit-area` does it.
//
// The swipe sets one attribute and nothing else (AR-28). `data-revealed` on the
// row is the same idiom as `data-completed` and `data-departing` above: the
// travel, the fill and the duration are all `app/globals.css`'s, so the class
// strings here stay static literals and the whole-tree scans can still read
// them. The gesture is read as a *distance*, not a velocity — a leftward travel
// past the threshold latches it open and the same travel rightward closes it,
// which is what makes a half-swipe recoverable without a second control.
//
// The panel never deletes, in either presentation: "releasing here opens the
// confirmation dialog in Step C; the swipe itself never deletes"
// (mockups/key-delete.html).

import { useRef, useState } from "react";

import type { Todo } from "@/shared/contract/todo";

/**
 * How far a finger travels before the delete panel latches open, in pixels.
 *
 * Not a design token and not a duration: DESIGN.md gives the panel a fill and a
 * radius but no travel, and mockups/key-delete.html records the latch distance
 * as an open question rather than a value. So it is chosen here, in the one
 * file that reads the gesture, and chosen small: a threshold longer than a
 * thumb's comfortable arc on a phone makes the control unreachable by the very
 * route it exists to serve, and the dialog beyond it is what makes a
 * too-sensitive threshold cost nothing.
 */
const SWIPE_LATCH_PX = 32;

/**
 * The id of one row's checkbox — the control focus lands on after a delete.
 *
 * Exported rather than spelled at the two call sites, because `todo-list.tsx`
 * has to find this element in the document and a second spelling of the
 * pattern is a second thing to keep in step.
 *
 * The `todo-` prefix is not decoration, for the reason the text id below gives:
 * a UUIDv7 begins with a digit about ten times in sixteen, and an id starting
 * with a digit is legal HTML but not a valid CSS identifier, so `#…` in a
 * `querySelector` throws on it.
 */
export function rowCheckboxId(todoId: string): string {
  return `todo-${todoId}-checkbox`;
}

export function TodoRow({
  todo,
  departing,
  onToggle,
  onDeparted,
  onRequestDelete,
}: {
  todo: Todo;
  /** On its way out of the active Filter View, and animating as it goes. */
  departing: boolean;
  onToggle: (todo: Todo, completed: boolean) => void;
  /** The departure transition finished; this row's id is done leaving. */
  onDeparted: (id: string) => void;
  /** The delete control was pressed. The Todo is not removed — a dialog asks. */
  onRequestDelete: (todo: Todo) => void;
}) {
  // The swipe, as two pieces of state that are not the same thing: where the
  // finger went down, which is a measurement and never renders, and whether the
  // panel is latched open, which is the attribute the stylesheet derives from.
  // A ref for the first, because a re-render per touch-move frame would be a
  // re-render per frame of a gesture.
  //
  // Both axes are kept, because only the pair can tell a swipe from a scroll
  // that drifted: a list is scrolled with the same thumb on the same row, and a
  // reveal armed by a vertical flick would put a destructive control under a
  // finger that was reading.
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  // The accessible name is the Todo's own text, borrowed from the element that
  // already renders it rather than duplicated into an `aria-label` that could
  // drift from it. Unique because the Todo's id is (AD-4), and stable across a
  // confirmation because the id is minted before the request and never
  // changes.
  //
  // The `todo-` prefix is not decoration. A `Todo` id is a UUIDv7, which
  // begins with a digit about ten times in sixteen, and an id starting with a
  // digit is legal HTML but not a valid CSS identifier — so `#…` in a
  // stylesheet or a `querySelector` throws on it. Prefixing costs nothing and
  // removes a whole class of "works for some Todos" bug.
  const textId = `todo-${todo.id}-text`;

  return (
    <li
      data-completed={todo.completed ? true : undefined}
      // One more attribute, and no more: the class string stays a single
      // static literal and `row-departing` gates everything it does on this
      // marker, so nothing here is chosen in JavaScript (AR-28). The row
      // itself knows only that it is leaving — which view it is leaving, and
      // what that will be announced as, belong to the Filter View.
      data-departing={departing ? true : undefined}
      // The latch, and the only thing the gesture produces. Absent rather than
      // `false` when the panel is closed, so the stylesheet keys on presence
      // the way it does for the two markers above.
      //
      // A departing row is never revealed, whatever the gesture left behind:
      // the reveal is a step in a gesture, not a state the row carries, and a
      // row collapsing out of the Filter View with a destructive panel hanging
      // open is the one frame this must not have. Derived rather than cleared
      // in an effect, so the two cannot disagree for a commit.
      data-revealed={revealed && !departing ? true : undefined}
      onTouchStart={(event) => {
        // Only the first finger down starts a gesture. `onTouchStart` fires
        // again for a second finger, and `touches[0]` is by then the *current*
        // position of the first one — so assigning unconditionally would move
        // the origin to wherever the swipe had already got to and measure the
        // rest of the travel from there.
        if (touchOrigin.current !== null) return;

        const touch = event.touches[0];
        if (touch) touchOrigin.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        const origin = touchOrigin.current;
        const touch = event.touches[0];
        if (origin === null || touch === undefined) return;

        // Leftward is positive, because leftward is the direction that reveals
        // (EXPERIENCE.md:166). The same threshold closes it again travelling
        // the other way, so a swipe that overshoots is undone by reversing it
        // rather than by finding something else to press.
        const acrossTheRow = origin.x - touch.clientX;
        const downThePage = touch.clientY - origin.y;

        // Dominantly horizontal, or it is not this gesture at all. A scroll
        // rarely runs true, and a vertical flick with 40px of sideways drift
        // would otherwise arm a destructive control nobody reached for.
        if (Math.abs(acrossTheRow) <= Math.abs(downThePage)) return;

        if (acrossTheRow > SWIPE_LATCH_PX) setRevealed(true);
        else if (acrossTheRow < -SWIPE_LATCH_PX) setRevealed(false);
      }}
      // The origin is released rather than the panel: a lifted finger leaves
      // the panel where the gesture left it, which is what "latch" means, and
      // is why the dialog rather than the swipe is what deletes.
      //
      // `onTouchCancel` is handled identically and is not optional. The browser
      // cancels a touch when it takes the gesture over — a scroll it decided
      // was a scroll, a system edge swipe — and no `touchend` follows, so an
      // origin left behind here would measure the *next* gesture from a point
      // the finger was at some time ago.
      onTouchEnd={() => {
        touchOrigin.current = null;
      }}
      onTouchCancel={() => {
        touchOrigin.current = null;
      }}
      // `transitionend` bubbles and fires once per property, so a descendant
      // transitioning at the wrong moment would otherwise report a departure
      // this row had not made, and the row's own five properties would report
      // it five times. Two guards, both cheap: the event's own target, and the
      // one property whose transition is guaranteed to run — a height that
      // cannot interpolate still flips, and `opacity` always eases.
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity") {
          onDeparted(todo.id);
        }
      }}
      className="group delete-lane row-departing rounded-md"
    >
      {/*
        The row's own surface — everything the eye reads as the row, and the
        only thing that moves. `skeleton-row.tsx` carries this class string
        minus the markers, which is DESIGN.md's "same fill, same {rounded.md},
        same padding, same row shadow, same minimum height".
      */}
      <div className="row-sliding flex min-h-touch-target-min items-center gap-4 rounded-md bg-row-active p-row-padding shadow-row group-data-completed:bg-row-complete group-data-completed:shadow-row-complete">
        <button
          type="button"
          id={rowCheckboxId(todo.id)}
          role="checkbox"
          aria-checked={todo.completed}
          aria-labelledby={textId}
          // The value the user asked for, not a toggle instruction: the wire
          // carries `completed` and the server sets it, so a retry stores the
          // same value rather than flipping it a second time (AD-6).
          onClick={() => onToggle(todo, !todo.completed)}
          className="checkbox-box checkbox-hit-area group/box flex flex-none items-center justify-center rounded-sm border-border-control bg-row-active text-on-accent aria-checked:border-accent aria-checked:bg-accent group-data-completed:aria-checked:border-accent-deep group-data-completed:aria-checked:bg-accent-deep focus-visible:shadow-focus group-data-completed:focus-visible:shadow-focus-on-complete"
        >
          {/*
            Drawn in both statuses and revealed by the control's own state rather
            than rendered conditionally, so the glyph derives from the same
            single source as the fill (AC4) — `group/box` is what names that
            source for it. Geometry and stroke are the mockup's
            (mockups/key-main.html) — attributes rather than classes, so AD-13's
            arbitrary-value ban has nothing to catch and no token has to be
            invented for a path.
          */}
          <svg
            className="hidden group-aria-checked/box:block"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </button>
        <span
          id={textId}
          className="wrap-anywhere text-todo-text text-text-primary group-data-completed:text-text-completed group-data-completed:strikethrough-completed"
        >
          {todo.text}
        </span>
        <button
          type="button"
          // Named with the Todo it acts on, so "the tab order does not read as
          // a list of identical `Delete` buttons" (EXPERIENCE.md:217). An
          // `aria-label` and not `aria-labelledby` here, unlike the checkbox:
          // the name is two parts — the verb and the Todo — and the element
          // that renders the second carries no word for the first.
          aria-label={`Delete ${todo.text}`}
          // Pressing it un-latches the panel as well as asking the question.
          // The reveal is a step in a gesture that has now finished; leaving it
          // open would park a destructive surface under the dialog and still be
          // open behind a Cancel.
          onClick={() => {
            setRevealed(false);
            onRequestDelete(todo);
          }}
          // Focus reveals this control, so losing focus is the end of that
          // reveal. Without it, tabbing past a row on a touch-and-pointer
          // device leaves the panel latched open behind the control that has
          // moved on.
          onBlur={() => setRevealed(false)}
          className="delete-action delete-hit-area ml-auto flex flex-none items-center justify-center rounded-md text-text-muted hover:text-danger-text focus-visible:shadow-focus group-data-completed:focus-visible:shadow-focus-on-complete"
        >
          {/*
            The thin rounded line glyph of mockups/key-delete.html, geometry
            and stroke as attributes rather than classes — so AD-13's
            arbitrary-value ban has nothing to catch and no token has to be
            invented for a path. 17px, which is smaller than the 21px checkbox
            beside it, so the flex line's height is still the checkbox's and the
            row is exactly as tall as it was before this control existed.
          */}
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16" />
            <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
            <path d="M6.6 7l.8 11.3A1.8 1.8 0 0 0 9.2 20h5.6a1.8 1.8 0 0 0 1.8-1.7L17.4 7" />
            <path d="M10.5 11v5M13.5 11v5" />
          </svg>
        </button>
      </div>
    </li>
  );
}
