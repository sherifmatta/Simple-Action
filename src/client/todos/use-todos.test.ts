import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Covers epics.md Story 2.2 AC1 and AC3.
//
// `useTodos` is a React hook, and no DOM is installed — so what is checked here
// is the wiring, parsed from the real AST the way `app/layout.test.ts` and
// `src/client/providers.test.ts` do. What the query *does* is proved against a
// live `QueryClient` in `todo-list-query.test.ts`.
//
// AC3 is a claim about the whole codebase and about every story still to be
// written, so it is a tree scan, like AD-8's in `providers.test.ts`.

const repositoryRoot = process.cwd();
const USE_TODOS_FILE = path.join("src", "client", "todos", "use-todos.ts");

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

// The called name, with any qualifier stripped: `useState` for both `useState(…)`
// and `React.useState(…)`. Comparing `node.expression.getText()` to the bare
// name — which this did — misses every namespaced form, so a Todo held in
// `React.useState<Todo[]>([])` evaded the AD-8 scan below entirely.
function calleeName(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  const target = node.expression;
  if (ts.isPropertyAccessExpression(target)) return target.name.getText(sourceFile);
  if (ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression)) {
    return target.argumentExpression.text;
  }
  return target.getText(sourceFile);
}

function calls(sourceFile: ts.SourceFile, callee: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && calleeName(node, sourceFile) === callee) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

describe("the one query hook (AC1)", () => {
  const source = readFileSync(
    path.join(repositoryRoot, USE_TODOS_FILE),
    "utf8",
  );
  const sourceFile = parse(USE_TODOS_FILE, source);

  it("is a Client Component module, because a hook cannot run on the server", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("calls useQuery exactly once, with the shared options and nothing inline", () => {
    const useQueryCalls = calls(sourceFile, "useQuery");
    expect(useQueryCalls).toHaveLength(1);

    const [argument, ...rest] = useQueryCalls[0].arguments;
    expect(rest).toHaveLength(0);
    // An identifier, not an object literal: a second options object here is how
    // the key, the retry policy and the network mode drift away from the ones
    // Epics 3 through 5 write against.
    expect(ts.isIdentifier(argument)).toBe(true);
    expect(argument.getText(sourceFile)).toBe("todoListQueryOptions");
  });

  it("calls no other query or mutation hook — the list is one read", () => {
    for (const hook of ["useSuspenseQuery", "useQueries", "useMutation"]) {
      expect(calls(sourceFile, hook)).toHaveLength(0);
    }
  });
});

// --- AC3: no server-derived Todo data in React state ------------------------
// AD-8: server state lives in the query cache and nowhere else. A `useState`
// holding Todos is the second source of truth that makes an optimistic
// mutation's rollback in Epics 3 to 5 correct in the cache and wrong on screen.

/**
 * `useState`/`useReducer` calls that mention a Todo, by type or by name.
 *
 * The type check is the strong half: `Todo` is the single definition of a Todo
 * (`contract.test.ts` keeps it so), and a typed holder cannot avoid naming it.
 * The name check covers the inferred forms — `useState(todos)`,
 * `useState(todoList)`, `useState(useTodos().data)` — and is a proxy rather
 * than a proof: an untyped holder under an unrelated name still slips past.
 * It deliberately errs towards catching too much. `todoDraft` tripping this in
 * a later story costs a rename or an argued exemption; a Todo list living
 * quietly in React state costs an optimistic rollback that is right in the
 * cache and wrong on screen.
 */
function todoStateOffences(fileName: string, code: string): string[] {
  const sourceFile = parse(fileName, code);
  const offences: string[] = [];

  for (const hook of ["useState", "useReducer"]) {
    for (const call of calls(sourceFile, hook)) {
      const typeArguments = (call.typeArguments ?? [])
        .map((argument) => argument.getText(sourceFile))
        .join(", ");
      const valueArguments = call.arguments
        .map((argument) => argument.getText(sourceFile))
        .join(", ");

      const mentionsTodo =
        /\bTodo\b/.test(typeArguments) ||
        // `todos`, `todoList`, `todosById` — a word starting with `todo`,
        // ending at a boundary or at a camelCase hump.
        /\btodos?(\b|[A-Z_])/i.test(valueArguments) ||
        /\buseTodos\b/.test(valueArguments);

      if (mentionsTodo) {
        offences.push(call.getText(sourceFile));
      }
    }
  }

  return offences;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

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
  "e2e",
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
    if (entry.name.includes(".test.")) return [];
    return [relativePath];
  });
}

describe("AD-8 — the key has one declaration site (AC1)", () => {
  it("is declared in query-keys.ts and nowhere else", () => {
    // The lint rule matches the identifier by *name*, and `providers.test.ts`
    // checks that a file naming `queryKey` mentions `TODOS_QUERY_KEY` — both
    // of which a local `const TODOS_QUERY_KEY = ["todo-list"]` satisfies while
    // being the second key AD-8 forbids. No `no-restricted-syntax` selector
    // can see scope, so the declaration site is pinned here instead.
    const declarations = sourceFiles("").filter((file) =>
      /\b(?:const|let|var|function|class)\s+TODOS_QUERY_KEY\b/.test(
        readFileSync(path.join(repositoryRoot, file), "utf8"),
      ),
    );

    expect(declarations).toEqual([
      path.join("src", "client", "todos", "query-keys.ts"),
    ]);
  });
});

describe("AD-8 — no server-derived Todo data in React state (AC3)", () => {
  it("holds no Todo in useState or useReducer, anywhere", () => {
    const offenders = sourceFiles("")
      .map((file) => ({
        file,
        offences: todoStateOffences(
          file,
          readFileSync(path.join(repositoryRoot, file), "utf8"),
        ),
      }))
      .filter(({ offences }) => offences.length > 0);

    expect(
      offenders,
      `AD-8 keeps server state in the query cache only; these hold Todos in React state: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("would catch each way of holding one, so the assertion above is not vacuous", () => {
    const planted = [
      `const [todos, setTodos] = useState<Todo[]>([]);`,
      `const [list, setList] = useState(todos);`,
      `const [state, dispatch] = useReducer(reducer, todoList);`,
      `const [one, setOne] = useState<Todo | null>(null);`,
      `const [rows, setRows] = useState(useTodos().data ?? []);`,
      // The namespaced forms. These are the ones a bare-name comparison misses,
      // and they are ordinary React — nothing stops a later story writing them.
      `const [todos, setTodos] = React.useState<Todo[]>([]);`,
      `const [state, dispatch] = React.useReducer(reducer, todoList);`,
    ];
    for (const code of planted) {
      expect(todoStateOffences("probe.tsx", code), code).toHaveLength(1);
    }

    // The near-miss the trade above is made against, asserted rather than
    // left for a later story to discover: a draft-input name beginning with
    // `todo` trips this scan. Epic 3's input should name its state `text` or
    // `draft` — or argue the exemption here.
    expect(
      todoStateOffences("probe.tsx", `const [t, setT] = useState(todoText);`),
    ).toHaveLength(1);

    // Client-only state is untouched: AD-8 sends the Filter View, the dialog
    // flag and the character count to React state deliberately.
    const allowed = [
      `const [filter, setFilter] = useState<FilterView>("all");`,
      `const [open, setOpen] = useState(false);`,
      `const [text, setText] = useState("");`,
    ];
    for (const code of allowed) {
      expect(todoStateOffences("probe.tsx", code), code).toHaveLength(0);
    }
  });
});
