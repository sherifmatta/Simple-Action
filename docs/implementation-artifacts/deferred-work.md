# Deferred Work

Append-only. Each entry is a finding that was verified as real but deliberately not fixed in the spec that surfaced it.

- source_spec: `spec-1-1-scaffold-app-layer-boundaries.md`
  summary: The repository's own rules are written nowhere for future agents — `AGENTS.md` contains only Next.js's generated block.
  evidence: Story 1.1's stated premise is that the client/server seam must not depend on memory, but kebab-case naming, `strict: true`, the four boundary rules and "no Server Actions anywhere" exist only in planning docs and lint config. An agent reading `AGENTS.md` learns none of them. Deferred because the fix edits agent-context files, which routes to defer by rule. Natural owner is Story 1.8, which already writes the README.

- source_spec: `spec-1-1-scaffold-app-layer-boundaries.md`
  summary: `middleware.ts` is deprecated by Next 16.3 in favour of `proxy.ts`; both `next dev` and `next build` print a migration notice.
  evidence: AC7 and AR-20 name `middleware.ts` literally, so renaming it would have failed this story's own acceptance. The file still runs (build output labels it `ƒ Proxy (Middleware)`). Story 1.6 mints the Client Identity cookie here and should settle the rename before putting credentials in it — changing the filename and the cookie logic in one step is cheaper than doing it twice, and AR-20 will need amending to match.

- source_spec: `spec-1-4-establish-the-repository-as-the-only-database-module.md`
  summary: `.env.example` is named by two error messages but does not exist, and nothing tells a developer that `npm test` now needs `DATABASE_URL` and a network.
  evidence: `src/server/repository/client.ts` and `drizzle.config.ts` both tell the reader to "see .env.example"; no such file is in the tree, though `.gitignore` already carves it out with `!.env.example`. Story 1.4 is what made the variable mandatory for the test suite, so a fresh clone now gets nine failures and is pointed at a template that is not there. Deferred rather than patched because the README and the whole clone-to-running path are Story 1.8's deliverable (AC1, AC6, AC7) and that story times the path with a stopwatch — the template and the sentence explaining it should land together there, not be split across two stories.

- source_spec: `docs/implementation-artifacts/spec-1-5-define-the-shared-contract.md`
  summary: Constrain what may appear in the error envelope's `message`, so driver or SQL text cannot reach the browser through the single error slot.
  evidence: `ErrorEnvelope["error"]["message"]` is an unconstrained `string` crossing the wire on every failure path. AD-10's rule that the client never forwards or composes a server message is recorded in `errors.ts`'s doc comment, but nothing stops a route handler from putting a driver error's text there. No endpoint exists at this story's baseline, so the fix belongs to the stories that first construct an error response — Epic 2's list endpoint onward.

- source_spec: `spec-1-1-scaffold-app-layer-boundaries.md`
  summary: Nothing runs `npm test` automatically — no CI workflow, no git hooks, and `build` (what Vercel runs) skips the suite.
  evidence: `package.json`'s `build` is `lint && typecheck && next build`; `test` is a separate script nothing chains to. No `.github/` directory, no non-sample hooks in `.git/hooks`, no husky or lint-staged config. Every guard Epic 1 built — the 23 ESLint boundary fixtures, the design-token scan, the AD-2 database-reach scan, the contract-duplication scan — runs only when a human remembers. Two regressions were demonstrated surviving a green `npm run build` (design-token drift, schema/migration drift). Graded high. Deferred to Story 1.8, which establishes the deploy path and owns the `DATABASE_URL` secret a CI job would need; `src/server/repository/client-identity.test.ts` imports `./client` at module scope, so CI needs that secret or the live rows need gating.

- source_spec: `spec-1-2-transcribe-design-tokens-load-typeface.md`
  summary: `<body>` is never painted with `--color-ground` / `--color-text-primary`, so the app renders on Tailwind-preflight white.
  evidence: `app/globals.css` declares the tokens but carries no `body` rule and no `@layer base`; `app/layout.tsx:41` renders a bare `<body>`. Story 1.2's scope is transcription, and `app/page.tsx` states in a comment that Story 1.7 replaces the placeholder — so the shell story is the right owner for applying the ground colour. Recorded so it is not lost between the two.
