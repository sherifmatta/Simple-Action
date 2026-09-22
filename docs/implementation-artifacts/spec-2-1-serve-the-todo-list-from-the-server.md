---
title: 'Story 2.1 — Serve the Todo List from the server'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-2-context.md'
  - '{project-root}/docs/implementation-artifacts/spec-1-4-establish-the-repository-as-the-only-database-module.md'
  - '{project-root}/docs/implementation-artifacts/spec-1-6-issue-and-resolve-the-client-identity.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/api/` holds only a `.gitkeep`. The schema (1.3), the repository client (1.4), the shared contract (1.5) and the Client Identity (1.6) all exist, but nothing reads a Todo: there is no `listTodos`, no endpoint, and therefore nothing for Story 2.2's `useTodos` to call or for the skeleton, empty and error states of 2.6–2.8 to resolve against. FR-2 has no mechanism, and the `(owner_id, id DESC)` index Story 1.3 created for exactly this read is unused.

**Approach:** Add `listTodos(ownerId)` to the repository — the first Todo function, `ownerId` first per AD-2 — ordering `id DESC` (AD-5, never `created_at`) and returning the wire `Todo` shape so an `owner_id` cannot reach the browser through a leaked row. Then add `app/api/todos/route.ts`, the codebase's first route handler: resolve the identity with `resolveClientIdentity`, answer `401` through the existing `unauthorizedIdentityResponse` when there is none, otherwise return the bare JSON array with no envelope. A read that throws is logged server-side and answered with `{ error: { kind: "load", message } }` carrying a fixed diagnostic string — this is the endpoint that closes the deferred "unconstrained `message`" item, so no driver or SQL text ever reaches the wire.

**Decided (user, 2026-09-22):** the route handler resolves the Client Identity itself rather than trusting an `ownerId` forwarded from middleware on a request header. The second indexed `SELECT` per API call is accepted; the trusted-header remedy recorded in `deferred-work.md` is re-deferred rather than adopted, so ownership stays derived from the cookie in exactly one way.

</frozen-after-approval>

## Implementation Notes

**Files.** New: `src/server/repository/todos.ts` (`listTodos`) with a live test beside it, and `app/api/todos/route.ts` — the codebase's first route handler — with a mocked test beside it. `app/api/.gitkeep` is gone, per Stories 1.3–1.6's precedent. Two done stories' tests were amended (below). No schema change, no migration, no new dependency, no lint-rule change.

**The repository returns the wire `Todo`, not the Drizzle row.** This departs from `client-identity.ts`, which returns `$inferSelect`, and it is the decision Epics 3–5 inherit. A Client Identity never crosses the wire; a Todo always does, and its row carries `owner_id` — the one field AD-7 keeps server-side. Projecting inside `listTodos` means the row never leaves the repository, so `owner_id` cannot reach the browser by someone spreading a result into a response, and the `Date` → ISO-8601 conversion (SPINE "Dates") has one site rather than one per route handler. The cost is a `src/server/repository/` → `src/shared/contract/` import, which the dependency graph already permits (`eslint.config.mjs` walls `src/shared/` off the server, not the reverse).

**AC1 says `created_at`; the shipped contract says `createdAt`, and the contract wins.** `epics.md:509` writes the snake_case column name, but SPINE's "JSON and SQL casing" row is `camelCase` on the wire, `todo.ts` declares `createdAt`, and `contract.test.ts` fails any competing shape. Reading AC1 literally would have required a second Todo shape. Recorded as deferred work so the epic text is reconciled rather than silently diverged from.

**`middleware.ts` already makes AC5 true; the handler enforces it anyway.** Story 1.6 extended the matcher over `/api/**` and answers `401` before a handler runs, which is why the smoke test below sees `401` without ever reaching this code. The handler still resolves and refuses on its own, because that is what a direct call to `GET` exercises and what survives a future change to the matcher. Story 1.6's own comment says this is the intent: the middleware is the wall in front of route handlers, not a substitute for them.

**The identity is resolved twice per API call, deliberately.** `deferred-work.md` routed the choice here: middleware resolves to enforce the `401`, the handler resolves for its `ownerId`, and over `neon-http` each is a separate HTTPS round-trip. The trusted-header remedy (`NextResponse.next({ request: { headers } })`) was declined by the user — it would make a request header authoritative for ownership, a contract every later route inherits and any gap in the matcher turns into a read of someone else's list. The optimization is re-deferred with the measurement that would justify it.

**The failure message is a fixed constant, and the driver's text is logged instead.** This is the endpoint `deferred-work.md` named as the owner of "constrain what may appear in the error envelope's `message`". `LOAD_FAILED_MESSAGE` is never composed from the caught error; `console.error` receives `error.message` only, never the error object (which carries the query) — the pattern `middleware.ts` established. Three tests pin it, including one that serializes the response and asserts the driver text appears nowhere in it. A repository-wide mechanism (a message catalogue, or a lint selector over `message:` in an envelope literal) is re-deferred: `src/shared/contract/` is pinned at three files by its own test, and a fourth copy of the source-tree walk would worsen a debt already recorded.

**The whole handler body is wrapped, not just the list read.** `resolveClientIdentity` queries the database too, so an unwrapped identity failure would escape as Next.js's unenveloped 500 — which AD-10 forbids and the single error slot cannot classify. Both paths now answer the same enveloped `load` 500, and a test drives the identity-lookup rejection specifically.

**Two done stories' tests were amended, both because they asserted the absence of what this story adds.**
- `src/server/repository/client-identity.test.ts` pinned the repository directory to exactly `["client-identity.ts", "client.ts"]` and grepped it for `export function listTodos`. `todos.ts` is added to the list and `listTodos` removed from the forbidden set; `createTodo`, `setTodoCompleted` and `deleteTodo` stay forbidden, so the ratchet still holds for Epics 3–5.
- `middleware.test.ts`'s AC6 scan selected route handlers with `basename.startsWith("route.")`, which also matches `route.test.ts`. The test's own `TEST_FILE` rule — two functions above it, with a comment saying a test naming a minting symbol is assertion data, not a minting site — is now applied here as well, and an anti-vacuity assertion was added since the scan is no longer scanning an empty directory.

**Every `app/api/` response is now marked private and varying on the cookie (added after review).** The responses are decided entirely by the identity cookie, and neither carried `Cache-Control` or `Vary: Cookie` — so a shared cache keying on the URL alone could hand one person's Todo List to the next caller, and a browser could answer Story 2.7's `Retry` from its own cache. `privateToTheCaller` sets `Cache-Control: private, no-store` and *appends* `Vary: Cookie`, so the platform's own `Accept-Encoding` entry survives. It lives in `request-identity.ts` beside the `401` it also has to mark: the refusal a browser actually receives is built by `middleware.ts` before the handler runs, so marking it only in the route handler would have left the real `401` unmarked — verified against `next start`, which is how that gap was found. `middleware.ts`'s `503` is marked the same way. Next.js's own "Route Handlers are not cached by default" is about its route cache, which is a different cache from HTTP's.

**Verified end to end against `next start`.** `/api/todos` builds as `ƒ` (dynamic — Route Handlers are uncached by default in Next.js 16 and this one reads cookies, so no segment config is needed). Without a cookie it answers `401` with the envelope; after a document request issues one it answers `200` with a bare `[]`. `npm run lint`, `npm run typecheck` and `npm test` (311 tests, the six new repository cases live against Neon) are green.

## Review Triage Log

Pass 1 — layer: blind-hunter, over this story's changed files. Finding floor N = min(floor(sqrt(33) + 1), 10) = 6; thirteen returned.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `GET /api/todos` ships no `Cache-Control` and no `Vary: Cookie`, on a response keyed entirely by the identity cookie | medium | Confirmed against `next start` — the response carried `content-type` and `Vary: Accept-Encoding` only. Patched, and the patch exposed a second half the finding did not name: the `401` a browser receives comes from `middleware.ts`, not the handler, so the marking had to go in `unauthorizedIdentityResponse`. Both paths re-verified end to end. | patch |
| 2 | The failure `message` is constrained in one file, with no wall behind it for Epics 3-5 | medium | Accurate. Judged as growth beyond this story rather than a correction: the two candidate mechanisms are a catalogue module (which cannot live in `src/shared/contract/`, pinned at three files by its own test, and whose strings the client must never render) and a fourth copy of the source-tree walk already recorded as debt. Deferred with the cheapest real fix named — a `no-restricted-syntax` selector on a `message` beside a `kind` whose value is neither a literal nor a constant — and an owner. | defer |
| 3 | `deferred-work.md` is untouched although one of its entries named Story 2.1 as owner | medium | True when the reviewer looked; the three entries were appended after it started. Both items it names (the double resolve, the envelope message) now have a closing entry with the decision and current evidence, per Story 1.8's precedent. | false (already done) |
| 4 | Nothing tests the "no route handler trusts request-supplied ownership" decision | medium | Confirmed — it existed only as prose in the handler's header and the spec. A request carrying `x-owner-id` and `x-forwarded-owner` beside a valid cookie now has to reach `listTodos` with the cookie's id. | patch |
| 5 | The spec's `## Implementation Notes` is empty and the status lags | low | True at review time only — the notes were written after the reviewer started, and the status transitions are the workflow's final step. | false |
| 6 | Two header comments elsewhere are now false | split | `client-identity.ts` confirmed: it claimed "the whole repository surface at this point in the build" and listed `listTodos` as not yet arrived. Rewritten. `errors.ts:11` refuted — "this story adds no endpoint to apply it to" is Story 1.5 speaking about itself, and that remains true. | patch + false |
| 7 | Three files carry Prettier drift, two of them new | low | Confirmed by `npx prettier --check`, and `client-identity.test.ts` was clean at `HEAD` — this change broke it. All files this story touched are now conforming. `middleware.test.ts` was already non-conforming before this change and is left alone: reformatting it wholesale is diff noise belonging to the enforcement entry `deferred-work.md` already carries. | patch |
| 8 | The route test gives two Todos the same id, and it is the owner's id | low | Confirmed. Merge-by-id (AD-16) makes a duplicated id a shape the product must never produce, so the fixture was modelling an impossible list. Two distinct UUIDv7-shaped ids. | patch |
| 9 | The handler hardcodes `kind: "load"` instead of calling `errorKindForMethod` | low | Real observation, rejected as a fix. The literal sits beside a message that is also load-specific ("The Todo List could not be read."); deriving the kind and not the message would make a copy into Story 3.1's `POST` produce `kind: "create"` with a read-failure message — a half-correct template is worse than an obviously method-specific one. | reject |
| 10 | `listTodos.length === 1` proves "first", not "first and only" | low | Confirmed — `Function.length` stops at the first defaulted parameter, so `listTodos(ownerId, options = {})` would pass too. The over-claim is gone from the title and the limit is stated at the assertion. | patch |
| 11 | The route module's exported surface is unpinned, unlike both repositories' | low | Confirmed, and Next.js routes any recognised method name it finds. Pinned to `GET` plus the message constant, with a note that Story 3.1's `POST` updates the list — the same ratchet `client-identity.test.ts` uses. | patch |
| 12 | The failure assertions accept `expect.any(String)`, which the driver's text also satisfies, and `not.toContain("todo")` passes only on the copy's capitalisation | medium | Confirmed on both counts. `LOAD_FAILED_MESSAGE` is exported and asserted by equality; the substring sweep now covers `select` and `"todo"` quoted as SQL identifiers rather than the bare word. | patch |
| 13 | No `EXPLAIN` assertion that the read uses `todo_owner_id_id_idx` | low | Rejected on evidence: the live tests insert one to three rows per owner, and Postgres will choose a sequential scan over an index at that size regardless of the index existing — the assertion would fail on correct code. A meaningful plan test needs a seeded table of realistic size, which is Epic 6's ground, not a unit test's. | reject |

### Review Findings

Code review 2026-09-22 (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor over `cabcab9..HEAD`).

- [x] [Review][Patch] The `401` dead-ends `Retry` [src/client/todos/todo-list-query.ts, middleware.ts:96-104] — **resolved 2026-09-22: carry `status` on `TodoRequestError` and reload the document on `401`.** The middleware's catch branch serves a document with no cookie when the identity store is unreachable, so every following `GET /api/todos` is `401`; `readTodoList` discards `response.status`, so Story 2.7's `Retry` would re-request and fail forever. A reload lets middleware mint a fresh identity.

- [x] [Review][Defer] `listTodos` has no `LIMIT` and no pagination [src/server/repository/todos.ts] — deferred: **the unbounded read is accepted as a stated ceiling** rather than an oversight. A single-user Todo app is unlikely to reach a size where one response and one `<ul>` become a problem, and both a silent cap and real pagination are scope the PRD never asked for. Recorded so the absence reads as a choice, which is how every other absence in this epic reads.

- [x] [Review][Patch] The one response that hands out an identity is the only one left unmarked [middleware.ts:77-88] — `privateToTheCaller` reached the `401`, the `503` and every `route.ts` response, but not the minting path, which returns `Set-Cookie` with no `Cache-Control: private, no-store` and no `Vary: Cookie`. No test covers it.
- [x] [Review][Patch] The `503` cache-privacy headers are asserted nowhere [middleware.test.ts:310-318] — pre-verified: re-inlining the bare `Response.json` at `middleware.ts:55` ships 22 files / 406 tests green.
- [x] [Review][Patch] `loadFailedResponse()` hardcodes `kind: "load"` while `errorKindForMethod()` exists and is unimported here [app/api/todos/route.ts:42-48] — a trap for Story 3.1, when a failed create will report `load` to the single error slot.
- [x] [Review][Patch] `privateToTheCaller` is not idempotent and neither test would notice [src/server/identity/request-identity.ts:68-72] — `headers.append("Vary", "Cookie")` twice yields `Cookie, Cookie`; both assertions use `toMatch(/\bCookie\b/)`, which passes on the duplicate. `headers.set` also throws on an immutable `Headers`.
- [x] [Review][Patch] The `401` envelope test still accepts `expect.any(String)` for `message` [app/api/todos/route.test.ts] — triage row 12 applied the exported-constant fix to the `500` path only.
- [x] [Review][Patch] The export-surface assertion forbids Next's route segment config [app/api/todos/route.test.ts] — `toEqual(["GET", "LOAD_FAILED_MESSAGE"])` fails on any `export const dynamic` / `revalidate` / `runtime`, which are the declarations that would make the never-cached intent explicit.
- [x] [Review][Defer] AC1 says `created_at`; the contract and the code say `createdAt` [epics.md:509] — deferred: the fix edits planning documents, not code. The decision (contract wins) is sound and recorded in Implementation Notes; `epics.md` still contradicts it.
