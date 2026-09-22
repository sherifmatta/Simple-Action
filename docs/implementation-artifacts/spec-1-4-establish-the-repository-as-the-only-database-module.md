---
title: 'Story 1.4 — Establish the repository as the only database module'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a9d9ce71595fd571817845f812c0582fd07c6ed0'
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/planning-artifacts/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/server/repository/` is an empty scaffolded directory holding only a `.gitkeep`. The schema and its migration exist (Story 1.3), but nothing in the codebase can reach the database: there is no Drizzle client anywhere, and no driver dependency. Story 1.6's middleware needs identity persistence before it can mint or resolve a Client Identity, and every route handler in Epics 2–5 assumes a repository is already there to call. Built per-feature instead, data access spreads into route handlers and AD-2's single clamping point for a future ownership or authentication check never exists.

**Approach:** Instantiate the Drizzle client inside `src/server/repository/` — the one directory `eslint.config.mjs` permits to hold it — and export exactly two identity functions from that module: a lookup by token hash and a create. No Todo functions, no route handlers, no middleware.

## Boundaries & Constraints

**Decided (human, at approval):**
- **Driver: `@neondatabase/serverless` over `drizzle-orm/neon-http`.** HTTP per query — no pool to exhaust on Vercel, no TCP handshake per invocation, Node and Edge both. Interactive `db.transaction()` is unavailable and is not needed: every query this product performs is single-statement, and `db.batch()` is the escape hatch if that ever changes. Moving to `drizzle-orm/neon-serverless` later is an import change, since the package is the same.
- **Repository tests hit the live Neon branch on every `npm test`.** `DATABASE_URL` is wired into the test process — Vitest reads no `.env` of its own, confirmed in this session — so lookup and create round-trips are covered by persisted tests from this story forward, and Epics 2–5 inherit that pattern. Tests remove the rows they insert. The trade accepted: `npm test` needs the secret and a network and no longer runs offline.

**Always:**
- The Drizzle client and the raw driver are imported only by files under `src/server/repository/`. That directory is the sole block in `eslint.config.mjs:247-254` without the `noDrizzleClientImport` restriction; every other block denies both namespaces. The boundary is already built — this story is the first code to sit inside it.
- Identity function names are verb-first and use the PRD's vocabulary (`Client Identity`, `token hash`): `findClientIdentityByTokenHash` and `createClientIdentity` (AC2).
- The lookup takes the already-hashed token; hashing lives in `src/server/identity/` and is Story 1.6's, not this story's.
- `createClientIdentity` receives an already-minted id — `schema.ts:11-13` records that neither primary key has a DB-generated default, and that `client_identity` ids are minted server-side in Story 1.6.
- `DATABASE_URL` is read at the repository's client module and nowhere else; an unset value fails with a clear message, matching `drizzle.config.ts:3-7`.
- kebab-case filenames; `strict: true`; no `any`.

**Never:**
- No Todo functions — `listTodos`, `createTodo`, `setTodoCompleted` and `deleteTodo` belong to the stories that consume them, in Epics 2–5 (AC4).
- No route handler, no `app/api/` directory, no middleware change, no identity hashing, no cookie logic — Stories 1.5–1.7 own those.
- No schema change and no new migration; `src/server/db/schema.ts` is Story 1.3's and stays as it is.
- No new or relaxed lint rule. If a boundary needs loosening to make this compile, the design is wrong.
- Never write "Done" in prose or identifiers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lookup hits | A `client_identity` row exists with that token hash | Returns that identity | N/A |
| Lookup misses | No row carries that token hash | Returns `undefined` — absence is a normal result, not a failure | N/A |
| Create succeeds | A fresh id and token hash | Inserts the row and returns the created identity | N/A |
| Create collides | Token hash already stored | Rejects — the unique constraint on `token_hash` surfaces, the caller is not handed a silent no-op | Error propagates to the caller |
| Only-importer boundary | Repository-shaped and non-repository-shaped source inspected | The Drizzle client and driver resolve only under `src/server/repository/` | Lint error elsewhere (AD-2) |
| Repository scope | Exported surface inspected | Identity functions only; no Todo function exists yet | N/A |
| Missing `DATABASE_URL` | Variable unset when the client module loads | Fails with a message naming `DATABASE_URL` | Throws at module load, not at first query |

</frozen-after-approval>

## Code Map

- `src/server/repository/` (holds only `.gitkeep`) -- this story's whole deliverable lands here; the `.gitkeep` goes once real files arrive, per Story 1.3's precedent.
- `eslint.config.mjs:54-97` -- the AD-2 wall: `noDrizzleClientImport`'s deny-list and the dynamic-import selectors. `:247-254` is the repository block, the only one omitting that restriction — so the client must live here and nowhere else.
- `eslint.config.test.ts:74-84,173-178` -- existing AD-2 fixtures driven through the ESLint Node API; the shape to follow if this story adds a boundary case.
- `src/server/db/schema.ts` -- `clientIdentity` and `todo` tables; `:11-13` records that ids are minted application-side, never by the database.
- `src/server/db/schema.test.ts:1-27` -- test conventions: static introspection, and a header comment naming which matrix rows the file covers.
- `drizzle.config.ts:3-7` -- the established shape for a missing `DATABASE_URL`: throw with a message naming the variable.
- `vitest.config.mts` -- `@` aliases `./src`; include globs cover `src/**/*.test.ts`. Gains the `DATABASE_URL` wiring the live tests need; Vite's `loadEnv` is available without a new dependency.
- `package.json:18-23` -- exact-pinned runtime dependencies; the driver joins them at an exact version.
- `docs/planning-artifacts/epics.md:393-409` -- Story 1.4's AC1–AC5, source of truth.
- `docs/planning-artifacts/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md:77-81` -- AD-2 rule text; `:248-275` the source tree placing `repository/` and `identity/`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `@neondatabase/serverless`, exact-pinned -- matches the repo's exact-pin convention for runtime dependencies -- pinned to `1.1.0`
- [x] `src/server/repository/client.ts` -- instantiate the Drizzle client over `DATABASE_URL`, failing clearly when it is unset -- AC1
- [x] `src/server/repository/client-identity.ts` -- the lookup by token hash and the create -- AC2, AC4
- [x] remove `src/server/repository/.gitkeep` once real files occupy the directory
- [x] `vitest.config.mts` -- put `DATABASE_URL` in the test process's environment -- without it the live tests cannot connect -- Vite's `loadEnv`, imported from `vite` (`vitest/config` does not re-export it)
- [x] `src/server/repository/client-identity.test.ts` -- cover every matrix row, the live ones against the Neon branch, removing rows the test inserts -- Matrix Test Audit convention (Story 1.2)
- [x] confirm the AD-2 boundary still holds with real code inside it: `npm run lint` green, and the client resolves nowhere outside `src/server/repository/` -- AC1 -- the deny-list gained the client's real path (see Implementation Notes)

**Acceptance Criteria:**
- Given the codebase is searched for imports of the Drizzle client or its driver, when the results are listed, then every hit is under `src/server/repository/` (AC1).
- Given a future repository function that reads or writes a Todo, when its signature is written, then `ownerId` is its first parameter — recorded here as the standing rule for Epics 2–5, since this story adds no such function (AC3).
- Given any route handler, when one is later added, then it calls repository functions and never builds a query — no route handler exists in the tree at this story's baseline, so AC5 is a constraint this story preserves rather than a behavior it demonstrates (AC5).

### Review Findings

_Code review 2026-09-21 — four layers over the full Epic 1 diff._

- [x] [Review][Patch] The two tree-walking scan helpers were copy-pasted and have already drifted [src/server/repository/client-identity.test.ts:147] — `SOURCE_EXTENSIONS`, `SKIPPED_DIRECTORIES`, `SCAN_EXEMPT_FILES`, `repositoryRoot` and `sourceFiles()` are duplicated verbatim from `src/shared/contract/contract.test.ts`, except that copy skips `out` and `build` and this one does not. A stale build directory therefore makes the AD-2 scan walk emitted JS and report it as an illegal database importer. Extract one shared helper.
- [x] [Review][Defer] Two committed error messages point at a `.env.example` that is not in the tree [src/server/repository/client.ts:30, drizzle.config.ts:5] — deferred: **already recorded in `deferred-work.md` by this story's own triage**, routed to Story 1.8 so the template and the sentence explaining it land with the README rather than split across two stories. Re-confirmed here by three review layers and re-stated only because it is now load-bearing: `npm test` fails on a fresh clone until 1.8 lands.
- [x] [Review][Patch] `client.ts`'s comment understates the readers of `DATABASE_URL` [src/server/repository/client.ts:21] — it says "read here and nowhere else in the application (the only other reader is `drizzle.config.ts`)", but `vitest.config.mts:20` reads it too, via `loadEnv`, and injects it into `test.env`. That read was an explicit task in this same spec, so the code is right and the comment is stale — but the frozen Always bullet says "the repository's client module and nowhere else".

**Rejected**

- `createClientIdentity` returns `undefined` typed as `ClientIdentity` [src/server/repository/client-identity.ts:57] — `low`. `noUncheckedIndexedAccess` is off, so the destructure types away a runtime possibility; but a successful `INSERT ... RETURNING` always yields a row and a failure throws. No reachable path was demonstrated, and the fix adds a guard for state never shown to occur. Consistent with this spec's prior triage #11.

## Implementation Notes

**`@neondatabase/serverless@1.1.0`, exact-pinned.** The architecture pins no version for the driver (it is not in the Stack table), so the latest published release at implementation time was taken. It satisfies `drizzle-orm@0.45.3`'s `>=0.10.0` peer range. `drizzle-orm/neon-http` was already present in the installed `drizzle-orm` — no ORM change was needed.

**The AD-2 deny-list gained the client's real path — a tightening, not a relaxation.** `noDrizzleClientImport` walled `@/server/db/client` and `**/db/client` by name, which is where the client was *expected* to live. This spec's Design Notes place it at `src/server/repository/client` instead, and no pattern covered that: before this change, any route handler or `src/server/identity/` module could have written `import { db } from "@/server/repository/client"` and held the Drizzle client, with lint green. The driver namespaces (`drizzle-orm/**`, `@neondatabase/**`) were denied outside the repository, so the gap was the project's own client module only — but that module *is* the Drizzle client, so AC1 was not actually enforced for the location this story chose. Four patterns were added to the existing group (`@/server/repository/client{,.*}`, `**/repository/client{,.*}`) and the dynamic-import selector's tail widened from `db\/client$` to `(db|repository)\/client$`. The `db/client` patterns are kept so the specifier stays walled wherever it is moved to. This adds no rule and relaxes none; `eslint.config.test.ts` gained four matching cases (three violations, one exemption). The `Never: no new or relaxed lint rule` constraint reads as a ban on loosening the wall to make code compile — nothing here was loosened, and nothing in this story would have failed to compile without the change.

**`vitest/config` does not re-export `loadEnv`.** Confirmed against the installed Vitest 5.0.1 (`configDefaults`, `coverageConfigDefaults`, `defaultBrowserPort`, `defaultExclude`, `defaultInclude`, `defineConfig`, `defineProject`, `mergeConfig` — no `loadEnv`). It is imported from `vite` directly, which is already Vitest's own dependency, so no dependency was added. A value already in `process.env` (CI, a shell export) wins over the file, which is the loop Vercel and CI need.

**`loadEnv`'s third argument is a prefix, not an allow-list** (triage #7). It filters with `startsWith`, so `"DATABASE_URL"` alone would also admit a sibling such as Neon's own `DATABASE_URL_UNPOOLED`. The one key is destructured out of the result and `test.env` is built from it, which is what actually keeps the rest of `.env` out of the test process. The `DATABASE_URL ? { DATABASE_URL } : {}` guard is load-bearing too: `loadEnv` is typed `Record<string, string>`, so an absent variable would pass `undefined` through to `process.env` and land there as the string `"undefined"` — truthy, turning `client.ts`'s clear failure into an opaque connection error.

**Test and hook timeouts are raised to 30s** (triage #8). Vitest's defaults are 5s and 10s; a warm Neon branch answers in ~275ms, but an auto-suspended one can spend several seconds waking on the first query. Epics 2-5 inherit this ceiling along with the live-test pattern.

**The collision test asserts the cause, not the message** (triage #4). Drizzle wraps the driver error in its own `Failed query: ...` message, so the constraint name and SQLSTATE are on `error.cause`: the assertion is `rejects.toMatchObject({ cause: { code: "23505", constraint: "client_identity_token_hash_unique" } })`. Verified against the live branch, where the `NeonDbError` carries both fields.

**The client is instantiated as `drizzle(neon(databaseUrl))`, not `drizzle(databaseUrl)`.** Both compile; the explicit `neon()` call makes the driver choice visible at the one place it is made, and is the seam a future move to `drizzle-orm/neon-serverless` edits.

**`createClientIdentity(id, tokenHash)` takes positional parameters,** matching the architecture's stated repository convention (`createTodo(ownerId, todo)`) and the Design Notes' wording. A swap is not silently accepted: `id` is a `uuid` column, so passing a token hash in its place fails at the database.

**The test file reaches for `db` directly to clean up.** Removing the rows it inserts needs a delete, and the repository exports exactly two functions (AC2) — adding a third for the tests' benefit would have widened the surface AC4 constrains. Because the test lives under `src/server/repository/`, it is inside the AD-2 boundary and may hold the client itself. Epics 2-5 inherit this pattern.

**`eslint.config.test.ts` is the one file the AC1 source scan skips.** It carries forbidden specifiers as fixture *strings* (`code: \`import { drizzle } from "drizzle-orm/node-postgres";\``), which a textual scan cannot distinguish from a real import. It drives real ESLint over those fixtures instead, so the wall is tested there rather than scanned. `eslint.config.mjs`'s deny-list strings need no exemption — they carry no `from` clause, so the scan's regex never sees them.

**The `.gitkeep` is gone, per Story 1.3's precedent** — the directory is committed via its real files.

**`npm test` no longer runs offline.** This is the human decision recorded in Boundaries & Constraints, restated here as an operational fact: four of the nine tests in `client-identity.test.ts` open HTTPS connections to the Neon branch `DATABASE_URL` points at. Without the variable the client module throws at load and the whole file fails, rather than skipping.

## Spec Change Log

## Review Triage Log

Pass 1 — layers: blind-hunter, edge-case-hunter, verification-gap, over the diff since `baseline_commit`.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | A dynamic import carrying a file extension — `import("@/server/repository/client.js")` — escapes the AD-2 wall: the static deny-list covers `client.*`, but the `ImportExpression` selector's tail is `(db\|repository)\/client$` | medium | Confirmed empirically by driving the ESLint Node API over the repo's real config: ALLOWED from both `src/server/identity/` and `app/api/`, while the no-extension form is BLOCKED. The `client.*` static patterns show the extension case was meant to be covered. | patch |
| 2 | The relative-path form `../repository/client` has no fixture, so the `**/repository/client` globs can be deleted with the suite green | low | Pre-verified by the verification-gap layer. Confirmed lint blocks the form today, so the gap is coverage-only — the alias fixture is carried by the alias pattern alone. | patch |
| 3 | The dynamic-import selector's `/client$` tail is pinned by no fixture at all | low | Pre-verified; raised independently by blind-hunter. The two existing `ImportExpression` fixtures are carried by the `drizzle-orm/` alternative and the computed-specifier selector respectively. | patch |
| 4 | "Create collides" asserts only `.rejects.toThrow()`, never that the rejection is the unique-constraint one | low | Partly refuted: a dead connection fails the setup `await createClientIdentity(...)` on the line before, so it cannot pass silently. The assertion still does not pin the collision reason. | patch |
| 5 | `collidingId` is never registered in `insertedIds`, so the file's cleanup registry does not cover the row that create would land | low | Confirmed: minted by a bare `randomUUID()`. No leak today — the insert always fails and the test asserts no row landed — but the registry is the file's stated guarantee. | patch |
| 6 | The AC1 source scan's `MODULE_SPECIFIER` misses bare side-effect imports (`import "x";`) | low | Confirmed by reading the regex. ESLint does block the bare form (verified empirically), so the wall holds; only the persisted scan — the spec's standing AC1 proof for Epics 2–5 — is narrow. | patch |
| 7 | `loadEnv(mode, cwd, "DATABASE_URL")` matches by prefix, so a sibling like Neon's own `DATABASE_URL_UNPOOLED` would also enter the test process — the opposite of what the comment claims | low | Vite's `loadEnv` filters with `startsWith`. Raised by two layers. `.env` holds only `DATABASE_URL` today, so nothing leaks yet. | patch |
| 8 | No raised timeouts for tests that now cross the network | medium | Vitest defaults are 5s test / 10s hook; a Neon branch that has auto-suspended can exceed that on its first query. Observed 275ms warm, so the exposure is cold-start flakiness — in the very pattern Epics 2–5 are told to inherit. | patch |
| 9 | `freshIdentity()`'s comment claims the value is "Shaped like the SHA-256 hex Story 1.6 will store"; it produces `test-` + 32 hex chars | low | Confirmed: 37 characters with a non-hex prefix, against a 64-char digest. | patch |
| 10 | `.env.example` is named by `client.ts` and `drizzle.config.ts` but does not exist, and nothing tells a developer that `npm test` now needs the secret and a network | medium | Confirmed: no `.env.example` in the tree. `.gitignore`'s `!.env.example` and the epic's story split put the README and setup path in Story 1.8; this story is what made the variable mandatory for the suite. | defer |
| 11 | `const [created]` can be `undefined` behind a non-optional `Promise<ClientIdentity>` (`noUncheckedIndexedAccess` is off) | low | Flagged by all three layers. Real at the type level, but no reachable path was shown: a successful `INSERT ... RETURNING` always yields a row, and a failure throws. | rejected — low, fix adds a guard for state not demonstrated |
| 12 | A duplicate primary-key id with a fresh token hash has no matrix row or test | low | The behavior (reject) is correct and shares its mechanism with the covered token-hash collision. | rejected — the proposed fix edits this build's frozen matrix |
| 13 | An empty or whitespace `tokenHash` would match a row stored with `''` | low | The precondition is unreachable: the only writer is `createClientIdentity`, called with a SHA-256 hash. | rejected — low, fix adds a guard for state not demonstrated |
| 14 | A set-but-unparseable `DATABASE_URL` surfaces the driver's message rather than one naming the variable | low | Real, but the driver's own failure is legible and the fix wraps module init in try/catch. | rejected — low, fix adds a branch for state not demonstrated |
| 15 | `afterAll`'s cleanup delete could reject and leave rows "with no signal" | false | Refuted: a rejecting `afterAll` fails the suite in Vitest. The signal is a failing run, not silence. | rejected — false |
| 16 | The top-level `import { db }` means an unset `DATABASE_URL` fails the whole file, including the static AC1/AC4 rows | low | Real, and precisely the trade the human accepted in the frozen Boundaries block. The proposed lazy-import fix adds structure to honour a constraint the intent waived. | rejected — the intent explicitly accepts it |
| 17 | "holds no Todo function yet" misses `.mts`/`.tsx` files and `export { createTodo }` re-export forms | low | Real narrowness; the repo's server convention is `.ts` with `export async function`, and the story that adds a Todo function brings its own coverage. | rejected — low, unlikely, fix adds regex complexity |
| 18 | `eslint.config.test.ts` is exempted from the AC1 scan wholesale | low | Real and documented in Implementation Notes; that file drives real ESLint over its fixtures, so the wall is tested there rather than scanned. | rejected — low, stripping fixture literals before scanning is more than a direct correction |
| 19 | Two new `process.cwd()` dependencies where the same file elsewhere uses a URL-based root | low | Both failure modes are loud, not silent: a wrong root makes `client.ts` throw on the missing variable and makes the scan's own anti-vacuity test fail. The npm scripts run from the root. | rejected — low, unlikely, and the "silently" framing is refuted |
| 20 | The AC1 scan's `SKIPPED_DIRECTORIES` matches on basename rather than path | low | Real, but requires a future `docs`/`drizzle`/`public` directory nested under `src/` or `app/`. | rejected — low, unlikely, fix is more than a direct correction |
| 21 | Story 1.3's `schema.test.ts` comment now contradicts the live-test convention | low | Largely refuted: that comment is scoped to its own file's "Migration application" row, which is still not re-run on every `npm test`. | rejected — low, refuted as stated |
| 22 | The lint-config widening is absent from the `## Spec Change Log` | false | Refuted by the template's own definition: that log is populated by step-04 on a `bad_spec` loopback, not by implementation. Implementation Notes is where the change belongs, and it is recorded there. | rejected — false |
| 23 | AC3's `ownerId`-first rule has no test that can fail | low | Real; a test over functions that do not exist yet is vacuous by construction, and Epics 2–5 each bring their own coverage. | rejected — low, speculative future-proofing |
| 24 | No sweeper for rows orphaned by an aborted run | low | Real, but a `token_hash like 'test-%'` sweep would delete a concurrent run's rows — the per-run unique hashes exist precisely to permit concurrency. | rejected — low, fix adds complexity and risks concurrent-run interference |

## Design Notes

The client lives under `src/server/repository/`, not `src/server/db/`, and the lint config is what forces that. `eslint.config.mjs:76-79` explicitly denies `@/server/db/client` and `**/db/client` by name, and a file under `src/server/db/` falls in the `src/server/` block, which permits only `drizzle-orm/pg-core` and `drizzle-orm/sql` — so a client module placed there could not import its own driver. The repository block is the one place where both the driver and the client entrypoint resolve.

`client_identity` is not an owned resource — it *is* the owner — so AC3's `ownerId`-first rule does not apply to its two functions. The lookup's parameter is a token hash and the create's are an id and a token hash. AC3 binds the Todo functions of Epics 2–5, and this story's job is to leave nothing in the way of it.

A lookup that misses returns `undefined` rather than throwing: Story 1.6's middleware calls it on every document request, and "this browser has no identity yet" is the ordinary first-visit path, not an error.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0 (`--max-warnings=0`), with the Drizzle client now imported for real inside `src/server/repository/`
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0 with `DATABASE_URL` set, every matrix row covered, and no rows left behind on the branch
- `npm run build` -- expected: exit 0
- repo-wide search for the driver package and `drizzle-orm` client entrypoints, excluding `node_modules` -- expected: hits only under `src/server/repository/` (AC1)

**Manual checks (if no CLI):**
- After the suite runs, `client_identity` on the branch holds no rows the tests inserted.
- `DATABASE_URL` is never printed, logged, or written to a file, and nothing in the diff carries a connection string.

**Results (all pass):**

| Check | Result |
|---|---|
| `npm run lint` | exit 0 (`--max-warnings=0`), with `@neondatabase/serverless` and `drizzle-orm/neon-http` imported for real inside `src/server/repository/` |
| `npm run typecheck` | exit 0 |
| `npm test` | 5 files / 87 tests pass (was 4 / 74) -- prior suites plus this story's 9 |
| `npm run build` | exit 0 (`lint` -> `typecheck` -> `next build`, all green; only the pre-existing Story-1.1 `middleware` -> `proxy` deprecation notice, unrelated to this story) |
| AC1 -- repo-wide search | `grep -rnP '(from\|import\(\|require\()\s*["'"'"'](@neondatabase\|drizzle-orm/(?!pg-core\|sql)\|@vercel/postgres\|pg["'"'"']\|postgres["'"'"'])'` plus a search for the client module by relative path and alias, excluding `node_modules`/`.next`/`docs`/`_bmad`/`drizzle`: the only real imports are `src/server/repository/client.ts:18-19` (`@neondatabase/serverless`, `drizzle-orm/neon-http`) and `src/server/repository/client-identity.ts:17` / `client-identity.test.ts:7` (`./client`). Every other hit is fixture-string text in `eslint.config.test.ts`. |
| AC2 -- exported surface | `Object.keys` of the module is exactly `["createClientIdentity", "findClientIdentityByTokenHash"]` -- verb-first, `Client Identity` and `token hash` vocabulary, no `Done` anywhere. Asserted by test. |
| AC3 -- `ownerId`-first | No repository function reads or writes a Todo at this story, so the rule is preserved rather than demonstrated; recorded in `client-identity.ts`'s header comment as the standing rule for Epics 2-5. `client_identity` is the owner, not an owned resource, so its two functions are outside the rule's scope. |
| AC4 -- no Todo functions | Asserted by test: `src/server/repository/` holds exactly `client.ts` and `client-identity.ts`, and neither exports `listTodos`, `createTodo`, `setTodoCompleted` or `deleteTodo`. |
| AC5 -- route handlers | No `app/api/` directory and no route handler exists in the tree; this story added none. The constraint is preserved, not demonstrated. |
| Matrix row "Lookup hits" | Live against Neon: `createClientIdentity` then `findClientIdentityByTokenHash` returns the same `id`/`tokenHash`. |
| Matrix row "Lookup misses" | Live: an absent hash resolves to `undefined` -- no throw. |
| Matrix row "Create succeeds" | Live: returns the created row with the caller's `id`, the `tokenHash`, and a `Date` `createdAt`. |
| Matrix row "Create collides" | Live: a second create on a stored `tokenHash` rejects on `client_identity_token_hash_unique`, and no row lands under the colliding id. |
| Matrix row "Only-importer boundary" | Two ways: the AC1 source scan above (a persisted test, not just a grep), and four new AD-2 cases in `eslint.config.test.ts` driving real ESLint -- `@neondatabase/serverless` from `src/server/identity/`, `drizzle-orm/neon-http` from `app/api/`, `@/server/repository/client` from `src/server/identity/` (all three rejected, message names AD-2), and all three plus `./client` from `src/server/repository/` (allowed). |
| Matrix row "Repository scope" | Covered by the AC2 and AC4 rows above. |
| Matrix row "Missing `DATABASE_URL`" | `delete process.env.DATABASE_URL` + `vi.resetModules()` + `await import("./client")` rejects with a message matching `/DATABASE_URL/` -- at module load, before any query. |
| No rows left behind | After the suite: `select count(*) from client_identity` = 0, and `... where token_hash like 'test-%'` = 0. Run via `node --env-file=.env`, so the connection string was never printed or passed on a command line. |
| No secret in the diff | `DATABASE_URL` appears in the diff only as a variable name (`client.ts`, `vitest.config.mts`, the test). `.env` is gitignored and untouched; no connection string is committed, logged, or written anywhere. |
