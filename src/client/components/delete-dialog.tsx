// The one confirmation on the delete path (epics.md Story 5.2; DESIGN.md:430,
// `components.dialog-delete`; EXPERIENCE.md:111, 202; mockups/key-delete.html
// step C).
//
// One dialog for the whole Todo List, not one per row — `todo-list.tsx` holds
// it and the Todo it is asking about. All three routes to delete (swipe, hover
// icon, keyboard) open this same element, which is what "one dialog, one level
// deep, nothing stacks on top of it" means in code rather than in prose.
//
// --- Why a native `<dialog>` and not a hand-built modal -----------------------
//
// A hand-built modal needs `position: fixed` for its scrim, and
// `todo-card.test.ts` bans `fixed` from both the markup and `app/globals.css` —
// walls that exist so nothing can clip or cover the sticky top block.
// `showModal()` puts this element in the *top layer*, positioned by the UA
// stylesheet, so neither wall is touched and the dialog cannot be clipped by
// any ancestor however this card is later laid out.
//
// It also brings four behaviours from the platform rather than from
// hand-written code that would have to be kept correct: the focus trap
// (EXPERIENCE.md:202 "Tab cycles within the dialog only"), Escape closing it
// exactly as Cancel does, focus returning to the control that opened it, and
// `aria-modal` on the element without anyone setting it. This is the same trade
// `todo-row.tsx` took when it chose `<button>` to get Enter and Space "from the
// platform through one `onClick`".
//
// The cost is that jsdom 30 implements none of it — `showModal`, `show` and
// `close` are all `undefined` there — so `src/test-support/dialog.ts` shims the
// element for the render test. Be honest about what that buys: the tests prove
// *this file's* logic, that `showModal()` is called rather than `show()`, that
// `autoFocus` is on Cancel, that the `cancel` event and the Cancel button take
// the identical path, and that `Delete` fires `onConfirm` once. The trap and
// the focus restore are the platform's and are asserted as markup facts — the
// element is a real `<dialog>` and nothing here hand-sets `aria-modal` — not
// simulated.
//
// --- Why it closes itself ----------------------------------------------------
//
// Both buttons close the element and *then* report. Closing on the way out of
// the props — waiting for `todo` to arrive as `null` — would make the dialog's
// own behaviour depend on what its parent does with the callback, which is
// exactly the coupling that makes a component only testable through its
// consumer. The effect below is idempotent in both directions, so the parent's
// `null` a commit later is a no-op rather than a second close.
//
// This component is deliberately not the place where anything is deleted.
// `onConfirm` is the seam and `todo-list.tsx` is its consumer: what happens
// beyond this element — the row's collapse, the cache write, the request and
// the banner a refusal raises — belongs to the list and to `use-delete-todo.ts`,
// and none of it is visible from here. That is also why a refusal's `Retry`
// never re-opens this dialog: the retry closure lives in the error slot, the
// user has already confirmed, and asking a second time would make `Retry` a
// second confirmation (epics.md Story 5.3 AC11).

import { useEffect, useRef } from "react";

import type { Todo } from "@/shared/contract/todo";

/**
 * The title's id, module-scoped because there is exactly one of these.
 *
 * `aria-labelledby` pointing at the heading rather than an `aria-label`
 * repeating it: the name a screen reader announces is then the same string the
 * eye reads, and cannot drift from it. Prefixed and starting with a letter, so
 * it is a valid CSS identifier — the same care `todo-row.tsx` takes with a
 * UUIDv7 that usually starts with a digit.
 */
const TITLE_ID = "delete-dialog-title";

export function DeleteDialog({
  todo,
  onConfirm,
  onCancel,
}: {
  /** The Todo being asked about, or `null` when the dialog is closed. */
  todo: Todo | null;
  /** `Delete` was chosen. Fires once, with the Todo the dialog was asking about. */
  onConfirm: (todo: Todo) => void;
  /** `Cancel`, or Escape. The Todo List is untouched. */
  onCancel: () => void;
}) {
  const element = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = element.current;
    if (!dialog) return;

    // `showModal()` and never `show()`. `show()` opens a non-modal dialog: no
    // top layer, no focus trap, no `::backdrop` scrim, and the list behind
    // still operable — every one of the four guarantees above, gone, with the
    // element looking identical in the markup.
    //
    // Both branches are guarded on `open`, so this effect is idempotent:
    // `showModal()` on an already-open dialog throws `InvalidStateError`, and
    // `close()` on a closed one would fire a second `close` event.
    if (todo !== null) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [todo]);

  /**
   * Close first, then report — see the note at the top of the file.
   *
   * Both answers run through this, and both are refused once the dialog is
   * already closed. That is what makes "fires exactly once" a property of the
   * component rather than of how fast its consumer re-renders: a double-tap on
   * `Delete`, or an Escape landing in the same frame as a click, arrives on a
   * dialog that is no longer open and reports nothing a second time. The
   * platform's `cancel` fires *before* the close, so Escape still gets through
   * the guard on its one legitimate pass.
   */
  function answer(report: () => void) {
    const dialog = element.current;
    if (!dialog?.open) return;

    dialog.close();
    report();
  }

  const dismiss = () => answer(onCancel);

  const confirm = () =>
    answer(() => {
      // `todo` cannot be `null` while this button is on screen, because the
      // buttons render only when it is not. The guard is the compiler's, and
      // costs one branch rather than a non-null assertion that would be wrong
      // the day the contents stop being conditional.
      if (todo !== null) onConfirm(todo);
    });

  return (
    <dialog
      ref={element}
      aria-labelledby={TITLE_ID}
      // Escape. The platform fires `cancel` and would then close the dialog
      // itself; routing it through `dismiss` is what makes Escape and the
      // Cancel button one path rather than two that have to agree
      // (EXPERIENCE.md:202 — "Escape closes it as Cancel does"). The second
      // `close()` inside `dismiss` is a no-op on an element already closing.
      onCancel={dismiss}
      className="dialog-delete rounded-lg bg-card p-7 shadow-card"
    >
      {todo === null ? null : (
        // Rendered only while open, so the title and both buttons are absent
        // from the accessibility tree and from the tab order the rest of the
        // time — a closed `<dialog>` is `display: none`, but its contents are
        // still in the DOM for any scan that reads it, and `autoFocus` below
        // only means "when this mounts" if this mounts when the dialog opens.
        <>
          <h2 id={TITLE_ID} className="text-dialog-title text-text-primary">
            Delete this Todo?
          </h2>
          <div className="mt-6 flex gap-4">
            {/*
              Cancel first, and focused. "Initial focus lands on Cancel, not
              Delete: the safe default that destructive dialogs conventionally
              use, and consistent with a product where nothing else is ever
              lost" (DESIGN.md:430). A keyboard user who opens this and presses
              Enter without reading it keeps their Todo; reaching Delete is one
              Tab away and deliberate.
            */}
            <button
              type="button"
              autoFocus
              onClick={dismiss}
              className="dialog-button min-h-touch-target-min flex-1 rounded-full border-border-control text-button-label text-text-muted focus-visible:shadow-focus"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className="dialog-button min-h-touch-target-min flex-1 rounded-full border-danger-fill bg-danger-fill text-button-label text-on-danger-fill focus-visible:shadow-focus"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
