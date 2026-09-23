// @vitest-environment jsdom

// The pointer capability module (epics.md Story 3.2 AC6; EXPERIENCE.md:103,
// 245).
//
// `motion.test.ts` is the pattern this follows, because the two modules are
// the same shape: a media query read through `useSyncExternalStore`, a server
// snapshot that answers before the browser can be asked, and a subscription
// that is invisible to every other test in the repository. The differences
// are that this module's question is a capability rather than a preference,
// and that its snapshot is three-valued.
//
// The three-valued snapshot is the part worth testing hardest. `"unknown"` is
// not a spelling nicety: `add-input.tsx` latches autofocus on the first
// settled answer, and it can only tell the server's placeholder from a real
// "this is a touch device" because the two are different values. Collapse
// them and a hydrated pointer device loses its caret, or a tablet gains one
// an hour later when a mouse is plugged in.
//
// jsdom implements no `matchMedia` at all, so the stub below is the module's
// whole world here. It records what it was asked and captures the listeners
// it was given, for the same reason `todo-list.render.test.tsx`'s does: a
// stub that answers and forgets makes a wrong event name, a wrong query and a
// listener that is never removed all invisible.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePointerCapability } from "./pointer";

/** The one query this module may ask (EXPERIENCE.md:245 — capability, not width). */
const POINTER_QUERY = "(pointer: fine)";

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
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

type Registration = { event: string; handler: () => void };

type MediaStub = {
  queries: string[];
  added: Registration[];
  removed: Registration[];
  setMatches: (value: boolean) => void;
};

function stubMatchMedia(fine: boolean): MediaStub {
  const stub: MediaStub = {
    queries: [],
    added: [],
    removed: [],
    setMatches: () => {},
  };
  let matches = fine;
  stub.setMatches = (value: boolean) => {
    matches = value;
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      stub.queries.push(query);
      return {
        media: query,
        get matches() {
          return matches;
        },
        addEventListener: (event: string, handler: () => void) =>
          stub.added.push({ event, handler }),
        removeEventListener: (event: string, handler: () => void) =>
          stub.removed.push({ event, handler }),
      };
    }),
  );
  return stub;
}

/** The hook's answer, as an attribute, so a render can be read as a string. */
function Probe() {
  return createElement("i", { "data-pointer": usePointerCapability() });
}

const rendered = (): string | null =>
  container.querySelector("i")?.getAttribute("data-pointer") ?? null;

async function mount(): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe));
  });
}

describe("the server answers `unknown`, which is not `coarse`", () => {
  it("reports `unknown` when there is no browser to ask", () => {
    // `react-dom/server` drives `useSyncExternalStore` through
    // `getServerSnapshot` by definition, which is exactly the path under
    // test — and it needs no DOM, so no stub is in place here. A module that
    // reached for `window` on the server would throw rather than fail.
    expect(renderToStaticMarkup(createElement(Probe))).toBe(
      '<i data-pointer="unknown"></i>',
    );
  });

  it("would fail if the server guessed either real answer instead", () => {
    // Mutation-tested rather than asserted twice. `"fine"` on the server
    // raises the software keyboard over the list on every phone
    // (EXPERIENCE.md:103); `"coarse"` is the subtler break — it is the right
    // *behaviour* under the wrong *name*, and the consumer that latches
    // autofocus on the first settled answer would latch on the server's.
    const markup = renderToStaticMarkup(createElement(Probe));
    expect(markup).not.toBe('<i data-pointer="fine"></i>');
    expect(markup).not.toBe('<i data-pointer="coarse"></i>');
  });
});

describe("the client answers the browser's own capability", () => {
  it("reports `fine` where there is a mouse, a trackpad or a stylus", async () => {
    const media = stubMatchMedia(true);
    await mount();

    expect(rendered()).toBe("fine");
    // And it asked the right thing. Without this, a module that inverted the
    // feature — or asked `(pointer: coarse)` — would pass every assertion in
    // this file.
    expect(media.queries).not.toEqual([]);
    expect(new Set(media.queries)).toEqual(new Set([POINTER_QUERY]));
  });

  it("reports `coarse` where there is only a finger", async () => {
    stubMatchMedia(false);
    await mount();

    expect(rendered()).toBe("coarse");
  });
});

describe("the subscription is real, and is let go of on unmount", () => {
  it("follows a capability that arrives mid-session", async () => {
    // The half of `useSyncExternalStore` that no snapshot assertion reaches:
    // replacing `subscribe()`'s body with a no-op leaves both cases above
    // green. A mouse plugged into a tablet is a `change` on the query, and
    // the module's job is to see it — what autofocus *does* about it is
    // `add-input.tsx`'s decision, asserted in its own render test.
    const media = stubMatchMedia(false);
    await mount();
    expect(rendered()).toBe("coarse");

    const subscription = media.added.find(({ event }) => event === "change");
    expect(subscription, "the module registered no `change` listener").toBeDefined();
    // The event name is the whole of the subscription's contract with the
    // platform: `MediaQueryList` fires `change`, and a listener bound to
    // anything else is a subscription that never fires.
    expect(media.added.map(({ event }) => event)).toEqual(["change"]);

    media.setMatches(true);
    await act(async () => subscription!.handler());
    expect(rendered()).toBe("fine");

    // And back again, so the binding is two-way rather than a latch. The
    // latch belongs to the consumer, not to this module.
    media.setMatches(false);
    await act(async () => subscription!.handler());
    expect(rendered()).toBe("coarse");
  });

  it("removes the same listener it added when the consumer goes away", async () => {
    const media = stubMatchMedia(true);
    await mount();
    expect(media.removed).toEqual([]);

    // Unmounted here rather than in `afterEach`, so the teardown is observed.
    await act(async () => root.unmount());

    expect(media.removed.map(({ event }) => event)).toEqual(["change"]);
    // The same function object, not merely a `change` listener: removing a
    // different one leaves the original attached to a `MediaQueryList` that
    // outlives the component, which is a leak no other assertion can see.
    expect(media.removed[0]?.handler).toBe(media.added[0]?.handler);
  });
});
