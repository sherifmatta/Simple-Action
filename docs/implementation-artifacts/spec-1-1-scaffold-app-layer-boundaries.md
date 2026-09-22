---
title: 'Story 1.1 — Scaffold the application with its layer boundaries enforced'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' # empty tree — the repository has no commits yet
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository is empty. Every later story assumes a Next.js application whose client/server seam already holds — but the product ships as one deployable, which makes that seam a convention rather than a wall. If it is not enforced by tooling on the first commit, AD-1 and AD-2 become folklore that each feature is free to skip.

**Approach:** Scaffold the Next.js 16 / React 19 / TypeScript 6 application at the exact AR-20 source tree, pin the stack, and encode AD-1, AD-2 and the closed dependency graph as lint rules that fail the build. Nothing user-visible ships — `app/page.tsx` is a placeholder Story 1.7 replaces.

## Boundaries & Constraints

**Always:**
- Layers map to directories one-to-one, exactly as AR-20 lists them. `app/` and `middleware.ts` sit at the repository root as siblings of `src/` — not `src/app/`.
- Lint violations for AD-1 and AD-2 must contain the literal strings `AD-1` and `AD-2` in the message.
- TypeScript `strict: true`; files and directories kebab-case.
- TypeScript must be pinned so `npm install` can never resolve 7.x. `latest` is 7.0.2 today, and it drops the JavaScript Compiler API the Next.js default backend calls into, failing with a misleading "required package(s) are not installed".

**Never:**
- No schema, Drizzle client, repository, contract, identity or cookie work — Stories 1.2–1.6 own those. This story creates the directories, not their contents.
- No design tokens, no Poppins, no card, no styling beyond what the scaffold emits.
- No Server Actions and no `'use server'` anywhere.
- No deploy, Neon project, `.env.example` or README work — Story 1.8 owns those.
- No Playwright install, no `playwright.config`, no e2e test — deferred to Epic 6.

**Decisions (human-confirmed, 2026-09-21):**
- **Scaffold via `create-next-app@16.3.5 --ts --tailwind --eslint --app --no-src-dir`**, then apply the AR-19 pins and strip the emitted demo boilerplate (default page content, sample SVGs, starter README, sample CSS) and reshape its ESLint config into the four boundary rules. This settles AR-1's 🚨 open flag for this story.
- **Vitest 5.x is installed and configured here; Playwright is not.** Story 1.5 is the first consumer of Vitest and must be able to write its test without stopping to set up a runner. `e2e/` exists as a `.gitkeep` placeholder until Epic 6 fills it.

## I/O & Edge-Case Matrix

Each row is a temporary probe file the implementer creates to prove the rule fires, then deletes.

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Clean start | Clean checkout | `npm install && npm run dev` serves a page; `npm run typecheck` reports no errors |
| Component fetches | `fetch()` in `src/client/components/` or `app/` | `npm run lint` exits non-zero; message names `AD-1` |
| Hook fetches | `fetch()` in `src/client/todos/` | `npm run lint` passes — query hooks are the sanctioned `fetch` site |
| Drizzle client leaks | Drizzle client imported in `app/api/probe/route.ts` | `npm run lint` exits non-zero; message names `AD-2` |
| Schema builds tables | `drizzle-orm/pg-core` imported in `src/server/db/` | `npm run lint` passes — the restriction is the client, not the table builders |
| Server reaches into client | `src/server/` imports from `src/client/` | `npm run lint` exits non-zero |
| Server Action declared | `'use server'` in any file | `npm run lint` exits non-zero |

</frozen-after-approval>

## Code Map

The repository contains no source. Everything below is new. Planning inputs are already distilled here — do not re-read unless a conflict appears:

- `docs/implementation-artifacts/epic-1-context.md` -- compiled Epic 1 constraints; the authority for this story
- `docs/planning-artifacts/epics.md:331-351` -- Story 1.1's seven ACs, verbatim
- `.../ARCHITECTURE-SPINE.md:71-81` -- AD-1 and AD-2 rule text, the source of the lint messages
- `.../ARCHITECTURE-SPINE.md:248-275` -- the source tree AR-20 encodes, with per-directory comments

Verified on npm 2026-09-21: `next@16.3.5`, `react`/`react-dom@19.3.0`, `typescript@6.0.3`, `tailwindcss@4.3.3`, `eslint@10.11.0`, `vitest@5.0.1`, `@playwright/test@1.62.1`. Local Node is v24.19.0.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- scaffold and pin `next`, `react`, `react-dom`, `typescript` to AR-19; define `dev`, `build`, `lint`, `typecheck` -- AC1, AC2
- [x] `tsconfig.json` -- `strict: true` plus a `@/*` → `src/*` path alias, so the import-boundary rules match on a stable specifier -- AC1
- [x] `.nvmrc`, `package.json#engines` -- pin Node 24 so a contributor on another major fails fast rather than mysteriously
- [x] AR-20 tree -- `middleware.ts`, `app/`, `src/shared/contract/`, `src/client/{todos,feedback,components}/`, `src/server/{identity,repository,db}/`, `drizzle/`, `e2e/`; `.gitkeep` in each otherwise-empty directory, since git does not track empty directories -- AC7
- [x] `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/` -- strip the scaffold's demo content (sample page markup, SVG assets, starter CSS, starter README) down to minimal placeholders that render and typecheck; Stories 1.2 and 1.7 replace them -- AC1
- [x] `middleware.ts` -- pass-through with a matcher; Story 1.6 gives it the identity cookie -- AC7
- [x] `eslint.config.mjs` -- the four boundary rules; see Design Notes for scoping -- AC3–AC6
- [x] `.gitignore` -- ignore `node_modules`, `.next`, `.env*`, so no secret can be committed by accident
- [x] `vitest.config.mts`, `package.json#scripts.test` -- install Vitest 5.x and wire a `test` script resolving the `@/*` alias, so Story 1.5 can write its first unit test without setting up a runner
- [x] probes (temporary) -- one per I/O Matrix row; run `npm run lint`, confirm each outcome, delete every probe -- AC3–AC6

**Acceptance Criteria:**
- Given the installed tree, when versions are inspected, then `next` is 16.3.x, `react` is 19.3.x, `typescript` is 6.x, and no 7.x TypeScript appears in the lockfile.
- Given the repository root, when the layout is compared to AR-20, then every directory it names exists **and is tracked by git**.
- Given the final state with all probes removed, when `npm run lint` runs, then it exits zero.

### Review Findings

_Code review 2026-09-21 — four layers (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor) over the full Epic 1 diff._

- [x] [Review][Patch] AD-2 deny-list is not default-deny — three holes the config header promises are closed [eslint.config.mjs:60-93, 95-108] — (a) bare `drizzle-orm` is unwalled: the group lists `drizzle-orm/**`, which does not match the package root; (b) the `!drizzle-orm/pg-core` re-allow lives in the shared pattern object used by every block, so *any* file may import pg-core — `schema.ts:8`'s comment claims the exemption is scoped to `src/server/db/`, and it is not; (c) `noDrizzleDynamicImport`'s regex anchors `^` only to the first alternation branch and omits `./client`, so `import("./client")` is allowed while the static form is denied. Verified against the real config.
- [x] [Review][Patch] `app/` pages and layouts are not walled off `src/server/` [eslint.config.mjs:199-210] — the block omits `noServerImport`, justified by a comment about route handlers; but route handlers are already carved out by `ignores: [within("app/api")]`. As written, `app/page.tsx` may import the repository and query the database from a Server Component, bypassing the route-handler hop AR-24 mandates. No fixture covers this case.
- [x] [Review][Patch] The baseline block — the only AD-1/AD-2 wall over root-level and `e2e/` files — has no violation fixture [eslint.config.test.ts:37-200] — all 23 fixtures use paths matched by a later block that fully restates the rules. Demonstrated: blanking the baseline block's `rules` leaves all 23 fixtures green while root-level and `e2e/` files lose the wall entirely. This is the exact "FULL RESTATEMENT" rot that eslint.config.mjs:17-22 names this file as the defence against.
- [x] [Review][Patch] `boundaryMessages` passes vacuously when a fixture fails to parse or is globally ignored [eslint.config.test.ts:1345-1350] — every `allows $name` exemption case passes on zero messages without asserting the result is defined and non-fatal.
- [x] [Review][Patch] The fetch wall misses computed access and destructured rename [eslint.config.mjs:42-52] — `window["fetch"](url)` and `const { fetch: f } = globalThis` both pass; commit 16fc030 claims fetch aliasing is walled.
- [x] [Review][Patch] `coverage/**` is gitignored but absent from ESLint `globalIgnores` [eslint.config.mjs:137-146] — `CODE` includes `js`, so a coverage run leaves generated JS that `npm run lint --max-warnings=0` will walk and fail the build gate on.
- [x] [Review][Patch] middleware matcher does not exclude extensionless `/api` or `/_next`, and has no test [middleware.ts:14] — `/((?!api/|_next/|.*\..*).*)` requires the trailing slash, so bare `/api` is matched. Dormant while middleware is a pass-through; live the moment Story 1.6 mints cookies there, contrary to AD-17. The matcher is the one non-trivial invariant in this diff with no test pinning it. `deferred-work.md` already routes the `middleware.ts` → `proxy.ts` rename to Story 1.6 — fix the matcher in the same step.
- [x] [Review][Patch] `app/api/` is named by AR-20, by two ESLint config blocks and by six fixtures, but does not exist in the tree [app/] — spec-1-1's restated AC7 requires every AR-20 directory to exist and be git-tracked. (epics.md's narrower AC7 list *is* satisfied, so this is a contradiction internal to this spec.)
- [x] [Review][Defer] Nothing runs `npm test` automatically [package.json:10] — deferred: no CI workflow, no git hooks, no husky/lint-staged; `build` (what Vercel runs) is `lint && typecheck && next build` and skips tests. Every guard in this epic — 23 ESLint fixtures, the token scan, the AD-2 scan, the contract scan — runs only when a human types `npm test`. Graded **high**. Deferred to Story 1.8, which establishes the deploy path and owns the `DATABASE_URL` secret a CI job needs.

**Rejected**

- `createClientIdentity` returns `undefined` typed as `ClientIdentity` (raised by three layers) — `low`. A successful `INSERT ... RETURNING` always yields a row and a failure throws; no reachable path was demonstrated. The fix adds a guard for state never shown to occur. Consistent with this spec's prior triage #11.
- Housekeeping nits — devDependency carets beside exact pins, no `packageManager` field, `tsconfig` `target: ES2017`, `next.config.ts` left at boilerplate, no README — `low`, and Story 1.8 owns the README and the reproducibility story.

## Implementation Notes

**Flat config resolves rules last-match-wins, not merge-wins.** The four boundary
rules cannot simply be four independent config blocks. ESLint flat config picks a
rule's options from the *last* matching config object and discards earlier ones,
so the repository-wide `'use server'` block would have silenced the `app/**` fetch
block, and the `src/server/**` client-import block would have silenced AD-2 for
every server file outside the repository. `eslint.config.mjs` therefore hoists the
selectors and import groups into shared constants and restates them in every block
that would otherwise override a neighbour. Probes were run for both override cases
(`'use server'` inside `app/` and `src/client/components/`; the Drizzle client
inside `src/server/identity/`) as well as for the seven I/O Matrix rows.

**ESLint stays on 9.x, not the 10.11.0 the Code Map lists as current.** ESLint 10
was installed first; `eslint-config-next@16.3.5` pulls `eslint-plugin-react@7.37.5`,
which crashes on it (`contextOrFilename.getFilename is not a function`), and `npm ls`
reports an invalid tree because four of the config's plugins declare `eslint <= 9`
peers. Pinned `^9.39.5` — the scaffold's own choice. npm prints a "no longer
supported" deprecation warning for it; that is cosmetic and is the price of a lint
run that works at all. Revisit when `eslint-config-next` ships ESLint 10 peers.
AR-19 does not pin ESLint, so no architectural decision is being overridden.

**`vitest.config.mts`, not `.ts`.** Vitest 5 loads the config through Vite's native
loader and warns that a `.ts` config using ESM syntax is being read as CommonJS.
The `.mts` extension silences it and is already covered by `tsconfig.json#include`.

**`middleware.ts` is deprecated by Next 16.3 in favour of `proxy.ts`.** Both `next dev`
and `next build` print a migration notice. AC7 and AR-20 name `middleware.ts`
literally, so it stays; it still runs (the build output labels it `ƒ Proxy (Middleware)`).
Story 1.6 should confirm whether the architecture wants to follow the rename before
it puts the identity cookie there.

**`AGENTS.md` and `CLAUDE.md` at the root are generated by Next, not by hand.**
`create-next-app` was run with `--no-agents-md`, but `next dev` and `next build`
re-create both files on every run and say so in their own text ("Removing it from a
diff only re-creates the uncommitted change"). They are committed rather than
fought. `agentRules: false` in `next.config.ts` would disable them if the project's
own agent instructions ever need the filename back.

**`app/api/` was not created.** The task list and AC7 enumerate the directories this
story owns, and `app/api/` is not among them; it was created only as a probe
location and deleted with the other probes. Story 1.4 or the first route-handler
story creates it for real.

**`app/favicon.ico` was deleted** along with the sample SVGs — it is the Next.js
logo, which is demo branding rather than this product's.

## Spec Change Log

## Review Triage Log

Pass 1 — layers: blind-hunter, edge-case-hunter, verification-gap. All claims re-verified in this session with probe files against the real toolchain.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Drizzle client reachable by relative import (`../db/client`) | high | Probe `src/server/identity/p1.ts` linted clean; the `@/`-aliased twin errored in the same run. `no-restricted-imports` matches the literal specifier. | patch (1) |
| 2 | Only two Drizzle drivers restricted | high | `drizzle-orm/postgres-js` linted clean from `src/server/identity/`. | patch (1) |
| 3 | Raw `pg`/`postgres` unrestricted | high | `import pg from "pg"` linted clean outside the repository. AD-2's intent is "the repository is the only code that touches the database". | patch (1) |
| 4 | No client→server wall at all | high | `src/client/components/p4.tsx` importing `@/server/repository/todos` linted clean. The config walls server→client only, so the most load-bearing arrow in AR-24 is unguarded. | patch (1) |
| 5 | fetch ban covers two hardcoded subdirs, not `src/client/` | high | `src/client/p5.tsx` and `src/client/layout/p6.tsx` both linted clean. AC3 is written against "a module under `src/client/` or `app/`". | patch (1) |
| 6 | fetch ban evaded by aliasing and dynamic import | medium | `const f = fetch; f(url)` and `await import("@/server/db/client")` both linted clean from `src/client/components/`. | patch (1) |
| 7 | Boundary globs omit `.js`/`.jsx` while `allowJs: true` | medium | tsconfig allows JS; the rule blocks match only `.ts`/`.tsx`. | patch (1) |
| 8 | `src/shared/` may import either layer | medium | Bare-specifier Drizzle import was caught, but no block walls shared→client/server generally. Couples both sides through the contract. | patch (1) |
| 9 | Route handlers cannot fetch outbound without a disable | low | `app/api/**` is inside the component fetch ban, but route handlers are not components. No external service is in scope, so harm is latent. | patch (1) |
| 10 | Lint gates nothing — `next build` runs no ESLint | high | `npm run build` exited **0** with a live AD-1 violation present (`typecheck` 0, `lint` 1, `build` 0, zero AD-1 mentions in the build log). Next 16 removed `next lint`. Contradicts the frozen Intent's "lint rules that fail the build". | patch (2) |
| 11 | No executable test pins the four rules | high | Pre-verified gap finding. Zero `*.test.*` in the repo; flat config is last-match-wins, so a later block re-declaring `no-restricted-syntax` silently disarms a boundary with no error and no diff signal. Green tree proves nothing. | patch (3) |
| 12 | `npm test` cannot fail and only looks in `src/` | high | `include` omits `app/**` and the repo root, so route-handler tests are never collected; `--passWithNoTests` makes an inert suite indistinguishable from a passing one. | patch (3) |
| 13 | `.env.example` is silently gitignored | medium | `git check-ignore -v .env.example` → `.gitignore:34:.env*`. Story 1.8 must commit a template for the sole required secret. | patch (4) |
| 14 | Node pin does not fail fast | medium | No `.npmrc` exists; npm treats `engines` as an `EBADENGINE` warning. The task's stated purpose was to fail fast. | patch (5) |
| 15 | Vitest promises DOM tests it cannot run | medium | `include` lists `*.test.tsx` while `environment: "node"` and no jsdom/happy-dom is installed. | patch (3) |
| 16 | `lint` script lacks `--max-warnings=0` | low | AC is "lint exits zero"; warnings would accumulate invisibly. Zero warnings today, so latent. | patch (6) |
| 17 | middleware matcher contradicts its own comment | low | Verified by regex: `/api-docs` is **excluded** (lookahead lacks a trailing slash) while `/robots.txt` and `/_next/data/x.json` **run** middleware, despite the comment claiming "never static assets". Matters when Story 1.6 mints credentials here. | patch (7) |
| 18 | Agent-context files carry none of this repo's rules | medium | `AGENTS.md` holds only Next's generated block; kebab-case, `strict: true`, the four boundaries and "no Server Actions" are written nowhere for future agents. | defer (fix edits agent-context files) |
| 19 | `middleware.ts` deprecated by Next 16.3 in favour of `proxy.ts` | low | Build and dev print a migration notice. AC7 and AR-20 name `middleware.ts` literally, so it stays this story. | defer (Story 1.6 owns the rename) |
| 20 | `.mjs` config files never typechecked | low | `allowJs: true` but `include` omits `**/*.mjs`. Config files are JS by design; harm negligible. | rejected (low, negligible) |

No `intent_gap` and no `bad_spec` entries — every surviving fix is a config or script correction that adds no public surface and guards only behaviour the probes demonstrated. No loopback triggered.

**Pass 1 resolution — findings 1–17 patched, each re-probed.**

The common root cause behind 1–9 was that every rule was an *enumeration* of the
evasions someone had already thought of, so anything unlisted linted clean.
`eslint.config.mjs` is now default-deny and carries a header saying so:

- **AD-2 (1, 2, 3, 6)** — `drizzle-orm/**` restricted wholesale with `pg-core` and
  `sql` re-allowed by negation, so a driver nobody has heard of is walled the day
  it ships; raw `pg`, `postgres`, `@neondatabase/**` and `@vercel/postgres` added;
  `**/db/client` and `./client` cover the relative paths; and two
  `ImportExpression` selectors close dynamic import, including a computed
  specifier. Re-probed: `../db/client` from `src/server/identity/`,
  `drizzle-orm/postgres-js`, `import pg from "pg"`, and
  `import("@/server/db/client")` from `src/client/components/` all error with a
  message containing `AD-2`; `drizzle-orm/pg-core` from `src/server/db/` and the
  client from `src/server/repository/` stay clean.
- **AD-1 fetch (5, 6, 7, 9)** — scope inverted to `src/client/**` with
  `ignores: src/client/todos/**`, so a new subdirectory is walled by default;
  globs extended to `js,jsx,mjs,cjs,ts,tsx,mts,cts`; `no-restricted-globals` added
  for the `const f = fetch` alias; `app/api/**` exempted, since route handlers are
  not components. Re-probed: `src/client/p5.tsx`, `src/client/components/p7.jsx`
  and `app/api-fetch-check.ts` all error; `src/client/todos/` and `app/api/` are clean.
- **Missing walls (4, 8)** — `src/client/**` may no longer import `@/server/**`
  (with `!next/**` so `next/server` still resolves), and `src/shared/**` is walled
  off both layers. `app/**` is deliberately left able to reach the server: route
  handlers call the repository.

**Finding 11 produced `eslint.config.test.ts`**, 23 cases driving `ESLint#lintText`
over a violating and an allowed fixture per rule, asserting the ruleId and the
literal `AD-1`/`AD-2`, and covering the three deliberate exemptions. It is
mutation-tested: appending a later `no-restricted-imports` block over
`src/client/**` — the exact last-match-wins trap — makes two cases fail.

**Finding 10** — `build` is now `npm run lint && npm run typecheck && next build`.
Verified: with a violating component in the tree, `npm run build` exits 1 and
prints the AD-1 message. Findings 12 and 15: Vitest `include` widened to
`["*.test.ts", "src/**/*.test.ts", "app/**/*.test.ts"]`, `*.test.tsx` dropped until
a DOM environment is installed, `--passWithNoTests` removed now that a real suite
exists (verified a test under `app/api/` is collected). Finding 13: `!.env.example`
added (verified `git check-ignore` now exits 1 for it and 0 for `.env.local`).
Finding 14: `.npmrc` with `engine-strict=true` (verified a wrong Node major exits 1
instead of warning). Finding 16: `--max-warnings=0`. Finding 17: matcher tightened
to `/((?!api/|_next/|.*\..*).*)` — verified `/` and `/api-docs` now run middleware
while `/api/todos`, `/_next/data/x.json`, `/robots.txt` and `/favicon.ico` do not.

Findings 18 and 19 remain deferred as routed; 20 remains rejected.

## Design Notes

The four rules are core-ESLint rules in a flat config, so no plugin owns the boundary and the message text stays under our control:

```js
// AD-2: restrict the Drizzle *client*, not the table builders.
{
  files: ['**/*.{ts,tsx}'],
  ignores: ['src/server/repository/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['drizzle-orm/node-postgres', 'drizzle-orm/neon-*', '@/server/db/client'],
      message: 'AD-2: only src/server/repository/ may import the Drizzle client.' }]}]}
}
```

`drizzle-orm/pg-core` stays unrestricted — Story 1.3's schema needs it. AD-1 is `no-restricted-syntax` on `CallExpression[callee.name='fetch']`, scoped to `app/**`, `src/client/components/**` and `src/client/feedback/**` but **not** `src/client/todos/**`, where `fetch` belongs. AC5 is a `no-restricted-imports` pattern on `@/client/*` scoped to `src/server/**`; AC6 is a `no-restricted-syntax` selector on the `'use server'` literal, applied everywhere.

## Verification

**Commands:**
- `npm install` -- expected: completes; `npm ls typescript` shows 6.x and no 7.x
- `npm run typecheck` -- expected: exits zero under `strict: true`
- `npm run dev` -- expected: serves a page on localhost; stop once confirmed
- `npm run lint` -- expected: exits zero with probes removed, non-zero with each probe present
- `npm test` -- expected: Vitest starts and reports no test files found (not a crash, and not a config error)

**Manual checks:**
- `git status --short` after adding `.gitkeep` files -- every AR-20 directory appears as tracked, proving AC7 survives a fresh clone rather than only existing on this machine.
