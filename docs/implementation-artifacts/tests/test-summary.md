---
date: 2026-09-26
tree: bccb76a
suites: e2e/api.spec.ts, e2e/keyboard.spec.ts
---

# Test Automation Summary

Two gaps, found by reading what the existing suites cannot reach rather than by picking a
feature. Epic 6 already measured the product end to end — 93 Playwright runs across journeys,
forced failures, races, persistence and three audits — so the useful question was not "what
is untested" but **"what is tested only by a mock, or only by an argument."** Two answers,
both named in the tree:

1. **The API has never been called over HTTP.** `app/api/todos/route.test.ts` and
   `app/api/todos/[id]/route.test.ts` are 90 exhaustive handler tests that `vi.mock` the
   repository and the identity store. They prove the handler's arithmetic; they cannot prove
   the stack it runs in, because in those tests the stack is a stub.
2. **No browser had ever pressed the checkbox.** `deferred-work.md:351` says so in as many
   words, and names Epic 6's keyboard audit as the owner it never got.

## Generated Tests

### API tests — `e2e/api.spec.ts` (22 tests, `pointer` project)

Playwright's `APIRequestContext`, taken from a real `BrowserContext` so the `Secure` identity
cookie is stored the way a browser stores it. Production build, real Neon branch, no mocks.

| | Covered |
|---|---|
| `GET /api/todos` | 200 bare array, empty list, `id DESC` over real rows, 401 |
| `POST /api/todos` | 201, client-minted id round-tripped, server-set `completed`/`createdAt`, 200 on retry, 409 on a foreign id, 400 × 4 refusal classes, 401 |
| `PATCH /api/todos/:id` | 200, writes `completed` and nothing else, 404 foreign/missing, 400 bad id, 400 bad body, 401 |
| `DELETE /api/todos/:id` | 204, idempotent retry, completed rows, 404-shaped silence for a foreign row, 400 bad id, 401 |
| Cross-cutting | `Cache-Control: private, no-store` + `Vary: Cookie` on every answer; 405 on the six unsupported method/path pairs |

Three of these assert things no existing test could:

- **`middleware.ts`'s matcher.** The handlers' own `401` is described in their source as "a
  second wall rather than the only one". The first wall is a regular expression in a config
  object, and until now nothing had driven a request over it.
- **The repository's `WHERE owner_id`.** Every handler test asserts `identity.id` is *passed
  first*. A repository that accepted the argument and ignored it would satisfy all of them,
  and one caller would read another's list. Four tests now put two real identities against
  one real database and check the list, the `PATCH`, the `DELETE` and the `409`.
- **`id DESC` as an ordering Postgres performs**, rather than one a mock returned in order.

### E2E tests — `e2e/keyboard.spec.ts` (5 tests × 2 projects = 10 runs)

Closes `deferred-work.md:351`. The status control is a `<button role="checkbox">`, which is
what makes the question live: a native checkbox activates on Space and not Enter, a button
activates on both. The accessible role says one thing and the element says another, and only
a browser settles which the user gets.

- Enter toggles, Space toggles back, focus survives both, and the row's `data-completed`
  marker follows.
- Exactly one `PATCH` per press — counted from the wire, because a second activation setting
  the same value is invisible on screen. This is the half the render test structurally cannot
  have: it proves one activation path by proving the *absence* of a handler, and a browser
  firing both a key activation and a synthetic click would still satisfy it.
- Space activates rather than scrolling the document, measured against `window.scrollY` with
  ten rows below the fold.
- The delete control answers both keys the same way.

## Coverage

- **API methods over HTTP:** 4/4 (`GET`, `POST`, `PATCH`, `DELETE`) — previously 0/4.
- **Status codes asserted on the wire:** 200, 201, 204, 400, 401, 404, 405, 409.
- **AC9 (keyboard activation):** argued from spec → observed in Chromium, on both projects.
- **Playwright suite:** 93 → **125 passed**, 13 skipped, 0 failed (19.5s).
- **Vitest suite:** 1327 passed across 58 files, unchanged.

## One config change

`playwright.config.ts` — the `touch` project now ignores `api.spec.ts`. A request has no
pointer capability, so running it on both device profiles would send the same request twice
and report the second as if it were evidence. Same argument the `pointer` project already
makes about the responsive audit.

## Found, not fixed

Three of the pending entries in `deferred-work-triage-2026-09-26.md` are server input-handling
gaps this suite brushed against but deliberately does not pin, because a test asserting the
current answer would cement behaviour the ledger already calls wrong:

- **`L276`** — the endpoints accept any `Content-Type` and parse whatever arrives; no `415`.
- **`L256`** — `POST` parses the whole body before the 500-character rule can reject it, with
  no `content-length` ceiling.
- **`L272`** — a NUL character in a Todo's text answers `500` where `400` is the honest reply.

They want a decision and a fix first, then a test. Worth a story.

## Next Steps

- Run in CI. Both suites need `DATABASE_URL`; the e2e suite builds and starts the app itself.
- `deferred-work.md:351` can be closed — cite `e2e/keyboard.spec.ts`.
- Consider the three input-handling entries above as one story; the API suite is the place
  their tests would land.
