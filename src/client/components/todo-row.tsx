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
// The checkbox is a glyph here, not a control. Story 4.3 makes it the thing
// that toggles; until then the row carries no handler, no `tabIndex` and no
// role, because "the row body is not a click target — there is no editing, so
// there is nothing for a row click to open" (EXPERIENCE.md:105, AC6). Its
// checked fill is `accent-deep` rather than `accent` because accent on mint is
// 2.97:1 and fails WCAG 1.4.11 on the one control the row's whole meaning
// turns on (DESIGN.md:412). The unchecked box is never drawn checked on an
// Active row in this product — a checked box *is* the Completed status — so
// `checked-*-on-active` has no reachable state to render.
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

export function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li
      data-completed={todo.completed ? true : undefined}
      className="group flex min-h-touch-target-min items-center gap-4 rounded-md bg-row-active p-row-padding shadow-row data-completed:bg-row-complete data-completed:shadow-row-complete"
    >
      <span
        aria-hidden="true"
        className="checkbox-box flex flex-none items-center justify-center rounded-sm border-border-control bg-row-active text-on-accent group-data-completed:border-accent-deep group-data-completed:bg-accent-deep"
      >
        {/*
          Drawn in both statuses and revealed by the marker rather than
          rendered conditionally, so the glyph derives from the same single
          source as the fill and the strikethrough (AC4). Geometry and stroke
          are the mockup's (mockups/key-main.html) — attributes rather than
          classes, so AD-13's arbitrary-value ban has nothing to catch and no
          token has to be invented for a path.
        */}
        <svg
          className="hidden group-data-completed:block"
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
      </span>
      <span className="wrap-anywhere text-todo-text text-text-primary group-data-completed:text-text-completed group-data-completed:strikethrough-completed">
        {todo.text}
      </span>
    </li>
  );
}
