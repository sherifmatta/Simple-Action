---
title: 'Story 1.3 — Create the schema and the first committed migration'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0de7e654bd2ba9dad048b7c3b80babb35b25643a'
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/planning-artifacts/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The database has no schema and no committed migration — `src/server/db/` and `drizzle/` exist only as empty scaffolded directories. Every later story (the repository, identity, and eventually the deployed app) assumes tables already exist; defining them ad hoc later is how the schema drifts from the single committed-migration source of truth AD-14 requires.

**Approach:** Define `client_identity` and `todo` as Drizzle tables in `src/server/db/schema.ts` using only `drizzle-orm/pg-core`, generate the first migration with `drizzle-kit generate`, commit it under `drizzle/`, and verify it applies cleanly to a live Postgres 18 target with every constraint and the one index in place.

## Boundaries & Constraints

**Always:**
- `schema.ts` imports only `drizzle-orm/pg-core` (plus `drizzle-orm/sql` if a raw default is needed) — never the Drizzle client or a driver. Story 1.1's lint rule (`eslint.config.mjs:54-84`) already carves out this exception and must stay green.
- Columns match epics.md AC1 exactly (see Code Map). Todo's copy column is `text`, never `title`/`content`/`task`/`item`.
- Exactly one index beyond the primary keys and the unique constraint: `(owner_id, id DESC)` on `todo`.
- Migration comes only from `drizzle-kit generate`, committed under `drizzle/`. `drizzle-kit push` may exist only in a local-only `db:push` script — never in `build`, `start`, or any deploy path.
- `camelCase` in TypeScript, `snake_case` in Postgres; `schema.ts` owns that mapping alone. kebab-case filenames; `strict: true`.
- AC5 verification target: apply the migration against a Neon branch whose `DATABASE_URL` the human supplies for this session (requested when the verification task runs); not committed anywhere.

**Never:**
- No Drizzle client instantiation (e.g. `src/server/db/client.ts`), no repository module, no route-handler wiring — Story 1.4 owns the client and the only-importer boundary.
- No `.defaultRandom()` or other DB-generated default on either primary key — ids are minted application-side (client for Todo per AD-4, server for `client_identity` later).
- No soft-delete column, no index beyond the one named above, no new lint rule.
- Never write "Done" in prose, identifiers, or tooltips.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Schema completeness | `src/server/db/schema.ts` inspected | Both tables present with every column, type and constraint from AC1/AC2 |
| Index presence | Generated migration SQL inspected | Exactly one non-PK/unique index: `(owner_id, id DESC)` on `todo` |
| Migration generation | `drizzle-kit generate` run against `schema.ts` | SQL file emitted under `drizzle/`, committed |
| Migration application | Committed migration applied to a Neon branch (human-supplied `DATABASE_URL`) | Both tables, the FK, the unique constraint and the index all exist |
| Push-script scope | `build`, `start`, lint and any deploy script inspected | None invoke `drizzle-kit push`; it appears only in `db:push` |

</frozen-after-approval>

## Code Map

- `src/server/db/schema.ts` (new) -- Drizzle table definitions; only `drizzle-orm/pg-core` imports lint-permitted here (`eslint.config.mjs:54-84`).
- `drizzle.config.ts` (new, root) -- drizzle-kit config: `dialect: 'postgresql'`, `schema: './src/server/db/schema.ts'`, `out: './drizzle'`, `dbCredentials.url` from `process.env.DATABASE_URL`.
- `drizzle/` -- generated migration SQL + `meta/` journal land here; already scaffolded (`.gitkeep`), must be committed per AD-14.
- `package.json` -- add `drizzle-orm@0.45.x` (dependency), `drizzle-kit@0.31.x` (devDependency, CLI-only), `db:generate`/`db:push` scripts.
- `docs/planning-artifacts/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md:149-159` -- AD-14 rule text.
- `docs/planning-artifacts/epics.md:371-391` -- Story 1.3's AC1-AC7, source of truth for exact column types and Tasks below.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `drizzle-orm@0.45.x`, `drizzle-kit@0.31.x`, `db:generate`/`db:push` scripts -- pinned to `0.45.3`/`0.31.11`, the latest patches in each pinned minor at implementation time
- [x] `drizzle.config.ts` -- schema/out/credentials config for `drizzle-kit`
- [x] `src/server/db/schema.ts` -- define `client_identity` and `todo` -- AC1, AC2, AC3, AC7
- [x] run `drizzle-kit generate`; commit the emitted SQL under `drizzle/` -- AC4 -- `drizzle/0000_orange_lightspeed.sql`
- [x] apply the migration to a Neon branch (human-supplied `DATABASE_URL`); confirm tables/FK/unique/index -- AC5
- [x] confirm no deploy-path script references `drizzle-kit push` -- AC6
- [x] persisted test(s) for the matrix rows that don't require a live DB -- Matrix Test Audit convention (Story 1.2) -- `src/server/db/schema.test.ts`

**Acceptance Criteria:**
<!-- AC1, AC3-AC6 are covered by the I/O Matrix above; full text at docs/planning-artifacts/epics.md:371-391 -->
- Given the Todo's copy column, when named, then it is `text` — matching the PRD glossary, not `title`, `content`, `task` or `item` (AC2).
- Given wire-to-database name mapping, when inspected, then `camelCase` ↔ `snake_case` translation is owned by the Drizzle schema alone (AC7).

## Implementation Notes

**Exact pins chosen within the `x` ranges.** `drizzle-orm@0.45.3` and `drizzle-kit@0.31.11` were the latest published patch releases inside the `0.45.x`/`0.31.x` pins at implementation time (2026-09-21), matching this repo's convention of exact-pinning stack dependencies (`next`, `react`, `typescript`, `vitest`, `tailwindcss` are all exact-pinned; only `eslint` and the `@types/*` packages use `^`).

**Both `.gitkeep` files removed once real content landed.** `src/server/db/.gitkeep` and `drizzle/.gitkeep` are gone now that `schema.ts` and the generated migration occupy those directories — the same pattern already visible in `app/`, which carries no `.gitkeep` once Story 1.1/1.2 populated it. Not a deviation from the Code Map ("already scaffolded (`.gitkeep`), must be committed per AD-14" refers to the *directory*, which is committed via its real files).

**`token_hash`'s uniqueness is a column-level `.unique()`, not a table-level `uniqueIndex()`.** This is what AC3's "the only index beyond the primary keys and the unique constraint" requires literally: `drizzle-kit generate` emits it as `CONSTRAINT "client_identity_token_hash_unique" UNIQUE("token_hash")` on the `CREATE TABLE` statement, not as a separate `CREATE UNIQUE INDEX`. The generated migration contains exactly one `CREATE INDEX` statement total — `todo_owner_id_id_idx` — verified both by direct SQL inspection and by a live `pg_indexes` query against Neon (four indexes exist in Postgres, as everything UNIQUE/PK is index-backed there, but only one was created by a `CREATE INDEX` statement; the other three are the two primary keys' and the unique constraint's implicit indexes).

**`(table) => [index(...).on(...)]` — the new (non-deprecated) `pgTable` extra-config array form**, per this Drizzle version's own type declarations (`node_modules/drizzle-orm/pg-core/table.d.ts` flags the object-returning `(t) => ({...})` form `@deprecated`). Matches the Design Notes' exact builder call.

**AC5 verification used a throwaway script, not a committed client.** Applying the committed SQL to the human-supplied Neon `DATABASE_URL` and inspecting the result needed some Postgres driver; adding one as a project dependency would have pre-empted Story 1.4's "only the repository imports the Drizzle client" boundary and left an unused driver sitting in `package.json`. Instead: `npm install pg --no-save --no-package-lock` (confirmed via `git diff`/`git status` that this changed neither `package.json` nor `package-lock.json`), a one-off script (project root, deleted immediately after the run) read `drizzle/0000_orange_lightspeed.sql`, split it on Drizzle's own `--> statement-breakpoint` markers, applied each statement, then queried `information_schema.tables`/`.columns`/`.table_constraints`, `pg_indexes`, and the FK join view. `npm uninstall pg` removed it afterward; the connection string itself was loaded via `node --env-file=.env` and never printed, logged, or written to a file. Results are summarized in Verification below; the script no longer exists in the tree.

**No deploy/CI script exists yet to check for AC6** beyond `package.json` (no `vercel.json`, no `.github/workflows/`) — Story 1.8 adds the deploy step. `db:push` is the only script anywhere in the repo (checked with a repo-wide grep, and now also a persisted test) that invokes `drizzle-kit push`; `build`/`start`/`lint`/`typecheck`/`test` do not.

## Spec Change Log

## Review Triage Log

Pass 1 — layers: blind-hunter, edge-case-hunter, verification-gap, over the diff since `baseline_commit`.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `sprint-status.yaml` still shows `1-3-...: in-progress` while the spec is `in-review` with every task/AC/verification complete | low | Confirmed: `sprint-status.yaml:42` read `in-progress`; spec frontmatter is `in-review`, all Tasks `[x]`, Verification table all-pass. | patch |
| 2 | `schema.test.ts`'s "completed is a not-null boolean defaulting to false" test asserts only `hasDefault === true`, never the default value itself | low | Read `schema.test.ts:120-125` — no assertion on the actual default value; would pass unchanged if the default flipped to `true`. | patch |
| 3 | Both `created_at` tests (client_identity and todo) assert type/notNull/timezone but never `hasDefault`, despite Design Notes calling out `.defaultNow()` as a deliberate choice | low | Read `schema.test.ts:57-61` and `:127-131` — neither checks `hasDefault`. | patch |
| 4 | `owner_id`'s FK test never asserts `onDelete`/`onUpdate`, despite Design Notes recording `NO ACTION` as a deliberate decision | low | Read `schema.test.ts:96-106` — the FK reference test checks columns/foreign table only. | patch |
| 5 | `todo`'s index test doesn't assert `config.uniqueConstraints` is empty, unlike `client_identity`'s symmetric `indexes`-empty check | low | Read `schema.test.ts:64-66` (clientIdentity, checks indexes empty) vs `:134-143` (todo, no uniqueConstraints check). | patch |
| 6 | `drizzle.config.ts`'s `dbCredentials.url: process.env.DATABASE_URL!` uses a bare non-null assertion, so an unset `DATABASE_URL` surfaces as an opaque error inside drizzle-kit rather than a clear message | low | Read `drizzle.config.ts:12`; flagged independently by both blind-hunter and edge-case-hunter (same location, same defect). | patch |
| 7 | `db:push` has no guard distinguishing a dev/branch `DATABASE_URL` from production; AD-14's "push never targets preview/production" is enforced only by developer discipline | low | True, but this is the standard whatever-env-is-set pattern; a guard needs environment-detection logic well beyond a direct fix, and AD-14's actual rule (push never wired into deploy/CI paths) is already fully satisfied. | rejected — low, fix is more than a direct correction, unlikely in disciplined everyday use |
| 8 | The "Migration application" (AC5) matrix row has no persisted regression test — a future `schema.ts` edit could silently break real Postgres applicability | low | True and already known: this is exactly this spec's resolved Open Question (no committed credential exists to automate it), matching Story 1.2's precedent for an unautomatable row. | rejected — fix would edit this build's spec / already a human-approved planning decision |
| 9 | No test locks `schema.ts`'s export surface to exactly `clientIdentity`/`todo` | low | True, but the scenario (an undocumented third table) would only arise from a future story that skips writing its own spec/tests entirely. | rejected — low, unlikely in everyday use, would be caught by that story's own coverage |
| 10 | `drizzle/0000_orange_lightspeed.sql` and `meta/0000_snapshot.json` are committed without a trailing newline | false | These are unmodified `drizzle-kit generate` output, verified byte-identical to a fresh re-run ("no schema changes, nothing to migrate"); hand-editing them would violate "migration comes only from `drizzle-kit generate`" and risk drift from the tool's real output. | rejected — false, editing this would be the actual defect |
| 11 | `schema.test.ts`'s migration-file describe block reads `sqlFiles[0]!` at the top level; if the file were ever missing, `path.join` throws a raw `TypeError` before any assertion runs, crashing the whole test file instead of one clear failure | low | Read `schema.test.ts:152-160` — the `readFileSync`/`path.join(..., sqlFiles[0]!)` line sits outside any `it()`, directly in the describe body. | patch |

## Design Notes

`drizzle-orm/pg-core`'s `index()` builder takes column-level direction: `index('todo_owner_id_id_idx').on(table.ownerId, table.id.desc())` compiles to `(owner_id, id DESC)`, no raw SQL needed.

`created_at` uses `.notNull().defaultNow()` on both tables (a DB default still counts as "server-set"); `completed` uses `.notNull().default(false)`. Neither is asserted by an AC and both are reversible. `todo.owner_id`'s FK takes Postgres's default `onDelete` (`NO ACTION`) — no identity-deletion path exists yet to justify a cascade policy.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run lint` -- expected: exit 0 (`--max-warnings=0`); `schema.ts`'s `drizzle-orm/pg-core` imports stay clean under AD-2
- `npx drizzle-kit generate` -- expected: exit 0, SQL file emitted under `drizzle/`
- migration applied to the human-supplied Neon `DATABASE_URL` -- expected: tables/FK/unique/index all present, inspected via `information_schema` or `\d`
- `npm test` -- expected: exit 0, matrix rows that don't require a live DB covered by a persisted test
- `npm run build` -- expected: exit 0

**Results (all pass):**

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings=0`) |
| `npx drizzle-kit generate` | exit 0 -- `2 tables / client_identity 3 columns 0 indexes 0 fks / todo 5 columns 1 indexes 1 fks` -- emitted `drizzle/0000_orange_lightspeed.sql` |
| `npm test` | 4 files / 74 tests pass -- prior suites plus this story's `src/server/db/schema.test.ts` |
| `npm run build` | exit 0 (`lint` -> `typecheck` -> `next build`, all steps green; only the pre-existing Story-1.1 `middleware` -> `proxy` deprecation notice, unrelated to this story) |
| AC5 -- live Neon apply | Applied against `PostgreSQL 18.6 (6569466)`. Both tables present; `todo.owner_id` FK -> `client_identity.id` (`todo_owner_id_client_identity_id_fk`) present; `client_identity_token_hash_unique` UNIQUE constraint present; exactly one non-PK/unique index, `todo_owner_id_id_idx` = `CREATE INDEX ... ON public.todo USING btree (owner_id, id DESC NULLS LAST)`. Verified via a throwaway script (see Implementation Notes), deleted after the run; `DATABASE_URL` was never printed or persisted anywhere. |
| AC6 -- push-script scope | Repo-wide grep for `drizzle-kit` (excluding `node_modules`, `package-lock.json`) matches only `package.json`'s `db:generate`/`db:push` scripts and `drizzle.config.ts`'s config comment; `build`/`start`/`lint`/`typecheck`/`test` scripts contain no reference to `drizzle-kit push`. No deploy/CI script exists yet in this repo (Story 1.8). |
| Matrix row "Schema completeness" | `src/server/db/schema.test.ts`, via `getTableConfig` introspection: both tables present with every AC1/AC2 column, type and constraint |
| Matrix row "Index presence" | `src/server/db/schema.test.ts`: the committed migration SQL contains exactly one `CREATE INDEX`/`CREATE UNIQUE INDEX` statement, and it is `todo_owner_id_id_idx` on `(owner_id, id DESC)` |
| Matrix row "Migration generation" | `src/server/db/schema.test.ts`: exactly one `.sql` file committed under `drizzle/`, containing both `CREATE TABLE` statements |
| Matrix row "Migration application" | Live-DB row; not a persisted test (per this story's own matrix note and Story 1.2's Matrix Test Audit precedent) -- see the AC5 row above |
| Matrix row "Push-script scope" | `src/server/db/schema.test.ts`: `db:push` is the only script in `package.json` containing `drizzle-kit push`; `build`/`start` do not |
