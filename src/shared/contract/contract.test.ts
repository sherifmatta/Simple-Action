import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as errorsContract from "./errors";
import * as todoContract from "./todo";
import type { ErrorEnvelope, ErrorKind } from "./errors";
import type { Todo } from "./todo";

// Matrix rows covered here (spec-1-5-define-the-shared-contract.md, frozen
// `## I/O & Edge-Case Matrix`):
//   - "Todo shape"       static: the type-level equality below, plus the keys
//                        of a literal the compiler already checked
//   - "Error kinds"      static, the same way
//   - "No type duplicated"  static: the source scan over the whole tree
// The predicate rows live in `validation.test.ts`.
//
// The wire shape is validated at the type level only — no runtime guard and no
// schema library, per the spec's frozen `Decided` note. So the first two rows
// are enforced by `npm run typecheck` (and therefore `npm run build`), not by
// `npm test`: Vitest transpiles without type-checking, so a drifted `Todo` or a
// fifth error kind makes `tsc --noEmit` fail while these `expect` calls still
// pass. They are here to name the row and to keep the assertion types used.

// `Exactly` is the standard conditional-identity trick: two types are the same
// only when each is assignable to the other in an invariant position. Plain
// `extends` would pass a Todo carrying extra fields.
type Exactly<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

describe("src/shared/contract/todo.ts — the Todo wire shape (AC1)", () => {
  it("is exactly id, text, completed and createdAt, all required", () => {
    const shapeIsExact: Exactly<
      Todo,
      { id: string; text: string; completed: boolean; createdAt: string }
    > = true;

    expect(shapeIsExact).toBe(true);
  });

  it("names its four fields in camelCase, the PRD's vocabulary verbatim", () => {
    // `satisfies` runs the excess-property check, so an extra field here fails
    // to compile; `Record<keyof Todo, ...>` fails to compile if one is missing.
    const wireFields: Record<keyof Todo, true> = {
      id: true,
      text: true,
      completed: true,
      createdAt: true,
    };

    expect(Object.keys(wireFields).sort()).toEqual([
      "completed",
      "createdAt",
      "id",
      "text",
    ]);
  });

  it("carries its timestamp as an ISO-8601 string, never a Date (SPINE 'Dates')", () => {
    const sample = {
      id: "0199a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b",
      text: "Buy milk",
      completed: false,
      createdAt: "2026-09-21T09:15:00.000Z",
    } satisfies Todo;

    // `Date.parse` would also accept "Sep 21 2026", which is exactly what this
    // row exists to rule out, so the shape of the string is what is asserted.
    expect(sample.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    );
  });
});

describe("src/shared/contract/errors.ts — the error envelope (AC2)", () => {
  it("admits exactly the four kinds, all present from the outset", () => {
    const kindsAreExact: Exactly<
      ErrorKind,
      "load" | "create" | "update" | "delete"
    > = true;

    // The `Record` is exhaustive in both directions: a missing kind fails to
    // compile, an invented one fails the excess-property check.
    const kinds: Record<ErrorKind, true> = {
      load: true,
      create: true,
      update: true,
      delete: true,
    };

    expect(kindsAreExact).toBe(true);
    expect(Object.keys(kinds).sort()).toEqual([
      "create",
      "delete",
      "load",
      "update",
    ]);
  });

  it("wraps the kind and the message in a single `error` key", () => {
    const envelopeIsExact: Exactly<
      ErrorEnvelope,
      { error: { kind: ErrorKind; message: string } }
    > = true;

    const sample = {
      error: { kind: "create", message: "text too long" },
    } satisfies ErrorEnvelope;

    expect(envelopeIsExact).toBe(true);
    expect(Object.keys(sample)).toEqual(["error"]);
    expect(Object.keys(sample.error).sort()).toEqual(["kind", "message"]);
  });
});

// ---------------------------------------------------------------------------
// The tree outside src/shared/contract/ — matrix row "No type duplicated"
// ---------------------------------------------------------------------------
//
// AC1's "neither src/client/ nor src/server/ declares its own Todo type" has no
// lint rule behind it: `eslint.config.mjs` restricts imports and syntax, never
// type declarations. This scan is the enforcement, in the style of the AD-2
// scan in `src/server/repository/client-identity.test.ts`. It fails the day a
// future story writes a competing shape instead of importing this one.

const CONTRACT_DIRECTORY = "src/shared/contract";
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  // `.gitignore` calls these generated too; `path.extname("x.d.ts")` is `.ts`,
  // so emitted declaration files would otherwise be scanned as source.
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

// `eslint.config.test.ts` carries module specifiers as fixture *strings* — it
// is the boundary wall's own test data and drives real ESLint over it. The one
// source file this textual scan cannot read literally.
const SCAN_EXEMPT_FILES = new Set(["eslint.config.test.ts"]);

const repositoryRoot = process.cwd();

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
    if (SCAN_EXEMPT_FILES.has(relativePath)) return [];
    return [relativePath];
  });
}

type Declaration = { file: string; name: string; body: string };

// Comments are prose: "classify any failure" is not an `any`, and a sentence
// about the Todo type is not a declaration of one. Strings survive, because the
// kind union is spelled with them. Not a parser — a regex literal holding `//`
// loses the rest of its line, which costs this scan nothing it needs.
// A `/` opens a regex literal only in expression position. These are the
// characters after which that is the case; after an identifier, a digit or a
// closing bracket, `/` is division.
function regexLiteralCanStartAfter(previous: string): boolean {
  return previous === "" || "(,=:[!&|?{};+-*%~^<>".includes(previous);
}

function withoutComments(source: string): string {
  let out = "";
  let quote = "";
  let comment: "" | "line" | "block" = "";
  let lastSignificant = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (comment === "line") {
      if (char === "\n") {
        comment = "";
        out += char;
      }
      continue;
    }
    if (comment === "block") {
      if (char === "*" && next === "/") {
        comment = "";
        i += 1;
      }
      continue;
    }
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      comment = "line";
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      comment = "block";
      i += 1;
      continue;
    }
    // A regex literal may hold a quote character (`/["']/`). Without
    // tracking it, that quote opens a phantom string here and every comment
    // until the next quote survives stripping — and prose is then reported as
    // a competing Todo shape. A `/` in expression position opens a literal;
    // after a value it is division, which is why the previous significant
    // character decides.
    if (char === "/" && regexLiteralCanStartAfter(lastSignificant)) {
      out += char;
      i += 1;
      let inClass = false;
      for (; i < source.length; i += 1) {
        const inner = source[i];
        out += inner;
        if (inner === "\\") {
          out += source[i + 1] ?? "";
          i += 1;
        } else if (inner === "[") {
          inClass = true;
        } else if (inner === "]") {
          inClass = false;
        } else if (inner === "/" && !inClass) {
          break;
        } else if (inner === "\n") {
          break; // not a regex after all — bail rather than run away
        }
      }
      lastSignificant = "/";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    if (char.trim() !== "") lastSignificant = char;
    out += char;
  }

  return out;
}

// The next declaration, or the end of this one: at depth 0 a blank line or a
// line opening with a declaration keyword is where a brace-less alias without a
// terminating semicolon stops. Without this, `type Bare = string` followed by a
// function swallows that function's body and is reported as a competing shape.
const NEXT_DECLARATION =
  /^[^\S\n]*(\n|export\b|import\b|declare\b|async\b|function\b|class\b|enum\b|const\b|let\b|var\b|type\b|interface\b|$)/;

// Every `type X = ...` and `interface X { ... }` in a file, with its body taken
// by brace matching rather than a regex — a nested object would end a lazy
// `{[^}]*}` early and let a duplicated shape through. A brace-less alias (the
// kind union is one) ends at its semicolon, at the next declaration, or at a
// closing brace it never opened, whichever comes first.
function declarations(file: string): Declaration[] {
  const source = withoutComments(
    readFileSync(path.join(repositoryRoot, file), "utf8"),
  );
  const found: Declaration[] = [];

  for (const match of source.matchAll(
    /\b(?:type|interface)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;

    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "{") depth += 1;
      else if (char === "}") {
        // A closer this declaration never opened: its body ended before it.
        if (depth === 0) break;
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      } else if (depth === 0) {
        if (char === ";") break;
        if (char === "\n" && NEXT_DECLARATION.test(source.slice(end + 1)))
          break;
      }
    }

    found.push({ file, name: match[1], body: source.slice(start, end) });
  }

  return found;
}

const ERROR_KINDS = ["load", "create", "update", "delete"] as const;

// A Todo shape by any name: a declaration that spells out the copy field, the
// Completion Status and the timestamp itself instead of importing `Todo`. The
// timestamp is matched in both spellings — `epics.md:509` writes `created_at`,
// so that is what an author copying from the epic would reach for.
function isTodoShape({ name, body }: Declaration): boolean {
  if (name === "Todo") return true;
  return [
    /\btext\s*[?]?\s*:/,
    /\bcompleted\s*[?]?\s*:/,
    /\bcreated(A|_a)t\s*[?]?\s*:/,
  ].every((field) => field.test(body));
}

// An error-envelope shape by any name: an `error` key wrapping a `kind`, or a
// declaration that re-spells the kind union. The union check is set-based, not
// ordered — the four kinds re-listed alphabetically are the same duplication.
function isErrorEnvelopeShape({ name, body }: Declaration): boolean {
  if (name === "ErrorKind" || name === "ErrorEnvelope") return true;
  if (/\berror\s*[?]?\s*:\s*\{[\s\S]*?\bkind\s*[?]?\s*:/.test(body))
    return true;
  return ERROR_KINDS.every((kind) => new RegExp(`["']${kind}["']`).test(body));
}

describe("AD-3 — the contract is the single definition (AC1, AC2, AC6)", () => {
  const everyDeclaration = sourceFiles("").flatMap(declarations);
  const inside = (file: string) =>
    file.startsWith(`${CONTRACT_DIRECTORY}${path.sep}`) ||
    file === CONTRACT_DIRECTORY;

  it("finds the contract's own declarations, so the scan cannot pass vacuously", () => {
    const own = everyDeclaration.filter((declaration) =>
      inside(declaration.file),
    );

    expect(
      own.filter(isTodoShape).map((declaration) => declaration.name),
    ).toContain("Todo");
    expect(
      own.filter(isErrorEnvelopeShape).map((declaration) => declaration.name),
    ).toEqual(expect.arrayContaining(["ErrorKind", "ErrorEnvelope"]));
  });

  it("finds no Todo shape declared anywhere outside src/shared/contract/", () => {
    const elsewhere = everyDeclaration
      .filter((declaration) => !inside(declaration.file))
      .filter(isTodoShape)
      .map(({ file, name }) => ({ file, name }));

    expect(
      elsewhere,
      `a competing Todo shape: ${JSON.stringify(elsewhere)} — import @/shared/contract/todo instead`,
    ).toEqual([]);
  });

  it("finds no error-envelope shape declared anywhere outside src/shared/contract/", () => {
    const elsewhere = everyDeclaration
      .filter((declaration) => !inside(declaration.file))
      .filter(isErrorEnvelopeShape)
      .map(({ file, name }) => ({ file, name }));

    expect(
      elsewhere,
      `a competing error envelope: ${JSON.stringify(elsewhere)} — import @/shared/contract/errors instead`,
    ).toEqual([]);
  });
});

describe("the duplication detectors themselves", () => {
  // The scan above passes when nothing outside the directory matches, so a
  // detector that stopped matching anything would pass too. These cases are
  // what keep the two predicates honest, on synthetic declarations rather than
  // on files, so no probe has to be left in the tree.
  const declaration = (name: string, body: string): Declaration => ({
    file: "src/client/todos/probe.ts",
    name,
    body,
  });

  it("recognises a Todo shape whatever it is called and however the timestamp is spelled", () => {
    expect(
      isTodoShape(declaration("Todo", "{ id: string }")),
      "the name alone is enough",
    ).toBe(true);
    expect(
      isTodoShape(
        declaration(
          "Row",
          "{ id: string; text: string; completed: boolean; createdAt: string }",
        ),
      ),
    ).toBe(true);
    // `epics.md:509` writes `created_at`, so this is the likelier drift.
    expect(
      isTodoShape(
        declaration(
          "TodoRow",
          "{ id: string; text: string; completed: boolean; created_at: string }",
        ),
      ),
    ).toBe(true);
    expect(
      isTodoShape(
        declaration(
          "Optional",
          "{ text?: string; completed?: boolean; createdAt?: string }",
        ),
      ),
    ).toBe(true);
  });

  it("leaves a declaration that is not a Todo shape alone", () => {
    expect(isTodoShape(declaration("Bare", " = string"))).toBe(false);
    expect(
      isTodoShape(declaration("Props", "{ todo: Todo; onDelete: () => void }")),
    ).toBe(false);
    expect(
      isTodoShape(
        declaration("Partial", "{ text: string; completed: boolean }"),
      ),
    ).toBe(false);
  });

  it("recognises the kind union in any order and the envelope under any name", () => {
    expect(isErrorEnvelopeShape(declaration("ErrorKind", " = never"))).toBe(
      true,
    );
    expect(
      isErrorEnvelopeShape(
        declaration("Kind", ' = "load" | "create" | "update" | "delete"'),
      ),
    ).toBe(true);
    // Alphabetical is the same duplication, so order must not matter.
    expect(
      isErrorEnvelopeShape(
        declaration(
          "ApiErrorKind",
          ' = "create" | "delete" | "load" | "update"',
        ),
      ),
    ).toBe(true);
    expect(
      isErrorEnvelopeShape(
        declaration("Banner", "{ error: { kind: string; message: string } }"),
      ),
    ).toBe(true);
  });

  it("leaves a declaration that is neither a union nor an envelope alone", () => {
    expect(
      isErrorEnvelopeShape(declaration("Partial", ' = "load" | "create"')),
    ).toBe(false);
    expect(
      isErrorEnvelopeShape(
        declaration("Slot", "{ kind: ErrorKind; retry: () => void }"),
      ),
    ).toBe(false);
    expect(isErrorEnvelopeShape(declaration("Bare", " = string"))).toBe(false);
  });
});

// The spec's frozen `Always` block, not AC4: "the module holds exactly the
// three things `ARCHITECTURE-SPINE.md:263` names". AC4 is the no-`any` row
// below, and nothing more.
describe("the contract directory holds exactly the three things SPINE:263 names", () => {
  const files = readdirSync(
    path.join(repositoryRoot, CONTRACT_DIRECTORY),
  ).sort();

  it("is three modules and their two colocated test files", () => {
    expect(files).toEqual([
      "contract.test.ts",
      "errors.ts",
      "todo.ts",
      "validation.test.ts",
      "validation.ts",
    ]);
  });

  it("contains no `any` (AC4)", () => {
    const offenders = files
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) =>
        /\bany\b/.test(
          withoutComments(
            readFileSync(
              path.join(repositoryRoot, CONTRACT_DIRECTORY, file),
              "utf8",
            ),
          ),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("emits no runtime value from todo.ts or errors.ts", () => {
    // The frozen `Decided` note: the directory's only runtime exports are the
    // cap and the predicate, both asserted in `validation.test.ts`. These two
    // modules are types, so their namespaces are empty at run time.
    expect(Object.keys(todoContract)).toEqual([]);
    expect(Object.keys(errorsContract)).toEqual([]);
  });

  it("names nothing from the banned vocabulary (SPINE 'Domain vocabulary')", () => {
    const banned = /\b(Done|task|item|isDone|title|status|content)\b/;
    const offenders = files
      // This file is the one exception: it carries the banned words as the
      // assertion data on this very line, which is the opposite of using them.
      .filter((file) => file !== "contract.test.ts")
      // Comments stripped, as the `any` scan already does. The rule is about
      // what the contract *names*, not what its prose explains: `todo.ts`
      // survived only because it writes "Completion Status" with a capital S
      // and this regex is case-sensitive, so one lowercase "status" in a
      // sentence would have failed the suite for no real reason.
      .filter((file) =>
        banned.test(
          withoutComments(
            readFileSync(
              path.join(repositoryRoot, CONTRACT_DIRECTORY, file),
              "utf8",
            ),
          ),
        ),
      );

    expect(offenders).toEqual([]);
  });
});
