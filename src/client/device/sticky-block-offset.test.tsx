// @vitest-environment jsdom

// The sticky block's live measurement (epics.md Story 6.2 AC1; UX-DR21,
// EXPERIENCE.md:198).
//
// `pointer.test.tsx` is the harness this follows — the same `act`-driven root,
// the same "stub the platform API the module depends on and record what it was
// asked" shape. The difference is what is being proved. `pointer.ts` publishes
// a value through React; this module publishes one through the DOM, so every
// assertion below reads `document.documentElement.style` rather than rendered
// output.
//
// jsdom implements neither `ResizeObserver` nor `getBoundingClientRect` with
// real layout: the former is absent entirely and the latter returns zeroes for
// every element. Both are stubbed, and both stubs are the point rather than
// scaffolding. The observer stub is what lets a height *change* be delivered
// on demand, which is the only way to prove the module keeps the number
// current instead of measuring once and walking away — the failure AC4 is
// about, because the error banner joins the block after the page has loaded.
//
// The last test is a negative fixture in the sense the spec asks for: it holds
// the module's own subscription still and shows that a height change which is
// *not* propagated leaves a stale number behind. Without it, every assertion
// above would still pass against a module that wrote the property once in a
// layout effect and never subscribed to anything.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STICKY_BLOCK_HEIGHT_PROPERTY,
  STICKY_TOP_BLOCK_ID,
} from "./sticky-block-contract";
import { useStickyBlockOffset } from "./sticky-block-offset";

let container: HTMLDivElement;
let root: Root;

/** Every `ResizeObserver` the module constructed, with its callback. */
type ObserverStub = {
  observed: Element[];
  disconnected: number;
  fire: () => void;
};

let observers: ObserverStub[];

function stubResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      // Each instance carries its own record. Reaching for
      // `observers[observers.length - 1]` instead works only while the module
      // constructs exactly one observer — a re-mount, or a future observer per
      // occupant, would file both instances' calls against the newest stub and
      // the assertions below would be measuring the wrong object.
      private readonly record: ObserverStub;
      constructor(callback: () => void) {
        this.record = {
          observed: [],
          disconnected: 0,
          fire: () => callback(),
        };
        observers.push(this.record);
      }
      observe(element: Element) {
        this.record.observed.push(element);
      }
      disconnect() {
        this.record.disconnected += 1;
      }
    },
  );
}

/**
 * Put a block in the document whose measured height is `height`.
 *
 * `getBoundingClientRect` is assigned per element rather than globally: jsdom
 * gives every element the same zeroed rect, and the module measures one
 * specific element, so stubbing the prototype would make a test pass that had
 * measured the wrong box.
 */
function placeBlock(height: number): HTMLDivElement {
  const block = document.createElement("div");
  block.id = STICKY_TOP_BLOCK_ID;
  setHeight(block, height);
  document.body.append(block);
  return block;
}

function setHeight(element: HTMLElement, height: number): void {
  element.getBoundingClientRect = () =>
    ({ height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0 }) as DOMRect;
}

function publishedHeight(): string {
  return document.documentElement.style.getPropertyValue(
    STICKY_BLOCK_HEIGHT_PROPERTY,
  );
}

function Probe() {
  useStickyBlockOffset();
  return null;
}

async function mount(): Promise<void> {
  await act(async () => root.render(createElement(Probe)));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  observers = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  stubResizeObserver();

});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.getElementById(STICKY_TOP_BLOCK_ID)?.remove();
  document.documentElement.style.removeProperty(STICKY_BLOCK_HEIGHT_PROPERTY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    false;
});

describe("the block's height is measured and published (AC1)", () => {
  it("writes the rendered height onto the document element", async () => {
    placeBlock(142);
    await mount();
    expect(publishedHeight()).toBe("142px");
  });

  it("rounds a fractional height up, never down", async () => {
    // Under is the direction that leaves a focused control partly covered,
    // which is the one outcome UX-DR21 exists to prevent. 141.2px must not
    // become 141px.
    placeBlock(141.2);
    await mount();
    expect(publishedHeight()).toBe("142px");
  });

  it("observes the block itself, not the document", async () => {
    const block = placeBlock(100);
    await mount();
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([block]);
  });

});

describe("the number stays current (AC4)", () => {
  it("re-measures when the block grows under the banner", async () => {
    const block = placeBlock(100);
    await mount();
    expect(publishedHeight()).toBe("100px");

    // The error banner has just opened inside the block.
    setHeight(block, 156);
    await act(async () => observers[0].fire());

    expect(publishedHeight()).toBe("156px");
  });

});

describe("absence and teardown are real states, not guards (AC2 fallback)", () => {
  it("publishes nothing when the block is not in the document", async () => {
    await mount();
    expect(publishedHeight()).toBe("");
  });

  it("removes a stale height when the block goes away", async () => {
    const block = placeBlock(100);
    await mount();
    expect(publishedHeight()).toBe("100px");

    block.remove();
    await act(async () => observers[0].fire());

    expect(publishedHeight()).toBe("");
  });

  it("removes the property and its subscription on unmount", async () => {
    placeBlock(100);
    await mount();

    await act(async () => root.unmount());

    expect(publishedHeight()).toBe("");
    expect(observers[0].disconnected).toBe(1);

    // The shared afterEach unmounts again; re-rooting keeps that a no-op.
    root = createRoot(container);
  });

  it("measures once and does not throw where ResizeObserver is absent", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ResizeObserver", undefined);
    placeBlock(133);

    await mount();

    expect(publishedHeight()).toBe("133px");
    expect(observers).toHaveLength(0);
  });
});

describe("the height has exactly one source", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "client",
      "device",
      "sticky-block-offset.ts",
    ),
    "utf8",
  );

  // Comments are stripped for both assertions below. This module explains its
  // own reasoning at length and names the things it deliberately does *not*
  // do — `offsetHeight` among them — so a scan of the raw text would be
  // answering the prose rather than the code.
  const body = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("hard-codes no height of its own (AC1)", () => {
    // `sticky-top-block.test.ts:141` bans a height class on the block so that
    // a constant cannot become a second source of truth. This is the same ban
    // pointed at the module that replaced it: the only numeral this file may
    // contain is one that came out of a measurement.
    const numerals = [...body.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(([n]) => n);
    expect(numerals).toEqual([]);
  });

  it("reads the box rather than a rounded integer", () => {
    // `offsetHeight` is rounded by the platform and rounds down as often as
    // up; down is the direction that covers a focused control.
    expect(body).toContain("getBoundingClientRect()");
    expect(body).not.toContain("offsetHeight");
  });
});

describe("a change that is not propagated is a failure (negative fixture)", () => {
  it("goes stale when the module's own subscription is held still", async () => {
    const block = placeBlock(100);
    await mount();
    expect(publishedHeight()).toBe("100px");

    // The block grows and nothing tells the module. This is the shape of the
    // bug the tests above exist to catch — a module that measured once in a
    // layout effect and subscribed to nothing would pass every assertion in
    // this file except the two that fire a subscription, and would leave the
    // property exactly like this.
    setHeight(block, 156);

    expect(publishedHeight()).toBe("100px");

    // And the subscription is what closes it.
    await act(async () => observers[0].fire());
    expect(publishedHeight()).toBe("156px");
  });
});
