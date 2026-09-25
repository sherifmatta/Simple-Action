import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { clientIdentity } from "@/server/db/schema";
import { db } from "./client";
import * as clientIdentityRepository from "./client-identity";
import {
  createClientIdentity,
  findClientIdentityByTokenHash,
} from "./client-identity";

// Matrix rows covered here (spec-1-4-establish-the-repository-as-the-only-database-module.md,
// frozen `## I/O & Edge-Case Matrix`) — every row:
//   - "Lookup hits"            live, against the Neon branch DATABASE_URL points at
//   - "Lookup misses"          live
//   - "Create succeeds"        live
//   - "Create collides"        live
//   - "Only-importer boundary" static: the source scan below, plus the AD-2
//                              fixtures in eslint.config.test.ts, which drive
//                              the real ESLint over repository-shaped and
//                              non-repository-shaped files
//   - "Repository scope"       static: the exported surface and the directory
//   - "Missing DATABASE_URL"   the client module re-imported with it unset
//
// The four live rows need `DATABASE_URL` and a network: `vitest.config.mts`
// puts the variable in the test process, and `npm test` no longer runs offline.
// Every row this file inserts is removed in `afterAll`.

const REPOSITORY_DIRECTORY = "src/server/repository";

// ---------------------------------------------------------------------------
// Live rows
// ---------------------------------------------------------------------------

describe(`${REPOSITORY_DIRECTORY}/client-identity.ts — against the live branch (AC2)`, () => {
  const insertedIds: string[] = [];

  function freshIdentity() {
    const id = randomUUID();
    insertedIds.push(id);
    // Not a real SHA-256 hash — 32 hex characters behind a `test-` prefix,
    // unique per call so concurrent runs against the same branch cannot collide
    // with each other. The column is plain text and neither function inspects
    // the value, so only uniqueness matters here. The `test-` prefix is what
    // the leftover-row check keys on when the branch is inspected by hand.
    return { id, tokenHash: `test-${randomUUID().replaceAll("-", "")}` };
  }

  afterAll(async () => {
    if (insertedIds.length > 0) {
      await db
        .delete(clientIdentity)
        .where(inArray(clientIdentity.id, insertedIds));
    }
  });

  it("createClientIdentity inserts the row and returns it (matrix row 'Create succeeds')", async () => {
    const { id, tokenHash } = freshIdentity();

    const created = await createClientIdentity(id, tokenHash);

    expect(created.id).toBe(id);
    expect(created.tokenHash).toBe(tokenHash);
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it("findClientIdentityByTokenHash returns the stored identity (matrix row 'Lookup hits')", async () => {
    const { id, tokenHash } = freshIdentity();
    await createClientIdentity(id, tokenHash);

    const found = await findClientIdentityByTokenHash(tokenHash);

    expect(found?.id).toBe(id);
    expect(found?.tokenHash).toBe(tokenHash);
  });

  it("findClientIdentityByTokenHash returns undefined when no row carries the hash — a normal first visit, not a failure (matrix row 'Lookup misses')", async () => {
    const absent = `test-absent-${randomUUID().replaceAll("-", "")}`;

    await expect(
      findClientIdentityByTokenHash(absent),
    ).resolves.toBeUndefined();
  });

  it("createClientIdentity rejects on a token hash already stored rather than silently no-opping (matrix row 'Create collides')", async () => {
    const { id, tokenHash } = freshIdentity();
    await createClientIdentity(id, tokenHash);

    // Registered for cleanup before the attempt: if the unique constraint ever
    // stopped rejecting, the row this creates must still be removed.
    const collidingId = randomUUID();
    insertedIds.push(collidingId);

    // Named, not just "some error": a connection failure or a typo'd column
    // would otherwise satisfy a bare `.rejects.toThrow()`. Drizzle wraps the
    // driver error in its own "Failed query" message, so the constraint and
    // the SQLSTATE sit on the cause rather than the top-level message.
    await expect(
      createClientIdentity(collidingId, tokenHash),
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "client_identity_token_hash_unique",
      },
    });

    // The rejected create must not have landed a row under its own id either.
    const rows = await db
      .select()
      .from(clientIdentity)
      .where(inArray(clientIdentity.id, [collidingId]));
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Missing DATABASE_URL
// ---------------------------------------------------------------------------

describe(`${REPOSITORY_DIRECTORY}/client.ts — configuration (matrix row 'Missing DATABASE_URL')`, () => {
  it("throws at module load, naming DATABASE_URL, when the variable is unset", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    try {
      // The module registry was reset, so this re-evaluates client.ts rather
      // than handing back the instance the rest of this file holds.
      await expect(import("./client")).rejects.toThrow(/DATABASE_URL/);
    } finally {
      if (saved !== undefined) {
        process.env.DATABASE_URL = saved;
      }
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// Static rows
// ---------------------------------------------------------------------------

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

// Kept in step with the identical set in src/shared/contract/contract.test.ts.
// The two were copy-pasted and had already drifted: `out` and `build` were
// missing here, so a stale build directory made this AD-2 scan walk emitted
// JavaScript and report it as an illegal database importer.
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

// `eslint.config.test.ts` carries forbidden specifiers as fixture *strings* —
// they are the AD-2 wall's own test data, and that file drives real ESLint over
// them rather than importing anything. It is the one source file this textual
// scan cannot read literally.
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

// `from "x"`, `import("x")`, `require("x")` and the bare side-effect
// `import "x"` — the four ways a specifier reaches a module graph. The
// side-effect form takes no binding, so nothing in it says `from`.
const MODULE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

// Mirrors `noDrizzleClientImport` in eslint.config.mjs: deny the namespace,
// re-allow only the pure schema/SQL entrypoints the Drizzle schema needs.
function reachesTheDatabase(specifier: string): boolean {
  if (/^@neondatabase(\/|$)/.test(specifier)) return true;
  if (/^(pg|postgres|@vercel\/postgres)(\/|$)/.test(specifier)) return true;
  if (
    /^drizzle-orm\//.test(specifier) &&
    !/^drizzle-orm\/(pg-core|sql)(\/|$)/.test(specifier)
  ) {
    return true;
  }
  // This project's own client module, by alias or by any relative path.
  return (
    /^(\.|@\/server)/.test(specifier) &&
    /(^|\/)client(\.[a-z]+)?$/.test(specifier)
  );
}

function databaseImporters(): { file: string; specifier: string }[] {
  return sourceFiles("").flatMap((file) => {
    const source = readFileSync(path.join(repositoryRoot, file), "utf8");
    return [...source.matchAll(MODULE_SPECIFIER)]
      .map((match) => match[1])
      .filter(reachesTheDatabase)
      .map((specifier) => ({ file, specifier }));
  });
}

describe("AD-2 — the repository is the only code that touches the database (AC1)", () => {
  const importers = databaseImporters();

  it("finds the client's own driver imports, so the scan cannot pass vacuously", () => {
    const specifiers = importers
      .filter(
        (hit) => hit.file === path.join(REPOSITORY_DIRECTORY, "client.ts"),
      )
      .map((hit) => hit.specifier)
      .sort();
    expect(specifiers).toEqual([
      "@neondatabase/serverless",
      "drizzle-orm/neon-http",
    ]);
  });

  it("resolves the Drizzle client and its driver nowhere outside src/server/repository/", () => {
    const outside = importers.filter(
      (hit) => !hit.file.startsWith(`${REPOSITORY_DIRECTORY}${path.sep}`),
    );
    expect(
      outside,
      `unexpected database reach: ${JSON.stringify(outside)}`,
    ).toEqual([]);
  });
});

describe("repository scope — identity functions only (AC4, matrix row 'Repository scope')", () => {
  it("exports exactly the lookup and the create, both verb-first in the PRD's vocabulary (AC2)", () => {
    expect(Object.keys(clientIdentityRepository).sort()).toEqual([
      "createClientIdentity",
      "findClientIdentityByTokenHash",
    ]);
  });

  it("holds only the Todo functions whose stories have landed — Story 2.1 added the list", () => {
    // The test files are excluded on purpose: they name the forbidden symbols
    // as assertion data, which is the opposite of exporting them.
    const modules = readdirSync(
      path.join(repositoryRoot, REPOSITORY_DIRECTORY),
    ).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    // `todos.ts` joined the directory with Story 2.1's `listTodos`. This list
    // is a ratchet, not a ceiling: each of Epics 3 to 5 adds its function to
    // that same module, and none of them adds a third file.
    expect(modules.sort()).toEqual([
      "client-identity.ts",
      "client.ts",
      "todos.ts",
    ]);

    const source = modules
      .map((file) =>
        readFileSync(
          path.join(repositoryRoot, REPOSITORY_DIRECTORY, file),
          "utf8",
        ),
      )
      .join("\n");

    // `listTodos` left this list with Story 2.1, `createTodo` with Story 3.1,
    // `setTodoCompleted` with Story 4.1 and `deleteTodo` with Story 5.1 — each
    // story removed the function it consumed, and the list is now empty
    // because FR-1 to FR-5 have nothing left to ask for.
    //
    // So the ratchet turns over: what was a list of functions that must *not*
    // be here yet is now the list that must be, in the one module that may
    // hold them. A fifth Todo function, or any of these four appearing in a
    // second file, is what this now catches.
    for (const todoFunction of [
      "listTodos",
      "createTodo",
      "setTodoCompleted",
      "deleteTodo",
    ]) {
      expect(
        source.match(
          new RegExp(`export\\s+(async\\s+)?function\\s+${todoFunction}\\b`, "g"),
        ),
        `${todoFunction} is declared somewhere other than todos.ts, or not at all`,
      ).toHaveLength(1);
    }
  });
});
