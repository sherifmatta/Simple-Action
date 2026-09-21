import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { clientIdentity, todo } from "./schema";

// `getTableConfig`'s declared return type widens each column to the base
// `PgColumn` and each index column to `Partial<SQL | IndexedColumn>` — too
// loose to name `withTimezone`, `name` or `indexConfig` without a narrowing
// cast. These helpers do only that, for the runtime introspection below.
function withTimezoneFlag(column: unknown): boolean | undefined {
  return (column as { withTimezone?: boolean } | undefined)?.withTimezone;
}
function indexColumnInfo(column: unknown): { name?: string; order?: string } {
  const c = column as { name?: string; indexConfig?: { order?: string } };
  return { name: c.name, order: c.indexConfig?.order };
}

// Matrix rows covered here (spec-1-3-create-the-schema-and-the-first-committed-migration.md,
// frozen `## I/O & Edge-Case Matrix`):
//   - "Schema completeness"
//   - "Index presence"
//   - "Migration generation"
//   - "Push-script scope"
// The "Migration application" row needs a live Neon branch and is NOT here —
// it was verified once by hand against a human-supplied `DATABASE_URL` per
// the spec's Verification section, not re-run on every `npm test`.

describe("src/server/db/schema.ts — client_identity (AC1, AC7)", () => {
  const config = getTableConfig(clientIdentity);

  it("is named client_identity", () => {
    expect(config.name).toBe("client_identity");
  });

  it("has exactly the three columns AC1 specifies", () => {
    expect(config.columns.map((c) => c.name).sort()).toEqual(
      ["created_at", "id", "token_hash"].sort(),
    );
  });

  it("id is a uuid primary key with no DB-generated default", () => {
    const id = config.columns.find((c) => c.name === "id");
    expect(id?.columnType).toBe("PgUUID");
    expect(id?.primary).toBe(true);
    expect(id?.notNull).toBe(true);
    expect(id?.hasDefault).toBe(false);
  });

  it("token_hash is a unique, not-null text column", () => {
    const tokenHash = config.columns.find((c) => c.name === "token_hash");
    expect(tokenHash?.columnType).toBe("PgText");
    expect(tokenHash?.notNull).toBe(true);
    expect(tokenHash?.isUnique).toBe(true);
  });

  it("created_at is a not-null timestamptz defaulting to now()", () => {
    const createdAt = config.columns.find((c) => c.name === "created_at");
    expect(createdAt?.columnType).toBe("PgTimestamp");
    expect(createdAt?.notNull).toBe(true);
    expect(createdAt?.hasDefault).toBe(true);
    expect(withTimezoneFlag(createdAt)).toBe(true);
  });

  it("declares no index beyond the primary key", () => {
    expect(config.indexes).toHaveLength(0);
  });

  it("owns camelCase <-> snake_case mapping: JS keys are camelCase, DB names are snake_case (AC7)", () => {
    expect(Object.keys(clientIdentity)).toEqual(
      expect.arrayContaining(["id", "tokenHash", "createdAt"]),
    );
  });
});

describe("src/server/db/schema.ts — todo (AC1, AC2, AC3, AC7)", () => {
  const config = getTableConfig(todo);

  it("is named todo", () => {
    expect(config.name).toBe("todo");
  });

  it("has exactly the five columns AC1 specifies", () => {
    expect(config.columns.map((c) => c.name).sort()).toEqual(
      ["completed", "created_at", "id", "owner_id", "text"].sort(),
    );
  });

  it("id is a uuid primary key with no DB-generated default", () => {
    const id = config.columns.find((c) => c.name === "id");
    expect(id?.columnType).toBe("PgUUID");
    expect(id?.primary).toBe(true);
    expect(id?.notNull).toBe(true);
    expect(id?.hasDefault).toBe(false);
  });

  it("owner_id is a not-null uuid foreign key referencing client_identity.id, with no cascade policy (Design Notes: default NO ACTION)", () => {
    const ownerId = config.columns.find((c) => c.name === "owner_id");
    expect(ownerId?.columnType).toBe("PgUUID");
    expect(ownerId?.notNull).toBe(true);
    expect(config.foreignKeys).toHaveLength(1);
    const [fk] = config.foreignKeys;
    const reference = fk.reference();
    expect(reference.columns.map((c) => c.name)).toEqual(["owner_id"]);
    expect(reference.foreignColumns.map((c) => c.name)).toEqual(["id"]);
    expect(getTableConfig(reference.foreignTable).name).toBe("client_identity");
    expect(fk.onDelete).toBe("no action");
    expect(fk.onUpdate).toBe("no action");
  });

  it("the copy column is named `text`, matching the PRD glossary (AC2) — never title/content/task/item", () => {
    const forbidden = ["title", "content", "task", "item"];
    const names = config.columns.map((c) => c.name);
    expect(names).toContain("text");
    for (const bad of forbidden) {
      expect(names).not.toContain(bad);
    }
    const textColumn = config.columns.find((c) => c.name === "text");
    expect(textColumn?.columnType).toBe("PgText");
    expect(textColumn?.notNull).toBe(true);
  });

  it("completed is a not-null boolean defaulting to false", () => {
    const completed = config.columns.find((c) => c.name === "completed");
    expect(completed?.columnType).toBe("PgBoolean");
    expect(completed?.notNull).toBe(true);
    expect(completed?.hasDefault).toBe(true);
    expect(completed?.default).toBe(false);
  });

  it("created_at is a not-null timestamptz defaulting to now()", () => {
    const createdAt = config.columns.find((c) => c.name === "created_at");
    expect(createdAt?.columnType).toBe("PgTimestamp");
    expect(createdAt?.notNull).toBe(true);
    expect(createdAt?.hasDefault).toBe(true);
    expect(withTimezoneFlag(createdAt)).toBe(true);
  });

  it("declares exactly one index, (owner_id, id DESC), and it is not the unique/PK machinery (AC3)", () => {
    expect(config.indexes).toHaveLength(1);
    const [index] = config.indexes;
    expect(index.config.name).toBe("todo_owner_id_id_idx");
    expect(index.config.unique).toBe(false);
    expect(index.config.columns.map(indexColumnInfo)).toEqual([
      { name: "owner_id", order: "asc" },
      { name: "id", order: "desc" },
    ]);
    // Symmetric to client_identity's "declares no index beyond the primary
    // key" check: confirm the one index isn't shadowed by a second,
    // table-level unique constraint AC3 would also count against the limit.
    expect(config.uniqueConstraints).toHaveLength(0);
  });

  it("owns camelCase <-> snake_case mapping: JS keys are camelCase, DB names are snake_case (AC7)", () => {
    expect(Object.keys(todo)).toEqual(
      expect.arrayContaining(["id", "ownerId", "text", "completed", "createdAt"]),
    );
  });
});

describe("drizzle/ — the committed migration (AC4, matrix row 'Migration generation')", () => {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));

  it("has exactly one committed SQL migration file so far", () => {
    expect(sqlFiles).toHaveLength(1);
  });

  // Guarded rather than a bare `sqlFiles[0]!`: a missing migration file must
  // fail the assertion above with a clear message, not crash test collection
  // with a raw TypeError from `path.join(dir, undefined)` before any test runs.
  const sql = sqlFiles[0] ? readFileSync(path.join(drizzleDir, sqlFiles[0]), "utf8") : "";

  it("creates both tables", () => {
    expect(sql).toMatch(/CREATE TABLE "client_identity"/);
    expect(sql).toMatch(/CREATE TABLE "todo"/);
  });

  it("adds the owner_id -> client_identity(id) foreign key", () => {
    expect(sql).toMatch(
      /ALTER TABLE "todo" ADD CONSTRAINT .* FOREIGN KEY \("owner_id"\) REFERENCES "public"\."client_identity"\("id"\)/,
    );
  });

  it("declares the token_hash unique constraint", () => {
    expect(sql).toMatch(/CONSTRAINT "client_identity_token_hash_unique" UNIQUE\("token_hash"\)/);
  });

  it("contains exactly one CREATE INDEX statement: (owner_id, id DESC) on todo (matrix row 'Index presence')", () => {
    const createIndexStatements = sql.match(/CREATE (?:UNIQUE )?INDEX/g) ?? [];
    expect(createIndexStatements).toHaveLength(1);
    expect(sql).toMatch(
      /CREATE INDEX "todo_owner_id_id_idx" ON "todo" USING btree \("owner_id","id" DESC/,
    );
  });

  it("neither primary key takes a DB-generated default (no gen_random_uuid/uuid_generate default on id)", () => {
    expect(sql).not.toMatch(/"id" uuid PRIMARY KEY NOT NULL DEFAULT/);
  });
});

describe("package.json — push-script scope (AC6, matrix row 'Push-script scope')", () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts: Record<string, string>;
  };

  it("db:push is the only script that invokes drizzle-kit push", () => {
    const scriptsWithPush = Object.entries(packageJson.scripts)
      .filter(([, command]) => command.includes("drizzle-kit push"))
      .map(([name]) => name);
    expect(scriptsWithPush).toEqual(["db:push"]);
  });

  it("build and start do not invoke drizzle-kit push", () => {
    expect(packageJson.scripts.build).not.toMatch(/drizzle-kit push/);
    expect(packageJson.scripts.start).not.toMatch(/drizzle-kit push/);
  });

  it("db:generate invokes drizzle-kit generate, the only committed-migration source (AD-14)", () => {
    expect(packageJson.scripts["db:generate"]).toBe("drizzle-kit generate");
  });
});
