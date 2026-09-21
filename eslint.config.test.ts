import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The boundary rules in eslint.config.mjs are this story's entire deliverable,
// and flat config resolves rules last-match-wins: a later story adding a
// plausible `no-restricted-*` block for files an existing block already covers
// disarms that block silently — no error, no warning, green tree either way.
// These cases are the only thing that turns that into a failing test.

const BOUNDARY_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-restricted-globals",
]);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function boundaryMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? []).filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  );
}

type Violation = {
  name: string;
  filePath: string;
  code: string;
  ruleId: string;
  names: "AD-1" | "AD-2" | null;
};

const violations: Violation[] = [
  {
    name: "AD-1: a component calls fetch",
    filePath: "src/client/components/probe.tsx",
    code: `export async function Probe() {\n  await fetch("/api/todos");\n  return null;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-1: a brand-new src/client/ subdirectory calls fetch",
    filePath: "src/client/widgets/probe.ts",
    code: `export async function probe() {\n  await fetch("/api/todos");\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-1: a component aliases fetch instead of calling it",
    filePath: "src/client/components/probe.ts",
    code: `const f = fetch;\nexport const probe = () => f("/api/todos");\n`,
    ruleId: "no-restricted-globals",
    names: "AD-1",
  },
  {
    name: "AD-1: an app/ page calls fetch",
    filePath: "app/probe/page.tsx",
    code: `export default async function Page() {\n  await fetch("/api/todos");\n  return null;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-1: a Server Action is declared",
    filePath: "src/shared/contract/probe.ts",
    code: `"use server";\n\nexport const probe = 1;\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-2: a route handler imports the node-postgres client",
    filePath: "app/api/todos/route.ts",
    code: `import { drizzle } from "drizzle-orm/node-postgres";\nexport const probe = drizzle;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: a driver nobody enumerated (postgres-js)",
    filePath: "src/server/identity/probe.ts",
    code: `import { drizzle } from "drizzle-orm/postgres-js";\nexport const probe = drizzle;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the raw pg driver",
    filePath: "src/server/identity/probe.ts",
    code: `import pg from "pg";\nexport const probe = pg;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the Neon serverless driver this project actually uses",
    filePath: "src/server/identity/probe.ts",
    code: `import { neon } from "@neondatabase/serverless";\nexport const probe = neon;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the neon-http client entrypoint, from a route handler",
    filePath: "app/api/todos/route.ts",
    code: `import { drizzle } from "drizzle-orm/neon-http";\nexport const probe = drizzle;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the repository's own client module, by alias",
    filePath: "src/server/identity/probe.ts",
    code: `import { db } from "@/server/repository/client";\nexport const probe = db;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the repository client reached by a relative path",
    filePath: "src/server/identity/probe.ts",
    code: `import { db } from "../repository/client";\nexport const probe = db;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the repository client by dynamic import",
    filePath: "src/server/identity/probe.ts",
    code: `export const probe = async () => import("@/server/repository/client");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-2",
  },
  {
    name: "AD-2: the repository client by dynamic import, carrying a file extension",
    filePath: "src/server/identity/probe.ts",
    code: `export const probe = async () => import("@/server/repository/client.js");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-2",
  },
  {
    name: "AD-2: the db client reached by a relative path",
    filePath: "src/server/identity/probe.ts",
    code: `import { db } from "../db/client";\nexport const probe = db;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    name: "AD-2: the db client reached by dynamic import",
    filePath: "src/server/identity/probe.ts",
    code: `export const probe = async () => import("drizzle-orm/node-postgres");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-2",
  },
  {
    name: "AD-2: a computed dynamic import specifier",
    filePath: "src/server/identity/probe.ts",
    code: `const where = "drizzle-orm/node-postgres";\nexport const probe = async () => import(where);\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-2",
  },
  {
    name: "graph: src/server/ imports from src/client/",
    filePath: "src/server/identity/probe.ts",
    code: `import { useTodos } from "@/client/todos/use-todos";\nexport const probe = useTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    name: "graph: src/server/repository/ imports from src/client/",
    filePath: "src/server/repository/probe.ts",
    code: `import { useTodos } from "@/client/todos/use-todos";\nexport const probe = useTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    name: "graph: a component imports the repository",
    filePath: "src/client/components/probe.tsx",
    code: `import { listTodos } from "@/server/repository/todos";\nexport const probe = listTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    name: "graph: a query hook imports the repository",
    filePath: "src/client/todos/probe.ts",
    code: `import { listTodos } from "@/server/repository/todos";\nexport const probe = listTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    name: "graph: src/shared/ imports from src/client/",
    filePath: "src/shared/contract/probe.ts",
    code: `import { useTodos } from "@/client/todos/use-todos";\nexport const probe = useTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    name: "graph: src/shared/ imports from src/server/",
    filePath: "src/shared/contract/probe.ts",
    code: `import { listTodos } from "@/server/repository/todos";\nexport const probe = listTodos;\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
];

const exemptions: { name: string; filePath: string; code: string }[] = [
  {
    name: "a query hook is the sanctioned fetch site",
    filePath: "src/client/todos/use-todos.ts",
    code: `export const probe = async () => (await fetch("/api/todos")).json();\n`,
  },
  {
    name: "a route handler may call fetch",
    filePath: "app/api/todos/route.ts",
    code: `export async function GET() {\n  return fetch("https://example.test");\n}\n`,
  },
  {
    name: "the schema may import the pg-core table builders",
    filePath: "src/server/db/schema.ts",
    code: `import { pgTable, text } from "drizzle-orm/pg-core";\nexport const probe = pgTable("probe", { text: text("text") });\n`,
  },
  {
    name: "the repository may import the Drizzle client",
    filePath: "src/server/repository/todos.ts",
    code: `import { drizzle } from "drizzle-orm/node-postgres";\nimport { db } from "../db/client";\nexport const probe = [drizzle, db];\n`,
  },
  {
    name: "the repository may import the Neon driver and its own client module",
    filePath: "src/server/repository/todos.ts",
    code: `import { neon } from "@neondatabase/serverless";\nimport { drizzle } from "drizzle-orm/neon-http";\nimport { db } from "./client";\nexport const probe = [neon, drizzle, db];\n`,
  },
  {
    name: "a route handler may import the repository",
    filePath: "app/api/todos/route.ts",
    code: `import { listTodos } from "@/server/repository/todos";\nexport const probe = listTodos;\n`,
  },
  {
    name: "client code may import next/server",
    filePath: "src/client/components/probe.ts",
    code: `import { NextResponse } from "next/server";\nexport const probe = NextResponse;\n`,
  },
];

describe("boundary rules", () => {
  it.each(violations)(
    "rejects $name",
    async ({ filePath, code, ruleId, names }) => {
      const messages = await boundaryMessages(filePath, code);
      const matching = messages.filter((m) => m.ruleId === ruleId);

      expect(
        matching,
        `expected ${ruleId} on ${filePath}, got ${JSON.stringify(messages)}`,
      ).not.toHaveLength(0);

      if (names !== null) {
        expect(matching.map((m) => m.message).join("\n")).toContain(names);
      }
    },
    30_000,
  );

  it.each(exemptions)(
    "allows $name",
    async ({ filePath, code }) => {
      const messages = await boundaryMessages(filePath, code);
      expect(
        messages,
        `expected no boundary violation on ${filePath}, got ${JSON.stringify(messages)}`,
      ).toHaveLength(0);
    },
    30_000,
  );
});
