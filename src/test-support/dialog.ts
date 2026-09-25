// A minimal `HTMLDialogElement` for jsdom, so the delete dialog's own logic is
// testable (Story 5.2).
//
// jsdom 30.1.1 implements none of the dialog API: `showModal`, `show` and
// `close` are all `undefined` on a `<dialog>` it creates, while `open` is a
// working reflection of the attribute. So a component that calls `showModal()`
// throws in every test that mounts it, and the choice is between shimming the
// element and not testing the dialog at all.
//
// Be precise about what this buys, because a shim that is mistaken for the
// platform is worse than no shim. What these tests can then prove is *our*
// logic: that `showModal()` is called and not `show()`, that the open and close
// are idempotent, that the `cancel` event and the `Cancel` button take the same
// path, that `Delete` reports once. What they cannot prove, and must not be
// read as proving, is anything the browser owns — the top layer, the focus
// trap, Escape being dispatched at all, the `::backdrop`, or focus returning to
// the trigger. Those are asserted as markup facts (the element is a real
// `<dialog>`; nothing hand-sets `aria-modal`) and are driven for real in
// Epic 6.
//
// Installed per test file rather than globally: only the dialog's own suites
// want it, and a global stub would quietly make every other suite pass against
// a browser this repository does not have.

/**
 * Installs `show`, `showModal` and `close` on jsdom's `HTMLDialogElement`.
 *
 * `open` is left alone — jsdom already reflects the attribute, which is what
 * these methods set and clear, so the property and the markup agree without a
 * second source of truth.
 *
 * Returns the uninstall function, for an `afterEach`. Re-installing is safe:
 * the original descriptors are captured once per call and restored in reverse.
 */
export function installDialogShim(dialogElement: {
  prototype: HTMLDialogElement;
}): () => void {
  const prototype = dialogElement.prototype as unknown as Record<
    string,
    unknown
  >;
  const original = new Map<string, PropertyDescriptor | undefined>();

  function define(name: string, value: unknown): void {
    original.set(name, Object.getOwnPropertyDescriptor(prototype, name));
    Object.defineProperty(prototype, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  define("show", function show(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });

  define("showModal", function showModal(this: HTMLDialogElement) {
    // The real one throws `InvalidStateError` on an already-open dialog, and
    // that throw is load-bearing: it is why the component guards its effect on
    // `open` rather than calling `showModal()` on every render. A shim that
    // silently allowed it would let exactly that bug through.
    if (this.open) {
      throw new DOMException(
        "The element already has an 'open' attribute, and therefore cannot be opened modally.",
        "InvalidStateError",
      );
    }
    this.setAttribute("open", "");
    // The platform's own focusing rule, which is the one piece of `showModal`
    // behaviour worth standing in for: the first element in the dialog with an
    // `autofocus` attribute, and otherwise the first focusable one. Both
    // branches matter here, because React sets `autoFocus` imperatively on
    // mount and renders no attribute at all — so in a real browser this dialog
    // reaches Cancel by the second branch, and a shim that only knew the first
    // would be testing a DOM React does not produce.
    const autofocus = this.querySelector<HTMLElement>("[autofocus]");
    const focusable = this.querySelector<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    (autofocus ?? focusable ?? this).focus();
  });

  define("close", function close(this: HTMLDialogElement, returnValue?: string) {
    // A no-op on a dialog that is already closed, exactly as the real one is:
    // the `close` event fires once per close, and a component that closes on
    // its way out of two code paths must not announce it twice.
    if (!this.open) return;
    this.removeAttribute("open");
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
  });

  return () => {
    for (const [name, descriptor] of [...original].reverse()) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else delete prototype[name];
    }
  };
}

/**
 * Dispatches the `cancel` a browser fires when Escape is pressed in a modal.
 *
 * jsdom dispatches no `cancel` of its own — it has no modal to press Escape in
 * — so the event is raised directly rather than through a `keydown` that would
 * be simulating a key handler nothing in this product has. Cancelable, because
 * the platform's is: `preventDefault()` on it keeps the dialog open, and a
 * component that relied on that would be relying on something this raises the
 * same way.
 */
export function dispatchCancel(dialog: HTMLDialogElement): Event {
  const event = new Event("cancel", { bubbles: false, cancelable: true });
  dialog.dispatchEvent(event);
  return event;
}
