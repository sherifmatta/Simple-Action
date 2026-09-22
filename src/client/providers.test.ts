import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { TODOS_QUERY_KEY } from "./todos/query-keys";

// Covers epics.md Story 1.7 AC1: a `QueryClientProvider` wraps the tree, and
// `['todos']` is the only query key the application will use.
//
// The second half is a claim about the whole codebase and about every story
// still to be written, so it is a tree scan — the same tool `contract.test.ts`
// uses for "neither side declares its own Todo type". The nesting is checked
// by parsing the real AST, as `app/layout.test.ts` does.

const repositoryRoot = process.cwd();

/** An array literal whose first element is the string `todos`, plus more. */
const COMPOSITE_KEY = /\[\s*["']todos["']\s*,/;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const PROVIDERS_FILE = path.join("src", "client", "providers.tsx");
const QUERY_KEYS_FILE = path.join("src", "client", "todos", "query-keys.ts");

const source = readFileSync(path.join(repositoryRoot, PROVIDERS_FILE), "utf8");

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** The JSX element names on the path from the root element down to `children`. */
function providerChain(sourceFile: ts.SourceFile): string[] {
  const chain: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      chain.push(node.openingElement.tagName.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return chain;
}

describe("the shell mounts the three singletons once (AC1, AC2, AC4)", () => {
  const chain = providerChain(parse(PROVIDERS_FILE, source));

  it("wraps the tree in a QueryClientProvider, outermost", () => {
    expect(chain[0]).toBe("QueryClientProvider");
  });

  it("mounts the error slot and the announcer inside it, each exactly once", () => {
    expect(chain).toEqual([
      "QueryClientProvider",
      "ErrorSlotProvider",
      "AnnouncerProvider",
    ]);
  });

  it("is a Client Component, because React context is unavailable in Server Components", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("builds the QueryClient per mount, not at module scope, so SSR never shares one cache between visitors", () => {
    // A module-scope `new QueryClient()` is created once per server process,
    // which under SSR would hand every visitor the same cache — and this
    // cache holds one person's Todo List, scoped to their Client Identity.
    expect(source).toMatch(/useState\(createQueryClient\)/);
    expect(source).not.toMatch(/^const \w+ = new QueryClient\(/m);
  });
});

describe("AD-8 — `['todos']` is the only query key (AC1)", () => {
  it("is exactly `['todos']`", () => {
    expect([...TODOS_QUERY_KEY]).toEqual(["todos"]);
  });

  it("is declared once, and every file that names a query key imports it", () => {
    const offenders = sourceFiles("")
      .filter((file) => file !== QUERY_KEYS_FILE && !file.endsWith(".test.ts"))
      .filter((file) => {
        const text = readFileSync(path.join(repositoryRoot, file), "utf8");
        if (!/\bqueryKey\b/.test(text)) return false;
        return !text.includes("TODOS_QUERY_KEY");
      });
    expect(
      offenders,
      `these files name a query key without importing TODOS_QUERY_KEY: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("declares no second key beside it, under any export form", () => {
    const keysModule = readFileSync(
      path.join(repositoryRoot, QUERY_KEYS_FILE),
      "utf8",
    );
    // `^export const` alone would miss `export function todosKey()` and
    // `export let`, which are the same second key by another spelling.
    const exported = [
      ...keysModule.matchAll(
        /^export (?:const|let|var|function|class)\s+(\w+)/gm,
      ),
    ].map((match) => match[1]);
    expect(exported).toEqual(["TODOS_QUERY_KEY"]);
  });

  it("declares no composite key anywhere — `['todos', id]` is a second key (AD-8)", () => {
    // The import check above is satisfied by a file that imports the constant
    // and writes `queryKey: ["todos", id]` beside it, which is exactly the
    // drift AD-8 forbids ("there is exactly one query key"). A composite
    // array literal beginning with the string `todos` is that drift, whatever
    // else the file imports.
    // Comments are stripped first — `query-keys.ts` names `['todos', id]` in
    // prose as the very thing it forbids, and prose about a second key is not
    // a second key.
    const offenders = sourceFiles("")
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) =>
        COMPOSITE_KEY.test(
          withoutComments(
            readFileSync(path.join(repositoryRoot, file), "utf8"),
          ),
        ),
      );
    expect(
      offenders,
      `AD-8 allows exactly one query key, ['todos']; these files build a composite one: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("would catch that composite key, so the assertion above is not vacuous", () => {
    expect(COMPOSITE_KEY.test(`useQuery({ queryKey: ["todos", id] })`)).toBe(
      true,
    );
    expect(COMPOSITE_KEY.test(`useQuery({ queryKey: TODOS_QUERY_KEY })`)).toBe(
      false,
    );
  });
});

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  ".git",
  ".claude",
  ".vercel",
  "coverage",
  "drizzle",
  "docs",
  "public",
  "_bmad",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(repositoryRoot, directory || "."), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = directory
      ? path.join(directory, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : sourceFiles(relativePath);
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [relativePath];
  });
}
