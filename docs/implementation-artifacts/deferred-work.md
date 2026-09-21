# Deferred Work

Append-only. Each entry is a finding that was verified as real but deliberately not fixed in the spec that surfaced it.

- source_spec: `spec-1-1-scaffold-app-layer-boundaries.md`
  summary: The repository's own rules are written nowhere for future agents — `AGENTS.md` contains only Next.js's generated block.
  evidence: Story 1.1's stated premise is that the client/server seam must not depend on memory, but kebab-case naming, `strict: true`, the four boundary rules and "no Server Actions anywhere" exist only in planning docs and lint config. An agent reading `AGENTS.md` learns none of them. Deferred because the fix edits agent-context files, which routes to defer by rule. Natural owner is Story 1.8, which already writes the README.

- source_spec: `spec-1-1-scaffold-app-layer-boundaries.md`
  summary: `middleware.ts` is deprecated by Next 16.3 in favour of `proxy.ts`; both `next dev` and `next build` print a migration notice.
  evidence: AC7 and AR-20 name `middleware.ts` literally, so renaming it would have failed this story's own acceptance. The file still runs (build output labels it `ƒ Proxy (Middleware)`). Story 1.6 mints the Client Identity cookie here and should settle the rename before putting credentials in it — changing the filename and the cookie logic in one step is cheaper than doing it twice, and AR-20 will need amending to match.
