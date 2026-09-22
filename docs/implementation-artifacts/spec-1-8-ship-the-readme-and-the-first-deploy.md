---
title: 'Story 1.8 — Ship the README and the first deploy, and time the path'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/implementation-artifacts/spec-1-3-create-the-schema-and-the-first-committed-migration.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has no `README.md`, no `.env.example` (though `.gitignore` already carves one out with a comment naming this story), no git remote, and no deploy configuration of any kind. `drizzle/0000_orange_lightspeed.sql` has been committed since Story 1.3 with no sanctioned way to reach a database — that spec closed its Open Question with option (b) and recorded verbatim that "**Story 1.8 still owns where `db:migrate` runs on deploy.**" A fresh clone today gets four failing tests and is pointed by two error messages at a `.env.example` that does not exist, which is precisely the undocumented step NFR-6 forbids.

**Approach:** Write the clone-to-running path down and then walk it: `.env.example` as the committed template holding no secret, `README.md` as the single source of the setup, deploy and environment story, and a committed Vercel build command that applies the migrations before `next build` — never `drizzle-kit push`, per AD-14. Then measure the path rather than assert it, and record the number and its method in the README.

**Decisions taken by the human (2026-09-21):**

1. **The external setup is the human's, done in this run.** They create the git remote, the Vercel project and the Neon preview/production branches; this session does the repo-side wiring and then verifies the real deploy end to end against what they stand up. AC3–AC5 are closed by that verification, not by assertion.
2. **The timing is measured mechanically, not with a human stopwatch.** Clone into a scratch directory, `npm ci`, set `DATABASE_URL`, start the dev server, and time until the document request returns. The README records the number *alongside its method and the machine it was measured on*, and states plainly what the measurement excludes (reading time, account signup). A human-walked number may replace it later.

</frozen-after-approval>

## Implementation Notes

**Four files, no dependency added.** `README.md`, `.env.example`, `vercel.json`, `readme.test.ts`. Nothing was installed; nothing in `app/` or `src/` was touched. The application code this story documents is exactly the code Stories 1.1–1.7 left behind.

**The deploy step is `vercel.json`, not a `vercel-build` script.** Vercel would honour either, but `buildCommand` puts the whole deploy contract in one committed file a reader can open, rather than splitting it between `package.json` and a platform convention. It is `npm run db:migrate && npm run build` — `&&` rather than `;`, so a migration that fails stops the deploy instead of shipping code against a database that has not caught up. `npm run build` already chains `lint → typecheck → next build`, so the deploy runs the boundary lint rules too. AD-14 holds: `readme.test.ts` asserts the build command contains no `push` at all, and that none of the four scripts it can reach (`db:migrate`, `build`, `lint`, `typecheck`) contains one either.

**`.env.example` closes a deferred item two stories old.** `src/server/repository/client.ts` and `drizzle.config.ts` have both pointed at it since Story 1.4, and `.gitignore` has carved it out with `!.env.example` and a comment naming this story. It holds one line, `DATABASE_URL=`, with no value — a test pins that it declares exactly one variable and assigns nothing, because a second entry is the cheapest way for AC1's "exactly one environment variable" to quietly stop being true.

**The timing was measured, and the honest parts of it are stated rather than smoothed.** A real `git clone` into an empty scratch directory, `npm ci` with `--cache` pointed at an empty directory so every package was downloaded rather than served warm, then `next dev` polled with `curl` until `GET /` returned 200: 0.6 s, 6.1 s, 2.9 s. Two things the README says out loud rather than burying: the clone was from a local path, so 0.6 s is a floor and not a network number; and the measurement excludes installing Node and creating the Neon account, which are the parts that actually consume a stranger's minutes. NFR-6's five minutes holds with the human steps, not the tooling, as the binding cost.

**A discovery worth more than the number: the credential in `.env` has expired.** `npm test` fails four cases in `src/server/repository/client-identity.test.ts` with `password authentication failed for user 'neondb_owner'` — on `main`, before this story touched anything. It is why the `npm run db:migrate` row in the README's table reads *pending* rather than carrying a figure: that step has never completed successfully, and writing a plausible number for it would be the exact assertion-instead-of-measurement AC2 exists to forbid. Two consequences follow, both recorded in the README: the application renders anyway (middleware catches the unreachable identity store and serves the document — verified, `GET / 200` with `Client Identity unavailable` in the log, which is the designed behaviour working under a real outage rather than a simulated one), and the failure mode is now in Troubleshooting because it looks like broken tests and is an expired string.

**Still open, and gated on the human's Vercel and Neon setup.** AC4 ("the same commit is live") and AC5 (three environments) cannot be closed from here: the repository has no git remote, and there is no `vercel`, `gh` or `neonctl` CLI on this machine. The README's deploy section is written as the runbook for that setup. One step in it is genuinely unverified rather than merely undone — `drizzle-kit migrate` selects the `@neondatabase/serverless` driver automatically and would run against the **pooled** connection string the README tells you to copy, while Neon documents the direct endpoint for migrations. That combination has never executed successfully here. It is the first thing to check against a live branch, and if it fails the README's "copy the pooled string" line is what changes.

**Not done, deliberately.** No CI workflow and no `AGENTS.md` rules section, though `deferred-work.md` routed both to this story — each is a second shippable deliverable named in none of the seven acceptance criteria, and both are re-deferred with a named owner rather than silently dropped. No Playwright. No `proxy.ts` rename (`next dev` still prints the Next 16 deprecation notice; it is Story 1.6's file).

## Review Triage Log

Pass 1 — layer: blind-hunter, over this story's four files. Thirteen findings.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | The spec's `## Implementation Notes` was an empty heading, while `readme.test.ts` pointed readers at it for the live-deploy verification | medium | Confirmed — the file ended at the heading. | patch — these notes |
| 2 | AC2's measurement is incomplete, and the method omitted that `git clone` ran against a local path, not a network remote | medium | Confirmed both. 0.6 s is a local-filesystem clone and reads as a network number unless said otherwise. | patch — the README now calls 0.6 s a floor and names the reason; the `db:migrate` row stays explicitly *pending* rather than being given a plausible figure |
| 3 | The README said a missing `DATABASE_URL` makes tests "fail with an authentication error", contradicting `client.ts`, which throws at module load naming the variable | medium | Confirmed by reading `client.ts:30-34`. The authentication error is what an *expired* string produces — which is what this session actually hit, and is how the two got conflated. | patch — the Testing section now distinguishes unset from expired, and Troubleshooting covers the second |
| 4 | Quick start told a developer to create a Neon *project* while the Environments table says the three environments differ only by *branch* | low | Real inconsistency. A stranger with no access to the account genuinely needs their own project, which is why it was written that way — but the README never said so. | patch — one paragraph: create a branch if you have access to the project, a fresh project otherwise, and why the first is the same shape |
| 5 | Every preview build migrates the one shared preview branch, and nothing said how to undo a migration | medium | Confirmed from `vercel.json` plus the README's own singular "a branch for previews". A schema change in one open pull request lands on the branch every other preview reads. | patch — two sentences in the deploy section on the shared branch and on forward-only rollback. Full rollback tooling is more than a direct correction and is not invented here |
| 6 | The CI gap that `deferred-work.md` routed to this story is still open | medium | Confirmed — no `.github/`, no hooks, `build` still skips `test`. The routing is quoted accurately. | defer — a CI workflow is a second shippable deliverable named in none of the seven ACs. Re-deferred with the blocker noted as gone and Story 6.8 named as owner |
| 7 | `npm run build` was captioned "what the deploy runs", which the new `vercel.json` makes inaccurate | low | Confirmed. | patch — one line |
| 8 | `AGENTS.md` is untouched, so an agent still learns none of the repository's rules | low | Confirmed. | defer — this workflow routes fixes that edit agent-context files to defer by rule; re-deferred with the cheapest form named (a pointer at the README, not a restatement) |
| 9 | The credential sweep read `git ls-files` only, so it did not scan `README.md` — untracked at the time, and the likeliest place for a pasted string to sit | medium | Confirmed, and worse than stated: every file this story adds was exempt from its own sweep. | patch — `--cached --others --exclude-standard`. Immediately caught two real matches, which forced the regex to learn the difference between a secret and the `<user>:<password>` shape the README documents; the anti-vacuity fixture is now concatenated so the file is not its own offender, avoiding an exemption-by-path. Mutation-tested: a file carrying a live-shaped string is flagged, and removing it goes green |
| 10 | The "documented script exists" check matched only `npm run …`, missing `npm ci`, `npm start` and `npm test` | low | Confirmed by reading the regex. | patch — `npm (?:run )?…` with npm's own subcommands allow-listed, plus an anti-vacuity assertion that the shorthands are really present. A quick-start *ordering* case was added alongside, since the order is what AC1 is actually about |
| 11 | `readme.test.ts` throws rather than skips outside a git work tree | low | The coupling is real. But the README's first instruction is `git clone`, and no path in this repository produces a git-less tree; the suite already shells out elsewhere. | rejected — low, and guards a state not shown to be reachable |
| 12 | Nothing pins Node 24 for the Vercel build: `.nvmrc` is not read there and `engines.node` is a range | maybe-false, would be medium | Could not settle from here whether Vercel resolves `">=24.0.0 <25.0.0"` or falls back to a project default — it needs the live project, and no network check was available. The risk to AC5's "identical in shape" is real either way. | patch — the smallest fix needs no resolution: the deploy runbook now has a step setting the project's Node version to 24.x, and says why that is the one place the pin must be repeated |
| 13 | Migrations run over the **pooled** connection string, which Neon documents the direct endpoint for, and that combination has never executed | medium | Confirmed unverified: `drizzle-kit migrate` picked `@neondatabase/serverless` automatically and then failed on the expired credential, so it has never reached a live branch. | patch (notes) — recorded above as the one genuinely unverified step and the first thing to check against the live branch, rather than guessed at in the README |

Also raised and disposed of without a row: the Scripts table separator was misaligned (already fixed by Prettier before the review landed), and the sprint-status bookkeeping was "a step behind" (it moves to `review` at this workflow's finalize step, which is where it is now).

**Closed after the human supplied a live branch and the remote (2026-09-21).** The two items left open above are settled, and one assumption is now a fact rather than a risk:

- **The pooled connection string applies migrations.** `npm run db:migrate` against the live branch reported `migrations applied successfully` in 1.0 s. `drizzle-kit` selects `@neondatabase/serverless` on its own and prints a websocket warning while doing it, but the pooled endpoint the README tells you to copy works — so AC1's one variable stays one variable and no direct endpoint is needed. This was finding 13's open question and it resolved in favour of the simpler README, which is why the instruction did not change.
- **The whole path was walked in one uninterrupted run**, on the tree as committed: clone 0.4 s, cold `npm ci` 6.1 s, `db:migrate` 1.0 s, `next dev` to a 200 in 3.1 s — **10.6 s** total. The document response carried `client_identity=…; Max-Age=34560000; Secure; HttpOnly; SameSite=lax`, so the walk proves the identity round-trip against a real database rather than only that a page rendered. The README's *pending* row is gone and its table now carries measured figures for every step.
- **The suite is fully green**: 292 of 292. The four failures recorded above were the expired credential and nothing else — no test was changed to make them pass.
- **Still not closed here: AC4 and AC5.** The remote now exists and carries this work, but whether a push produces a live deployment with the migrations applied, and whether preview and production sit on their own Neon branches, is observable only in the Vercel and Neon dashboards. That verification is the human's, against the runbook in README.md's deploy section.
