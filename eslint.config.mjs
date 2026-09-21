import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The boundary rules below are the wall that makes AD-1, AD-2 and the closed
// dependency graph of ARCHITECTURE-SPINE.md enforceable rather than remembered.
// They are core-ESLint rules on purpose: no plugin owns the boundary, and the
// message text stays under our control.
//
// Two properties this file must keep:
//
//  1. DEFAULT-DENY. An enumeration of forbidden module specifiers is a list of
//     the ways someone already thought of. Each group below denies a namespace
//     and re-allows the few entrypoints that are genuinely safe, so a new
//     driver or a new directory is walled the day it appears.
//
//  2. FULL RESTATEMENT. Flat config resolves a rule to the LAST matching config
//     object rather than merging entries, so a block that re-declares
//     `no-restricted-imports` or `no-restricted-syntax` for files an earlier
//     block already covers silently disarms that earlier block. Every block
//     therefore restates every entry that applies to its files. `eslint.config.test.ts`
//     is what stops that invariant from rotting: it drives the ESLint Node API
//     over one violating and one allowed fixture per rule.

const CODE = "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
const within = (dir) => `${dir}/**/${CODE}`;

// --- AD-1: Server Actions are used nowhere in this codebase. -----------------

const noUseServerDirective = {
  selector: "ExpressionStatement > Literal[value='use server']",
  message:
    "AD-1: Server Actions are not used in this codebase. Every client-server interaction goes through a REST route handler under app/api/.",
};

// --- AD-1: UI components never call `fetch`. --------------------------------
// The query hooks under src/client/todos/ are the one sanctioned fetch site.

const NO_FETCH =
  "AD-1: components never call fetch. Go through a query hook in src/client/todos/, which calls a route handler under app/api/.";

const noComponentFetchSyntax = [
  { selector: "CallExpression[callee.name='fetch']", message: NO_FETCH },
  {
    selector: "CallExpression[callee.property.name='fetch']",
    message: NO_FETCH,
  },
];

// Catches aliasing — `const f = fetch; f(url)` — which a call-expression
// selector cannot see.
const noComponentFetchGlobal = ["error", { name: "fetch", message: NO_FETCH }];

// --- AD-2: only src/server/repository/ may import the Drizzle client. --------
// Deny the whole drizzle-orm namespace and every raw Postgres driver, then
// re-allow the pure schema/SQL entrypoints Story 1.3's schema needs.

const AD_2 = "AD-2: only src/server/repository/ may import the Drizzle client.";

const noDrizzleClientImport = {
  group: [
    "drizzle-orm/**",
    "!drizzle-orm/pg-core",
    "!drizzle-orm/pg-core/**",
    "!drizzle-orm/sql",
    "!drizzle-orm/sql/**",
    // Raw drivers are the same wall by another name.
    "pg",
    "pg/**",
    "postgres",
    "postgres/**",
    "@neondatabase/**",
    "@vercel/postgres",
    "@vercel/postgres/**",
    // This project's own client module, by alias or by any relative path.
    "@/server/db/client",
    "@/server/db/client.*",
    "**/db/client",
    "**/db/client.*",
    "./client",
    "./client.*",
  ],
  message: AD_2,
};

// `import()` is an expression, so no-restricted-imports never sees it.
const noDrizzleDynamicImport = [
  {
    selector:
      "ImportExpression[source.value=/^(drizzle-orm\\/|pg$|postgres$|@neondatabase\\/|@vercel\\/postgres$)|db\\/client$/]",
    message: AD_2,
  },
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: `${AD_2} A dynamic import with a computed specifier walks around that wall — use a static import.`,
  },
];

// --- The closed dependency graph --------------------------------------------
// client -> route handler -> server, never back; shared couples to neither.

const noClientImport = {
  group: ["@/client", "@/client/**", "**/client/**"],
  message:
    "Dependency graph: nothing outside src/client/ may import from it. The graph runs client -> route handler -> server, never back.",
};

const noServerImport = {
  group: [
    "@/server",
    "@/server/**",
    "**/server/**",
    // next/server is the Next.js runtime, not this project's server layer.
    "!next/**",
  ],
  message:
    "Dependency graph: client and shared code may not import from src/server/. Go through a route handler under app/api/.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This project:
    "node_modules/**",
    "drizzle/**",
  ]),

  // Baseline — every file in the repository.
  {
    files: [`**/${CODE}`],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": ["error", { patterns: [noDrizzleClientImport] }],
    },
  },

  // src/client/ — components and everything that is not a query hook.
  {
    files: [within("src/client")],
    ignores: [within("src/client/todos")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
        ...noComponentFetchSyntax,
      ],
      "no-restricted-globals": noComponentFetchGlobal,
      "no-restricted-imports": [
        "error",
        { patterns: [noDrizzleClientImport, noServerImport] },
      ],
    },
  },

  // src/client/todos/ — the sanctioned fetch site. Still walled off the server.
  {
    files: [within("src/client/todos")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [noDrizzleClientImport, noServerImport] },
      ],
    },
  },

  // app/ — pages and layouts are components. Route handlers are not, and they
  // legitimately call into src/server/, so app/ is not walled off the server.
  {
    files: [within("app")],
    ignores: [within("app/api")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
        ...noComponentFetchSyntax,
      ],
      "no-restricted-globals": noComponentFetchGlobal,
      "no-restricted-imports": ["error", { patterns: [noDrizzleClientImport] }],
    },
  },

  // app/api/ — route handlers: fetch is fine here, the Drizzle client is not.
  {
    files: [within("app/api")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": ["error", { patterns: [noDrizzleClientImport] }],
    },
  },

  // src/shared/ — imported by both sides, so it may couple to neither.
  {
    files: [within("src/shared")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [noDrizzleClientImport, noClientImport, noServerImport] },
      ],
    },
  },

  // src/server/ — everything but the repository.
  {
    files: [within("src/server")],
    ignores: [within("src/server/repository")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [noDrizzleClientImport, noClientImport] },
      ],
    },
  },

  // src/server/repository/ — the one module allowed to hold the Drizzle client.
  {
    files: [within("src/server/repository")],
    rules: {
      "no-restricted-syntax": ["error", noUseServerDirective],
      "no-restricted-imports": ["error", { patterns: [noClientImport] }],
    },
  },
]);

export default eslintConfig;
