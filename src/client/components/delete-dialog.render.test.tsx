// @vitest-environment jsdom

// The dialog's behaviour, in a real DOM and with no providers (epics.md Story
// 5.2 AC8, AC9, AC10, AC11, AC12 and AC14).
//
// `delete-dialog.test.ts` reads the file and compiles its classes; neither can
// see which method opens the element, which button reports what, or whether
// Escape and Cancel end up in the same place. This file mounts it.
//
// jsdom 30.1.1 implements no dialog API at all — `showModal`, `show` and
// `close` are `undefined` — so `src/test-support/dialog.ts` installs a minimal
// one and its own comment is explicit about the line between what that proves
// and what it cannot. In short: everything below is a claim about *this
// component*, never about the platform. The top layer, the focus trap, the
// `::backdrop` and focus returning to the trigger are the browser's, are
// asserted here only as markup facts, and are driven for real in Epic 6.
//
// The thinnest possible mount — `createRoot` and React's own `act`, no testing
// library — which is this repository's established shape for a render test.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchCancel, installDialogShim } from "@/test-support/dialog";
import type { Todo } from "@/shared/contract/todo";

import { DeleteDialog } from "./delete-dialog";

const TODO: Todo = {
  id: "0199a2c0-0000-7000-8000-00000000000c",
  text: "send invoice",
  completed: false,
  createdAt: "2026-09-25T08:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;
let uninstallDialog: () => void;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  uninstallDialog = installDialogShim(window.HTMLDialogElement);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  uninstallDialog();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});

function dialogElement(): HTMLDialogElement {
  const found = container.querySelector("dialog");
  expect(found, "the component rendered no <dialog>").not.toBeNull();
  return found as HTMLDialogElement;
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = buttons().find(
    (button) => button.textContent?.trim() === label,
  );
  expect(found, `no button reads ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}

async function mount(todo: Todo | null) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  await act(async () => {
    root.render(
      <DeleteDialog todo={todo} onConfirm={onConfirm} onCancel={onCancel} />,
    );
  });

  return { onConfirm, onCancel };
}

/** Re-renders the same element with a different `todo` — what the list does. */
async function rerender(
  todo: Todo | null,
  handlers: { onConfirm: (todo: Todo) => void; onCancel: () => void },
) {
  await act(async () => {
    root.render(
      <DeleteDialog
        todo={todo}
        onConfirm={handlers.onConfirm}
        onCancel={handlers.onCancel}
      />,
    );
  });
}

describe("the shim stands in for something jsdom does not have", () => {
  it("would have thrown without it, which is why every case below installs it", () => {
    // If jsdom ever implements the dialog API, this fails and the shim can go.
    // Asserted rather than assumed: a shim nobody notices has become a stub
    // that hides the real element's behaviour.
    uninstallDialog();
    const bare = document.createElement("dialog") as HTMLDialogElement;
    expect(bare.showModal).toBeUndefined();
    expect(bare.close).toBeUndefined();

    uninstallDialog = installDialogShim(window.HTMLDialogElement);
    const shimmed = document.createElement("dialog") as HTMLDialogElement;
    expect(typeof shimmed.showModal).toBe("function");
  });
});

describe("opening it (AC8, AC10)", () => {
  it("opens modally — showModal, never show", async () => {
    // `show()` opens a non-modal dialog: no top layer, no focus trap, no
    // scrim, and the list behind still operable. It looks identical in the
    // markup, which is why the method is what is asserted.
    const opened = vi.spyOn(window.HTMLDialogElement.prototype, "showModal");
    const nonModal = vi.spyOn(window.HTMLDialogElement.prototype, "show");

    await mount(TODO);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(nonModal).not.toHaveBeenCalled();
    expect(dialogElement().open).toBe(true);
  });

  it("stays closed while there is no Todo to ask about", async () => {
    const opened = vi.spyOn(window.HTMLDialogElement.prototype, "showModal");

    await mount(null);

    expect(opened).not.toHaveBeenCalled();
    expect(dialogElement().open).toBe(false);
    // And it renders nothing inside itself, so the title and the two buttons
    // are absent from the tab order and from the accessibility tree.
    expect(buttons()).toHaveLength(0);
    expect(dialogElement().textContent).toBe("");
  });

  it("opens once, however often it re-renders", async () => {
    // `showModal()` on an already-open dialog throws `InvalidStateError`, so
    // an effect that did not guard on `open` would take the whole card down
    // the first time an unrelated re-render reached it.
    const opened = vi.spyOn(window.HTMLDialogElement.prototype, "showModal");
    const handlers = await mount(TODO);

    await rerender(TODO, handlers);
    await rerender(TODO, handlers);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(dialogElement().open).toBe(true);
  });

  it("is a real <dialog>, so the trap and the restore are the platform's", async () => {
    // The guarantees this component does not implement: `aria-modal` is not
    // hand-set anywhere, the element carries no `role`, and there is no
    // keydown handler holding Tab inside it. All four come from `showModal()`
    // and are driven for real in Epic 6.
    await mount(TODO);
    const dialog = dialogElement();

    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.hasAttribute("aria-modal")).toBe(false);
    expect(dialog.hasAttribute("role")).toBe(false);
  });

  it("is named by its own title (AC8)", async () => {
    await mount(TODO);
    const dialog = dialogElement();

    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    // Resolved through the document, so an id that no element carries fails
    // here rather than shipping as an unnamed modal.
    const title = document.getElementById(String(labelledBy));
    expect(title, "aria-labelledby points at nothing").not.toBeNull();
    expect(title?.textContent?.trim()).toBe("Delete this Todo?");
    expect(dialog.hasAttribute("aria-label")).toBe(false);
  });

  it("holds exactly two buttons, reading Cancel and Delete (AC8, AC14)", async () => {
    // "No third button, no checkbox, no 'don't ask again'" (DESIGN.md:430).
    await mount(TODO);

    expect(buttons().map((button) => button.textContent?.trim())).toEqual([
      "Cancel",
      "Delete",
    ]);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    // Copy verbatim, and the banned word nowhere near it.
    expect(container.textContent).toBe("Delete this Todo?CancelDelete");
    expect(container.textContent).not.toMatch(/\bDone\b/);
  });

  it("lands initial focus on Cancel and not on Delete (AC10)", async () => {
    // The safe default: "a keyboard user who opens this dialog and presses
    // Enter without reading it keeps their Todo" (mockups/key-delete.html).
    await mount(TODO);

    expect(document.activeElement).toBe(buttonNamed("Cancel"));
    expect(document.activeElement).not.toBe(buttonNamed("Delete"));
  });

  it("keeps Cancel the first focusable thing inside the dialog", async () => {
    // Worth pinning separately, because the obvious assertion about the case
    // above is wrong. `autoFocus` is on Cancel in the source —
    // `delete-dialog.test.ts` reads it out of the AST — but React applies it
    // *imperatively* on mount and renders no `autofocus` attribute at all, so
    // a real `showModal()` never sees one and falls back to focusing the first
    // focusable element in the dialog. That fallback is therefore load-bearing
    // in the browser, and it is document order that decides it: swap the two
    // buttons and initial focus lands on `Delete` with the `autoFocus` prop
    // still exactly where it was.
    await mount(TODO);

    const focusable = [
      ...dialogElement().querySelectorAll("a, button, input, [tabindex]"),
    ];
    expect(focusable[0]).toBe(buttonNamed("Cancel"));
    expect(focusable).toHaveLength(2);
  });

  it("puts Cancel first in the tab order, with Delete one Tab away", async () => {
    await mount(TODO);

    const [first, second] = buttons();
    expect(first.textContent?.trim()).toBe("Cancel");
    expect(second.textContent?.trim()).toBe("Delete");
    // Document order, not an arrangement: an explicit `tabindex` here would be
    // ordering something that is already ordered.
    for (const button of buttons()) {
      expect(button.hasAttribute("tabindex")).toBe(false);
      // `type="button"`, so a dialog inside a form could never submit it.
      expect(button.getAttribute("type")).toBe("button");
    }
  });
});

describe("cancelling it (AC9, AC11)", () => {
  it("closes, reports the cancel, and confirms nothing", async () => {
    const { onConfirm, onCancel } = await mount(TODO);

    await act(async () => buttonNamed("Cancel").click());

    expect(dialogElement().open).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Nothing is removed until the user chooses `Delete` — this is the whole
    // of AC8's second half at this component, and the Todo List's own untouchedness is
    // `todo-list.render.test.tsx`'s.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("takes the identical path when the cancel event fires (Escape)", async () => {
    // Escape reaches a modal as a `cancel` event. Routing it through the same
    // handler is what makes "Escape closes it as Cancel does"
    // (EXPERIENCE.md:202) one path rather than two that have to agree.
    const { onConfirm, onCancel } = await mount(TODO);

    await act(async () => {
      dispatchCancel(dialogElement());
    });

    expect(dialogElement().open).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes when the list takes the pending Todo away", async () => {
    // The other direction of the same effect: the parent clearing its state
    // closes the element, and does so without a second `close` when the
    // dialog closed itself on the way out.
    const handlers = await mount(TODO);
    expect(dialogElement().open).toBe(true);

    await rerender(null, handlers);

    expect(dialogElement().open).toBe(false);
    expect(buttons()).toHaveLength(0);
  });

  it("reopens for the next Todo on the same element", async () => {
    // The same element across every open, which is what lets the platform
    // restore focus to whichever control opened it.
    const handlers = await mount(TODO);
    const element = dialogElement();

    await rerender(null, handlers);
    await rerender({ ...TODO, id: "0199a2b0-0000-7000-8000-00000000000b" }, handlers);

    expect(dialogElement()).toBe(element);
    expect(element.open).toBe(true);
  });
});

describe("confirming it (AC8)", () => {
  it("fires onConfirm exactly once, with the pending Todo, and closes", async () => {
    const { onConfirm, onCancel } = await mount(TODO);

    await act(async () => buttonNamed("Delete").click());

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(TODO);
    expect(dialogElement().open).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("reports the Todo it was asking about, not the one before it", async () => {
    const other: Todo = {
      ...TODO,
      id: "0199a2b0-0000-7000-8000-00000000000b",
      text: "book dentist",
    };
    const handlers = await mount(TODO);
    await rerender(null, handlers);
    await rerender(other, handlers);

    await act(async () => buttonNamed("Delete").click());

    expect(handlers.onConfirm).toHaveBeenCalledExactlyOnceWith(other);
  });

  it("answers once however many times Delete is pressed", async () => {
    // A double-tap, and the frame before the list has re-rendered the dialog
    // shut. The guard is on the element's own `open`, so the second press
    // arrives at a closed dialog and reports nothing — "exactly once" is a
    // property of this component rather than of how fast its consumer commits.
    const { onConfirm } = await mount(TODO);
    const confirm = buttonNamed("Delete");

    await act(async () => {
      confirm.click();
      confirm.click();
      confirm.click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("reports nothing more once it has been cancelled", async () => {
    // The two answers are mutually exclusive, and are so through one gate: a
    // `Delete` that lands after a `Cancel` has already closed the dialog must
    // not remove the Todo the user just kept.
    const { onConfirm, onCancel } = await mount(TODO);
    const confirm = buttonNamed("Delete");

    await act(async () => {
      buttonNamed("Cancel").click();
      confirm.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
