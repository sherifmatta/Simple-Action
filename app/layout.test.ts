import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Matrix row covered here (spec-1-2-transcribe-design-tokens-load-typeface.md,
// frozen `## I/O & Edge-Case Matrix`): "Font swap".
//
// Spec Change Log entry 1 establishes that, under Turbopack, `next/font`
// treats a supplied `fallback` list as a *replacement* for its automatic
// metric-adjusted fallback face rather than a suffix — passing `fallback`
// (or setting `adjustFontFallback: false`) silences the
// ascent/descent/line-gap/size-adjust `@font-face` that makes the swap
// contribute zero CLS. This test parses the real TypeScript AST (the same
// rigor eslint.config.test.ts applies via `ESLint#lintText`, rather than
// grepping the file as text) to assert the `Poppins(...)` call in
// app/layout.tsx never reintroduces either, that it still exposes the
// `--font-poppins` variable, and that `<html>` actually applies it.

const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
const source = readFileSync(layoutPath, "utf8");

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function findPoppinsCalls(root: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Poppins"
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return calls;
}

// Matches both `fallback: [...]` and `"fallback": [...]`. Until the
// string-literal form was handled, `Poppins({ "fallback": [...] })` walked
// straight through the zero-CLS guard.
function findProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  return objectLiteral.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );
}

// A spread hides whatever it carries from every property lookup above, so the
// options object stops being statically readable and the guards below would
// pass without having checked anything.
function hasSpread(objectLiteral: ts.ObjectLiteralExpression): boolean {
  return objectLiteral.properties.some(ts.isSpreadAssignment);
}

function findHtmlJsxElement(
  root: ts.Node,
): ts.JsxOpeningLikeElement | undefined {
  let found: ts.JsxOpeningLikeElement | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "html"
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function classNameExpressionText(
  element: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile,
): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "className",
  );
  if (
    !attribute?.initializer ||
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression
  ) {
    return undefined;
  }
  return attribute.initializer.expression.getText(sourceFile);
}

// The guards, expressed once. Both halves of this suite call this: the real
// file must produce no violations, and each negative fixture must produce the
// specific one it encodes. Hand-writing the inverse assertion in the negative
// half — as this file did until the 2026-09-21 review — proves only that the
// helpers work, and leaves the fixtures green if a guard is ever weakened.
type FontGuardViolation =
  | "poppins-not-called-exactly-once"
  | "options-not-an-object-literal"
  | "options-spread"
  | "fallback-present"
  | "adjust-font-fallback-disabled"
  | "variable-drifted"
  | "html-classname-drifted";

function fontGuardViolations(sourceFile: ts.SourceFile): FontGuardViolation[] {
  const found: FontGuardViolation[] = [];
  const calls = findPoppinsCalls(sourceFile);

  if (calls.length !== 1) {
    found.push("poppins-not-called-exactly-once");
  }

  const options = calls[0]?.arguments[0];
  if (calls.length === 1) {
    if (!options || !ts.isObjectLiteralExpression(options)) {
      found.push("options-not-an-object-literal");
    } else {
      if (hasSpread(options)) found.push("options-spread");
      if (findProperty(options, "fallback")) found.push("fallback-present");

      const adjust = findProperty(options, "adjustFontFallback");
      if (adjust && adjust.initializer.getText(sourceFile) === "false") {
        found.push("adjust-font-fallback-disabled");
      }

      const variable = findProperty(options, "variable");
      if (
        !variable ||
        variable.initializer.getText(sourceFile) !== '"--font-poppins"'
      ) {
        found.push("variable-drifted");
      }
    }
  }

  const htmlElement = findHtmlJsxElement(sourceFile);
  if (
    htmlElement &&
    classNameExpressionText(htmlElement, sourceFile) !== "poppins.variable"
  ) {
    found.push("html-classname-drifted");
  }

  return found;
}

describe("app/layout.tsx — Poppins() zero-CLS font swap", () => {
  const sourceFile = parse(layoutPath, source);
  const calls = findPoppinsCalls(sourceFile);

  it("satisfies every zero-CLS font guard", () => {
    expect(fontGuardViolations(sourceFile)).toEqual([]);
  });

  it("loads Poppins exactly once via next/font/google", () => {
    expect(calls).toHaveLength(1);
  });

  const [call] = calls;
  const options = call?.arguments[0];

  it("passes an object literal of options to Poppins(...)", () => {
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
  });

  it("does not pass a `fallback` option (Turbopack would treat it as a replacement, not a suffix, for the metric-adjusted fallback face)", () => {
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      expect(findProperty(options, "fallback")).toBeUndefined();
    }
  });

  it("does not set `adjustFontFallback: false` (leaves it at its default of true)", () => {
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = findProperty(options, "adjustFontFallback");
      if (property) {
        expect(property.initializer.getText(sourceFile)).not.toBe("false");
      }
      // Absent entirely is also fine — next/font's default is `true`.
    }
  });

  it('exposes the CSS variable as exactly "--font-poppins"', () => {
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = findProperty(options, "variable");
      expect(
        property,
        "expected a `variable` option on Poppins(...)",
      ).toBeDefined();
      expect(property!.initializer.getText(sourceFile)).toBe(
        '"--font-poppins"',
      );
    }
  });

  it("applies poppins.variable as <html>'s className", () => {
    const htmlElement = findHtmlJsxElement(sourceFile);
    expect(htmlElement, "expected to find an <html> JSX element").toBeDefined();
    expect(classNameExpressionText(htmlElement!, sourceFile)).toBe(
      "poppins.variable",
    );
  });
});

describe("app/layout.tsx — negative fixtures prove the guards actually catch regressions", () => {
  it("would flag a Poppins(...) call that reintroduces `fallback`", () => {
    const fixture = parse(
      "fixture-fallback.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({
         subsets: ["latin"],
         weight: ["400", "500", "600"],
         variable: "--font-poppins",
         fallback: ["Arial"],
       });`,
    );
    expect(fontGuardViolations(fixture)).toContain("fallback-present");
  });

  it("would flag a Poppins(...) call that reintroduces `fallback` under a string-literal key", () => {
    const fixture = parse(
      "fixture-fallback-string-key.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({
         subsets: ["latin"],
         variable: "--font-poppins",
         "fallback": ["Arial"],
       });`,
    );
    expect(fontGuardViolations(fixture)).toContain("fallback-present");
  });

  it("would flag a Poppins(...) call whose options arrive through a spread", () => {
    const fixture = parse(
      "fixture-spread.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({ ...options, variable: "--font-poppins" });`,
    );
    expect(fontGuardViolations(fixture)).toContain("options-spread");
  });

  it("would flag a Poppins(...) call that sets `adjustFontFallback: false`", () => {
    const fixture = parse(
      "fixture-adjust-font-fallback.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({
         subsets: ["latin"],
         weight: ["400", "500", "600"],
         variable: "--font-poppins",
         adjustFontFallback: false,
       });`,
    );
    expect(fontGuardViolations(fixture)).toContain(
      "adjust-font-fallback-disabled",
    );
  });

  it('would flag a `variable` option that drifts from "--font-poppins"', () => {
    const fixture = parse(
      "fixture-variable-typo.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({ subsets: ["latin"], variable: "--font-poppin" });`,
    );
    expect(fontGuardViolations(fixture)).toContain("variable-drifted");
  });

  it("would flag an <html> element whose className drifts from poppins.variable", () => {
    const fixture = parse(
      "fixture-html-classname.tsx",
      `export default function RootLayout({ children }) {
         return (
           <html lang="en" className={poppins.className}>
             <body>{children}</body>
           </html>
         );
       }`,
    );
    expect(fontGuardViolations(fixture)).toContain("html-classname-drifted");
  });
});

// --- Story 1.7: the shell is mounted here, once -----------------------------
//
// Matrix-free story, but the same rigor: AC1 ("a `QueryClientProvider` wraps
// the tree") and AC2 ("exactly one polite and one assertive live region") are
// claims about what this file mounts, and the cheapest way to break either is
// to move the providers below `children`, or to add a second boundary. Both
// are AST-visible here; `src/client/providers.test.ts` checks the composition
// on the other side of the boundary.

function jsxElementNames(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      names.push(node.tagName.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

describe("app/layout.tsx — the application shell is mounted once, at the root", () => {
  const sourceFile = parse(layoutPath, source);
  const elements = jsxElementNames(sourceFile);

  it("mounts exactly one client boundary, and `children` goes inside it", () => {
    expect(elements).toEqual(["html", "body", "AppProviders"]);
    expect(source).toMatch(/<AppProviders>\{children\}<\/AppProviders>/);
  });

  it("stays a Server Component — the boundary is @/client/providers, not this file", () => {
    expect(source).not.toMatch(/^\s*["']use client["']/m);
    expect(source).toMatch(
      /import \{ AppProviders \} from "@\/client\/providers";/,
    );
  });

  it("puts the ground on <body> from DESIGN.md's tokens (AC5)", () => {
    const body = elements.indexOf("body");
    expect(body).toBeGreaterThan(-1);
    expect(source).toMatch(
      /<body className="min-h-dvh overflow-x-hidden bg-ground text-text-primary">/,
    );
  });
});
