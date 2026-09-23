import { rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readMarkup, type Markup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import {
  EmptyState,
  emptyAnnouncement,
  type EmptyStateVariant,
} from "./empty-state";

// Covers epics.md Story 2.6 AC10-AC14 and AC17.
//
// Two of the three variants are unreachable in this epic — nothing selects a
// Filter View until Epic 4 — so they are exercised directly here rather than
// through the list region. That is the point of building them now: the
// component is finished before its consumers exist, so Epic 4 places it
// rather than growing it.
//
// `renderToStaticMarkup` needs no DOM and runs no effect, which suits the
// split: what the markup *is* is asserted by rendering, and what the
// announcement *says* is asserted through `emptyAnnouncement`, the pure
// function the effect calls. That the effect fires at all, in a real DOM, is
// `todo-list.render.test.tsx`'s.

const emptyFile = path.join("src", "client", "components", "empty-state.tsx");
const markup = readMarkup();

function markupOf(file: string): Markup {
  const found = markup.find((entry) => entry.file === file);
  if (found === undefined) throw new Error(`${file} is not in the markup surface`);
  return found;
}

const emptySource = markupOf(emptyFile).source;

// Comments stripped before any absence scan, as `announcer.test.ts` does it:
// this file's source explains why the announcement is polite rather than
// assertive, and prose about an urgency is not an urgency.
const emptyCode = emptySource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

// `renderToStaticMarkup` escapes nothing in these three strings today, but
// the All variant's second line ends in a full stop and the first could gain
// an apostrophe; decoding keeps the assertions reading as the copy.
const text = (html: string) =>
  html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

const render = (variant: EmptyStateVariant) =>
  renderToStaticMarkup(createElement(EmptyState, { variant }));

vi.mock("@/client/feedback/announcer", () => ({
  useAnnounce: () => vi.fn(),
}));

const VARIANTS: EmptyStateVariant[] = ["all", "active", "completed"];

describe("all three variants exist, with EXPERIENCE.md's exact strings (AC10)", () => {
  it("gives the All view two lines", () => {
    const html = render("all");
    expect(html).toContain("Nothing here yet.");
    expect(html).toContain("Type above to add your first Todo.");
    // The order matters: the message leads, the pointer follows.
    expect(html.indexOf("Nothing here yet.")).toBeLessThan(
      html.indexOf("Type above to add your first Todo."),
    );
  });

  it("gives the other two their first line and nothing else (AC12)", () => {
    expect(render("active")).toContain("Nothing active.");
    expect(render("completed")).toContain("Nothing completed yet.");

    for (const variant of ["active", "completed"] as const) {
      const html = render(variant);
      expect(html, variant).not.toContain("Type above");
      // The second line has its own type role; its absence is what AC12 is.
      expect(html, variant).not.toContain("text-empty-sub");
    }
  });

  it("carries no button and no control (AC13)", () => {
    for (const variant of VARIANTS) {
      const html = render(variant);
      for (const control of ["<button", "<a ", "<input", "tabindex", "onclick"]) {
        expect(html.toLowerCase(), `${variant} / ${control}`).not.toContain(control);
      }
    }
    // And no handler in the source either — a control added as a `<div>` with
    // an `onClick` would pass every assertion above.
    expect(emptyCode).not.toMatch(/\bon[A-Z]\w+=/);
  });

  it("shows a plus on All and a check on the other two (AC11, AC12)", () => {
    const PLUS = "M12 5v14M5 12h14";
    const CHECK = "M5 12.5l4.5 4.5L19 7";

    expect(render("all")).toContain(PLUS);
    expect(render("all")).not.toContain(CHECK);
    for (const variant of ["active", "completed"] as const) {
      expect(render(variant), variant).toContain(CHECK);
      expect(render(variant), variant).not.toContain(PLUS);
    }
  });

  it("hides the ring from the accessibility tree", () => {
    // It is decoration: the announcement carries the whole meaning, and a
    // 40px circle with no label would otherwise be an unnamed graphic.
    for (const variant of VARIANTS) {
      expect(render(variant), variant).toContain('aria-hidden="true"');
    }
  });
});

describe("the panel is DESIGN.md's, and it compiles (AC11)", () => {
  it("draws a dashed hairline panel at the tokens DESIGN.md names", async () => {
    const css = await compile(markup.flatMap(({ classes }) => classes));

    // `1.5px dashed` has no token and lives in the recipe; the colour, radius
    // and padding all do and stay on the element.
    const panel = ruleFor(css, "empty-panel");
    expect(panel).toContain("border-width: 1.5px");
    expect(panel).toContain("border-style: dashed");

    const html = render("all");
    for (const token of ["border-hairline", "rounded-md", "px-6", "py-8", "text-center"]) {
      expect(html, token).toContain(token);
    }

    // `{spacing.8} {spacing.6}` — 32px block, 18px inline (DESIGN.md:220).
    expect(ruleFor(css, "py-8")).toContain("var(--spacing-8)");
    expect(ruleFor(css, "px-6")).toContain("var(--spacing-6)");
    expect(css).toContain("--spacing-8: 32px");
    expect(css).toContain("--spacing-6: 18px");
  });

  it("draws the 40px mint ring, the one perfect circle in the product", async () => {
    const css = await compile(markup.flatMap(({ classes }) => classes));

    const ring = ruleFor(css, "empty-ring");
    expect(ring).toContain("width: 40px");
    expect(ring).toContain("height: 40px");

    const html = render("all");
    // `ring-background: {colors.row-complete}` and `ring-glyph:
    // {colors.text-completed}` (DESIGN.md:224-225) — both tokens, both on the
    // element. DESIGN.md:286 flags this as the only non-row use of the mint.
    expect(html).toContain("bg-row-complete");
    expect(html).toContain("text-text-completed");
    expect(html).toContain("rounded-full");
    expect(ruleFor(css, "rounded-full")).toContain("var(--radius-full)");
  });

  it("separates the ring and the second line by the gaps DESIGN.md gives", async () => {
    const css = await compile(markup.flatMap(({ classes }) => classes));
    // `ring-gap: {spacing.4}` = 12px, `sub-gap: {spacing.1}` = 4px.
    expect(render("all")).toContain("mb-4");
    expect(render("all")).toContain("mt-1");
    expect(ruleFor(css, "mb-4")).toContain("var(--spacing-4)");
    expect(ruleFor(css, "mt-1")).toContain("var(--spacing-1)");
    expect(css).toContain("--spacing-4: 12px");
    expect(css).toContain("--spacing-1: 4px");
  });

  it("gives each line its own type role and colour", () => {
    const html = render("all");
    expect(html).toContain("text-empty-message");
    expect(html).toContain("text-text-primary");
    expect(html).toContain("text-empty-sub");
    expect(html).toContain("text-text-muted");
  });
});

describe("what a screen reader hears (AC17)", () => {
  it("reads both of the All variant's lines as one utterance", () => {
    // EXPERIENCE.md:213. Two announcements would put the second into the same
    // region before the first had been read, so the second would win and the
    // first would be lost.
    expect(emptyAnnouncement("all")).toBe(
      "Nothing here yet. Type above to add your first Todo.",
    );
  });

  it("reads the single line on the other two", () => {
    expect(emptyAnnouncement("active")).toBe("Nothing active.");
    expect(emptyAnnouncement("completed")).toBe("Nothing completed yet.");
  });

  it("announces exactly the text it renders", () => {
    // The announcement is not a second, parallel copy that can drift: what is
    // spoken is what is on screen.
    for (const variant of VARIANTS) {
      const html = text(render(variant));
      for (const word of emptyAnnouncement(variant).split(" ")) {
        expect(html, `${variant} / ${word}`).toContain(word);
      }
    }
  });

  it("announces politely, and declares no live region of its own (AC19, AC20)", () => {
    // AD-12: errors are assertive because they report a failure the user did
    // not cause; an empty list is a resolution the user asked for.
    expect(emptyCode).toContain('"polite"');
    expect(emptyCode).not.toContain("assertive");
    expect(emptyCode).not.toMatch(/aria-live\s*[=:]/);
    expect(emptyCode).not.toMatch(/role="(alert|status|log)"/);
    // And it goes through the one function rather than touching a region.
    expect(emptySource).toMatch(
      /import \{ useAnnounce \} from "@\/client\/feedback\/announcer";/,
    );
  });

  it("announces from an effect, never during render", () => {
    // `announce` is `setState` behind a stable identity (announcer.tsx:68).
    // Calling it in a render body is a cross-component update React rejects,
    // and it would fire on every re-render rather than on the resolution.
    expect(emptySource).toMatch(/useEffect\(\(\) => \{\s*announce\(/);
  });
});
