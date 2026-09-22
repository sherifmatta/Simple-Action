import { rmSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { parseTsx, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";

// Covers epics.md Story 1.7 AC5 and Story 2.3 AC1, AC6 and AC7: the card
// renders on the ground at the correct max width, centred, the sticky block
// holds at the top of the viewport on an opaque surface, and nothing else is on
// the screen.
//
// Story 2.3 moved the card recipe out of `app/page.tsx` into
// `src/client/components/`, which is why the two guards below — the AD-13 hex
// and arbitrary-value scan, and the compilation that proves every class
// resolves to a theme token — now run over the whole markup surface rather
// than over a list of files. Scoped to `app/`, they let the card walk out from
// under both by changing directory; scoped to a hand-written list, the next
// component to be added would walk out the same way without anyone noticing.
//
// "The correct max width" is `{spacing.card-max-width}` — a DESIGN.md token
// Story 1.2 already transcribed — so this compiles the real `app/globals.css`
// through the real Tailwind engine (the `app/globals.test.ts` approach) and
// asserts the classes the product actually uses resolve to those tokens. A test
// that only read the class strings would pass on `max-w-card-max-width` even
// if Tailwind emitted nothing for it, which is exactly the failure mode: an
// unrecognised utility is silently dropped, not an error.

const markup = readMarkup();

function markupOf(file: string) {
  const found = markup.find((entry) => entry.file === file);
  if (found === undefined)
    throw new Error(`${file} is not in the markup surface`);
  return found;
}

const pageFile = path.join("app", "page.tsx");
const layoutFile = path.join("app", "layout.tsx");
const cardFile = path.join("src", "client", "components", "todo-card.tsx");
const stickyFile = path.join(
  "src",
  "client",
  "components",
  "sticky-top-block.tsx",
);

const pageSource = markupOf(pageFile).source;
const pageClasses = markupOf(pageFile).classes;
const layoutClasses = markupOf(layoutFile).classes;
const cardClasses = markupOf(cardFile).classes;
const stickyClasses = markupOf(stickyFile).classes;
/** Every class in the product — what the compilation below must account for. */
const productClasses = markup.flatMap(({ classes }) => classes);

// --- The markup -------------------------------------------------------------

describe("the card is the only thing on the page (1.7 AC5, 2.3 AC1/AC7)", () => {
  const sourceFile = parseTsx("page.tsx", pageSource);

  it("renders no text at all", () => {
    const text: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && node.getText(sourceFile).trim() !== "") {
        text.push(node.getText(sourceFile).trim());
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(
      text,
      `the page renders the card and nothing else; found ${JSON.stringify(text)}`,
    ).toEqual([]);
  });

  it("renders the card and nothing beside it", () => {
    const elements: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        elements.push(node.tagName.getText(sourceFile));
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    // Story 2.3: the card's own markup moved into `TodoCard`, so the page is
    // its margin and one child. Nothing may be added beside it — a wordmark or
    // a title bar here would show up as a third entry (AC7).
    expect(elements).toEqual(["main", "TodoCard"]);
  });

  it("uses no hex literal and no arbitrary-value class, anywhere (AD-13)", () => {
    for (const { file, source } of markup) {
      expect(source, file).not.toMatch(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/);
      expect(source, file).not.toMatch(/\b[a-z-]+-\[[^\]]+\]/);
    }
  });

  it("puts the ground on <body>, so it is behind the card at every viewport height", () => {
    expect(layoutClasses).toContain("bg-ground");
    expect(layoutClasses).toContain("min-h-dvh");
    // DESIGN.md:356 — no horizontal scrolling on the page body, ever.
    expect(layoutClasses).toContain("overflow-x-hidden");
    // `deferred-work.md` records that Story 1.2 left <body> painted with
    // Tailwind preflight's white and named this story as the owner of both
    // the ground and the default ink.
    expect(layoutClasses).toContain("text-text-primary");
  });

  it("is DESIGN.md's card recipe entire, and only that (2.3 AC1)", () => {
    // An exact set rather than a handful of `toContain`s: dropping
    // `shadow-card` or `rounded-lg` would leave every positive assertion
    // passing and the card wrong, which is the regression worth catching.
    expect([...cardClasses].sort()).toEqual(
      [
        "mx-auto",
        "max-w-card-max-width",
        "rounded-lg",
        "bg-card",
        "px-gutter",
        "py-6",
        "shadow-card",
      ].sort(),
    );
    // Below the cap the card fills the viewport less the phone margin, which
    // is the page's to apply — the card itself has no width of its own.
    expect(pageClasses).toContain("p-margin-phone");
  });
});

// --- What those classes actually compile to ---------------------------------

// Story 2.4 moved this harness to `src/test-support/tailwind.ts`; it had two
// consumers there and a third arriving, which is the duplication
// `deferred-work.md` has been tracking. Behaviour here is unchanged.
const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("the card is built from DESIGN.md's tokens, not from values (AC5, AD-13)", () => {
  it("compiles every class the shell uses to a theme token", async () => {
    const css = await compile(productClasses);

    // The `components.card` recipe: fill, radius, shadow, block padding,
    // inline padding, max width. Plus the ground behind it.
    expect(ruleFor(css, "bg-card")).toContain("var(--color-card)");
    expect(ruleFor(css, "rounded-lg")).toContain("var(--radius-lg)");
    expect(ruleFor(css, "shadow-card")).toContain("--tw-shadow:");
    expect(ruleFor(css, "py-6")).toContain("var(--spacing-6)");
    expect(ruleFor(css, "px-gutter")).toContain("var(--spacing-gutter)");
    expect(ruleFor(css, "max-w-card-max-width")).toContain(
      "var(--spacing-card-max-width)",
    );
    expect(ruleFor(css, "p-margin-phone")).toContain(
      "var(--spacing-margin-phone)",
    );
    expect(ruleFor(css, "bg-ground")).toContain("var(--color-ground)");
    expect(ruleFor(css, "text-text-primary")).toContain(
      "var(--color-text-primary)",
    );
  });

  it("holds the sticky block at the top of the viewport on an opaque surface (2.3 AC6)", async () => {
    const css = await compile(productClasses);

    expect(stickyClasses).toContain("sticky");
    expect(stickyClasses).toContain("top-0");
    expect(ruleFor(css, "sticky")).toContain("position: sticky");
    expect(ruleFor(css, "top-0")).toContain("top: 0");
    // DESIGN.md:360 — an opaque surface, not a translucent one. `bg-card`
    // resolves to a six-digit hex with no alpha channel, and no opacity
    // modifier is applied to it anywhere in the block.
    expect(stickyClasses).toContain("bg-card");
    expect(css).toMatch(/--color-card:\s*#[0-9A-Fa-f]{6};/);
  });

  it("resolves the max width to DESIGN.md's 640px and the ground to its colour", async () => {
    const css = await compile(productClasses);
    expect(css).toContain("--spacing-card-max-width: 640px");
    expect(css).toContain("--color-ground: #E7EAF6");
    expect(css).toContain("--spacing-margin-phone: 18px");
  });

  it("would fail if a class stopped resolving, so the assertions above are not vacuous", async () => {
    const css = await compile(productClasses);
    expect(() => ruleFor(css, "max-w-invented-token")).toThrow(
      /emitted no rule/,
    );
  });
});
