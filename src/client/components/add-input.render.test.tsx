// @vitest-environment jsdom

// What the add input *does* (epics.md Story 3.2 AC1-AC6).
//
// `add-input.test.ts` asserts the source and what it compiles to; none of
// that can see a keystroke. Enter clearing the field and keeping focus, a
// whitespace-only Enter changing nothing at all, the counter crossing 450,
// and the caret landing in the field on a pointer device and not on a touch
// one are each a fact about a real DOM, so this file mounts one.
//
// It follows `todo-list.render.test.tsx` exactly — `createRoot`, React's own
// `act`, no testing library — because what is under test is behaviour rather
// than markup, and a thin mount keeps the failure messages about this
// component. It mounts `AddInput` alone: the component takes no context, no
// query and no mutation, which is AC1 restated, and wrapping it in providers
// would only prove those providers still work.
//
// jsdom implements no `matchMedia` at all, and this component now asks two
// questions through it — the motion preference and the pointer capability —
// so the stub below answers per query rather than with one constant. A stub
// that answered the same thing to both would pass every assertion here with
// the two questions swapped.

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TODO_TEXT_MAX_LENGTH } from "@/shared/contract/validation";
import { AddInput, ADD_INPUT_PLACEHOLDER, COUNTER_APPEARS_AT } from "./add-input";

let container: HTMLDivElement;
let root: Root;

// React only treats `act` as a real flush boundary when this is set, and warns
// when it is not — without it `act` can return before React has drained its
// work, which is a race that passes alone and fails under a loaded worker.
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

/** The two queries this component's two hooks ask, spelled out once. */
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const POINTER_QUERY = "(pointer: fine)";

type MediaStub = {
  queries: string[];
  /** The `change` handler each query was subscribed with, keyed `query:event`. */
  listeners: Map<string, () => void>;
  /** Whether the device grows a fine pointer after the page has loaded. */
  setPointer: (value: boolean) => void;
};

/**
 * `matchMedia`, answering each query on its own merits.
 *
 * Recording as well as answering: without `queries` asserted, a module that
 * asked the *other* question — pointer capability deciding the pulse, the
 * motion preference deciding the caret — would leave every case here green.
 *
 * The listeners are captured rather than discarded, which is what lets a
 * capability *change* be delivered: a mouse plugged into a tablet arrives as
 * a `change` on the pointer query and nothing else, and the caret must stay
 * where the user put it when it does. `pointer.test.tsx` holds the rest of
 * the subscription's contract — the event name and the removal on unmount.
 */
function stubCapabilities(answers: { pointer: boolean; reduced: boolean }): MediaStub {
  const stub: MediaStub = {
    queries: [],
    listeners: new Map(),
    setPointer: () => {},
  };
  let pointer = answers.pointer;
  stub.setPointer = (value: boolean) => {
    pointer = value;
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      stub.queries.push(query);
      return {
        media: query,
        // A getter, so a capability changed after `matchMedia` was called is
        // read back rather than frozen at subscription time.
        get matches() {
          return query === POINTER_QUERY
            ? pointer
            : query === REDUCE_QUERY
              ? answers.reduced
              : false;
        },
        addEventListener: (event: string, handler: () => void) =>
          stub.listeners.set(`${query}:${event}`, handler),
        removeEventListener: () => {},
      };
    }),
  );
  return stub;
}

async function mount(onSubmit?: (text: string) => void): Promise<HTMLInputElement> {
  await act(async () => {
    root.render(<AddInput onSubmit={onSubmit} />);
  });
  const field = container.querySelector("input");
  expect(field, "the input did not render").not.toBeNull();
  return field as HTMLInputElement;
}

/**
 * A keystroke, as the browser delivers it.
 *
 * React tracks an input's value on the node itself and skips `onChange` when
 * the value it reads back is the one it last wrote, so assigning `.value`
 * directly is swallowed. Going through the prototype's own setter is what
 * makes the change look like a user's.
 */
const nativeValue = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

async function type(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    nativeValue.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function press(
  field: HTMLInputElement,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> {
  await act(async () => {
    field.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}

/**
 * The component as the browser really meets it: server markup, then hydration.
 *
 * Every other case here mounts client-side, where `useSyncExternalStore` reads
 * the client snapshot on the very first render. A hydrating tree does not: it
 * renders the *server* snapshot to match the HTML, and the browser's real
 * answer arrives one commit later. Autofocus is decided across exactly that
 * gap, so the two cases below mount this way or they are not testing it.
 */
async function hydrate(): Promise<{
  field: HTMLInputElement;
  unmount: () => Promise<void>;
}> {
  const host = document.createElement("div");
  host.innerHTML = renderToString(<AddInput />);
  document.body.append(host);

  let hydrated: Root | undefined;
  await act(async () => {
    hydrated = hydrateRoot(host, <AddInput />);
  });

  const field = host.querySelector("input");
  expect(field, "the hydrated input did not render").not.toBeNull();
  return {
    field: field as HTMLInputElement,
    unmount: async () => {
      await act(async () => hydrated?.unmount());
      host.remove();
    },
  };
}

/** The counter, which is absent rather than empty below the threshold. */
const counter = (): Element | null => container.querySelector(".char-counter");

const repeat = (count: number): string => "a".repeat(count);

// --- AC1 --------------------------------------------------------------------

describe("the field is live from the first paint (AC1)", () => {
  it("renders enabled, writable and already accepting text", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    expect(field.disabled).toBe(false);
    expect(field.readOnly).toBe(false);
    expect(field.getAttribute("placeholder")).toBe(ADD_INPUT_PLACEHOLDER);
    // The accessible name, which the placeholder alone would only weakly
    // provide (AC8).
    expect(field.getAttribute("aria-label")).toBe(ADD_INPUT_PLACEHOLDER);

    await type(field, "send invoice");
    expect(field.value).toBe("send invoice");
  });

  it("asks each of its two questions, and asks the right one of each", async () => {
    const media = stubCapabilities({ pointer: false, reduced: false });
    await mount();
    expect(new Set(media.queries)).toEqual(new Set([POINTER_QUERY, REDUCE_QUERY]));
  });
});

// --- AC2 --------------------------------------------------------------------

describe("Enter submits, clears and keeps the caret where it is (AC2)", () => {
  it("submits the text, empties the field and holds focus", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    field.focus();
    await type(field, "send invoice");
    await press(field, "Enter");

    expect(submitted).toEqual(["send invoice"]);
    expect(field.value).toBe("");
    // The whole of "focus is never moved to the new row": clearing a
    // controlled input does not blur it, so there is nothing to restore —
    // which is why a regression here would be someone *adding* a blur or a
    // focus call, not removing one.
    expect(document.activeElement).toBe(field);
  });

  it("hands on the trimmed text, which is what the server persists", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    await type(field, "  book dentist  ");
    await press(field, "Enter");

    // Epic 3's "the trimmed form is what persists": handing the seam anything
    // else would put a string on screen optimistically that the confirmed row
    // then quietly disagrees with.
    expect(submitted).toEqual(["book dentist"]);
    expect(field.value).toBe("");
  });

  it("takes consecutive captures with no interaction in between", async () => {
    // The rhythm the whole story exists for — type, Enter, type, Enter.
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    field.focus();
    await type(field, "one");
    await press(field, "Enter");
    await type(field, "two");
    await press(field, "Enter");

    expect(submitted).toEqual(["one", "two"]);
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
  });

  it("lets the Enter that commits an IME candidate close the candidate list", async () => {
    // A Japanese, Chinese or Korean typist presses Enter to accept the
    // candidate the IME is offering, several times per sentence. The browser
    // delivers that keystroke as a `keydown` with `isComposing` set, and
    // without the guard it would capture the half-composed reading and clear
    // the field — losing text the user never asked to submit, which is the
    // same harm AC3's silent no-op is written to avoid.
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    await type(field, "にほんご");
    await press(field, "Enter", { isComposing: true });

    expect(submitted).toEqual([]);
    expect(field.value).toBe("にほんご");

    // And the Enter *after* the composition ends is an ordinary submit, so
    // the guard costs the typist nothing but the keystroke they meant to
    // spend on the candidate.
    await press(field, "Enter");
    expect(submitted).toEqual(["にほんご"]);
    expect(field.value).toBe("");
  });

  it("submits on Enter and on nothing else", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    await type(field, "send invoice");
    for (const key of ["a", "Escape", "Tab", " "]) {
      await press(field, key);
    }

    expect(submitted).toEqual([]);
    expect(field.value).toBe("send invoice");
  });
});

// --- AC3 --------------------------------------------------------------------

describe("a whitespace-only Enter is a mis-press, not an error (AC3)", () => {
  it("creates nothing and — the part that is easy to get wrong — does not clear", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    await type(field, "   ");
    await press(field, "Enter");

    expect(submitted).toEqual([]);
    expect(field.value).toBe("   ");
  });

  it("shows nothing: no error, no banner, no marker of any kind", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    // The snapshot is taken *after* the whitespace is typed, so what is
    // compared is the effect of the Enter alone.
    await type(field, "\t  ");
    const before = container.innerHTML;

    await press(field, "Enter");

    // Byte-for-byte the markup it had a moment earlier. A colour change, an
    // `aria-invalid`, a shake class or a banner would each be a difference
    // here, and none of them can be enumerated in advance — which is why this
    // compares the whole tree rather than a list of the ones thought of.
    expect(container.innerHTML).toBe(before);
    expect(field.value).toBe("\t  ");
  });

  it("does the same on a completely empty field", async () => {
    // UJ-2's edge case: Enter on an empty input. Nothing is created and
    // nothing breaks.
    stubCapabilities({ pointer: false, reduced: false });
    const submitted: string[] = [];
    const field = await mount((text) => submitted.push(text));

    await press(field, "Enter");

    expect(submitted).toEqual([]);
    expect(field.value).toBe("");
  });
});

// --- AC4 and AC5 ------------------------------------------------------------

describe("the ceiling and the counter that explains it (AC4, AC5)", () => {
  it("hands the stop to the browser at the shared contract's number", async () => {
    // jsdom does not enforce `maxLength` on a programmatic value, and neither
    // does any test: it is a user-agent constraint on typed input. What can be
    // asserted is that the constraint is declared, and that nothing in the
    // component second-guesses it.
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();
    expect(field.maxLength).toBe(TODO_TEXT_MAX_LENGTH);
  });

  it("keeps the counter absent below 450", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(COUNTER_APPEARS_AT - 1));
    expect(counter()).toBeNull();
  });

  it("brings it in at exactly 450, counting down", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(COUNTER_APPEARS_AT));
    expect(counter()?.textContent).toBe(
      String(TODO_TEXT_MAX_LENGTH - COUNTER_APPEARS_AT),
    );

    await type(field, repeat(COUNTER_APPEARS_AT + 12));
    expect(counter()?.textContent).toBe(
      String(TODO_TEXT_MAX_LENGTH - COUNTER_APPEARS_AT - 12),
    );
  });

  it("reads 0 at the ceiling, as a bare numeral", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(TODO_TEXT_MAX_LENGTH));
    expect(counter()?.textContent).toBe("0");
  });

  it("changes nothing else at the ceiling — no colour, no weight, no shake (AC4)", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(TODO_TEXT_MAX_LENGTH - 1));
    const box = container.firstElementChild as HTMLElement;
    const beforeBox = box.className;
    const beforeCounter = counter()?.className;

    await type(field, repeat(TODO_TEXT_MAX_LENGTH));

    // Every cue this product has is a class, so identical class strings on
    // both sides of the ceiling is the whole claim: the only difference
    // between 499 and 500 is the digit.
    expect(box.className).toBe(beforeBox);
    expect(counter()?.className).toBe(beforeCounter);
    expect(counter()?.textContent).toBe("0");
  });

  it("goes away again when the text drops back under the threshold", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(COUNTER_APPEARS_AT));
    expect(counter()).not.toBeNull();
    await type(field, repeat(COUNTER_APPEARS_AT - 1));
    expect(counter()).toBeNull();
  });

  it("never takes the danger ramp", async () => {
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();

    await type(field, repeat(TODO_TEXT_MAX_LENGTH));
    expect(container.innerHTML).not.toContain("danger");
  });
});

// --- AC6 --------------------------------------------------------------------

describe("the caret starts in the field on a pointer device and not on a touch one (AC6)", () => {
  it("autofocuses where there is a fine pointer", async () => {
    stubCapabilities({ pointer: true, reduced: false });
    const field = await mount();
    expect(document.activeElement).toBe(field);
  });

  it("does not on touch, so the software keyboard stays down", async () => {
    // EXPERIENCE.md:103 — UJ-1 has Dana opening her phone to *read* her list,
    // and a keyboard would bury it.
    stubCapabilities({ pointer: false, reduced: false });
    const field = await mount();
    expect(document.activeElement).not.toBe(field);
  });

  it("decides on capability alone, and not on the motion preference beside it", async () => {
    // The two questions cross here: reduced motion on, pointer present. A
    // component that read one hook's answer for the other's decision would
    // fail exactly this pairing and nothing else in the file.
    stubCapabilities({ pointer: true, reduced: true });
    const field = await mount();
    expect(document.activeElement).toBe(field);
  });

  it("takes it on a hydrated page, where the answer arrives a commit late", async () => {
    // The case a client-side mount cannot see. Hydration renders the server
    // snapshot — "not asked yet" — so the effect runs once knowing nothing
    // and again with the browser's answer. A latch closed on that first run
    // would leave every pointer device without a caret in the field, and
    // every other case in this file would still pass.
    //
    // Reduced motion is on in both renders, so the only thing that changes
    // across hydration is the capability under test.
    stubCapabilities({ pointer: true, reduced: true });
    const { field, unmount } = await hydrate();

    expect(document.activeElement).toBe(field);
    await unmount();
  });

  it("does not take it when a mouse is plugged in mid-session", async () => {
    // The theft the latch exists to prevent, end to end: a tablet hydrates
    // with no pointer, the user is reading their list, and a mouse arrives an
    // hour later. The capability is *seen* — the module subscribes, so the
    // answer is now "fine" — and the caret stays exactly where the user left
    // it, because the decision was settled at load.
    const media = stubCapabilities({ pointer: false, reduced: true });
    const { field, unmount } = await hydrate();
    expect(document.activeElement).not.toBe(field);

    const onChange = media.listeners.get(`${POINTER_QUERY}:change`);
    expect(onChange, "the pointer module registered no `change` listener").toBeDefined();

    media.setPointer(true);
    await act(async () => onChange!());

    expect(document.activeElement).not.toBe(field);
    await unmount();
  });

  it("uses no autofocus attribute, which would fire before the question is asked", async () => {
    // `autoFocus` is server-rendered markup: it would take the caret on a
    // touch device too, which is the precise harm AC6 names.
    stubCapabilities({ pointer: true, reduced: false });
    const field = await mount();
    expect(field.hasAttribute("autofocus")).toBe(false);
  });
});

// --- The motion marker ------------------------------------------------------

describe("stillness arrives as a marker, never as a branched class", () => {
  it("marks the input when the browser asks for reduced motion", async () => {
    stubCapabilities({ pointer: false, reduced: true });
    await mount();
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute("data-still")).toBe("true");
  });

  it("leaves the marker off when motion is allowed, and the classes identical", async () => {
    stubCapabilities({ pointer: false, reduced: true });
    await mount();
    const still = (container.firstElementChild as HTMLElement).className;

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    stubCapabilities({ pointer: false, reduced: false });
    await mount();
    const moving = container.firstElementChild as HTMLElement;

    expect(moving.hasAttribute("data-still")).toBe(false);
    // The preference changes the marker and nothing else: the stylesheet
    // derives the suppression from it, so a class string that differed would
    // mean the decision had been branched in the component (AR-28).
    expect(moving.className).toBe(still);
  });
});
