---
title: 'Story 3.1: Accept and validate a new Todo at the server'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/docs/implementation-artifacts/epic-3-context.md'
  - '{project-root}/docs/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/api/todos/route.ts` serves only `GET`. Nothing in the product can create a Todo, so FR-1 is unreachable and the durable persistence built in Epic 1 is still unobservable. The endpoint must also be safe against a caller that is not our interface, and safe against the client retrying a create it never saw answered — which, without an idempotency rule, gives the user two Todos for one thought.

**Approach:** Add `POST /api/todos` to the existing handler and `createTodo` to the existing repository. The client mints the id and sends it; the server never generates one. A create for an id that already exists returns the existing row untouched when the owner matches, and refuses without disclosure when it does not. Validation is imported from `src/shared/contract/`, never retyped, and re-enforced here as a trust boundary.

**Decisions recorded at planning time** (the first was the human's; the rest follow from the repository's own constraints and are the agent's):

1. **Status codes — `201` created, `200` idempotent same-owner retry, `400` validation failure, `409` foreign owner, `401` no identity.** 201-vs-200 is what lets a client tell a create from a replay, which makes AC3's explicit "with `200`" carry information rather than restate the default. Epics 4 and 5 inherit this mapping.
2. **UUIDv7 validation is a hand-written lowercase-canonical regex living under `src/server/`.** The `uuidv7` package exports a generator, not a v7 validator, so installing it would not satisfy AC2 — and installing it is Story 3.3's job. It cannot live in `src/shared/contract/`: `contract.test.ts:493` pins that directory to exactly three source files. Postgres's `uuid` type is not a substitute — it accepts a v4 and normalises case, satisfying neither half of AC2.
3. **Idempotency is `ON CONFLICT (id) DO NOTHING RETURNING *`, then a scoped `SELECT` only when nothing came back.** The `neon-http` driver has no interactive transaction (`src/server/repository/client.ts:10-17`), so a read-then-write would be racy. `DO NOTHING` makes the insert the arbiter; the follow-up read decides `200` from `409` by owner. The existing row is never written to, so AC3's "the stored row is not modified" is true structurally rather than by a condition that remembered to be careful.
4. **The `POST` body gets a local two-field type in `route.ts`, not a shared one.** `contract.test.ts:329` fails any type outside the contract directory that declares `text`, `completed` *and* `createdAt`; a `{ id, text }` request type declares two of the three and is safe. A shared wire type is impossible while the directory is pinned at three files.
5. **The three ratchet assertions are updated, not worked around** — `app/api/todos/route.test.ts:237` (the pinned export surface), `src/server/repository/todos.test.ts:146` (the pinned repository surface) and `src/server/repository/client-identity.test.ts:296` (which fails the moment `createTodo` is exported). Each carries a comment naming this story as the one that updates it.
6. **Constraining `ErrorEnvelope["error"]["message"]` by mechanism stays deferred.** This story adds a sibling module constant beside `LOAD_FAILED_MESSAGE` and re-defers the lint-selector fix, which is a fourth concern and would expand the story past its acceptance criteria.

</frozen-after-approval>

## Implementation Notes

### What was built

| File | Change |
| --- | --- |
| `src/server/validation/todo-id.ts` | **New.** `isCanonicalUuidV7(value)` — one anchored regex, no imports, no dependency. |
| `src/server/validation/todo-id.test.ts` | **New.** AC2's unit coverage: 40 cases across accept and refuse. |
| `src/server/repository/todos.ts` | `createTodo(ownerId, id, text)` and the exported `CreateTodoResult` type; `wireColumns` and `toWireTodo` factored out of `listTodos` so both queries project and convert through one place. |
| `src/server/repository/todos.test.ts` | Eight live rows for `createTodo`; the pinned repository surface is now `["createTodo", "listTodos"]`. |
| `app/api/todos/route.ts` | `POST`, `CREATE_FAILED_MESSAGE`, the local `CreateTodoRequest` type and its structural guard; `requestFailedResponse` now takes `(method, status, message)`. |
| `app/api/todos/route.test.ts` | Fifty-odd rows for `POST`; the pinned export surface is now the four names. |
| `src/server/repository/client-identity.test.ts` | `"createTodo"` removed from the not-yet-exported list, as the story planned. |

No migration: `schema.ts` already had the table, the client-supplied primary key with no `.defaultRandom()`, the `completed` and `created_at` defaults and the `(owner_id, id DESC)` index.

### `createTodo`'s return shape

```ts
export type CreateTodoResult =
  | { outcome: "created"; todo: Todo }
  | { outcome: "existing"; todo: Todo }
  | { outcome: "foreign-owner" };
```

A discriminated union rather than `Todo | undefined`, because the three outcomes
are three different HTTP answers (`201`, `200`, `409`) and the handler has to
choose between them without reading a Drizzle result — which is the half of AC5
that "the route handler builds no query" does not say out loud. It wraps `Todo`
rather than restating its fields: a declaration outside `src/shared/contract/`
carrying `text`, `completed` and `createdAt` together fails `contract.test.ts`,
and wrapping also keeps the contract the one definition.

The `foreign-owner` member carries no row at all. The follow-up `SELECT` is
scoped to `(id, owner_id)` rather than to `id` alone, so a row the caller does
not own reads as absent and this function never holds the other person's text —
there is nothing for a later change to leak, which is a stronger form of AC4
than "remember not to include it in the response". The cost is that the same
verdict covers the vanishingly narrow race where the conflicting row is deleted
between the two statements; `409` is the honest answer to "that id is not yours
to create" in both cases, and it is documented at the function.

### Decisions taken during implementation

- **One failure message for every `POST` refusal**, not one per status. AC4's
  "discloses nothing about the existing row" is violated by a message that says
  an id is taken, so the `400`, the `409` and the `500` all answer
  `CREATE_FAILED_MESSAGE` and the status code carries the distinction. This is
  the single sibling constant the frozen decision 6 called for.
- **`requestFailedResponse` takes `(method, status, message)`.** Only the
  hardcoded message was generalised, as planned; the kind still comes from
  `errorKindForMethod`, so `POST` is classified `create` without the handler
  naming a kind anywhere.
- **`request.json()` is `.catch`ed rather than left to the outer `try`.** This
  is an AC11 requirement in disguise: `SyntaxError` from `JSON.parse` quotes the
  offending input, so a malformed body reaching the catch block would put a
  fragment of the submitted Todo in a log line. A body that is not JSON is a
  caller error and answers `400` without logging anything. A regression test
  pins it.
- **Validation is three explicit steps** — shape, then id, then text — rather
  than one predicate. Each maps to a criterion (AC1's body, AC2, AC7/AC8) and
  each is separately testable, and the guard stays structural so a numeric `id`
  and a missing `text` are refused before the id regex ever runs.
- **`wireColumns` / `toWireTodo` were factored out of `listTodos`.** Two queries
  now project the same four columns and convert the timestamp in one place; the
  mapper's parameter is annotated inline because a *named* type spelling out
  `text`, `completed` and `createdAt` would be a competing Todo shape.
- **AC9's "imports the predicate and the constant"**: `route.ts` imports
  `isValidTodoText`; `TODO_TEXT_MAX_LENGTH` is imported by `route.test.ts` to
  build the at-the-cap and over-the-cap cases. The predicate already enforces
  the ceiling, so importing the constant into the handler as well would have
  been dead code — and an early raw-length check would be wrong, since
  `"  " + 500 chars + "  "` is valid once trimmed. What AC9 protects is that the
  number `500` is never retyped on the server side, and it is not: neither in
  the handler, nor in the repository, nor in the tests.

### Surprises

- **The `POST` body cannot use `NextRequest`'s cookie helper and a stream
  together in tests** — not an issue in the end, but the test harness builds
  `POST`s with a fresh helper (`postRequest`) rather than extending
  `requestWith`, because a body and a cookie header are set through different
  options and folding both into one four-argument helper made every call site
  harder to read than two helpers do.
- **The whole `409` path is unreachable from our own client**, since a client
  only ever submits ids it minted itself. It exists because the endpoint must be
  safe against a caller that is not our interface, and the live tests are the
  only place it is exercised.
- **`DATABASE_URL` is still stale.** The eight pre-existing repository failures
  are unchanged in cause, and the seven new live `createTodo` rows fail the same
  way: `NeonDbError: password authentication failed for user 'neondb_owner'`.
  Totals went from `8 failed | 540 passed (548)` to `15 failed | 625 passed
  (640)` — every one of the fifteen is that credential error and nothing else.
  (Story 3.2 landed `src/client/device/pointer.ts` in the same working tree
  shortly afterwards, which trips `src/client/motion/motion.test.ts`'s
  single-reader scan for `matchMedia`. Two further failures, neither of them
  this story's and neither in a file this story owns.)
  The epic context flagged this as an inherited condition; `createTodo`'s
  idempotency and its owner scoping are therefore written but **not yet
  demonstrated**, and re-running this file against a current branch is the last
  thing standing between AC3/AC4 and proof.

### Review fixes (review loop, server side)

Eight confirmed findings, all in the server half of this story. `src/client/`,
`app/globals.css` and `app/page.test.ts` were being edited concurrently by
Story 3.2 and were not touched.

| # | Finding | Fix |
| --- | --- | --- |
| 1 | **AC11 was violated in production.** Both catch blocks logged `error.message` whole. Drizzle builds every driver failure as `` new Error(`Failed query: ${query}\nparams: ${params}`) `` (`node_modules/drizzle-orm/errors.js`, `DrizzleQueryError`, thrown from `pg-core/session.js`'s `queryWithCache`), and the submitted Todo text is a bound parameter of the `createTodo` insert — so the text reached the log line. | `logSafeError(error)` in `route.ts`: cut the message at `\nparams:`, keep the statement summary, fall back to `error.name`, then to `"unknown error"` for a non-`Error` throw. Applied in **both** `GET` and `POST` — `GET`'s parameter is only an owner id today, but insulation that depends on which query is running breaks the first time one changes, and `resolveClientIdentity` runs inside both. Not exported: the surface ratchet pins exactly four names. |
| 2 | **The AC11 regression test could not fail.** The `DRIVER_ERROR` fixture's params said `-- params: Buy milk` while the test submitted `"pick up the dry cleaning"` and asserted only that *that* string was absent — and `-- params:` is not the separator Drizzle emits. | A `drizzleQueryError(query, params)` helper builds fixtures with the real `\nparams:` separator and `${params}` array interpolation. Both the `GET` and the `POST` fixtures now use it, the `POST` fixture's params carry the exact text the requests submit, and a guard row asserts the fixture itself contains that text — so if the fixture ever stops being the leak, that row fails rather than the AC11 rows passing quietly. Three further rows: the statement *is* still logged (silence is the cheap way to pass a leak check), a params-only message logs the error's name rather than a blank line, and a non-`Error` rejection leaks nothing. |
| 3 | **No repository test drove a real driver error.** | `createTodo` with an `ownerId` that has no `client_identity` row — the foreign-key failure, and the exact path that produces the leaking message. Asserts the rejection and that no row was written. |
| 4 | **The idempotency race was untested.** Every row in the describe was sequential and would pass against the read-then-write `createTodo`'s doc comment rules out. | `Promise.all([createTodo(o, id, "the first attempt"), createTodo(o, id, "the retry")])`, asserting the two outcomes sort to `["created", "existing"]`, exactly one row for that id in the table, and one row in `listTodos`. |
| 5 | **Two vacuous assertions.** `storedRow()` answers `undefined` for an absent row, so both `toEqual(before)` comparisons passed as `undefined === undefined` if the seeding create silently wrote nothing. | `expect(before).toBeDefined()` before each. |
| 6 | **`todo-id.test.ts` cross-checked the wrong generator.** It asserted `isCanonicalUuidV7(mintIdentityId())` and claimed to catch Story 3.3's `uuidv7` swap — but `mintIdentityId` mints the *Client Identity* id, a different call site (AD-4's client Todo-id minting is the one Story 3.3 replaces) that never reaches this validator. | The row is re-aimed at what it can actually prove: 100 ids assembled from random hex with only the version and variant nibbles constrained, proving the predicate accepts every RFC 9562 layout the random bits produce. The `@/server/identity/identity-token` import is gone, so the unit test depends on nothing but the predicate; a header comment records that the real generator cross-check belongs to Story 3.3, beside the generator it is about. `node:crypto`'s `randomUUID()` stays — it appears only as a v4 the validator must refuse. |
| 6b | **Two id sources in `todos.test.ts`** — `mintIdentityId()` for Todo ids, `randomUUID()` for owners. | One source, aliased as `freshId`. Both `client_identity.id` and `todo.id` are UUIDv7 in production (SPINE "Ids", AD-4); half the fixtures were v4s, a shape neither column ever holds. `node:crypto` is no longer imported by this file. |
| 7 | **AC10 rested on two independent `.trim()` calls agreeing.** `isValidTodoText` trims internally to decide; `route.ts` trims again to persist, and nothing pinned the two together. | The shared contract's API is unchanged (it stays a verdict, per AD-11). A new row submits text valid *only* after trimming — over the cap raw, padded with a non-breaking space — and asserts the persisted string is exactly `TODO_TEXT_MAX_LENGTH` long, still satisfies `isValidTodoText`, and is a fixed point of a further trim. One character of padding left behind would be 501, which is precisely the disagreement that would make the predicate's verdict a lie. |
| 8 | **The success paths were not pinned against identity issuance.** AD-17 says a route handler never issues one, full stop; only the `401` path asserted it. | A new describe extends `createClientIdentity` not-called to the `201`, the `200` and the `409`, each with its status asserted so the row cannot pass by taking a different path. |

Deliberately **not** touched, as already recorded in `deferred-work.md`: the
request body size guard, `src/server/validation/`'s absence from
ARCHITECTURE-SPINE.md, `requestFailedResponse`'s conventional status/message
pairing, the UTF-16 code-unit semantics of the 500 cap, a NUL in text answering
`500`, and the missing `Content-Type`/`415` check.

**Verification.** `npm run lint` clean at `--max-warnings=0`; `npm run typecheck`
clean; `npx vitest run app/api/todos/route.test.ts
src/server/validation/todo-id.test.ts` green at 110 tests. The AC11 fix was
mutation-checked: reverting `logSafeError` to `error.message` fails four rows,
including the one that previously could not fail.

Full suite: `17 failed | 686 passed (703)`, all seventeen in the two live
repository files and every one of them `NeonDbError: password authentication
failed for user 'neondb_owner'` — the same stale `DATABASE_URL` recorded above.
That is the prior 15 plus exactly the two live rows added here (#3 and #4). No
new kind of failure.

### 2026-09-23, after the fact — the credential was refreshed and the suite is fully green

The notes above record the live repository rows as failing on a stale `DATABASE_URL`. That condition is gone: the user refreshed the credential and `npm test` now reports **714 passed, 0 failed** across 34 files.

This matters beyond the count. Three of this story's criteria could only ever be *asserted* while the database was unreachable, and all three are now demonstrated against the live branch:

- AC3's idempotent same-owner retry returns the existing row and leaves it unmodified.
- AC3's race — two interleaved retries for one id settle as one `created`, one `existing`, and exactly one row. This is the criterion the `ON CONFLICT (id) DO NOTHING` design was chosen for, and it had never actually run.
- AC4's foreign owner is refused, touching nothing and carrying nothing of the other owner's row.

The foreign-key path added during the review pass — a create under an owner with no `client_identity` row — also runs and rejects without writing, which is the path that produced the leaking log line `logSafeError` now closes.

## Review Triage Log

One review layer ran (Blind Hunter, context-free, over the server half of the worktree). Fourteen findings; each was checked against the cited file before a verdict was written.

**Patched**

- `high` — **AC11 was violated in production.** Both catch blocks logged `error.message`, and Drizzle builds `DrizzleQueryError` as `` new Error(`Failed query: ${query}\nparams: ${params}`) `` (`node_modules/drizzle-orm/errors.js`, thrown from `pg-core/session.js`'s `queryWithCache`). The submitted Todo text is a bound parameter of the `createTodo` insert. Verified twice over: at the construction site, and in this repository's own suite output, which already prints `Failed query: insert into "client_identity" … params: f4283dfb-…`. Fixed with `logSafeError`, applied to `GET` as well as `POST`.
- `high` — **The AC11 regression test could not fail.** The `DRIVER_ERROR` fixture's params carried `Buy milk` while the test submitted `pick up the dry cleaning` and asserted only the absence of the latter; the fixture also spelled `-- params:` where Drizzle emits `\nparams:`. Fixed so the fixture carries the exact submitted text in the real shape, plus a guard row asserting the fixture itself still contains it. Mutation-checked: reverting `logSafeError` to `error.message` now fails four rows.
- `medium` — No repository test drove a real driver error; both layers only ever saw a hand-written `Error`. Added the live foreign-key case (a create under an owner with no `client_identity` row).
- `medium` — The idempotency race that `ON CONFLICT (id) DO NOTHING` was chosen for was never exercised; every row in the describe was sequential. Added a `Promise.all` race asserting one `created`, one `existing`, and exactly one row.
- `medium` — Two assertions were vacuous: `storedRow()` returns `rows.at(0)`, so a silently-unwritten seed made `undefined === undefined` pass. Added `expect(before).toBeDefined()` to both.
- `medium` — `todo-id.test.ts` cross-checked against `mintIdentityId`, the *Client Identity* minter. Story 3.3 replaces the *client's Todo-id* minting, a different call site this row would never see, so the assertion could not catch what it claimed to. Re-aimed at what it can prove, and the server-identity import dropped from an otherwise dependency-free unit test.
- `medium` — AC10 rested on two independent `.trim()` calls agreeing forever, with nothing pinning it. Added a test that the persisted string is exactly the string the predicate measured. The shared contract's API is unchanged.
- `medium` — AD-17 was pinned only on the `401` path. Extended to the `201`, `200` and `409` responses.

**Deferred** (each has an entry in `deferred-work.md`)

- `medium` — No request-body size guard ahead of `request.json()`. The same guard is wanted by Epics 4 and 5; writing it once there beats generalising it twice.
- `medium` — A NUL in `text` answers `500` where `400` is honest. Deciding which control characters a Todo may hold is a contract decision, and that predicate is shared with the client input this story did not own.
- `low` — `src/server/validation/` is absent from `ARCHITECTURE-SPINE.md`'s source tree. Deferred by rule: the fix edits a planning artifact.
- `low` — `requestFailedResponse`'s status and message can drift apart. Making the pairing structural adds a type that Story 4.1 can design against two callers rather than one.
- `low` — No `Content-Type` check. The `SameSite=Lax` identity cookie mitigates the cross-origin form-post case, so this is a structural statement rather than a live vulnerability.

**False**

- The claim that the UTF-16 measure makes **the client counter and the server cap disagree** does not happen. `maxLength`, the counter's `text.length` and `isValidTodoText`'s `.length` all count UTF-16 code units, so the two layers agree exactly. What survives is only that `500` means 500 code units rather than 500 typed characters — a product-semantics gap with no user-visible inconsistency behind it, recorded in `deferred-work.md` rather than fixed.
