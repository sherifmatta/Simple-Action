// The markup surface, read once for the tests that make claims about all of it.
//
// Story 2.3 needs several whole-product claims — no second scrolling element,
// no cue that there is more below, no unapproved token, stickiness declared
// once — and each of them is an absence, so each has to be a scan rather than
// an assertion at a call site. This module is what they scan.
//
// It is the placement `deferred-work.md` names for the tree-walk duplication
// it records ("one `src/test-support/source-files.ts` imported by all six").
// Story 2.3 took the narrower half: the *markup* surface, which is `.tsx`
// under `app/` and `src/client/`. Story 2.5 added `readSources()` below, the
// generic `.ts`/`.tsx` walk the entry asks for. The six existing copies in
// done stories' tests are still unmigrated — a home for the walk now exists,
// so what remains of that entry is moving them onto it.
//
// Classes come out of the TypeScript AST, not out of the file text. Every file
// this walks discusses `sticky`, `overflow`, fades and scrollbars *in its
// comments*, so a text scan would have to strip comments first and would still
// trip over a prop name. A `className` string literal is the only thing that
// reaches the browser, and it is exactly what the AST gives.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const repositoryRoot = process.cwd();

/** Everywhere in this product that can put an element on the screen. */
export const MARKUP_ROOTS = ["app", path.join("src", "client")];

export type Markup = {
  /** Repository-relative path, e.g. `src/client/components/todo-card.tsx`. */
  file: string;
  source: string;
  /** Every class as written, variants included. */
  classes: string[];
};

export function parseTsx(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function classNameAttributes(sourceFile: ts.SourceFile): ts.JsxAttribute[] {
  const found: ts.JsxAttribute[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === "className"
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function classNamesOf(source: string, fileName: string): string[] {
  const sourceFile = parseTsx(fileName, source);
  return classNameAttributes(sourceFile).flatMap((attribute) =>
    attribute.initializer && ts.isStringLiteral(attribute.initializer)
      ? attribute.initializer.text.split(/\s+/).filter(Boolean)
      : [],
  );
}

/**
 * `file:expression` for every `className` that is not a plain string literal.
 *
 * A `className={cn(…)}` or a template literal contributes nothing to
 * `classNamesOf`, and contributes it *silently* — every scan in this
 * repository would keep passing while the classes it is meant to police became
 * invisible. So the scans assert this list rather than trusting their own
 * silence.
 */
export function dynamicClassNames(sources: Markup[]): string[] {
  return sources.flatMap(({ file, source }) => {
    const sourceFile = parseTsx(file, source);
    return classNameAttributes(sourceFile)
      .filter(
        (attribute) =>
          attribute.initializer === undefined ||
          !ts.isStringLiteral(attribute.initializer),
      )
      .map(
        (attribute) =>
          `${file}:${attribute.initializer?.getText(sourceFile) ?? "(none)"}`,
      );
  });
}

/**
 * The base utility, with variants and the important marker removed.
 *
 * `md:overflow-y-auto` is a scroll container on a tablet and `!sticky` is a
 * second sticky block; both are the thing the scans exist to catch, and an
 * anchored pattern matched against the class as written would see neither.
 */
export function baseUtility(className: string): string {
  // The variant separator is a colon at bracket depth zero. Slicing on the last
  // colon anywhere turns `md:[overflow:auto]` into `auto]`, which matches no
  // pattern any scan holds — so an arbitrary-property class used to slip past
  // every one of them silently.
  let depth = 0;
  let separator = -1;
  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === "[") depth += 1;
    else if (character === "]") depth -= 1;
    else if (character === ":" && depth === 0) separator = index;
  }

  const withoutVariants = className.slice(separator + 1);
  return withoutVariants.replace(/^!/, "").replace(/!$/, "");
}

/**
 * `file:class` for every arbitrary-*property* class, e.g. `[overflow:auto]`.
 *
 * Tailwind lets a class name carry a raw CSS declaration. That is a scroll
 * container, a second sticky block or a fade written in a form no utility
 * pattern can match, so the scans assert this list is empty rather than trying
 * to police what is inside the brackets.
 */
export function arbitraryProperties(sources: Markup[]): string[] {
  return sources.flatMap(({ file, classes }) =>
    classes
      .filter((name) => /^\[[^\]]*:[^\]]*\]$/.test(baseUtility(name)))
      .map((name) => `${file}:${name}`),
  );
}

function filesUnder(directory: string, extension: string): string[] {
  return readdirSync(path.join(repositoryRoot, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(relativePath, extension);
    if (path.extname(entry.name) !== extension) return [];
    if (entry.name.includes(".test.")) return [];
    return [relativePath];
  });
}

/** Every `.tsx` under `MARKUP_ROOTS`, test files excluded. */
export function markupFiles(): string[] {
  return MARKUP_ROOTS.flatMap((root) => filesUnder(root, ".tsx"));
}

/** Everywhere in this product that ships TypeScript, markup or otherwise. */
export const SOURCE_ROOTS = ["app", "src"];

/** The repository root's own `.ts` files, which belong to no directory. */
function rootSourceFiles(): string[] {
  return readdirSync(repositoryRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name) === ".ts" &&
        !entry.name.includes(".test."),
    )
    .map((entry) => entry.name);
}

/**
 * Every `.ts` and `.tsx` the product ships, as `{ file, source }`.
 *
 * The markup walk above reads `.tsx` under `app/` and `src/client/`, which is
 * the right surface for a claim about class names and the wrong one for a
 * claim about the product as a whole. Story 2.5 needs three of the latter —
 * that the motion-preference media query is read in one module, that no
 * second duration constant is declared anywhere, that nothing schedules its
 * own timer — and each is an absence, so each has to be a scan over
 * everything rather than an assertion at a call site.
 *
 * `SOURCE_ROOTS` alone would miss the files that sit at the repository root,
 * and one of them ships on every request: `middleware.ts` runs before every
 * matched route. A scan that says "anywhere in the product" and cannot see it
 * is not the claim it says it is, so the root's own `.ts` files are in the
 * surface too.
 *
 * This file is inside the surface it returns, which is deliberate: excluding
 * the test-support directory would leave a hole exactly where a helper is
 * most tempted to keep a stub. It is also why the doc comments here name no
 * banned token literally.
 *
 * Test files are excluded by the walk; nothing here is a claim about tests.
 */
export function readSources(): { file: string; source: string }[] {
  return [
    ...rootSourceFiles(),
    ...SOURCE_ROOTS.flatMap((root) => [
      ...filesUnder(root, ".ts"),
      ...filesUnder(root, ".tsx"),
    ]),
  ].map((file) => ({
    file,
    source: readFileSync(path.join(repositoryRoot, file), "utf8"),
  }));
}

export function readMarkup(): Markup[] {
  return markupFiles().map((file) => {
    const source = readFileSync(path.join(repositoryRoot, file), "utf8");
    return { file, source, classes: classNamesOf(source, file) };
  });
}

/** `file:class` for every class whose base utility matches `pattern`. */
export function matches(sources: Markup[], pattern: RegExp): string[] {
  return sources.flatMap(({ file, classes }) =>
    classes
      .filter((name) => pattern.test(baseUtility(name)))
      .map((name) => `${file}:${name}`),
  );
}

/**
 * `file:expression` for every way markup can reach the browser unscanned.
 *
 * `dynamicClassNames` covers a computed `className` attribute. These are the
 * three routes around the attribute itself:
 *
 * - `{...props}` on a JSX element, which can carry a `className` this module
 *   never sees, because it is a `JsxSpreadAttribute` and not a `JsxAttribute`.
 * - `createElement(...)`, which produces an element with no JSX attribute node
 *   at all.
 * - `style={{ … }}`, which sets `overflow`, `position` or a gradient directly,
 *   with no class involved.
 *
 * Each makes the whole-tree absence scans blind in exactly the way
 * `dynamicClassNames` exists to prevent, so they are reported the same way.
 */
export function opaqueMarkup(sources: Markup[]): string[] {
  return sources.flatMap(({ file, source }) => {
    const sourceFile = parseTsx(file, source);
    const found: string[] = [];

    function visit(node: ts.Node) {
      if (ts.isJsxSpreadAttribute(node)) {
        found.push(`${file}:spread ${node.getText(sourceFile)}`);
      }
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "style") {
        found.push(`${file}:style ${node.getText(sourceFile)}`);
      }
      if (
        ts.isCallExpression(node) &&
        /(^|\.)createElement$/.test(node.expression.getText(sourceFile))
      ) {
        found.push(`${file}:createElement`);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
  });
}

/** The JSX tag a `className` attribute sits on, e.g. `body`, `div`, `TodoRow`. */
function elementOf(attribute: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  const opening = attribute.parent.parent;
  if (ts.isJsxSelfClosingElement(opening) || ts.isJsxOpeningElement(opening)) {
    return opening.tagName.getText(sourceFile);
  }
  return "(unknown)";
}

/**
 * `file:element:class` for every class whose base utility matches `pattern`.
 *
 * `matches` reports the file only, which makes a file-scoped allow-list the
 * strongest thing a scan can assert — and `overflow-x-hidden` is only safe on
 * `<body>`. Moving it to `<html>`, or onto any other element in the same file,
 * breaks sticky positioning and the overflow propagation the scroll model rests
 * on, while a `file:class` assertion stays green. This is what lets the scans
 * pin the element instead.
 */
export function matchesWithElement(sources: Markup[], pattern: RegExp): string[] {
  return sources.flatMap(({ file, source }) => {
    const sourceFile = parseTsx(file, source);
    return classNameAttributes(sourceFile).flatMap((attribute) => {
      if (!attribute.initializer || !ts.isStringLiteral(attribute.initializer)) {
        return [];
      }
      const element = elementOf(attribute, sourceFile);
      return attribute.initializer.text
        .split(/\s+/)
        .filter(Boolean)
        .filter((name) => pattern.test(baseUtility(name)))
        .map((name) => `${file}:${element}:${name}`);
    });
  });
}

/** Every stylesheet this product ships, as `{ file, source }`. */
export function readStyleSheets(): { file: string; source: string }[] {
  return MARKUP_ROOTS.flatMap((root) => filesUnder(root, ".css")).map((file) => ({
    file,
    source: readFileSync(path.join(repositoryRoot, file), "utf8"),
  }));
}

/**
 * `file:match` for every stylesheet declaration matching `pattern`.
 *
 * The scans above read `.tsx` only, so the whole CSS half of the product was
 * unscanned — and this epic has started putting component recipes in
 * `globals.css`, which makes the stylesheet a live route for exactly the
 * regressions the markup scans exist to catch rather than a theoretical one.
 */
export function styleSheetMatches(pattern: RegExp): string[] {
  return readStyleSheets().flatMap(({ file, source }) => {
    // Comments discuss `overflow`, gradients and fades at length; only
    // declarations reach the browser.
    const declarations = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return [...declarations.matchAll(new RegExp(pattern, "g"))].map(
      (match) => `${file}:${match[0]}`,
    );
  });
}
