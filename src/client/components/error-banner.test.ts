import { rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readMarkup, readSources, type Markup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import type { ErrorKind } from "@/shared/contract/errors";
import { ERROR_COPY } from "@/client/feedback/error-copy";
import { TodoRequestError } from "@/client/todos/todo-list-query";

// Covers epics.md Story 2.6 AC2, AC3, AC5, AC6, AC7, AC8, AC9 and AC18.
//
// AC1, AC7 and AC8 were built by Story 1.7 and are proved against the slot
// itself in `error-slot.test.ts`. What is asserted here is that this banner
// consumes them rather than re-implementing them — the difference between
// "the reducer replaces without retrying" and "the banner that renders the
// reducer's output does not add a second path around it".
//
// The slot, the hook and the announcer are stubbed so the retry closure can
// be caught and invoked. `renderToStaticMarkup` runs no effect, so the two
// effects are exercised by calling the captured closure directly; that they
// actually fire in a mounted tree is `todo-list.render.test.tsx`'s.

const { slot, mockUseTodos, mockAnnounce } = vi.hoisted(() => ({
  slot: {
    error: null as { kind: string; retry: () => void } | null,
    raiseError: vi.fn(),
    clearError: vi.fn(),
    retryCurrentError: vi.fn(),
  },
  mockUseTodos: vi.fn(),
  mockAnnounce: vi.fn(),
}));

vi.mock("@/client/feedback/error-slot", () => ({ useErrorSlot: () => slot }));
vi.mock("@/client/todos/use-todos", () => ({ useTodos: mockUseTodos }));
vi.mock("@/client/feedback/announcer", () => ({ useAnnounce: () => mockAnnounce }));

const { ErrorBannerRegion } = await import("./error-banner");

const bannerFile = path.join("src", "client", "components", "error-banner.tsx");
const markup = readMarkup();

function markupOf(file: string): Markup {
  const found = markup.find((entry) => entry.file === file);
  if (found === undefined) throw new Error(`${file} is not in the markup surface`);
  return found;
}

const bannerSource = markupOf(bannerFile).source;

// Comments are stripped before any "this file does not contain X" scan, the
// way `announcer.test.ts` and `contract.test.ts` both do it. This file's
// source *discusses* `aria-live`, `role="alert"` and the polite urgency at
// length — explaining why the banner uses none of them is the point of the
// comments — and prose about a live region is not a live region.
const bannerCode = bannerSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

// `renderToStaticMarkup` escapes the apostrophe in every one of these strings
// to `&#x27;`, so a raw `toContain` would fail on copy that is in fact
// correct. Decoding is what lets the assertions read as the copy they check.
const text = (html: string) =>
  html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

const render = () => renderToStaticMarkup(createElement(ErrorBannerRegion));

const occupy = (kind: ErrorKind) => {
  slot.error = { kind, retry: vi.fn() };
};

beforeEach(() => {
  slot.error = null;
  slot.raiseError.mockReset();
  slot.retryCurrentError.mockReset();
  mockAnnounce.mockReset();
  mockUseTodos.mockReturnValue({ readFailure: null, refetch: vi.fn() });
});

describe("the region is part of the layout whether or not it holds a message (AC2)", () => {
  it("renders the region when the slot is empty", () => {
    const html = render();
    expect(html).toContain("banner-region");
    // Present, and holding nothing: no message, no control.
    expect(html).not.toContain("Retry");
    expect(text(html)).not.toContain("Couldn't");
  });

  it("reserves the banner's own height, derived rather than transcribed", async () => {
    // "Occupied or empty, its region is part of the layout, so appearing does
    // not shift the list" (EXPERIENCE.md:109) is only true if the space
    // reserved is the space the banner will take.
    //
    // The banner's row is `items-center`, so its height is its tallest child,
    // and that is `Retry` at 44px (AC9). Reserving the mockup's
    // `min-height:48px` instead would under-reserve by 22px, because the
    // mockup pairs that 48px with a 32px pill this product cannot ship — so
    // the reservation is built from the tokens that produce the height.
    const css = await compile(markup.flatMap(({ classes }) => classes));
    const region = ruleFor(css, "banner-region");

    for (const token of ["--spacing-touch-target-min", "--spacing-4"]) {
      expect(region, token).toContain(token);
    }
    expect(region).not.toContain("48px");

    // And the arithmetic, computed from the theme's own values rather than
    // retyped: 44 + 2x12 + 2 = 70.
    const value = (name: string) =>
      Number(/(\d+)px/.exec(new RegExp(`${name}:\\s*([^;]+)`).exec(css)?.[1] ?? "")?.[1]);
    const touchTarget = value("--spacing-touch-target-min");
    const padding = value("--spacing-4");
    expect(touchTarget).toBe(44);
    expect(padding).toBe(12);
    expect(touchTarget + 2 * padding + 2).toBe(70);
  });

  it("reserves at least what the banner's tallest child needs", async () => {
    // The mutation this catches: dropping `min-h-touch-target-min` from
    // `Retry` would make the banner shorter than its reservation, and
    // swapping the reservation back to a literal would make it shorter than
    // the banner. Both are silent without a layout engine, so the two are
    // pinned against each other rather than against a number.
    occupy("load");
    expect(render()).toContain("min-h-touch-target-min");

    const css = await compile(markup.flatMap(({ classes }) => classes));
    expect(ruleFor(css, "banner-region")).toContain("--spacing-touch-target-min");
    expect(ruleFor(css, "min-h-touch-target-min")).toContain(
      "--spacing-touch-target-min",
    );
  });

  it("renders the same region element in both states", () => {
    const empty = render();
    occupy("load");
    const occupied = render();
    for (const html of [empty, occupied]) {
      expect(html.startsWith('<div class="banner-region"')).toBe(true);
    }
  });
});

describe("the banner says what the kind means, and never what the server said (AC3)", () => {
  it("renders the string for whichever kind the slot holds", () => {
    for (const kind of ["load", "create", "update", "delete"] as const) {
      occupy(kind);
      expect(text(render()), kind).toContain(ERROR_COPY[kind]);
    }
  });

  it("carries the load string and a Retry control on a failed read", () => {
    occupy("load");
    const html = text(render());
    expect(html).toContain("Couldn't load your Todos.");
    expect(html).toContain("Retry");
    expect(html).toContain("<button");
  });

  it("reads no message off the error it is reporting", () => {
    // AD-10. `TodoRequestError`'s message is "The Todo load request failed." —
    // a diagnostic, never reviewed as copy.
    expect(bannerCode).not.toMatch(/\.message\b/);
    expect(render()).not.toContain("request failed");
  });
});

describe("a failed read reaches the slot, with the right closure (AC5, AC6)", () => {
  // `renderToStaticMarkup` runs no effects, so the raise is asserted as the
  // shape of the effect that performs it and then exercised for real, in a
  // mounted tree, by `todo-list.render.test.tsx` — which presses `Retry` and
  // watches the request go out.

  it("names the operation that failed, not the response that came back", () => {
    // Every way the read can fail is kind `load` (todo-list-query.ts:150) —
    // a 401, a 500, a body that is not an array, a transport failure with no
    // response at all. The banner does not re-derive it.
    const error = new TodoRequestError("load", { status: 500 });
    expect(error.kind).toBe("load");
    // The kind is carried straight through rather than re-derived: the banner
    // renders `ERROR_COPY[slot.kind]`, so a wrong kind is a wrong string, and
    // that is asserted by rendering rather than by matching the source.
    for (const kind of ["load", "create", "update", "delete"] as const) {
      occupy(kind);
      expect(text(render()), kind).toContain(ERROR_COPY[kind]);
    }
  });

  it("reloads the document when the identity expired, rather than refetching", () => {
    // AC6. `middleware.ts` mints a Client Identity on a document request and
    // never under `app/api/`, so re-requesting after a 401 yields 401 forever
    // and `Retry` is a dead button. Only a fresh document request mints.
    // Both halves — that the reload happens and that no refetch follows it —
    // are driven for real against a 401 in `todo-list.render.test.tsx`, which
    // presses `Retry` and counts the requests. What is worth pinning here is
    // that the decision is delegated rather than re-derived from a status
    // code this file reads itself.
    expect(bannerCode).toMatch(/identityExpired\(/);
    expect(bannerCode).not.toMatch(/status\s*===\s*401/);
  });

  it("imports identityExpired from the module that owns the reason", () => {
    // It is exported beside the request rather than decided in the banner,
    // because Epics 3 through 5 reach the same 401 from their own mutations
    // (todo-list-query.ts:212).
    expect(bannerSource).toMatch(
      /import \{ identityExpired \} from "@\/client\/todos\/todo-list-query";/,
    );
  });

  it("re-requests the list unchanged on every other failure", () => {
    // "The Todo List request, unchanged" (EXPERIENCE.md:119) — `refetch()`
    // with no argument, not a new request with different options.
    expect(bannerSource).toMatch(/void refetch\(\);/);
    expect(bannerCode).not.toMatch(/refetch\(\{/);
  });

  it("raises nothing while the read is healthy", () => {
    mockUseTodos.mockReturnValue({ readFailure: null, refetch: vi.fn() });
    render();
    expect(slot.raiseError).not.toHaveBeenCalled();
    // The healthy branch clears rather than returning early, which is the
    // banner's other half: a background refetch that succeeds has to take
    // down the banner reporting that the read failed (EXPERIENCE.md:109).
    // Exercised end to end in `todo-list.render.test.tsx`.
    expect(bannerCode).toMatch(/if \(readFailure !== null\)/);
    expect(bannerCode).toMatch(/reported\.current = null;\s*\n\s*clearError\(\);/);
  });

  it("clears only what it raised itself", () => {
    // The guard is on having raised something, not on what the slot holds:
    // reading the slot in that effect is what would make it re-run itself
    // after every raise. A slot read there would be a loop.
    expect(bannerCode).toMatch(/if \(reported\.current !== null\)/);
    expect(bannerCode).not.toMatch(/\}, \[readFailure[^\]]*\bslot\b/);
  });
});

describe("Retry goes through the slot, not around it (AC7, AC8)", () => {
  it("wires the control to the slot's own retry", () => {
    // That pressing it re-requests the list is `todo-list.render.test.tsx`'s,
    // which counts the fetches. Here: the control exists and this file has no
    // handler of its own to have wired it to.
    occupy("load");
    expect(render()).toContain("Retry");
    expect(bannerCode).toMatch(/onClick=\{retryCurrentError\}/);
  });

  it("invokes no closure itself, and hand-rolls no retry of its own", () => {
    // `retryCurrentError` clears *before* invoking, so a retry that fails
    // again keeps its new entry (error-slot.tsx:79-96). A banner that called
    // `slot.error.retry()` and then `clearError()` would wipe it, which is
    // why the control is wired to the slot's own function and this file never
    // invokes an entry's closure.
    //
    // `clearError` *is* used here, for the unrelated background-refetch case
    // above — so what is banned is calling it next to a closure invocation,
    // not calling it at all.
    expect(bannerCode).not.toMatch(/\.retry\(\)/);
    expect(bannerCode).not.toMatch(/slot\??\.(error|retry)/);
  });

  it("holds one message at a time", () => {
    // AC7 is the reducer's, by construction — `raise` never reads the entry
    // it displaces. What is this file's is rendering one banner, not a list.
    occupy("update");
    const html = text(render());
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.match(/Couldn't/g)).toHaveLength(1);
  });
});

describe("Retry is reachable and large enough (AC9)", () => {
  it("declares at least 44px in both dimensions", async () => {
    // DESIGN.md:354 names Retry in the 44px floor. The height is a class; the
    // width cannot be, because `todo-card.test.ts:190` bans `min-w-*`
    // tree-wide as something that can outgrow the card.
    const css = await compile(markup.flatMap(({ classes }) => classes));
    const pill = ruleFor(css, "retry-pill");
    expect(pill).toContain("min-width: var(--spacing-touch-target-min)");
    expect(pill).toContain("border-width: 1.5px");

    occupy("load");
    expect(render()).toContain("min-h-touch-target-min");
    expect(ruleFor(css, "min-h-touch-target-min")).toContain(
      "var(--spacing-touch-target-min)",
    );
    expect(css).toContain("--spacing-touch-target-min: 44px");
  });

  it("is a real button, so Enter and Space both activate it", () => {
    occupy("load");
    const html = render();
    expect(html).toContain('<button type="button"');
    // Not a div with a handler, and not something that needs a tabindex to be
    // reachable — EXPERIENCE.md:194 puts it in the tab order between the
    // input and the filter tabs.
    expect(html).not.toContain("tabindex");
  });

  it("is the region's only control", () => {
    // DESIGN.md:426 — "a pill Retry button ... the only control in the
    // region". The icon is decoration and says so.
    occupy("load");
    const html = render();
    expect(html.match(/<button|<a |<input/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("the banner is DESIGN.md's, and it compiles", () => {
  it("uses the danger ramp, all of it tokens", async () => {
    occupy("load");
    const html = render();
    for (const token of [
      "bg-danger-bg",
      "border-danger-border",
      "text-danger-text",
      "border-danger-text",
      "rounded-md",
      "p-4",
      "text-banner-message",
      "text-button-label",
      "rounded-full",
    ]) {
      expect(html, token).toContain(token);
    }

    const css = await compile(markup.flatMap(({ classes }) => classes));
    // `padding: {spacing.4} {spacing.4}` (DESIGN.md:177).
    expect(ruleFor(css, "p-4")).toContain("var(--spacing-4)");
    expect(css).toContain("--color-danger-bg: #F6E7E1");
    expect(css).toContain("--color-danger-text: #8E3B22");
  });

  it("gives Retry a transparent fill", () => {
    // DESIGN.md:426 — "transparent fill, 1.5px border". DESIGN.md:460 bans
    // `danger-fill` here; a filled pill would read as the primary action of a
    // failure the user did not cause.
    occupy("load");
    const html = render();
    expect(html).not.toContain("bg-danger-fill");
    expect(html).not.toContain("bg-danger-text");
  });

  it("opens with no animation", () => {
    // EXPERIENCE.md bans "any animation on open", and `motion.test.ts`
    // scans the markup surface for the classes. Asserted here too, where the
    // temptation is.
    expect(bannerCode).not.toMatch(/\b(transition|duration-|delay-|animate-)/);
  });
});

describe("what a screen reader hears (AC18, AC19, AC20)", () => {
  it("announces assertively, through the one function", () => {
    // EXPERIENCE.md:212 — assertive "because it reports a failure the user
    // did not cause and would otherwise not know about".
    expect(bannerSource).toMatch(/announce\(ERROR_COPY\[slot\.kind\], "assertive"\)/);
    expect(bannerSource).toMatch(
      /import \{ useAnnounce \} from "@\/client\/feedback\/announcer";/,
    );
    expect(bannerCode).not.toContain('"polite"');
  });

  it("declares no live region and no implicit one", () => {
    // `eslint.config.mjs:152-174` bans all four forms and names this banner
    // as the reason the rule exists: the mockup is `role="alert"
    // aria-live="polite"`, which both duplicates the app's regions and
    // downgrades the urgency.
    expect(bannerCode).not.toMatch(/aria-live\s*[=:]/);
    expect(bannerCode).not.toMatch(/role="(alert|status|log)"/);
  });

  it("announces from an effect, keyed on the slot rather than on this story's read", () => {
    // One announcement site for four kinds: Epics 3 through 5 raise an entry
    // and are heard without writing an announcement of their own.
    expect(bannerSource).toMatch(/\}, \[slot, announce\]\);/);
  });

  it("adds no live region of its own to the surface AC20 counts", () => {
    // The tree-wide "exactly one polite and one assertive region" scan is
    // `announcer.test.ts`'s and already walks this file — writing a second
    // walker here would be a second definition of what a violation is, which
    // is the failure AD-12 exists to prevent. What is asserted from this side
    // is that the two components this story adds are in that surface at all,
    // so their passing it means something.
    const scanned = readSources().map(({ file }) => file);
    expect(scanned).toContain("src/client/components/error-banner.tsx");
    expect(scanned).toContain("src/client/components/empty-state.tsx");
  });
});
