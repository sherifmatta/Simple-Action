import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

// Covers epics.md Story 1.7 AC5: an empty card renders on the ground at the
// correct max width, and nothing else is visible.
//
// "The correct max width" is `{spacing.card-max-width}` — a DESIGN.md token
// Story 1.2 already transcribed — so this compiles the real `app/globals.css`
// through the real Tailwind engine (the `app/globals.test.ts` approach) and
// asserts the classes the page actually uses resolve to those tokens. A test
// that only read the class strings would pass on `max-w-card-max-width` even
// if Tailwind emitted nothing for it, which is exactly the failure mode: an
// unrecognised utility is silently dropped, not an error.

const repositoryRoot = process.cwd();
const pagePath = path.join(repositoryRoot, "app", "page.tsx");
const layoutPath = path.join(repositoryRoot, "app", "layout.tsx");
const pageSource = readFileSync(pagePath, "utf8");
const layoutSource = readFileSync(layoutPath, "utf8");

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function classNamesOf(source: string, fileName: string): string[] {
  const sourceFile = parse(fileName, source);
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === "className" &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      found.push(...node.initializer.text.split(/\s+/).filter(Boolean));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

const pageClasses = classNamesOf(pageSource, "page.tsx");
const layoutClasses = classNamesOf(layoutSource, "layout.tsx");

// --- The markup -------------------------------------------------------------

describe("the card is empty and it is the only thing on the page (AC5)", () => {
  const sourceFile = parse("page.tsx", pageSource);

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
      `the shell renders an empty card and nothing else; found ${JSON.stringify(text)}`,
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
    expect(elements).toEqual(["main", "div"]);
  });

  it("uses no hex literal and no arbitrary-value class (AD-13)", () => {
    for (const source of [pageSource, layoutSource]) {
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/);
      expect(source).not.toMatch(/\b[a-z-]+-\[[^\]]+\]/);
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

  it("centres the card and caps its width", () => {
    expect(pageClasses).toContain("mx-auto");
    expect(pageClasses).toContain("max-w-card-max-width");
  });
});

// --- What those classes actually compile to ---------------------------------

const base = mkdtempSync(path.join(tmpdir(), "simple-action-card-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

async function compile(classes: string[]): Promise<string> {
  writeFileSync(
    path.join(base, "marker.html"),
    `<div class="${classes.join(" ")}"></div>`,
  );
  const input = `@import "${path.join(repositoryRoot, "app", "globals.css")}";\n@source "${path.join(base, "marker.html")}";\n`;
  const result = await postcss([tailwindcssPostcss({ base })]).process(input, {
    from: path.join(base, "input.css"),
  });
  return result.css;
}

function ruleFor(css: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`\\.${escaped}\\s*\\{[^}]*\\}`));
  if (match === null) {
    throw new Error(
      `Tailwind emitted no rule for .${className} — an unrecognised utility is dropped silently, not reported.`,
    );
  }
  return match[0].replace(/\s+/g, " ");
}

describe("the card is built from DESIGN.md's tokens, not from values (AC5, AD-13)", () => {
  it("compiles every class the shell uses to a theme token", async () => {
    const css = await compile([...pageClasses, ...layoutClasses]);

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

  it("resolves the max width to DESIGN.md's 640px and the ground to its colour", async () => {
    const css = await compile([...pageClasses, ...layoutClasses]);
    expect(css).toContain("--spacing-card-max-width: 640px");
    expect(css).toContain("--color-ground: #E7EAF6");
    expect(css).toContain("--spacing-margin-phone: 18px");
  });

  it("would fail if a class stopped resolving, so the assertions above are not vacuous", async () => {
    const css = await compile(pageClasses);
    expect(() => ruleFor(css, "max-w-invented-token")).toThrow(
      /emitted no rule/,
    );
  });
});
