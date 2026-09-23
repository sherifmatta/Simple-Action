"use client";

// The add input, and the two marks at its trailing edge (epics.md Story 3.2
// AC1-AC9; DESIGN.md `components.input-add` and `components.char-counter`,
// DESIGN.md:414-416, 440-442; EXPERIENCE.md:71, 103-104, 144-146, 155, 157).
//
// A single-line `<input>` at a fixed height rather than a growing
// `<textarea>`. `mockups/key-states.html:642` leaves grow-vs-cap explicitly
// undecided and this story settles it: Enter becomes a plain `onKeyDown` with
// no newline to suppress and no form element, the field never changes height
// while the user types — which matters inside a sticky block, where it would
// push the list — and text past the field width scrolls sideways within the
// field rather than reflowing anything.
//
// Nothing here is disabled, read-only or gated on the Todo List (AC1). That
// is true by construction rather than by discipline: this component takes no
// query and no mutation, so there is nothing for it to wait on. It is
// interactive from first paint, including while the skeletons are pulsing
// underneath it.
//
// The submit seam is the `onSubmit` prop (AC2), and what is behind it is not
// this file's business. Story 3.2 shipped a no-op default because there was
// no mutation to call; the story that built one deleted the default rather
// than replacing it, so the field can no longer be rendered in the one state
// it must never be in — accepting a Todo and discarding it.
//
// The caller is `add-todo.tsx`, not `sticky-top-block.tsx`, and that is
// forced rather than chosen. The block is a Server Component —
// `todo-list.test.ts` asserts it stays one — and "passing a function as a
// prop from a Server Component to a Client Component throws" (Next.js, Server
// and Client boundary guide); the one thing that does cross is a Server
// Function, which AD-1 bans outright. So a client component sits between the
// block and this one and supplies the prop.
//
// Three things a component would normally carry are deliberately elsewhere:
//
//  - The `Enter` hint's pointer gate is `@media (pointer: fine)` inside the
//    `enter-hint` recipe rather than a Tailwind width variant, because
//    EXPERIENCE.md:245 makes the test a capability rather than a width and
//    because, as CSS, it adds no second `matchMedia` call site.
//  - The counter's fade is a recipe whose duration is `COUNTER_FADE_MS`,
//    because `motion.test.ts` bans a `transition` or `duration` class
//    anywhere in the markup and a millisecond literal outside the motion
//    module.
//  - Stillness is the `data-still` marker the motion module produces and the
//    recipe suppresses the fade on (AR-28), never a branched class string.
//
// Autofocus is the one capability decision CSS cannot make, and it is read
// through `src/client/device/pointer.ts` for the same reason the preference
// is read through the motion module: one question, one home.

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { flushSync } from "react-dom";

import { usePointerCapability } from "@/client/device/pointer";
import { useReducedMotion } from "@/client/motion/motion";
import {
  isValidTodoText,
  TODO_TEXT_MAX_LENGTH,
} from "@/shared/contract/validation";

/**
 * EXPERIENCE.md:71, exactly — and the field's accessible name as well as its
 * placeholder.
 *
 * There is no visible label and there is nowhere to put one: DESIGN.md:334
 * has the card opening straight into the input, with no wordmark, no title
 * and no greeting above it. A placeholder alone is a weak accessible name, so
 * the same string is given as one; naming it twice from one constant is what
 * keeps the two from drifting.
 */
export const ADD_INPUT_PLACEHOLDER = "what needs doing?";

/** The pill hint's whole label (DESIGN.md `components.input-add`). */
export const ENTER_HINT_LABEL = "Enter";

/**
 * DESIGN.md `components.char-counter.appears-at`.
 *
 * Counted against the *raw* length, which `validation.ts:11` requires
 * explicitly: the counter reports keystrokes remaining before the browser
 * stops accepting them, and `isValidTodoText` measures the trimmed length,
 * so deriving one from the other would put the wrong number on screen for
 * any text with a trailing space.
 */
export const COUNTER_APPEARS_AT = 450;

/**
 * What the field's owner may do to the text in it (Story 3.4 AC2, AC4, AC5).
 *
 * Story 3.2 gave this component one seam, `onSubmit`, and the text went one
 * way through it. A failed add reverses the direction: the submitted string
 * has to come back, the caret has to land at its end, and `Retry` has to read
 * whatever is in the field at the moment it is pressed rather than whatever
 * was submitted.
 *
 * It is a handle rather than a lifted `value`/`onChange` pair because two of
 * the three are focus-and-selection work — the case React's own guidance
 * names for `useImperativeHandle` — and because the text itself has a settled
 * home here: the counter, the 500-character stop and the whitespace-only
 * branch are all written against this component's own state, and mirroring
 * that string in the parent would put two owners on one value for the sake of
 * a failure path.
 *
 * All three read the DOM node rather than the state, which is what lets the
 * handle be built once instead of on every keystroke. A controlled input's
 * value and its state are the same string by definition.
 */
export type AddInputHandle = {
  /** The text in the field right now (AC4). */
  currentText: () => string;
  /** Put `text` back, focused, caret at the end (AC2). */
  restore: (text: string) => void;
  /** Empty the field and keep the caret in it, as a submit does (AC5). */
  clearAndFocus: () => void;
};

/**
 * The field, and nothing behind it.
 *
 * `onSubmit` is required, and what it does is deliberately unknown here.
 * Story 3.2 shipped this component with a no-op default because there was no
 * mutation to call; Story 3.3 deleted the default rather than replacing it,
 * so that the one state this component must never be in — accepting a Todo
 * and discarding it — cannot be reached by rendering it with no props.
 * `add-todo.tsx` is the caller that knows there is a server.
 */
export function AddInput({
  onSubmit,
  ref,
}: {
  onSubmit: (text: string) => void;
  ref?: Ref<AddInputHandle>;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const autofocused = useRef(false);
  const pointer = usePointerCapability();
  const still = useReducedMotion();

  // AC6 — the caret starts in the field on a pointer device and does not on a
  // touch one, where it would raise the software keyboard over the list.
  //
  // The latch is on the first *settled* answer, not on the first focus, and
  // the difference is the whole of AC6's second half. `usePointerCapability`
  // is a subscription: this component is server-rendered and hydrated, so the
  // effect runs first with the server's `"unknown"` and again one commit
  // later with the browser's real answer — verified, not assumed. Latching on
  // the first focus instead would mean a device that answered `"coarse"`
  // never latched at all, and the mouse plugged into a tablet an hour later
  // would fire this effect, pass the guard and yank the caret out of whatever
  // the user was doing. So the run that carries the server's placeholder is
  // skipped, every later run finds the latch closed, and the one answer in
  // between decides.
  useEffect(() => {
    if (autofocused.current || pointer === "unknown") return;
    autofocused.current = true;
    if (pointer === "fine") field.current?.focus();
  }, [pointer]);

  // The handle, built once (AC2, AC4, AC5).
  //
  // `flushSync` in `restore` is what makes the caret placement below the
  // thing that decides where the caret goes. It is called from the create
  // mutation's `onError` — a promise callback — so without it the `setText`
  // is still queued when the next two lines run, `setSelectionRange` clamps
  // against the empty string the submit left behind, and the caret lands at
  // the end only because setting an `<input>`'s `value` happens to move it
  // there (HTML, the value setter). That is a real rule and it agrees with
  // this one, which is why no test separates them; it is also React's commit
  // order and the browser's selection restoration deciding a thing this
  // component states outright. Flushing first is the documented use of
  // `flushSync`: a state update you must read the DOM after.
  //
  // It is load-bearing on its own in the case the rule above cannot reach —
  // a retry that fails again restores the *same* string, so the value setter
  // never runs and the explicit call is all there is.
  //
  // `clearAndFocus` needs no flush, because focusing an element does not
  // depend on what it contains.
  useImperativeHandle(
    ref,
    (): AddInputHandle => ({
      currentText: () => field.current?.value ?? "",
      restore(next: string) {
        flushSync(() => setText(next));
        const node = field.current;
        if (node === null) return;
        node.focus();
        node.setSelectionRange(next.length, next.length);
      },
      clearAndFocus() {
        setText("");
        field.current?.focus();
      },
    }),
    [],
  );

  // AC2 and AC3, which are one branch: a submit either creates and clears, or
  // does nothing at all and leaves the text where it is.
  //
  // `isValidTodoText` is the shared predicate, imported rather than retyped
  // (AD-11) — the same function the route handler enforces with. A
  // whitespace-only Enter fails it and returns: nothing is created, nothing
  // is raised into the error slot, nothing is announced, and the field keeps
  // its text, because a mis-press that silently ate what the user typed would
  // be worse than the error this deliberately does not show.
  //
  // Focus is never moved and never restored, which is why there is no
  // `focus()` here: clearing a controlled input does not blur it, so the
  // caret is still in the field for the next Todo. Moving focus to the new
  // row is what would break the type-Enter-type rhythm (EXPERIENCE.md:155).
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // The Enter that commits an IME candidate is the same Enter that would
    // submit here. A Japanese, Chinese or Korean typist closes the candidate
    // window with it several times per sentence, and without this guard each
    // of those would capture the half-composed reading and clear the field —
    // the one failure this component promises never to cause (AC3's
    // reasoning, on text the user certainly did not mean to lose). The
    // browser sets `isComposing` for exactly that keystroke, so the guard is
    // the standard one rather than a heuristic.
    if (event.nativeEvent.isComposing) return;
    if (!isValidTodoText(text)) return;
    // The trimmed form is what the server persists (Epic 3 AC10), so it is
    // what the seam hands on: anything else would put a string on screen
    // optimistically that the confirmed row then quietly disagrees with.
    onSubmit(text.trim());
    setText("");
  }

  return (
    // The row shadow and the 1.5px control border are DESIGN.md's; the ring is
    // painted on focus-within, so it appears for the field inside rather than
    // on the box that carries the border (DESIGN.md:414). The accent border on
    // focus is the mockup's (`mockups/key-states.html:240`), which DESIGN.md
    // does not contradict.
    //
    // No `border` class, which `retry-pill`'s element omits for the same
    // reason: Tailwind's preflight already gives every element a solid border
    // at zero width, so the colour class plus the recipe's `border-width` is
    // the whole declaration — and `border` would land *after* the recipe in
    // the emitted stylesheet and quietly reset 1.5px back to 1px.
    <div
      data-still={still ? true : undefined}
      className="input-add flex min-h-touch-target-min items-center gap-4 rounded-md border-border-control bg-card px-5 py-4 shadow-row focus-within:border-accent focus-within:shadow-focus"
    >
      {/*
        The leading plus. Geometry and stroke are the mockup's, copied exactly
        (mockups/key-main.html:388) — SVG attributes rather than classes, the
        treatment `error-banner.tsx` and `empty-state.tsx` both give a value
        with no token to be added under. The colour does have one, so it is a
        class: DESIGN.md `components.input-add.leading-glyph`.
      */}
      <svg
        aria-hidden="true"
        className="flex-none text-accent"
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {/*
        `maxLength` is the stop itself (AC4), not a check written beside one:
        at 500 characters the browser declines the keystroke, so there is no
        moment at which this component holds an over-long value and has to
        decide what to do about it. Nothing about the interface changes there
        — no colour, no weight, no error, no shake — because nothing here is
        keyed on the ceiling at all. The counter reaching `0` is the whole
        explanation.

        `outline-none` does not suppress the focus indicator, it relocates it:
        the ring is painted by the wrapper's `focus-within:shadow-focus`
        above, around the control's whole visible extent rather than around
        the text box inside it. DESIGN.md:386 — never suppressed.
      */}
      <input
        ref={field}
        type="text"
        value={text}
        maxLength={TODO_TEXT_MAX_LENGTH}
        placeholder={ADD_INPUT_PLACEHOLDER}
        aria-label={ADD_INPUT_PLACEHOLDER}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="input-add-field flex-1 text-input-text text-text-primary outline-none placeholder:text-text-placeholder"
      />
      {/*
        AC5. Absent below 450 rather than present-and-empty, because a
        reserved slot that fills is a different thing from a mark that is not
        there yet — and the trailing edge has the `Enter` hint holding its
        place anyway. A bare numeral counting down, in `counter` type at
        `{colors.text-muted}`, and never on the danger ramp: it is not
        validation and reports no error. `tabular-nums` is the mockup's
        (`mockups/key-states.html:248`) and equalises the digits' *widths*, so
        `44` and `11` occupy the same space. It does not equalise their
        *count*: the `char-counter` recipe reserves two digits' width for
        that, because the field beside it is `flex-1` and would otherwise grow
        into the space a two-digit count gives up at 10 → 9, moving the caret
        and the typed text mid-keystroke. What the reserved width does not
        remove is the single shift at 450, when the span appears where there
        was nothing: only a permanently reserved slot could, and this story
        chose an absent counter over a present-and-empty one above. One
        deliberate shift as the mark arrives is not the same defect as the
        field moving under a typist's hands at every tenth keystroke.
      */}
      {text.length < COUNTER_APPEARS_AT ? null : (
        <span className="char-counter flex-none tabular-nums text-counter text-text-muted">
          {TODO_TEXT_MAX_LENGTH - text.length}
        </span>
      )}
      {/*
        AC7 — a hint, not a button. `aria-hidden`, which is the whole of "not
        in the tab order" and then some: a `<span>` is not focusable, and a
        stray "Enter" read out beside the field would be noise to someone who
        is not looking at it. Shown only where there is a keyboard to press,
        which the `enter-hint` recipe decides with `@media (pointer: fine)`.
      */}
      <span
        aria-hidden="true"
        className="enter-hint flex-none rounded-full border border-border-control px-2 py-1 text-counter text-text-muted"
      >
        {ENTER_HINT_LABEL}
      </span>
    </div>
  );
}
