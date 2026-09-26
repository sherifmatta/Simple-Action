<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# This repository

`README.md` is the entry point and this file does not restate it. For the directory layout,
the scripts and the setup path, read [README.md § How the code is arranged](README.md#how-the-code-is-arranged);
for operating a deploy, [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md). Two copies of a rule
is how the two copies start disagreeing, so what follows is only what an agent needs *before*
it writes a line, with a pointer for the rest.

## The boundaries

Most are enforced by `eslint.config.mjs`, so `npm run lint` fails rather than a reviewer
having to remember. **Two are not** — they are enforced by the test suite instead, which is
why `npm run lint` is not the whole check. Each rule below names the file that enforces it.
If you are unsure whether something is allowed, write it and run **both** `npm run lint` and
`npm test`.

- **AD-1 — one client/server seam.** Every client–server interaction goes through a route
  handler under `app/api/`. No Server Actions (`"use server"`) anywhere, and no component calls
  `fetch` directly. Enforced by `eslint.config.mjs`.
- **AD-2 — one database module.** Only `src/server/repository/` may import the Drizzle client,
  and the server never imports from client code. Every repository function takes `ownerId`
  first — that half is a convention the repository's own tests pin, not a lint rule. Enforced
  by `eslint.config.mjs` and `src/server/repository/todos.test.ts`.
- **AD-8 — one list read.** One query key for the Todo List, read in one place. Enforced by
  `eslint.config.mjs`.
- **AD-12 — one announcer.** Announcements go through the single `announce()` function; no
  component declares its own `aria-live`. Enforced by `eslint.config.mjs`.
- **AD-13 — tokens live in one block.** Design tokens are transcribed exactly once, into the
  `@theme` block in `app/globals.css`. A colour or size that is not in there gets added there
  before it is used — no hex literals and no arbitrary-value classes elsewhere. **No lint rule
  covers this**, so a hex literal passes `npm run lint` and fails `npm test`. Enforced by
  `app/globals.test.ts` and `src/client/components/todo-card.test.ts`.
- **AD-14 — migrations are generated and committed, never pushed.** Edit
  `src/server/db/schema.ts`, run `npm run db:generate`, and commit the SQL and the journal
  entry together. `npm run db:push` is a local convenience and appears in no deploy path. **No
  lint rule covers this either**: the drift check re-runs the generator on every test run and
  fails if the committed migrations no longer match the schema. Enforced by
  `src/server/db/schema.test.ts`.

`eslint.config.mjs` also pins the dependency graph between the four source directories, so an
import that crosses a layer fails the lint rather than a review.

`readme.test.ts` checks the attributions above against the tree: a rule this file assigns to
lint must actually appear in `eslint.config.mjs`, and one it assigns to a test must not. That
is what stops this section from drifting back into claiming a guarantee the config does not
give.

## Before you claim it works

`npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`. The unit suite and the
end-to-end suite both need `DATABASE_URL` — see README.md § Testing.
