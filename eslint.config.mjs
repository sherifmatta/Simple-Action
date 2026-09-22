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
  // `window["fetch"](url)` — a computed member access, which the
  // property-name selector above cannot see.
  {
    selector: "MemberExpression[computed=true][property.value='fetch']",
    message: NO_FETCH,
  },
  // `const { fetch: f } = globalThis` — a destructured rename. The key is a
  // property, not a global reference, so no-restricted-globals misses it.
  {
    selector: "ObjectPattern > Property[key.name='fetch']",
    message: NO_FETCH,
  },
  {
    selector: "ObjectPattern > Property[key.value='fetch']",
    message: NO_FETCH,
  },
];

// Catches aliasing — `const f = fetch; f(url)` — which a call-expression
// selector cannot see.
const noComponentFetchGlobal = ["error", { name: "fetch", message: NO_FETCH }];

// --- AD-8: exactly one query key, `['todos']`. ------------------------------
// Story 1.7 declared the key once and proved the rule with source scans in
// `providers.test.ts`; `deferred-work.md` records putting it behind a lint
// rule as the first query hook's to own, because until Story 2.2 there was no
// call site to write the rule against. This is that rule.
//
// Scoped to `ObjectExpression >` so it sees an options object and not a
// destructuring pattern: `queryFn: ({ queryKey }) => …` is TanStack handing
// the key back, which is the rule being obeyed rather than broken. A shorthand
// `{ queryKey }` in an options object is still an error — a key read from a
// local variable is the drift AD-8 forbids, whatever the variable holds.

const AD_8 =
  "AD-8: there is exactly one query key. Import TODOS_QUERY_KEY from src/client/todos/query-keys and pass it as queryKey.";

// The cache methods that take the key *positionally* rather than in an options
// object. `setQueryData` is how every optimistic mutation in Epics 3 to 5
// writes to the cache, so leaving these to the property selectors below would
// wall the one form this codebase barely uses and leave the one it lives on
// open. Their first argument is always a query key, which is what lets the rule
// demand the constant itself rather than merely reject an array literal.
const POSITIONAL_KEY_METHODS =
  "/^(setQueryData|getQueryData|getQueryState|setQueryDefaults|getQueryDefaults)$/";

const noUnapprovedQueryKey = [
  {
    selector:
      "ObjectExpression > Property[key.name='queryKey']:not([value.name='TODOS_QUERY_KEY'])",
    message: AD_8,
  },
  // `{ "queryKey": … }` — a string key, which `key.name` cannot see.
  {
    selector:
      "ObjectExpression > Property[key.value='queryKey']:not([value.name='TODOS_QUERY_KEY'])",
    message: AD_8,
  },
  {
    selector: `CallExpression[callee.property.name=${POSITIONAL_KEY_METHODS}]:not([arguments.0.name='TODOS_QUERY_KEY'])`,
    message: AD_8,
  },
  // The same call after the method has been pulled off the client —
  // `const { setQueryData } = queryClient`.
  {
    selector: `CallExpression[callee.name=${POSITIONAL_KEY_METHODS}]:not([arguments.0.name='TODOS_QUERY_KEY'])`,
    message: AD_8,
  },
];

// --- AD-12: one live region, one announcer. ---------------------------------
// Exactly one polite and one assertive live region exist, and they are
// declared in src/client/feedback/announcer.tsx. Everything that wants to say
// something calls `announce(message, urgency)`. A second `aria-live` element
// does not fail loudly — it produces duplicate, colliding or silently dropped
// announcements, which is precisely the class of bug nobody notices without a
// screen reader, so the wall is a lint rule rather than a convention.

const AD_12 =
  "AD-12: no component declares its own aria-live. Exactly two live regions exist, in src/client/feedback/announcer.tsx; call announce(message, urgency) from useAnnounce() instead.";

const noAriaLive = [
  { selector: "JSXAttribute[name.name='aria-live']", message: AD_12 },
  // `createElement("div", { "aria-live": "polite" })`, a spread props object,
  // or a computed `{ ["aria-live"]: … }` — none of which is a JSXAttribute, so
  // the selector above cannot see any of them. The key is always a string
  // literal because `aria-live` is not a valid identifier, which is why there
  // is no `key.name` variant to match.
  { selector: "Property[key.value='aria-live']", message: AD_12 },
  // `el.setAttribute("aria-live", …)` — the imperative spelling, which is
  // neither a JSX attribute nor an object key.
  {
    selector:
      "CallExpression[callee.property.name='setAttribute'][arguments.0.value='aria-live']",
    message: AD_12,
  },
  // The implicit live regions. `role="alert"`, `role="status"` and
  // `role="log"` each carry an implied `aria-live` in ARIA, so they produce
  // exactly the duplicate and colliding announcements AD-12 forbids while
  // containing none of the text the selectors above look for. This is not
  // hypothetical: the error-banner mockup
  // (docs/planning-artifacts/ux-designs/…/mockups/key-states.html) is
  // `role="alert" aria-live="polite"`, so the story that builds the banner
  // will reach for it. The banner announces through `announce(message,
  // "assertive")` instead.
  ...["alert", "status", "log"].flatMap((role) => [
    {
      selector: `JSXAttribute[name.name='role'][value.value='${role}']`,
      message: AD_12,
    },
    {
      selector: `Property[key.name='role'][value.value='${role}']`,
      message: AD_12,
    },
    {
      selector: `Property[key.value='role'][value.value='${role}']`,
      message: AD_12,
    },
  ]),
];

// --- AD-2: only src/server/repository/ may import the Drizzle client. --------
// Deny the whole drizzle-orm namespace and every raw Postgres driver, then
// re-allow the pure schema/SQL entrypoints Story 1.3's schema needs.

const AD_2 = "AD-2: only src/server/repository/ may import the Drizzle client.";

// The package root is denied through `paths`, not here. `group` uses
// gitignore semantics, where a bare `drizzle-orm` entry also swallows
// everything beneath it — and a parent that is excluded can never be
// re-included, so listing it here would silently kill the `pg-core`
// re-allow below. `paths` matches the exact specifier and nothing else.
const drizzleRootPath = { name: "drizzle-orm", message: AD_2 };

const drizzleDenyList = [
  "drizzle-orm/**",
  // Raw drivers are the same wall by another name.
  "pg",
  "pg/**",
  "postgres",
  "postgres/**",
  "@neondatabase/**",
  "@vercel/postgres",
  "@vercel/postgres/**",
  // This project's own client module, by alias or by any relative path.
  // It lives at `src/server/repository/client` (Story 1.4) — `db/client` is
  // kept denied so the specifier is walled wherever it might be moved to.
  // Re-exporting `db` is the last way around this wall, and only the
  // repository can do it, which is what the whole boundary is for.
  "@/server/repository/client",
  "@/server/repository/client.*",
  "**/repository/client",
  "**/repository/client.*",
  "@/server/db/client",
  "@/server/db/client.*",
  "**/db/client",
  "**/db/client.*",
  "./client",
  "./client.*",
];

const noDrizzleClientImport = { group: drizzleDenyList, message: AD_2 };

// src/server/db/ builds the table definitions, so it — and only it — may
// reach the pure schema and SQL entrypoints. These negations live here rather
// than in the shared deny-list because a negation in the shared object is an
// exemption for every file in the repository, which is the opposite of what
// `schema.ts` documents.
const noDrizzleClientImportInSchema = {
  group: [
    ...drizzleDenyList,
    "!drizzle-orm/pg-core",
    "!drizzle-orm/pg-core/**",
    "!drizzle-orm/sql",
    "!drizzle-orm/sql/**",
  ],
  message: AD_2,
};

// `import()` is an expression, so no-restricted-imports never sees it.
const noDrizzleDynamicImport = [
  {
    selector:
      // The `client` tail makes the extension optional, mirroring the
      // `client.*` static patterns: a dynamically imported
      // `@/server/repository/client.js` is the same reach as the
      // extensionless form. Each alternative carries its own anchor — a
      // single leading `^` binds only to the first branch — and the bare
      // `drizzle-orm` root and the sibling `./client` form are both listed,
      // so this matches what the static deny-list above denies.
      "ImportExpression[source.value=/^(drizzle-orm($|\\/)|pg$|postgres$|@neondatabase\\/|@vercel\\/postgres$)|(^|\\/)(db|repository)\\/client(\\.[a-z]+)?$|^\\.{1,2}\\/client(\\.[a-z]+)?$/]",
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
    // `.gitignore` and both source scans already treat this as generated; a
    // coverage run otherwise leaves vendored JS for `--max-warnings=0` to
    // fail the build gate on.
    "coverage/**",
  ]),

  // Baseline — every file in the repository.
  {
    files: [`**/${CODE}`],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport],
        },
      ],
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
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
        ...noComponentFetchSyntax,
      ],
      "no-restricted-globals": noComponentFetchGlobal,
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noServerImport],
        },
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
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noServerImport],
        },
      ],
    },
  },

  // app/ — pages and layouts are components. Route handlers do call into
  // src/server/, but they are carved out by the `ignores` below and get their
  // own block, so pages and layouts stay walled off the server: a Server
  // Component querying the database directly skips the route-handler hop the
  // closed graph in AR-24 is built on.
  {
    files: [within("app")],
    ignores: [within("app/api")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
        ...noComponentFetchSyntax,
      ],
      "no-restricted-globals": noComponentFetchGlobal,
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noServerImport],
        },
      ],
    },
  },

  // app/api/ — route handlers: fetch is fine here, the Drizzle client is not.
  {
    files: [within("app/api")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport],
        },
      ],
    },
  },

  // src/shared/ — imported by both sides, so it may couple to neither.
  {
    files: [within("src/shared")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noClientImport, noServerImport],
        },
      ],
    },
  },

  // src/server/db/ — the schema. The one place the pure table-builder
  // entrypoints are reachable; the Drizzle client still is not.
  {
    files: [within("src/server/db")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImportInSchema, noClientImport],
        },
      ],
    },
  },

  // src/server/ — everything but the repository and the schema.
  {
    files: [within("src/server")],
    ignores: [within("src/server/repository"), within("src/server/db")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noClientImport],
        },
      ],
    },
  },

  // src/server/repository/ — the one module allowed to hold the Drizzle client.
  {
    files: [within("src/server/repository")],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noAriaLive,
        ...noUnapprovedQueryKey,
      ],
      "no-restricted-imports": ["error", { patterns: [noClientImport] }],
    },
  },

  // src/client/feedback/announcer.tsx — the one file that may declare
  // `aria-live`, because it is where the two live regions AD-12 permits are
  // declared. It must stay LAST: last-match-wins is what makes this an
  // exemption rather than a no-op, and everything the `src/client` block above
  // applies to this file is restated here minus `noAriaLive`.
  {
    files: ["src/client/feedback/announcer.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        noUseServerDirective,
        ...noUnapprovedQueryKey,
        ...noDrizzleDynamicImport,
        ...noComponentFetchSyntax,
      ],
      "no-restricted-globals": noComponentFetchGlobal,
      "no-restricted-imports": [
        "error",
        {
          paths: [drizzleRootPath],
          patterns: [noDrizzleClientImport, noServerImport],
        },
      ],
    },
  },
]);

export default eslintConfig;
