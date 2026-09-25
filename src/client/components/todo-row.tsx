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

import type { Todo } from "@/shared/contract/todo";

export function TodoRow({
  todo,
  departing,
  onToggle,
  onDeparted,
}: {
  todo: Todo;
  /** On its way out of the active Filter View, and animating as it goes. */
  departing: boolean;
  onToggle: (todo: Todo, completed: boolean) => void;
  /** The departure transition finished; this row's id is done leaving. */
  onDeparted: (id: string) => void;
}) {
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
      className="group row-departing flex min-h-touch-target-min items-center gap-4 rounded-md bg-row-active p-row-padding shadow-row data-completed:bg-row-complete data-completed:shadow-row-complete"
    >
      <button
        type="button"
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
    </li>
  );
}
