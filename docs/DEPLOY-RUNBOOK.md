# Deploy Runbook

How this application is deployed, what the deploy does and does not do, and how to undo it.

This is the operational half. The README owns the setup half — what to click once in Vercel
and Neon, and which variable goes where — and it is not repeated here; see
[README.md § Deploying](../README.md#deploying) and [§ Environments](../README.md#environments).
Every claim below names the file that proves it, so a claim that has gone stale can be checked
against the tree rather than believed.

---

## 1. What a deploy actually runs

`vercel.json` is one line, and it is the whole deploy contract:

```json
{ "buildCommand": "npm run db:migrate && npm run build" }
```

`package.json` expands the second half to `npm run lint && npm run typecheck && next build`.
So a deploy is, in order: **migrate → lint → typecheck → build**.

Two things that are not in that list, and both matter:

- **The suite does not run.** Neither `npm test` nor `npm run test:e2e` appears in
  `buildCommand` or in any script it chains to. A deploy can go out green with a failing test
  suite. The gate that would catch it is `.github/workflows/ci.yml`, and §5 says what state
  that is in.
- **Nothing pushes a schema.** `buildCommand` contains no `push`, and
  `src/server/db/schema.test.ts` (the `push-script scope` block) asserts mechanically that
  `drizzle-kit push` appears in exactly one script — `db:push` — and that neither `build` nor
  `start` reaches it. `readme.test.ts` asserts the same thing from the deploy command's side.

**If the build fails, read which of the four steps failed before anything else.** A migration
failure and a typecheck failure have nothing in common except the log they land in, and the
next section only applies to the first one.

---

## 2. Migrations

### How they are applied

By the deploy, before the build, as committed SQL.

- **The command is `npm run db:migrate`**, which is `drizzle-kit migrate` (`package.json`).
  It reads the committed `drizzle/meta/_journal.json` to learn which `.sql` files exist and in
  what order, then applies the ones the target branch has not recorded. Today the journal has
  one entry, `0000_orange_lightspeed.sql`.
- **What has been applied is recorded in the database, not in the repository.**
  `node_modules/drizzle-orm/pg-core/dialect.cjs` (`PgDialect.migrate`) creates
  `drizzle.__drizzle_migrations` on the target branch if it is absent and inserts one row per
  applied migration, carrying the migration's **hash** and its timestamp. `_journal.json` is a
  committed file that `migrate` reads and never writes — so "what this branch has" is a
  question only the branch can answer, and two branches at the same commit can be at different
  points.
- **The separator is `&&`, not `;`.** A failed migration stops the deploy instead of shipping
  code against a database that has not caught up. `readme.test.ts` pins the `&&` specifically,
  because a `;` would look almost identical in review and would silently invert the guarantee.
- **The connection is the same `DATABASE_URL` the application uses** — the pooled string.
  `drizzle.config.ts` names no `driver`; drizzle-kit selects `@neondatabase/serverless` itself
  and prints a websocket warning while it does. That warning is expected output, not a fault.
- **`drizzle.config.ts` throws on a missing credential** for `migrate` and `push`, naming
  `DATABASE_URL` (`drizzle.config.ts`, the `needsDatabase` guard). A deploy with the variable
  unset therefore fails at the first step with a message that says which variable, rather than
  failing later as an opaque connection error.

### How a migration is created

`npm run db:generate` diffs `src/server/db/schema.ts` against the committed snapshot in
`drizzle/meta/` and writes a new `.sql` file plus a journal entry. **Commit all of it.** The
`generate` path is the one drizzle-kit command that reaches no database — `drizzle.config.ts`
exempts it by name — which is why it works on a clone with no `DATABASE_URL`.

Editing `schema.ts` without generating is the failure this is built to prevent: the build stays
green and every query against the changed table fails at runtime with "column does not exist".
`src/server/db/schema.test.ts` closes that hole by re-running `drizzle-kit generate` against a
copy of `drizzle/meta/` on every test run and failing if any new file appears. If that test
fails, the fix is `npm run db:generate` and a commit — never an edit to the generated SQL.

### Migrations are forward-only

There is no `down` file and drizzle-kit is not asked for one. Undoing a schema change means
either a new compensating migration or a branch reset; see §4.

---

## 3. The three environments

They are identical in shape. **The only thing that differs is which Neon branch
`DATABASE_URL` points at** — the same commit, the same build command, the same code. The table
of which branch belongs to which environment is in
[README.md § Environments](../README.md#environments).

Three consequences worth knowing before they surprise you.

**Every preview build migrates the same preview branch.** Preview deployments share one Neon
branch, so an open pull request carrying a schema change applies it to the branch every other
preview reads. For a backward-compatible migration — a nullable column, a new table — that is
fine. For one that is not, give the pull request its own Neon branch and point that preview's
`DATABASE_URL` at it, or merge it on its own and let the other previews rebuild afterwards.

**Vercel does not read `.nvmrc`.** `.nvmrc`, `package.json`'s `engines.node` and the README
agree on Node 24 and `readme.test.ts` asserts that they agree — but Vercel's Node version is a
project setting, and no test in this repository can see it. **It is the one pin that can drift,
and it drifts silently.** If a build behaves differently from local for no reason the diff
explains, check it first.

**Environment variables come from the platform, not from a file.** Vercel injects
`DATABASE_URL` into `process.env`, and `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
records that a value already in `process.env` wins over every `.env` file. `.env` is
git-ignored and never reaches a deploy. Nothing in this codebase supplies a fallback for the
variable — `readme.test.ts` asserts that no `process.env` read in tracked source carries a
non-empty default — so a missing value fails loudly at module load in
`src/server/repository/client.ts` rather than connecting to something unintended.

---

## 4. Rolling back

**Code and schema roll back differently. Doing the first and assuming it did the second is the
mistake this section exists to prevent.**

### Rolling back code

In the Vercel dashboard, promote a previous deployment. This is the fast path and it is
instant: the build is already there.

One property of that path to hold in mind. **A redeploy of an existing build reuses that
build's artifact** — it does not rebuild. `node_modules/next/dist/docs/01-app/02-guides/building.md`
records that `next build` reads the `.env` files and mints the build ID at build time, so
anything inlined then belongs to *that* build, not to today's project settings. Changing an
environment variable and promoting an old deployment does not give you the old code with the
new variable; it gives you the old code with the old inlined values. When a variable is the
thing that changed, trigger a fresh build.

`next.config.ts` sets no `output`, no `deploymentId` and no `generateBuildId`; Vercel handles
version skew for its own platform, which
`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` describes as the problem a
pinned deployment id solves elsewhere. Nothing in this repository needs configuring for it.

### Rolling back a migration

**Reverting the commit does not revert the migration.** The deploy applies forward only, so the
revert's build runs `db:migrate` against a branch that already has the change and finds nothing
to do. Two real options:

1. **A compensating migration.** Change `src/server/db/schema.ts` back, run
   `npm run db:generate`, commit the new `.sql` file and the journal entry, and deploy. This is
   the only option for **production**. Write it knowing it is a forward migration: dropping a
   column that the previous migration added also drops what was written into it.
2. **Reset the Neon branch.** Usually faster, and usually correct for **preview**, where the
   branch holds nothing anyone needs. Reset it from its parent in Neon, then redeploy. This
   works because the reset drops `drizzle.__drizzle_migrations` along with everything else, so
   the branch has no record of any migration and `db:migrate` applies the whole journal from
   the beginning. **Do not do this to production** — it is a data loss operation, and the rows
   in production are the product.

### If a deploy fails mid-migration

`node_modules/drizzle-orm/pg-core/dialect.cjs` runs the whole pending set inside one
transaction, and each migration's `insert` into `drizzle.__drizzle_migrations` is part of that
same transaction. A failure therefore rolls back both the SQL and its ledger row: the branch is
left exactly at the last successfully applied migration, with nothing half-recorded. The build
stops before `next build`, so the previously deployed build is still serving. Fix the SQL,
generate forward, and deploy again.

**Do not hand-edit an already-applied `.sql` file.** Two things break. The drift check in
`src/server/db/schema.test.ts` compares regenerated output against the committed snapshot and
fails. And the ledger records a **hash** of the file's contents, so every branch that already
applied the old text now holds a row that no longer describes any committed migration — which
is not something a redeploy can reconcile.

---

## 5. What CI covers, and what it does not

`.github/workflows/ci.yml` runs on `push` and `pull_request`, with one `verify` job: checkout,
`setup-node` pinned by `node-version-file: .nvmrc`, `npm ci`, Chromium for Playwright, then
`npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`, with `DATABASE_URL`
from `secrets.DATABASE_URL`. It deliberately runs **no** migration — it is a verification job,
not a deploy.

What is true of it, stated rather than assumed:

- **The workflow is green, as of 2026-09-26.** Run #4 against `436db06` concluded success
  ([run 36247297413](https://github.com/sherifmatta/Simple-Action/actions/runs/36247297413)),
  job `verify`, 233s, with every step passing — install, Chromium, lint, typecheck, `npm test`
  and `npm run test:e2e`. That closes Story 6.1's `AC6-green-ci-run` deferral, which had been
  open since the workflow was written.
- **`DATABASE_URL` in CI is a GitHub Actions secret, not a Vercel environment variable.** They
  are different stores and only the first reaches this workflow: `ci.yml` reads
  `${{ secrets.DATABASE_URL }}`, which Vercel's environment — including one the Neon
  integration populates — does not supply. The three pushes before the secret existed
  (`d34eb47`, `09b1c13`, `d20bff4`) each failed at the `npm test` step for exactly that reason,
  with the end-to-end step skipped behind it. If CI starts failing there again, check that
  store first.
- **Point the secret at a dedicated Neon CI branch** — never production, and not the shared
  preview branch either. The repository tests write rows and the end-to-end suite creates Todos
  through the UI, so CI needs a branch it is free to dirty.
- **A green CI run and a successful deploy are still different events**, and this is the one
  real gap left. CI runs the suite and no migration; the deploy runs a migration and no suite.
  **Nothing blocks a deploy on CI being green** — Vercel builds from the same push
  independently, so a red suite does not stop a release. The deploy's own gates remain `lint`
  and `typecheck`, chained into `npm run build`. Wiring the deploy to wait on CI is the
  remaining piece of work here.

---

## 6. First checks when something is wrong

**Two different logs, and reaching for the wrong one is the usual first mistake.** Vercel's
**build log** is per deployment and covers the four steps in §1 — the migration and anything
that failed before the application ever started. The **runtime (function) log** is per request
and covers everything after: a route handler throwing, a query failing, the identity middleware
unable to reach the database. A build that went green and an application that is broken are two
different investigations.

| Symptom | Look at |
| --- | --- |
| Build failed | The build log. Which of migrate / lint / typecheck / `next build` failed (§1). |
| Build log fails on its first command | `DATABASE_URL` for that environment, then §2. |
| Build was green, the app errors at runtime | The runtime log, not the build log. Then: is it a query error (§2, a missing migration) or a code error? The build only ran lint and typecheck, so a failing test suite ships (§5). |
| Runtime log says `Client Identity unavailable` | The database is unreachable from the deployed environment. Check that environment's `DATABASE_URL` and that the Neon branch still accepts it. README § Troubleshooting. |
| "column does not exist" at runtime | A schema change shipped without a generated migration (§2). Check the build log — did `db:migrate` say it applied anything? |
| Behaves differently from local, the diff explains nothing | Vercel's Node version project setting (§3). It is the one pin nothing in this repository can check. |
| Rolled back but the bug is still there | It was a schema change, not a code change (§4). |
| Rolled back but the fix did not take | The promoted build carries its own build-time values (§4). Trigger a fresh build. |
| A local end-to-end run passes or fails against code you did not just write | A `next start` left running on port 3000 from an earlier commit. `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so outside CI Playwright silently reuses whatever is already answering on that port instead of building this commit. Stop it and re-run. This one has bitten this repository. |
