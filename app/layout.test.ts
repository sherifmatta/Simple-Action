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
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findPoppinsCalls(root: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Poppins") {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return calls;
}

function findProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  return objectLiteral.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function findHtmlJsxElement(root: ts.Node): ts.JsxOpeningLikeElement | undefined {
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

function classNameExpressionText(element: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === "className",
  );
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    return undefined;
  }
  return attribute.initializer.expression.getText(sourceFile);
}

describe("app/layout.tsx — Poppins() zero-CLS font swap", () => {
  const sourceFile = parse(layoutPath, source);
  const calls = findPoppinsCalls(sourceFile);

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

  it("exposes the CSS variable as exactly \"--font-poppins\"", () => {
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = findProperty(options, "variable");
      expect(property, "expected a `variable` option on Poppins(...)").toBeDefined();
      expect(property!.initializer.getText(sourceFile)).toBe('"--font-poppins"');
    }
  });

  it("applies poppins.variable as <html>'s className", () => {
    const htmlElement = findHtmlJsxElement(sourceFile);
    expect(htmlElement, "expected to find an <html> JSX element").toBeDefined();
    expect(classNameExpressionText(htmlElement!, sourceFile)).toBe("poppins.variable");
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
    const [call] = findPoppinsCalls(fixture);
    const options = call.arguments[0];
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      expect(findProperty(options, "fallback")).toBeDefined();
    }
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
    const [call] = findPoppinsCalls(fixture);
    const options = call.arguments[0];
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = findProperty(options, "adjustFontFallback");
      expect(property).toBeDefined();
      expect(property!.initializer.getText(fixture)).toBe("false");
    }
  });

  it("would flag a `variable` option that drifts from \"--font-poppins\"", () => {
    const fixture = parse(
      "fixture-variable-typo.tsx",
      `import { Poppins } from "next/font/google";
       const poppins = Poppins({ subsets: ["latin"], variable: "--font-poppin" });`,
    );
    const [call] = findPoppinsCalls(fixture);
    const options = call.arguments[0];
    expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = findProperty(options, "variable");
      expect(property!.initializer.getText(fixture)).not.toBe('"--font-poppins"');
    }
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
    const htmlElement = findHtmlJsxElement(fixture);
    expect(htmlElement).toBeDefined();
    expect(classNameExpressionText(htmlElement!, fixture)).not.toBe("poppins.variable");
  });
});
