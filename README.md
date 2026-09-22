# Simple Action

A Todo List you can add to, toggle and remove from without the page ever flickering. One
deployable: the UI, the API route handlers and the database repository live in this one
repository and ship as one unit.

Built on Next.js 16 (App Router), React 19, TanStack Query, Drizzle ORM and Neon Postgres.

---

## What you need

- **Node.js 24** (LTS line). `.nvmrc` pins the major, so `nvm use` picks it up. `package.json`
  declares it in `engines` and `.npmrc` sets `engine-strict=true`, so npm **refuses** to install
  on the wrong major rather than warning and continuing.
- **A Neon Postgres connection string.** Free tier, about a minute to create — see
  [Getting your DATABASE_URL](#getting-your-database_url).

That is the entire list. **No Docker, no local Postgres install**, no other service and no
second account. Neon's branching is what buys that: a database here is a connection string,
not an installation.

## Quick start

```bash
git clone <this-repository> simple-action
cd simple-action
npm ci
cp .env.example .env
#   ...then paste your Neon connection string after DATABASE_URL= in .env
npm run db:migrate      # applies the committed migrations to your branch
npm run dev
```

Open <http://localhost:3000>.

`DATABASE_URL` is the only variable you set, and the only secret in the whole system — the
Client Identity token is random and hashed, so there is no signing key to manage.

### Getting your DATABASE_URL

1. Sign up at <https://neon.com> (free tier).
2. Create a project. Accept the defaults.
3. Copy the **pooled** connection string from the project dashboard. It looks like
   `postgresql://<user>:<password>@<host>.neon.tech/<database>?sslmode=require`.
4. Paste it after `DATABASE_URL=` in your `.env`.

If you already have access to this project's Neon account, create your **own branch** off it
instead of a new project — that is what makes your local environment the same shape as preview
and production, which differ from it only in the branch the string points at. A fresh project
of your own behaves identically and is the right choice if you do not have that access.

`.env` is git-ignored. `.env.example` is committed and holds no value — nothing in this
codebase defaults this variable, and both readers of it (`src/server/repository/client.ts`
and `drizzle.config.ts`) fail immediately and name it when it is unset.

## How long this takes

NFR-6 asks for clone-to-running in under five minutes with no undocumented steps. That is a
testable requirement, so it was **measured with a clock rather than asserted**:

| Step                                | Measured   |
| ----------------------------------- | ---------- |
| `git clone`                         | 0.4 s      |
| `npm ci` (cold cache)               | 6.1 s      |
| `npm run db:migrate`                | 1.0 s      |
| `npm run dev` → first `GET /` = 200 | 3.1 s      |
| **Total, commands only**            | **10.6 s** |

**Method.** A fresh `git clone` into an empty directory on an Apple Silicon Mac (macOS 25.6,
Node 24.19.0, npm 11.17.0) over domestic broadband, measured 2026-09-21. Every step above was
executed in one uninterrupted run against a live Neon branch — including the migration, which
applied the committed SQL and reported `migrations applied successfully`, and the dev server,
which was polled with `curl` until the document request returned 200 and set the Client
Identity cookie. The clone was taken from a local path rather than over the network, so treat
0.4 s as a floor: cloning from a remote adds however long your connection takes to move a few
megabytes. `npm ci` ran with `--cache` pointed at an empty directory, so every package was
downloaded rather than served from a warm local cache — the number a stranger actually gets.

**What the number excludes**, and should: installing Node 24 if you do not have it, and
creating the Neon account and copying the connection string. Allow about two minutes for a
first-time Neon signup. Your network, not this repository, is the variable that moves the
total.

**Outcome against NFR-6.** Just under eleven seconds of commands plus a couple of minutes of
account signup sits comfortably inside five minutes, with the human steps — not the tooling —
as the binding cost. NFR-6 stands as written; nothing is renegotiated, and no step was left
out of this README to make the number look better.

## Scripts

| Script                | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `npm run dev`         | Development server on port 3000.                                           |
| `npm run build`       | `lint` → `typecheck` → `next build`. The deploy runs this after migrating. |
| `npm start`           | Serves a production build.                                                 |
| `npm test`            | Vitest, once. **Needs `DATABASE_URL`** — some tests query your branch.     |
| `npm run lint`        | ESLint, warnings fatal. Also enforces the layer boundaries below.          |
| `npm run typecheck`   | `tsc --noEmit`.                                                            |
| `npm run db:generate` | Generates a migration from `src/server/db/schema.ts`. Needs no database.   |
| `npm run db:migrate`  | Applies committed migrations. Run after a clone and after a schema change. |
| `npm run db:push`     | **Local only.** Never run this against preview or production.              |

## Environments

Three, identical in shape. They differ only in which Neon branch `DATABASE_URL` points at —
nothing else changes between them.

| Environment | Runs on                  | `DATABASE_URL` points at |
| ----------- | ------------------------ | ------------------------ |
| Local       | your machine             | your own Neon branch     |
| Preview     | Vercel, per pull request | a preview Neon branch    |
| Production  | Vercel, default branch   | the production branch    |

## Deploying

The application deploys to **Vercel** from this repository's default branch.

**One-time setup:**

1. Push this repository to GitHub.
2. In Vercel, import it as a new project. The Next.js preset is detected automatically;
   `vercel.json` supplies the build command.
3. In Neon, create a branch for production and a branch for previews.
4. In the Vercel project's environment variables, set `DATABASE_URL` — the production branch's
   connection string for Production, the preview branch's for Preview. It is the only variable
   the application needs.
5. Set the project's Node.js version to **24.x** in Vercel's project settings. `.nvmrc` is not
   read by Vercel, so this is the one place the Node pin has to be repeated; without it the
   build can run a different major than local and preview, which is the one way these three
   environments could stop being identical in shape.

**Every deploy after that** is a git push. A push to the default branch deploys to production;
a pull request gets its own preview deployment.

**Migrations are applied by the deploy step.** `vercel.json` sets the build command to:

```
npm run db:migrate && npm run build
```

so the committed SQL under `drizzle/` is applied to that environment's branch before the
application is built. `drizzle-kit` selects the `@neondatabase/serverless` driver on its own
and prints a websocket warning while it does; the **pooled** connection string — the one this
README tells you to copy — was verified to apply migrations through it successfully, so the one
variable stays one variable and no direct endpoint is needed. The `&&` matters: a migration that fails stops the deploy rather than
shipping code against a database that has not caught up. Schema changes therefore travel as
committed migration files generated by `npm run db:generate` — `npm run db:push` is a local
convenience and appears in no deploy path.

Two things follow from that, worth knowing before they surprise you. Every preview build
migrates the **same** preview branch, so an open pull request carrying a schema change applies
it to the branch every other preview reads; give a migration that is not backward-compatible
its own Neon branch rather than sharing. And a migration is not rolled back by reverting the
commit — the deploy applies forward only, so undoing one means generating a compensating
migration, or resetting the Neon branch, which is usually faster for preview.

## How the code is arranged

```
app/            Routes, layout, and app/api/ route handlers — the only server entry point.
src/client/     React components, hooks, providers. Never imports from src/server/.
src/server/     Route-handler support, identity, and the repository.
  repository/   The only place allowed to import the Drizzle client.
src/shared/     The contract both sides import: Todo shape, error envelope, validation.
drizzle/        Committed migration SQL. Generated, never hand-written.
middleware.ts   Issues and resolves the Client Identity on the document request.
e2e/            Playwright end-to-end specs. Empty until Epic 6.
docs/           Planning artifacts and the per-story implementation specs.
```

Four boundaries hold this together, and `eslint.config.mjs` enforces each of them, so
`npm run lint` fails rather than a reviewer having to remember:

- Every client–server interaction goes through a route handler under `app/api/`. No Server
  Actions anywhere.
- Only `src/server/repository/` may import the Drizzle client, and every repository function
  takes `ownerId` first.
- The server never imports from client code.
- Announcements go through the single `announce()` function; no component declares its own
  `aria-live`.

Design tokens are transcribed exactly once, into the `@theme` block in `app/globals.css`. A
colour or size that is not in there gets added there before it is used — no hex literals and no
arbitrary-value classes elsewhere.

## Troubleshooting

**`npm ci` refuses with `EBADENGINE`.** You are on the wrong Node major. That refusal is
deliberate — `.npmrc` sets `engine-strict=true` so the pin fails loudly instead of installing
and breaking later. Run `nvm use` (or install Node 24) and try again.

**The page loads but the server log says `Client Identity unavailable`.** The application is
running; it cannot reach your database. Check that `DATABASE_URL` in `.env` is set and that the
Neon branch still accepts it — a string copied from a branch that has since been reset or
deleted fails authentication. The page is designed to render anyway rather than show an error
page, so this shows up in the log rather than on screen.

**`npm test` reports four failures about `client_identity`.** Same cause: those are the tests
that query your live branch.

## Testing

```bash
npm test
```

Vitest, Node environment. The repository tests query your live Neon branch, so `DATABASE_URL`
has to be set. Unset, they fail at module load with the message naming the variable; set to a
string the branch no longer accepts, they fail with an authentication error instead — worth
knowing apart, because the second one looks like a broken test and is actually an expired
credential. Everything else in the suite runs offline.
