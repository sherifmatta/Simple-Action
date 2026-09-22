// The markup surface, read once for the tests that make claims about all of it.
//
// Story 2.3 needs several whole-product claims — no second scrolling element,
// no cue that there is more below, no unapproved token, stickiness declared
// once — and each of them is an absence, so each has to be a scan rather than
// an assertion at a call site. This module is what they scan.
//
// It is the placement `deferred-work.md` names for the tree-walk duplication
// it records ("one `src/test-support/source-files.ts` imported by all six").
// This is deliberately the narrower half of that job: the *markup* surface,
// which is `.tsx` under `app/` and `src/client/`. Migrating the six existing
// copies of the generic source walk is still outstanding and still theirs —
// those scan `.ts` as well and belong to done stories' tests.
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
  const withoutVariants = className.slice(className.lastIndexOf(":") + 1);
  return withoutVariants.replace(/^!/, "").replace(/!$/, "");
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
