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
  const [result] = await eslint.lintText(code, {
    filePath,
    warnIgnored: false,
  });

  // Without these two guards every `allows $name` case passes on an empty
  // message list — which is also what a fixture that failed to parse, or one
  // whose path is globally ignored, produces. The exemption half of this
  // suite would then prove nothing at all.
  if (result === undefined) {
    throw new Error(
      `ESLint returned no result for ${filePath} — the fixture was ignored rather than linted.`,
    );
  }
  const fatal = result.messages.filter((message) => message.fatal === true);
  if (fatal.length > 0) {
    throw new Error(
      `${filePath} failed to parse, so no rule ran: ${JSON.stringify(fatal)}`,
    );
  }

  return result.messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  );
}

type Violation = {
  name: string;
  filePath: string;
  code: string;
  ruleId: string;
  names: "AD-1" | "AD-2" | "AD-12" | null;
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

// --- Cases added by the 2026-09-21 code review ------------------------------
// Each of these passed before the rule it exercises was tightened.

const reviewViolations: Violation[] = [
  {
    // `drizzle-orm/**` never matched the package root, so the namespace the
    // header calls default-deny had an unwalled entrypoint.
    name: "AD-2: shared code imports the bare drizzle-orm package root",
    filePath: "src/shared/contract/probe.ts",
    code: `import { eq } from "drizzle-orm";\nexport const probe = eq;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    // The pg-core re-allow used to live in the shared pattern object, which
    // made it an exemption for every file in the repository.
    name: "AD-2: a component imports the pg-core table builders",
    filePath: "src/client/components/probe.ts",
    code: `import { pgTable } from "drizzle-orm/pg-core";\nexport const probe = pgTable;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    // The static deny-list carries `./client`; the dynamic selector did not.
    name: "AD-2: a sibling module dynamically imports ./client",
    filePath: "src/server/identity/probe.ts",
    code: `export const probe = () => import("./client");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-2",
  },
  {
    // Route handlers are carved out by `ignores`, so pages and layouts get no
    // exemption from the closed graph.
    name: "Graph: an app/ page imports the repository directly",
    filePath: "app/probe/page.tsx",
    code: `import { findClientIdentityByTokenHash } from "@/server/repository/client-identity";\nexport default function Page() {\n  return findClientIdentityByTokenHash;\n}\n`,
    ruleId: "no-restricted-imports",
    names: null,
  },
  {
    // Nothing below the baseline block matches a repository-root file, so
    // this is the only fixture that pins the baseline's AD-2 entry.
    name: "AD-2: a root-level module imports the Drizzle client",
    filePath: "probe.ts",
    code: `import { drizzle } from "drizzle-orm/neon-http";\nexport const probe = drizzle;\n`,
    ruleId: "no-restricted-imports",
    names: "AD-2",
  },
  {
    // Same for e2e/ — matched by the baseline block and nothing else.
    name: "AD-1: an e2e/ helper declares a Server Action",
    filePath: "e2e/probe.ts",
    code: `"use server";\n\nexport const probe = 1;\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-1: a component reaches fetch through a computed member",
    filePath: "src/client/components/probe.ts",
    code: `export const probe = () => window["fetch"]("/api/todos");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
  {
    name: "AD-1: a component destructures fetch off globalThis",
    filePath: "src/client/components/probe.ts",
    code: `const { fetch: f } = globalThis;\nexport const probe = () => f("/api/todos");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-1",
  },
];

violations.push(...reviewViolations);

// --- Cases added by Story 1.7 (AD-12, one live region one announcer) --------
// `announce(message, urgency)` is only the single announcing function AD-12
// names for as long as nothing else can mount a live region of its own. These
// fixtures are what make that a wall rather than a comment.

const ariaLiveViolations: Violation[] = [
  {
    name: "AD-12: a component declares its own aria-live",
    filePath: "src/client/components/probe.tsx",
    code: `export function Probe() {\n  return <div aria-live="polite" />;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: an app/ page declares its own aria-live",
    filePath: "app/probe/page.tsx",
    code: `export default function Page() {\n  return <p aria-live="assertive">saved</p>;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    // A sibling of the exempt file, so the exemption is proved to be
    // file-scoped rather than directory-scoped.
    name: "AD-12: another module in src/client/feedback/ declares aria-live",
    filePath: "src/client/feedback/probe.tsx",
    code: `export function Probe() {\n  return <span aria-live="polite" />;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    // The query-hook block is a separate config object, so it needs its own
    // restatement of the rule — and therefore its own fixture.
    name: "AD-12: a query hook declares aria-live",
    filePath: "src/client/todos/probe.tsx",
    code: `export function Probe() {\n  return <div aria-live="polite" />;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    // The JSX selector cannot see a props object built as a literal.
    name: "AD-12: aria-live reaches the DOM through a props object",
    filePath: "src/client/components/probe.ts",
    code: `export const probe = { "aria-live": "polite" };\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: a root-level module declares aria-live",
    filePath: "probe.tsx",
    code: `export const probe = <div aria-live="polite" />;\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
];

violations.push(...ariaLiveViolations);

// The implicit live regions. `role="alert"`, `role="status"` and `role="log"`
// each carry an implied `aria-live`, so they are the way a second live region
// arrives without the word `aria-live` appearing anywhere. The error-banner
// mockup uses exactly this, which is why these fixtures exist before the
// banner does.

const implicitLiveRegionViolations: Violation[] = [
  {
    name: "AD-12: a component uses role=alert, an implicit live region",
    filePath: "src/client/components/probe.tsx",
    code: `export function Probe() {\n  return <div role="alert">failed</div>;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: a component uses role=status",
    filePath: "src/client/components/probe.tsx",
    code: `export function Probe() {\n  return <div role="status">saved</div>;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: a component uses role=log",
    filePath: "src/client/components/probe.tsx",
    code: `export function Probe() {\n  return <div role="log" />;\n}\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: role=alert reaches the DOM through a props object",
    filePath: "src/client/components/probe.ts",
    code: `export const probe = { role: "alert" };\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
  {
    name: "AD-12: aria-live is set imperatively",
    filePath: "src/client/components/probe.ts",
    code: `export const probe = (node: Element) => node.setAttribute("aria-live", "polite");\n`,
    ruleId: "no-restricted-syntax",
    names: "AD-12",
  },
];

violations.push(...implicitLiveRegionViolations);

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
    name: "the schema, and only the schema, may import the pg-core table builders",
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
  {
    // Only the three live-region roles are denied. Banning `role` outright
    // would make the rule an obstacle to ARIA rather than a wall around
    // announcements.
    name: "a non-live-region role is untouched",
    filePath: "src/client/components/probe.tsx",
    code: `export function Probe() {\n  return <div role="dialog" />;\n}\n`,
  },
  {
    // The exemption is keyed to this exact path. If the announcer is ever
    // moved or renamed without moving the config block, this case fails —
    // which is the point.
    name: "the announcer, and only the announcer, may declare aria-live",
    filePath: "src/client/feedback/announcer.tsx",
    code: `export function Probe() {\n  return (\n    <>\n      <div aria-live="polite" />\n      <div aria-live="assertive" />\n    </>\n  );\n}\n`,
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
