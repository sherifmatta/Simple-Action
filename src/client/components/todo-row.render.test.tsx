// @vitest-environment jsdom

// The row's behaviour, in a real DOM and with no providers (epics.md Story 4.2
// AC8, AC9, AC10, AC14).
//
// `todo-row.test.ts` reads the file and compiles its classes; neither can see
// whether pressing the checkbox calls anything, what its accessible name
// resolves to, or what comes first in the tab order. This file mounts it.
//
// No providers, and that is the point of the `onToggle` prop rather than a
// `useSetCompleted()` call inside the row: the mutation needs a
// `QueryClientProvider` and an `AnnouncerProvider`, and every case below would
// have had to mount both to exercise neither. `TodoRow` is presentational, so
// its test is too — the same split `add-input.render.test.tsx` has against
// `add-todo.tsx`.
//
// The thinnest possible mount: `createRoot` and React's own `act`, no testing
// library, which is this repository's established shape for a render test.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import { TodoRow } from "./todo-row";

const ACTIVE: Todo = {
  id: "0199a2c0-0000-7000-8000-00000000000c",
  text: "send invoice",
  completed: false,
  createdAt: "2026-09-22T08:00:00.000Z",
};

const COMPLETED: Todo = {
  id: "0199a2b0-0000-7000-8000-00000000000b",
  text: "book dentist",
  completed: true,
  createdAt: "2026-09-21T08:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

async function mount(todo: Todo, departing = false) {
  const onToggle = vi.fn();
  const onDeparted = vi.fn();
  const onRequestDelete = vi.fn();
  // A `<ul>` around it, because an `<li>` outside a list is not what the
  // product renders and React would warn about the nesting.
  await act(async () => {
    root.render(
      <ul>
        <TodoRow
          todo={todo}
          departing={departing}
          onToggle={onToggle}
          onDeparted={onDeparted}
          onRequestDelete={onRequestDelete}
        />
      </ul>,
    );
  });

  const controls = [...container.querySelectorAll("button")];
  expect(controls, "the row rendered no control").not.toHaveLength(0);
  const row = container.querySelector("li");
  expect(row, "the row rendered no list item").not.toBeNull();
  return {
    checkbox: controls[0] as HTMLButtonElement,
    // The row's last control, by document order — which is what makes it the
    // last tab stop without a `tabIndex` saying so.
    deleteControl: controls.at(-1) as HTMLButtonElement,
    row: row as HTMLLIElement,
    onToggle,
    onDeparted,
    onRequestDelete,
  };
}

/**
 * One touch point, as a `TouchEvent` React will read `touches[0]` off.
 *
 * jsdom implements no `Touch` constructor and no `TouchEvent`, so the event is
 * an ordinary one with the two lists React's synthetic event copies across.
 * That is enough for the handler under test, which reads `touches[0].clientX`
 * and `.clientY` and nothing else — and honest about its limit: this drives the
 * handler, it does not prove a browser would deliver the sequence.
 */
function touch(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true });
  const point = { clientX: x, clientY: y };
  return Object.assign(event, { touches: [point], changedTouches: [point] });
}

/**
 * The name a screen reader computes for an element, as far as this row needs.
 *
 * `aria-labelledby` wins over content, and it resolves by id within the
 * document — which is exactly the step a markup scan cannot take, because it
 * cannot know whether the id it points at exists or which element carries it.
 */
function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy === null) return element.textContent?.trim() ?? "";
  return labelledBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ");
}

/**
 * A key press on a focused control, plus the activation the platform performs.
 *
 * jsdom implements no activation behaviour at all — it dispatches the
 * `keydown` and stops, so a test that asserted a handler ran from the key
 * alone would be asserting a browser this suite does not have. What *is*
 * assertable here, and is the whole of AC9's design, is that nothing in the
 * row intercepts either key: the event reaches the control undefended and the
 * platform's own behaviour (HTML §Button "activation behaviour" — Enter on
 * `keydown`, Space on `keyup`) is what turns it into a click. So the key is
 * dispatched for real, its `defaultPrevented` is asserted, and the click the
 * browser would then fire is dispatched in the browser's place.
 *
 * The alternative — a hand-written `onKeyDown` — is what this row deliberately
 * does not have, and `todo-row.test.ts` asserts its absence. Epic 6 drives
 * real browsers and is where the two keys are pressed for real.
 */
function press(element: HTMLElement, key: string) {
  const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  element.dispatchEvent(down);
  const up = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true });
  element.dispatchEvent(up);
  // Nothing consumed the key on its way through, so the platform's activation
  // behaviour is still the thing that runs.
  expect(down.defaultPrevented, `${key} keydown was intercepted`).toBe(false);
  expect(up.defaultPrevented, `${key} keyup was intercepted`).toBe(false);
  element.click();
  return { down, up };
}

describe("the checkbox is the toggle, in both directions (AC8)", () => {
  it("asks for Completed when an Active row's checkbox is clicked", async () => {
    const { checkbox, onToggle } = await mount(ACTIVE);

    await act(async () => checkbox.click());

    // The value asked for, not an instruction to flip — which is what makes a
    // retry idempotent at the server (AD-6).
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(ACTIVE, true);
  });

  it("asks for Active when a Completed row's checkbox is clicked", async () => {
    const { checkbox, onToggle } = await mount(COMPLETED);

    await act(async () => checkbox.click());

    expect(onToggle).toHaveBeenCalledWith(COMPLETED, false);
  });

  it("is the only thing in the row that responds to a click (EXPERIENCE.md:105)", async () => {
    const { onToggle } = await mount(ACTIVE);

    const row = container.querySelector("li");
    const text = document.getElementById(`todo-${ACTIVE.id}-text`);
    await act(async () => (row as HTMLElement).click());
    await act(async () => (text as HTMLElement).click());

    // There is no editing, so a row click has nothing to open.
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("Enter and Space activate it, through one path (AC9)", () => {
  it("runs the same handler with the same arguments as a pointer click", async () => {
    for (const key of ["Enter", " "]) {
      const { checkbox, onToggle } = await mount(ACTIVE);
      checkbox.focus();
      expect(document.activeElement).toBe(checkbox);

      await act(async () => {
        press(checkbox, key);
      });

      expect(onToggle, `${key} did not activate the checkbox`).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(ACTIVE, true);
    }
  });

  it("is a <button>, which is where both keys come from", async () => {
    // A native `<input type="checkbox">` activates on Space only — Enter fires
    // nothing — so AC9 with one means hand-writing a second activation path
    // and keeping it in step with the first. This is the assertion that the
    // platform is doing the work.
    const { checkbox } = await mount(ACTIVE);
    expect(checkbox.tagName).toBe("BUTTON");
    // `type="button"`, so a row inside a form could never submit it.
    expect(checkbox.getAttribute("type")).toBe("button");
  });
});

describe("what a screen reader is told (AC10)", () => {
  it("is a checkbox whose checked state tracks Completion Status", async () => {
    const active = await mount(ACTIVE);
    expect(active.checkbox.getAttribute("role")).toBe("checkbox");
    expect(active.checkbox.getAttribute("aria-checked")).toBe("false");
    // Not decoration, which is what Story 2.4 shipped and `deferred-work.md`
    // recorded: the glyph was `aria-hidden` and the status reached no
    // accessibility tree at all.
    expect(active.checkbox.hasAttribute("aria-hidden")).toBe(false);

    await act(async () => root.render(<ul />));
    const completed = await mount(COMPLETED);
    expect(completed.checkbox.getAttribute("aria-checked")).toBe("true");
  });

  it("is named by the Todo's own text", async () => {
    const { checkbox } = await mount(ACTIVE);

    expect(accessibleName(checkbox)).toBe("send invoice");
    // Resolved through the DOM, so a dangling `aria-labelledby` — an id that
    // no element carries — fails here rather than shipping as an unnamed
    // control.
    const target = document.getElementById(`todo-${ACTIVE.id}-text`);
    expect(target, "aria-labelledby points at nothing").not.toBeNull();
    expect(target?.textContent).toBe(ACTIVE.text);
    // And the id is a valid CSS identifier, so `#…` reaches it. A UUIDv7
    // usually starts with a digit, which is legal in HTML and illegal here.
    expect(() => document.querySelector(`#todo-${ACTIVE.id}-text`)).not.toThrow();
  });

  it("carries no text of its own, so the name cannot double up", async () => {
    const { checkbox } = await mount(ACTIVE);
    expect(checkbox.textContent).toBe("");
  });
});

describe("the status classes are on the control that carries the attribute (AC11, AC12, AC13)", () => {
  // `todo-row.test.ts` compiles these classes and proves what each one *does*,
  // but it reads them out of `classNamesOf`, which flattens every `className`
  // literal in the file into one array. So moving `checkbox-hit-area` onto the
  // text span, or the `aria-checked:` fill onto the `<li>` — which never
  // carries `aria-checked` — leaves that whole file green while rendering the
  // hit area and the fill inert. Binding them to the mounted element is the
  // half only a DOM can do.
  it("carries the hit area, the checked fill and both focus rings itself", async () => {
    const { checkbox } = await mount(ACTIVE);
    const classes = checkbox.className.split(/\s+/);

    for (const name of [
      "checkbox-box",
      "checkbox-hit-area",
      "group/box",
      "aria-checked:bg-accent",
      "aria-checked:border-accent",
      "group-data-completed:aria-checked:bg-accent-deep",
      "group-data-completed:aria-checked:border-accent-deep",
      "focus-visible:shadow-focus",
      "group-data-completed:focus-visible:shadow-focus-on-complete",
    ]) {
      expect(classes, `${name} is not on the control`).toContain(name);
    }

    // And the element it is on is the one with the attribute those variants
    // gate on, which is what makes them fire at all.
    expect(checkbox.hasAttribute("aria-checked")).toBe(true);
  });

  it("reveals the glyph from the control's own group, not the row's", async () => {
    const { checkbox } = await mount(ACTIVE);
    const glyph = checkbox.querySelector("svg");

    expect(glyph?.getAttribute("class")?.split(/\s+/)).toEqual([
      "hidden",
      "group-aria-checked/box:block",
    ]);
    // `group/box` names the source; without it on this element the variant
    // resolves against the row instead and the glyph never appears.
    expect(glyph?.closest(".group\\/box")).toBe(checkbox);
  });
});

describe("the tab order within a row (AC14)", () => {
  it("puts the checkbox first, with no tabIndex of its own", async () => {
    const { checkbox, deleteControl } = await mount(ACTIVE);

    const focusable = [...container.querySelectorAll("a, button, input, [tabindex]")];
    expect(focusable[0]).toBe(checkbox);
    // Document order is what gives the row its tab order; an explicit
    // `tabindex` would be arranging something that is already arranged.
    expect(checkbox.hasAttribute("tabindex")).toBe(false);
    // Two controls since Story 5.2, and the delete control is the second —
    // epics.md Story 5.2 AC7's "it is the **last** focusable control within its
    // row, which places it after the checkbox once Epic 4 ships one". Neither
    // carries a `tabindex`, so the order is the markup's.
    expect(focusable).toHaveLength(2);
    expect(focusable[1]).toBe(deleteControl);
    expect(deleteControl.hasAttribute("tabindex")).toBe(false);
  });
});

// --- Story 4.3: reporting that the departure has finished -------------------

describe("the row reports its own departure (AC13)", () => {
  /** The `transitionend` a collapsing row produces, for one property. */
  const transitionEnd = (propertyName: string) =>
    Object.assign(new Event("transitionend", { bubbles: true }), { propertyName });

  it("says nothing while it is merely leaving", async () => {
    // The marker is set and the transition has its 400ms hold to serve. The
    // row is still on screen and still its own business until then.
    const { onDeparted } = await mount(
      { ...ACTIVE, completed: true },
      true,
    );
    expect(onDeparted).not.toHaveBeenCalled();
  });

  it("reports once the fade has finished, with its own id", async () => {
    const { onDeparted } = await mount({ ...ACTIVE, completed: true }, true);
    const row = container.querySelector("li");

    await act(async () => {
      row?.dispatchEvent(transitionEnd("opacity"));
    });

    expect(onDeparted).toHaveBeenCalledExactlyOnceWith(ACTIVE.id);
  });

  it("reports once, not once per property", async () => {
    // Five properties collapse together, so five `transitionend` events
    // arrive. `opacity` is the one that is guaranteed to run — a height that
    // cannot interpolate still flips to zero without easing — so it is the one
    // that counts, and the others are ignored rather than debounced.
    const { onDeparted } = await mount({ ...ACTIVE, completed: true }, true);
    const row = container.querySelector("li");

    await act(async () => {
      for (const property of [
        "height",
        "min-height",
        "padding-block",
        "margin-bottom",
        "opacity",
      ]) {
        row?.dispatchEvent(transitionEnd(property));
      }
    });

    expect(onDeparted).toHaveBeenCalledTimes(1);
  });

  it("ignores a transition that finished somewhere inside it", async () => {
    // `transitionend` bubbles. The checkbox has a focus ring that transitions
    // in some browsers, and a row must not report a departure because one of
    // its descendants finished something.
    const { onDeparted } = await mount({ ...ACTIVE, completed: true }, true);
    const checkbox = container.querySelector('[role="checkbox"]');

    await act(async () => {
      checkbox?.dispatchEvent(transitionEnd("opacity"));
    });

    expect(onDeparted).not.toHaveBeenCalled();
  });

  it("carries the marker only while it is departing", async () => {
    // The attribute is absent rather than `false` when the row is staying, so
    // the stylesheet can key on its presence — the `data-completed` idiom.
    await mount({ ...ACTIVE, completed: true }, true);
    expect(container.querySelector("li")?.getAttribute("data-departing")).toBe("true");

    // `mount` renders into the same root, so this replaces the tree.
    const staying = await mount(ACTIVE);
    expect(container.querySelector("li")?.getAttribute("data-departing")).toBeNull();
    expect(staying.onDeparted).not.toHaveBeenCalled();
  });
});

// --- Story 5.2: the delete control and the swipe that reveals it -------------
//
// epics.md Story 5.2 AC1 (the swipe reveals the lane and tapping it opens the
// dialog), AC3 (the control is reachable whether or not it is revealed, and
// Enter and Space open the dialog), AC5 (it is named with the Todo it acts on)
// and AC7 (it is the last focusable control in the row).
//
// What is *drawn* is `delete-dialog.test.ts`'s — jsdom computes no Tailwind, so
// nothing here can see the lane, the travel or the 44px. What is here is the
// behaviour: which handler runs, what it sets, and what it calls.

describe("the delete control (AC3, AC5, AC7)", () => {
  it("is named with the Todo it acts on, not with the verb alone", async () => {
    // "So the tab order does not read as a list of identical `Delete` buttons"
    // (EXPERIENCE.md:217). The name is two parts, which is why this one is an
    // `aria-label` where the checkbox's is an `aria-labelledby`.
    const { deleteControl } = await mount(ACTIVE);
    expect(deleteControl.getAttribute("aria-label")).toBe("Delete send invoice");

    const completed = await mount(COMPLETED);
    expect(completed.deleteControl.getAttribute("aria-label")).toBe(
      "Delete book dentist",
    );
  });

  it("is rendered on every row, revealed or not — the keyboard route", async () => {
    // The reveal is the stylesheet's (`@utility delete-action`), never a
    // branch: a control that is not rendered cannot be tabbed to, and AC3 makes
    // the keyboard route the WCAG 2.2 AA floor rather than a fallback.
    const { row, deleteControl } = await mount(ACTIVE);
    expect(row.getAttribute("data-revealed")).toBeNull();
    expect(deleteControl.isConnected).toBe(true);
    expect(deleteControl.hasAttribute("hidden")).toBe(false);
    expect(deleteControl.hasAttribute("disabled")).toBe(false);
  });

  it("asks rather than removes — it reports the Todo and nothing else", async () => {
    // "Releasing here opens the confirmation dialog in Step C; the swipe itself
    // never deletes" (mockups/key-delete.html). The row holds no dialog and
    // removes no Todo; `onRequestDelete` is the whole of its part.
    const { deleteControl, onRequestDelete, onToggle } = await mount(ACTIVE);

    await act(async () => deleteControl.click());

    expect(onRequestDelete).toHaveBeenCalledExactlyOnceWith(ACTIVE);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("opens the dialog on Enter and on Space, from the platform (AC3)", async () => {
    // A `<button>`, so both keys arrive as a click through one handler — the
    // argument `todo-row.tsx` already makes for the checkbox. jsdom dispatches
    // no synthetic click for a key, so the keys are pressed and the click the
    // platform would raise is raised with them; what is under test is that
    // there is one activation path and no `onKeyDown` beside it.
    const { deleteControl, onRequestDelete } = await mount(ACTIVE);

    for (const key of ["Enter", " "]) {
      await act(async () => {
        deleteControl.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
        deleteControl.click();
      });
    }

    expect(onRequestDelete).toHaveBeenCalledTimes(2);
  });
});

describe("the swipe that reveals the lane (AC1)", () => {
  /** A leftward travel of `distance`, with `drift` of vertical wander. */
  async function swipe(
    row: HTMLElement,
    distance: number,
    drift = 0,
  ): Promise<void> {
    await act(async () => {
      row.dispatchEvent(touch("touchstart", 200, 100));
      row.dispatchEvent(touch("touchmove", 200 - distance, 100 + drift));
      row.dispatchEvent(touch("touchend", 200 - distance, 100 + drift));
    });
  }

  it("marks the row revealed once the travel passes the threshold", async () => {
    const { row } = await mount(ACTIVE);
    await swipe(row, 60);
    expect(row.getAttribute("data-revealed")).toBe("true");
  });

  it("leaves a short travel alone, so a tap is not a swipe", async () => {
    const { row } = await mount(ACTIVE);
    await swipe(row, 8);
    expect(row.getAttribute("data-revealed")).toBeNull();
  });

  it("closes again on the same travel back the other way", async () => {
    // A half-swipe is recoverable by reversing it rather than by finding
    // something else to press.
    const { row } = await mount(ACTIVE);
    await swipe(row, 60);
    await swipe(row, -60);
    expect(row.getAttribute("data-revealed")).toBeNull();
  });

  it("ignores a scroll that drifted sideways (AC1)", async () => {
    // The finding that sent the first attempt back: `clientX` alone, with no
    // axis comparison, arms a destructive control on a vertical flick that
    // wandered 40px across. A list is scrolled with the same thumb on the same
    // row, so this is the common gesture and not the exotic one.
    const { row } = await mount(ACTIVE);
    await swipe(row, 40, 120);
    expect(row.getAttribute("data-revealed")).toBeNull();
  });

  it("latches when the same travel is dominantly horizontal", async () => {
    // The other side of the comparison, so the guard above is a discrimination
    // rather than a threshold nobody can cross.
    const { row } = await mount(ACTIVE);
    await swipe(row, 40, 10);
    expect(row.getAttribute("data-revealed")).toBe("true");
  });

  it("does not move the origin when a second finger lands mid-swipe", async () => {
    // `touchstart` fires again for the second finger, and `touches[0]` is by
    // then the *current* position of the first — so an unguarded assignment
    // measures the rest of the travel from wherever the swipe had got to, and
    // a gesture that has already travelled 50px never reaches the threshold.
    const { row } = await mount(ACTIVE);

    await act(async () => {
      row.dispatchEvent(touch("touchstart", 200, 100));
      row.dispatchEvent(touch("touchmove", 175, 100));
      // A second finger, reported at the first one's current position.
      row.dispatchEvent(touch("touchstart", 175, 100));
      row.dispatchEvent(touch("touchmove", 160, 100));
    });

    expect(row.getAttribute("data-revealed")).toBe("true");
  });

  it("measures the next gesture from its own origin after a cancel", async () => {
    // The browser cancels a touch when it takes the gesture over, and no
    // `touchend` follows. An origin left behind here measures the next gesture
    // from a point the finger was at some time ago — so a 10px tap at the far
    // left of the row would read as a 150px swipe.
    const { row } = await mount(ACTIVE);

    await act(async () => {
      row.dispatchEvent(touch("touchstart", 300, 100));
      row.dispatchEvent(touch("touchcancel", 300, 100));
      row.dispatchEvent(touch("touchstart", 140, 100));
      row.dispatchEvent(touch("touchmove", 132, 100));
    });

    expect(row.getAttribute("data-revealed")).toBeNull();
  });
});

describe("the reveal is a step in a gesture, not a row state (AC1)", () => {
  async function reveal(row: HTMLElement): Promise<void> {
    await act(async () => {
      row.dispatchEvent(touch("touchstart", 200, 100));
      row.dispatchEvent(touch("touchmove", 120, 100));
      row.dispatchEvent(touch("touchend", 120, 100));
    });
    expect(row.getAttribute("data-revealed")).toBe("true");
  }

  it("un-latches when the control is pressed", async () => {
    // The question has been asked; leaving the panel open would park a
    // destructive surface under the dialog and still be open behind a Cancel.
    const { row, deleteControl, onRequestDelete } = await mount(ACTIVE);
    await reveal(row);

    await act(async () => deleteControl.click());

    expect(row.getAttribute("data-revealed")).toBeNull();
    expect(onRequestDelete).toHaveBeenCalledOnce();
  });

  it("un-latches when the control loses focus", async () => {
    const { row, deleteControl } = await mount(ACTIVE);
    await reveal(row);

    await act(async () => {
      deleteControl.focus();
      deleteControl.blur();
    });

    expect(row.getAttribute("data-revealed")).toBeNull();
  });

  it("is never revealed while it is departing", async () => {
    // A row collapsing out of the Filter View with a destructive panel hanging
    // open is the one frame this must not have. Derived from the two rather
    // than cleared in an effect, so they cannot disagree for a commit.
    const { row } = await mount(ACTIVE);
    await reveal(row);

    await act(async () => {
      root.render(
        <ul>
          <TodoRow
            todo={ACTIVE}
            departing
            onToggle={() => {}}
            onDeparted={() => {}}
            onRequestDelete={() => {}}
          />
        </ul>,
      );
    });

    const departing = container.querySelector("li");
    expect(departing?.getAttribute("data-departing")).toBe("true");
    expect(departing?.getAttribute("data-revealed")).toBeNull();
  });
});
