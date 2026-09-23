---
title: "Story 4.1: Set a Todo's Completion Status at the server"
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: 'e080fc2fafda2c3873ac102309a046c4e9e89773'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/planning-artifacts/epics.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      `src/server/http/` joins `src/server/validation/` as a server directory no
      architecture document lists.
    evidence: |-
      `ARCHITECTURE-SPINE.md`'s source tree names only `identity/`, `repository/`
      and `db/` under `src/server/`. `deferred-work.md` already carries the same
      open entry for `src/server/validation/`, and `route-failure.ts`'s own header
      cites that directory as its precedent. Deferred by rule: the fix edits a
      planning artifact.
    location: >-
      src/server/http/route-failure.ts
    severity: low
  - summary: >-
      `requestFailedResponse` still ties no status code to its message, and is now
      exported and accepting any string from any module.
    evidence: |-
      `deferred-work.md:266` names Story 4.1 as the natural owner of making the
      pairing structural, on the grounds that a second caller would let the shape
      be designed against more than one. The extraction was taken and the pairing
      was not: a `{status, message}` descriptor type would still let any caller
      pair any two, so it buys nothing until there is a catalogue to pair against.
      The evidence text at that entry also still places the helper in
      `app/api/todos/route.ts`, which is now stale. Three callers exist as of this
      story, which is the threshold at which a catalogue starts to pay.
    location: >-
      src/server/http/route-failure.ts
    severity: medium
  - summary: >-
      No `Content-Type` check on any mutating endpoint, though `PATCH` is now the
      second one.
    evidence: |-
      `deferred-work.md` routes the `415` check to "write it once for all three
      mutating endpoints". `PATCH /api/todos/:id` parses any media type it is
      handed; the `SameSite=Lax` identity cookie mitigates the cross-origin
      form-post case, so this stays a structural statement rather than a live
      vulnerability. Epic 5's `DELETE` is the third endpoint and the point at
      which writing it once is cheapest.
    location: >-
      app/api/todos/[id]/route.ts
    severity: low
  - summary: >-
      No request-body size guard ahead of `request.json()` on the update path.
    evidence: |-
      The same gap Story 3.1 recorded for `POST`. `PATCH`'s body is one boolean,
      so an arbitrarily large document is buffered and parsed only to be refused
      by a one-field predicate. App Router route handlers carry no default body
      cap. Cheapest fix remains a `content-length` check ahead of the parse,
      written once for every mutating endpoint rather than per endpoint.
    location: >-
      app/api/todos/[id]/route.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing in the product can change a Todo's Completion Status. `app/api/todos/route.ts` serves `GET` and `POST` on the collection only, and the repository exports `listTodos` and `createTodo` and nothing else, so FR-3 has no server behind it and Story 4.2's optimistic checkbox would have nothing to confirm against. The endpoint must also be safe against a caller that is not our interface: a retry must not flip the status a second time, and a request for somebody else's Todo must change nothing and reveal nothing.

**Approach:** Add `PATCH /api/todos/:id` as a new route handler at `app/api/todos/[id]/route.ts`, and `setTodoCompleted(ownerId, id, completed)` to the existing repository as one owner-scoped `UPDATE ... RETURNING`. The request carries the value the user asked for, never an instruction to invert, so the operation is idempotent by shape rather than by a guard. The two cross-endpoint helpers the collection route grew for Story 3.1 — the enveloped failure response and the log-safe error summary — move to `src/server/http/route-failure.ts` and are imported by both handlers rather than copied into the second one.

## Boundaries & Constraints

**Always:** The repository is the only Drizzle importer and takes `ownerId` first (AD-2); the route handler builds no query. Identity is resolved from the cookie via `resolveClientIdentity` and never read from the body or the path (AD-7, AD-17); the handler never issues one. Every response passes through `privateToTheCaller`. Success is the updated `Todo` bare in the shared contract's shape with no envelope; every failure is an `ErrorEnvelope` whose `kind` comes from `errorKindForMethod(request.method)` — `PATCH` already maps to `update` — and whose `message` is a fixed module constant, never composed from a caught error. The path id is validated with the existing `isCanonicalUuidV7` before any query runs.

**Never:** No toggle endpoint, and no endpoint whose result depends on the current stored value. No `text` or `createdAt` write on this path. No new Todo shape outside `src/shared/contract/` (`contract.test.ts` fails any declaration spelling `text`, `completed` and `createdAt` together, and pins the contract directory at three modules plus two tests). No `RouteContext<'/api/todos/[id]'>`: that helper comes from `.next/types`, which `npm run build` regenerates only *after* `lint` and `typecheck` have already run. No client work — the checkbox, the optimistic write and the revert are Stories 4.2 and 4.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Set completed | `PATCH /api/todos/:id` `{"completed":true}`, caller owns the row | `200`, the updated Todo bare, `completed:true`, `text` and `createdAt` unchanged | No error expected |
| Set uncompleted | Same request with `{"completed":false}` on a completed row | `200`, `completed:false` | No error expected |
| Idempotent repeat | The same `PATCH` sent twice | Second response equals the first; stored value is the value asked for, not its inverse | No error expected |
| Foreign owner | Caller does not own `:id` | `404`, `UPDATE_FAILED_MESSAGE`, row untouched, nothing of the row in body or headers | Indistinguishable from a Todo that does not exist |
| Unknown id | Well-formed UUIDv7 that names no row | `404`, `UPDATE_FAILED_MESSAGE` | Same body as the foreign-owner case |
| Malformed id | `:id` is not a lowercase-canonical UUIDv7 | `400`, `UPDATE_FAILED_MESSAGE`, no query runs | Refused before the repository |
| Bad body | Not JSON, or `completed` absent/not a boolean | `400`, `UPDATE_FAILED_MESSAGE` | `request.json()` rejection is caught locally, never logged |
| No identity | No cookie, or one naming no row | `401` via `unauthorizedIdentityResponse("PATCH")`, kind `update` | No identity issued |
| Driver failure | The `UPDATE` rejects | `500`, `UPDATE_FAILED_MESSAGE`, kind `update` | Statement summary logged via `logSafeError`; no bound parameters |

</intent-contract>

## Code Map

- `app/api/todos/[id]/route.ts` -- **New.** The only file this story adds under `app/`. Next 16: the handler's second argument is `{ params: Promise<{ id: string }> }` and must be awaited (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`).
- `app/api/todos/[id]/route.test.ts` -- **New.** Mirrors `app/api/todos/route.test.ts`'s pattern exactly: `vi.hoisted` mocks for `@/server/repository/client-identity` and `@/server/repository/todos`, `NextRequest` fixtures, `drizzleQueryError` for the driver case.
- `app/api/todos/route.ts` -- The sibling handler. `requestFailedResponse` (`:106-116`) and `logSafeError` (`:82-88`) move out of it; `LOAD_FAILED_MESSAGE` and `CREATE_FAILED_MESSAGE` stay. Its four-name export surface is unchanged.
- `app/api/todos/route.test.ts:288-303` -- Pins that surface. No name changes; the comment claiming `PATCH` will join *this* file is now wrong and is corrected in place.
- `src/server/http/route-failure.ts` -- **New.** The extracted `requestFailedResponse(method, status, message)` and `logSafeError(error)`. `src/server/validation/` is the precedent for a new sibling directory; `eslint.config.mjs:456` covers all of `src/server/` outside the repository and schema.
- `src/server/http/route-failure.test.ts` -- **New.** Direct unit coverage, including the `\nparams:` cut that `route.test.ts` can only reach through a handler.
- `src/server/repository/todos.ts:16-44` -- `wireColumns` and `toWireTodo`, already factored out for `createTodo`; `setTodoCompleted` projects and converts through the same two.
- `src/server/repository/todos.test.ts:340-348` -- The pinned repository surface, currently `["createTodo","listTodos"]`. Live tests against the Neon branch; helpers `freshOwner`, `freshId`, `insertTodo`, and `afterAll` cleanup at `:37-46`.
- `src/server/repository/client-identity.test.ts:296-305` -- Scans the repository source for functions not yet exported; `"setTodoCompleted"` leaves the list here, as `createTodo` did in Story 3.1.
- `src/server/identity/request-identity.ts:41-53,69-83,93-102` -- `errorKindForMethod` (`PATCH` → `update`, no change needed), `privateToTheCaller`, `unauthorizedIdentityResponse`. Read-only.
- `src/server/validation/todo-id.ts` -- `isCanonicalUuidV7`, reused for the path segment. Read-only.
- `src/shared/contract/errors.ts:15-23` / `todo.ts:16-25` -- `ErrorKind`/`ErrorEnvelope` and `Todo`. Read-only; imported, never restated.
- `middleware.ts:39-41,58-67` -- Already answers `401` for anything under `/api/`, so the new route is covered without a matcher change. Read-only.

## Tasks & Acceptance

**Execution:**
- `src/server/http/route-failure.ts` -- create; move `logSafeError` and `requestFailedResponse` verbatim from `app/api/todos/route.ts`, exported, with their doc comments -- two endpoints now need them and the second must not hold a copy.
- `src/server/http/route-failure.test.ts` -- create; unit-test both: the `\nparams:` cut, the empty-message fall back to `error.name`, the non-`Error` throw, and that the envelope's `kind` follows the method while the message is the argument -- the I/O matrix's log-safety and envelope rows, proved without a handler in the way.
- `app/api/todos/route.ts` -- delete the two local helpers and import them from `@/server/http/route-failure` -- one definition, no behaviour change.
- `app/api/todos/route.test.ts` -- correct the surface-test comment to say `PATCH` lands at `app/api/todos/[id]/route.ts` -- the renumbering/relocation drift rule: fix it in the file being touched.
- `src/server/repository/todos.ts` -- add `setTodoCompleted(ownerId, id, completed): Promise<Todo | undefined>` as a single `UPDATE ... WHERE id = ? AND owner_id = ? RETURNING wireColumns` -- one statement makes ownership part of the write rather than a check before it.
- `src/server/repository/todos.test.ts` -- add live rows for `setTodoCompleted` (set true, set false, idempotent repeat, foreign owner untouched, unknown id, `text`/`createdAt` preserved, wire-shape keys) and update the pinned surface to the three names.
- `src/server/repository/client-identity.test.ts` -- drop `"setTodoCompleted"` from the not-yet-exported list, leaving `["deleteTodo"]`.
- `app/api/todos/[id]/route.ts` -- create; `PATCH` plus the exported `UPDATE_FAILED_MESSAGE` -- identity, then path-id form, then body shape, then the repository, in that order.
- `app/api/todos/[id]/route.test.ts` -- create; cover every I/O matrix row, pin the module's export surface to `["PATCH","UPDATE_FAILED_MESSAGE"]`, and assert no identity is issued on any path.

**Acceptance Criteria:**
- Given the repository's exported surface, when it is inspected, then `setTodoCompleted` takes `ownerId` as its first parameter and the module exports exactly `createTodo`, `listTodos` and `setTodoCompleted` (AC5).
- Given the `app/api` tree, when its route files and their exported HTTP methods are enumerated by a test, then the only endpoints are `GET`/`POST` on `/api/todos` and `PATCH` on `/api/todos/[id]`, with no route segment or export offering a toggle (AC2).
- Given a successful `PATCH`, when the response is read, then it is the bare updated Todo with exactly the keys `completed`, `createdAt`, `id`, `text`, carries no error envelope, and carries `Cache-Control: private, no-store` and `Vary: Cookie` (AC1).
- Given two `PATCH`es with the same body for the same Todo, when both have been served, then the stored `completed` equals the value both requests carried and the second response body equals the first (AC3).
- Given a `PATCH` for a Todo owned by someone else, when it is served, then the stored row is byte-for-byte unchanged and the response is identical to the one for an id that names no row at all (AC4).
- Given any failure this endpoint reports, when its body is parsed, then `error.kind` is `update` and `error.message` is exactly `UPDATE_FAILED_MESSAGE` — never a driver string (AC6).
- Given a driver failure during the update, when the handler logs it, then the logged text contains the statement summary and nothing after `\nparams:`.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 27 findings — high 0, medium 9, low 18, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The extracted helper test is not database-free — `route-failure.ts` imported `errorKindForMethod` from `request-identity`, which value-imports the repository and loads the Drizzle client at module scope. Verified: `DATABASE_URL="" npx vitest run src/server/http` died at import with zero tests run. Fixed by moving `errorKindForMethod` into `route-failure.ts`, which now imports only the shared contract; the same command now runs 23 tests.
  - `[medium]` `[patch]` The AC2 tree scan rooted at `app/api` and matched only the literal `route.ts`, so a toggle at `app/todos/toggle/route.ts` or any `route.tsx` would pass the one test that exists to make AC2 true of the tree. Fixed to walk `app/` and match the extension set Next routes; the implementer confirmed it bites by planting a `route.js` exporting `PUT`.
  - `[low]` `[patch]` That scan also ran `readdirSync` at module scope against `process.cwd()`, so a run from another directory failed the file with an ENOENT naming neither test nor reason. Root now resolved from `import.meta.url`, read moved inside the `it`.
  - `[low]` `[patch]` The cache-header rows asserted `Vary` with `/\bCookie\b/`, the exact trap `privateToTheCaller`'s own comment documents — it passes on `Vary: Cookie, Cookie`. Now asserts the exact value.
  - `[low]` `[reject]` The spec's AC6 says "any failure ... message is exactly `UPDATE_FAILED_MESSAGE`" while the `401` carries its own message. Rejected by rule: the only fix is to edit this build's spec. No code defect — the I/O matrix already records the `401` as carrying `unauthorizedIdentityResponse`'s message, and the test pins that string.
  - `[low]` `[defer]` `src/server/http/` is a second server directory absent from the architecture spine's source tree. Fix edits a planning artifact.
  - `[medium]` `[defer]` Two deferrals naming Story 4.1 as owner were declined without being re-recorded — the structural status/message pairing, and the `415` check now that `PATCH` is the second mutating endpoint. Both recorded in frontmatter `deferred`.
  - `[low]` `[patch]` The concurrent-repeat repository test fires two identical `true` updates, which every implementation satisfies including read-then-write, while its comment claimed it would catch one. Comment reworded to what the row proves.
  - `[low]` `[patch]` `ownedId()` pushed to `insertedTodoIds` and `insertTodo` pushed again, registering every row for cleanup twice. Helper removed.
  - `[medium]` `[patch]` `drizzleQueryError` was copied into three test files, and it encodes drizzle-orm's private message format — the exact drift the story's own extraction argument is about. Moved to `src/test-support/drizzle-error.ts` and imported by all four consumers.
  - `[low]` `[patch]` Two log rows iterated `logged.mock.calls[0]` without first asserting a call happened, so a handler that stopped logging would throw a TypeError instead of reporting the real expectation. Added the `toHaveBeenCalledTimes(1)` line the sibling row already had.
  - `[low]` `[patch]` Nothing asserted a cookie-less request short-circuits before `findClientIdentityByTokenHash`, and the identity-lookup `500` was missing from the cache-header table. One row added to each.
  - `[low]` `[patch]` The 404 `it.each` labelled its first row "owned by somebody else" but hardcoded a literal identical to `TODO_ID`; and the arity row was labelled "takes `ownerId` first", which arity cannot prove. Distinct `FOREIGN_ID` added; label corrected to point at the live owner-scoped rows as what pins position.
  - `[medium]` `[defer]` No request-body size guard ahead of `request.json()`. Pre-existing and recorded for Story 3.1; `PATCH`'s body is one boolean. Recorded in frontmatter `deferred`.
  - `[low]` `[reject]` Undefined verbs on `/api/todos/:id` get Next's default `405` with no envelope and no cache headers. Rejected: the collection route has the same property, no client sends those verbs, and the fix adds five exported handlers — public surface, which a patch may not add.
  - `[low]` `[reject]` Two concurrent `PATCH`es carrying different values resolve last-write-wins, and the loser gets a `200` describing a value no longer stored. Rejected: that is what "a set, never a toggle" means for a single-owner resource, and the fix wants a version column and optimistic-concurrency state the story never demonstrated a need for.
  - `[medium]` `[patch]` Route-file matching misses extensions Next routes. Grouped with the AC2 scan finding above; same fix.
  - `[medium]` `[defer]` `requestFailedResponse` is now exported and accepts any string, including an interpolated driver error, from any module. Grouped with the declined-deferral entry above; recorded in frontmatter `deferred`.
  - `[low]` `[reject]` The `401`'s message differs from `UPDATE_FAILED_MESSAGE`. Duplicate of the AC6 finding above; rejected on the same refutation.
  - `[low]` `[reject]` The spec said the helpers moved "verbatim" while their doc comments were rewritten. Rejected: the function bodies are byte-identical, the prose changes are corrections, and no outcome follows for users or developers.
  - `[medium]` `[patch]` `middleware.ts` did not adopt the newly shared `logSafeError` — its catch logged `error.message` whole, so a Drizzle rejection there writes the stored token hash and identity id into a log line. Its only test used a fixture with no `\nparams:` section and passed either way. Fixed to use `logSafeError`; a new test row with the shared fixture was mutation-checked — reverting the fix fails it.
  - `[low]` `[patch]` `middleware.ts`'s comment justified logging `error.message` with a rationale the new module documents as false. Grouped with the above; comment replaced with the real one.
  - `[medium]` `[patch]` `identityUnavailableResponse` still built the `ErrorEnvelope` inline — the second copy the extraction exists to prevent, one directory away from the new home. Grouped with the above; now built through `requestFailedResponse`, same status, message and wrap.
  - `[low]` `[patch]` The driver fixture listed the Todo's text as a fourth bound parameter and the handler comment claimed `RETURNING` makes it ride along; the `UPDATE` binds only `(completed, id, ownerId)`. Fixture and both comments corrected; `route-failure.test.ts` carried the same error and now uses the insert statement, which genuinely binds the text its assertion is about.
  - `[low]` `[reject]` The intent is phrased at the interaction surface while every change and assertion sits at the HTTP/SQL surface below it. Rejected as a finding: this workflow builds one story per run, Story 4.1 is the epic's server story by design, and the frontmatter `multiple-goals` warning already records that 4.2-4.4 remain.
  - `[low]` `[patch]` `sprint-status.yaml` still read `epic-4: backlog` with the story complete. Tracker updated to `epic-4: in-progress` and the story `done`, matching the file's own workflow note.
  - `[low]` `[reject]` The spec omits `route: 'oneshot'` and carries warnings `spec-3-1` did not. Rejected: a process-shape difference between two skills with no outcome for the code.

## Design Notes

**`404` for both the foreign owner and the missing row.** Story 3.1 chose `409` for a *create* whose id was taken, because there the conflict is the answer. An update has no such distinction to draw: AC4 asks that the response disclose nothing about a row the caller does not own, and any status that separates "not yours" from "not there" is itself the disclosure. Owner scoping in the `WHERE` clause makes the two states produce one result — `undefined` — so the handler cannot tell them apart even if a later change wanted it to.

**One statement, not a read-then-write.** `neon-http` has no interactive transaction (`src/server/repository/client.ts`), so a check-then-update would be racy and would also hold the other owner's row in memory on the refusal path. The update's own `WHERE` is the ownership check, and `RETURNING` reports whether it matched:

```ts
const updated = await db
  .update(todo)
  .set({ completed })
  .where(and(eq(todo.id, id), eq(todo.ownerId, ownerId)))
  .returning(wireColumns);

const row = updated.at(0);
return row && toWireTodo(row);
```

**Extra body keys are structurally inert, not policed.** The guard requires `completed` to be a boolean and reads nothing else; `.set({ completed })` names the one column. A body smuggling `text` therefore writes nothing, which is a stronger guarantee than a rejection branch that must remember to exist. Recorded here because it is a deliberate choice, not an omission.

**The request body type stays local, one field wide.** `contract.test.ts:327-335` fails any declaration outside the contract directory that spells `text`, `completed` and `createdAt` together, and `:488-497` pins that directory at three modules. `{ completed: boolean }` declares one of the three and is safe.

**What stays deferred.** Making `requestFailedResponse`'s status/message pairing *structural* — the open `deferred-work.md` item that names this story — is not taken. Moving the helper is what removes the duplication this story would otherwise create; a `{status, message}` descriptor type would still let any caller pair any two, so it buys nothing until there is a catalogue to pair against. The same is true of the body-size guard: `PATCH`'s body is one boolean and the guard belongs with the endpoint that accepts arbitrary text. Both stay recorded rather than half-done.

## Verification

**Commands:**
- `npm run lint` -- expected: clean at `--max-warnings=0`, including the AD-2 and dependency-graph rules over the new `src/server/http/` module.
- `npm run typecheck` -- expected: clean, with the awaited `params` typed inline and no reliance on generated `.next/types`.
- `npx vitest run app/api/todos src/server/http src/server/repository/todos.test.ts src/server/repository/client-identity.test.ts` -- expected: green, with the live repository rows actually reaching the Neon branch (a `NeonDbError` about authentication means `DATABASE_URL` is stale, not that the code is wrong).
- `npm test` -- expected: no new failures against the pre-change baseline; record both totals.

## Auto Run Result

Status: done
Blocking condition: none

### What was built

`PATCH /api/todos/:id` — the Completion Status the caller asked for is stored, and
the updated Todo comes back bare. A **set**, never a toggle: nothing on this path
reads the current value to decide what to write, so a retry stores the same value
a second time rather than flipping it back. The endpoint is the first thing in the
product that can change a Todo's status, and it is what Story 4.2's optimistic
checkbox will confirm against.

| File | Change |
| --- | --- |
| `app/api/todos/[id]/route.ts` | **New.** `PATCH` and `UPDATE_FAILED_MESSAGE`. Gates in order: identity, path-id form, body shape, repository. `params` awaited and typed inline. |
| `app/api/todos/[id]/route.test.ts` | **New.** Every I/O-matrix row, the export-surface pin, "no identity issued" on all six status paths, and AC2's tree-wide scan of `app/` for route files and their exported methods. |
| `src/server/repository/todos.ts` | `setTodoCompleted(ownerId, id, completed)` as one owner-scoped `UPDATE ... RETURNING`. |
| `src/server/repository/todos.test.ts` | Nine live rows against the Neon branch; pinned surface now the three names. |
| `src/server/http/route-failure.ts` | **New.** `logSafeError`, `requestFailedResponse` and `errorKindForMethod`, sharing one home rather than a second copy. Imports nothing but the shared contract. |
| `src/server/http/route-failure.test.ts` | **New.** The helpers' own edges, reachable from no handler. Runs without a database. |
| `src/test-support/drizzle-error.ts` | **New.** The single `drizzleQueryError` fixture, encoding drizzle-orm's message format once. |
| `middleware.ts` | Adopts `logSafeError` and `requestFailedResponse`; the stale rationale comment replaced. |
| `middleware.test.ts` | A leak row whose fixture actually carries bound parameters. |
| `src/server/identity/request-identity.ts` | `errorKindForMethod` re-homed; imports it back. |
| `app/api/todos/route.ts` | Two local helpers deleted, imported from the new module. |
| `src/server/repository/client-identity.test.ts` | Not-yet-exported list is now `["deleteTodo"]`. |

No migration: `schema.ts` already had `completed` with its default.

### Review findings

Four layers ran: blind hunter, edge-case hunter, verification-gap and
intent-alignment. 27 findings — high 0, medium 9, low 18, false 0, maybe-false 0.
No `intent_gap` and no `bad_spec`, so no code was re-derived.

**Patched — 15 fixes in 13 entries** (medium 4, low 9). The three that mattered:

- The extracted helper module transitively loaded the Drizzle client, so its own
  "pure unit" test could not run without `DATABASE_URL`. Demonstrated before the
  fix and after.
- `middleware.ts` had never adopted the redaction rule this story made shared. Its
  catch logged `error.message` whole, which for a Drizzle rejection writes the
  stored token hash and a new identity id into a log line, and its only test used
  a fixture with no `\nparams:` section — so it passed either way. Fixed and
  mutation-checked: reverting the fix fails the new row.
- AC2's tree scan claimed tree-wide coverage while rooting at `app/api` and
  matching only the literal `route.ts`.

**Deferred — 4**, each recorded in frontmatter `deferred` rather than half-done:
the architecture spine's missing `src/server/http/` (and `src/server/validation/`)
entry; the still-unstructural status/message pairing, now that the helper is
exported and takes any string; the `Content-Type`/`415` check, with `PATCH` as the
second mutating endpoint; and the request-body size guard.

**Rejected — 8**, with reasons:

- The spec's AC6 wording versus the `401`'s own message (twice) — the only fix
  edits this build's spec, and the I/O matrix already records the exception.
- Undefined verbs answering a bare `405` — the fix adds five exported handlers.
- Last-write-wins on two conflicting concurrent `PATCH`es — that is what "a set,
  never a toggle" means here; the fix wants a version column.
- The helpers moved "verbatim" while their prose changed — the bodies are
  byte-identical and the prose changes are corrections.
- The intent sits at the interaction surface while this diff sits below it — this
  workflow builds one story per run, and `multiple-goals` already records it.
- The spec's frontmatter shape differs from `spec-3-1`'s — process, not code.

**Follow-up review recommended: true.** Four `medium` entries were patched on a
first pass. The specific unverified risk: this endpoint has no caller. Its wire
contract is proved against `NextRequest` fixtures and live SQL, but the
distinction the client's single error slot must actually act on — a `404` for a
Todo that is gone versus a `401` for an expired identity, each carrying kind
`update` — is exercised by nothing that runs in a browser until Story 4.2 builds
`useSetCompleted`. The `middleware.ts` changes also sit on the path of every
request in the product, and are covered by unit tests alone.

### Verification

- `npm run lint` — clean at `--max-warnings=0`.
- `npm run typecheck` — clean.
- `npx vitest run app/api/todos src/server/http src/server/repository/todos.test.ts src/server/repository/client-identity.test.ts` — 5 files, 204 tests, green, with the repository rows reaching the live Neon branch.
- `npm test` — **40 files, 876 tests, all passing.** Baseline at `e080fc2` was 38 files / 774 tests. No pre-existing test changed its verdict.
- `DATABASE_URL="" npx vitest run src/server/http` — 23 tests, green; before the patch this died at import with zero tests run.
- Mutation check: reverting `middleware.ts` to `error.message` fails
  `middleware.test.ts`'s new redaction row and nothing else.
- Every I/O-matrix row has at least one covering test that ran and passed.

### Residual risks

- **No client calls this endpoint yet.** FR-3 is still unreachable from the
  interface; the product behaves identically for a user until Story 4.2.
- **The AC2 tree scan is a ratchet.** It hardcodes the two route files, so Epic 5's
  `DELETE` updates it — deliberate, and the style the existing surface pins use.
- **Epic 4 is one story in.** Stories 4.2 (checkbox and optimistic change), 4.3
  (filter tabs and departure) and 4.4 (revert a refused toggle) remain; 4.2 is the
  one that makes the epic's headline sentence true.
