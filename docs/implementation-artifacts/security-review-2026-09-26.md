---
date: 2026-09-26
baseline_commit: 07b0004
scope: whole-tree
review_mode: no-spec
lenses: 4
verdict: no-exploitable-vulnerability
---

# Security Review — 2026-09-26

A whole-tree security review at `07b0004`, run as four independent context-free lenses:
**Injection & Data Flow**, **AuthN/AuthZ & Identity**, **XSS & Rendering**, and
**Platform, Secrets & Supply Chain**. Each read its slice of the tree with no knowledge of the
others' conclusions; every claim below was then re-verified against the file on disk before it
was graded. Claims the lenses could not substantiate are recorded as such rather than promoted.

Every finding names the file that proves it, so a claim that has gone stale can be checked
against the tree rather than believed.

---

## 1. Headline

**No exploitable vulnerability was found.** Not "none reported" — three lenses reached the
negative independently, by different routes, and the load-bearing claims were re-checked by
hand:

- **No injection of any kind.** There is no raw SQL in the tree: `sql\``, `sql.raw`,
  `child_process` and `fs` return zero hits across `src/server`, `app/api`, `middleware.ts` and
  `src/shared`. Every predicate is a Drizzle `eq()`/`and()` over a schema column, so every user
  value arrives as a bound parameter. `ORDER BY` is the literal `desc(todo.id)`
  (`src/server/repository/todos.ts:84`) — no dynamic identifier, no string-built predicate.
- **No XSS sink in product source.** `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, `eval`, `new Function` and string-argument timers are
  all absent. So are `href`, `src`, `action` and `formAction` — the client layer contains no
  `<a>`, no `<img>` and no `<form>`, so there is no URL-bearing attribute to poison. The only
  `innerHTML` in the repo is in three render tests.
- **No IDOR.** `ownerId` originates only from the verified cookie identity and reaches the
  actual `WHERE` in all four repository functions — including the two that matter most,
  UPDATE at `src/server/repository/todos.ts:188` and DELETE at `:229`, both
  `and(eq(todo.id, id), eq(todo.ownerId, ownerId))`. `src/server/repository/todos.test.ts:452,579`
  pin the cross-owner behaviour with live rows.
- **No prototype pollution, no mass assignment.** Nothing spreads or merges a request body.
  Both writes use explicit column lists: `.values({ id, ownerId, text })` and
  `.set({ completed })`.
- **No error leakage.** Every failure response carries a module constant; no caught error is
  interpolated into a body. `logSafeError` (`src/server/http/route-failure.ts:72-76`) cuts the
  Drizzle message at `\nparams:` and never logs `error.cause`, which is where NeonDbError
  carries row values.
- **No SSRF surface.** No server-side `fetch` exists in `src/server/` or `app/api/`; the only
  outbound call is the Neon HTTPS client to a fixed connection string. `next.config.ts` declares
  no `rewrites`, `redirects` or `images` block, and `next/image` is never used.
- **No committed secret, now or historically.** A full-history sweep finds only documentation
  placeholders and test fixtures. `.gitignore:40-42` covers `.env*` with a single
  `!.env.example` negation; the real `.env` is untracked.

The findings that follow are the gaps around that core, not in it. Read them as hardening, with
three exceptions — §2.1, §3.1 and §3.2 — which describe real, if narrow, attacker capability.

**Scope note.** This review was run while `Dockerfile`, `compose.yaml`, `.dockerignore` and
`container.test.ts` were present in the working tree. They were removed before the review
concluded, and the four container-specific findings have been dropped rather than recorded.
If that work returns, the platform lens must be re-run against it: it is not covered here.

---

## 2. Patch — fixable without a judgement call

### 2.1 No Content-Security-Policy, and no security response headers at all

**Class:** missing XSS mitigation layer · **Severity:** medium · **Raised by:** XSS + Platform

`next.config.ts` is, in full, a `NextConfig` with no keys. There is no `headers()` block, and a
grep for `content-security-policy`, `x-frame-options`, `x-content-type-options`,
`referrer-policy`, `strict-transport-security` and `nonce` across `middleware.ts`,
`next.config.ts`, `src/server/` and `app/` returns nothing. The only response header the
application sets anywhere is `Cache-Control: private, no-store` with `Vary: Cookie`
(`src/server/identity/request-identity.ts:48`).

Verified these are **not** framework defaults in Next 16.3.5:
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`
presents all four as things you add via `headers()`, and no default `x-content-type-options`
emitter exists under `node_modules/next/dist/server/`. Separately,
`.../poweredByHeader.md` confirms `x-powered-by: Next.js` is emitted **by default** and must be
opted out of.

**Failure scenario.** There is no injection point today, so this is second-order and honestly
labelled as such. Its value is future-facing: with ~621 packages in the tree, the moment a
component bug or a compromised front-end dependency introduces a script, there is no second
line of defence, and a same-origin `fetch` to `app/api/` exfiltrates the whole Todo List with
nothing to block it.

**Status: applied.** `next.config.ts` now sets `poweredByHeader: false` and an `async headers()`
block carrying `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` and
`Strict-Transport-Security: max-age=63072000`. Verified against a production build over HTTP:
all four are emitted and `x-powered-by` is gone.

**One correction to the advice this section originally carried.** It proposed a CSP of
"at minimum `default-src 'self'; frame-ancestors 'none'; …`" while also warning that
`script-src 'self'` breaks hydration. Those two are the same statement: **`script-src` falls back
to `default-src`**, so `default-src 'self'` would have blocked Next's inline hydration bootstrap
and `next/font`'s injected `<style>` exactly as a literal `script-src 'self'` would. The shipped
policy therefore sets **no `default-src`** and only the four directives that stand alone and
touch no script loading:

```
frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'
```

Restricting script sources still needs the nonce-based middleware pattern from the Next CSP
guide. That remains **unshipped** and is its own piece of work — see §6.

`Strict-Transport-Security` is deliberately without `includeSubDomains` and without `preload`.
Both are commitments on behalf of hosts this repository does not own, and both are deployment
decisions rather than code ones.

`next.config.ts` is the only correct home: `readme.test.ts:470-481` forbids only an `env:` key in
this file, and the change adds no environment variable name, so the env-surface assertion stays
green. No AD is touched.

### 2.2 CI actions are pinned to mutable major tags while a live database credential sits in the job environment

**Class:** supply chain · **Severity:** medium · **Raised by:** Platform

`.github/workflows/ci.yml` uses `actions/checkout@v4`, `actions/setup-node@v4` and
`actions/upload-artifact@v4`. `@v4` is a git tag the action's owner can move.

**Failure scenario.** This is the `tj-actions/changed-files` pattern of March 2025: an attacker
who compromises an action repository repoints `v4` at malicious code, which then runs in a job
whose process environment already holds `secrets.DATABASE_URL` (see §2.3). No `${{ secrets }}`
interpolation is needed — the code reads `process.env` directly, and GitHub's log masking does
not stop an outbound POST. The result is read/write access to the CI Neon branch.

**Status: applied.** All three are pinned to the commit SHA their `v4` tag resolved to at
review time, with the exact version as a trailing comment:
`actions/checkout@11d5960 # v4.4.0`, `actions/setup-node@49933ea # v4.4.0`,
`actions/upload-artifact@ea165f8 # v4.6.2`. The majors were deliberately not bumped — v7 is
current for all three, and a major upgrade is its own change with its own risk.

**Still open:** Dependabot is not configured for `github-actions`, so these pins will now age
silently. Adding `.github/dependabot.yml` is the follow-up that makes pinning sustainable
rather than a one-off.

### 2.3 The database credential is scoped to the whole CI job, including `npm ci`

**Class:** secret blast radius · **Severity:** medium · **Raised by:** Platform

`DATABASE_URL` is declared once at job level in `.github/workflows/ci.yml`, so it is present in
the environment of `npm ci` and `npx playwright install --with-deps chromium` as well as the two
steps that actually need it — `npm test` and `npm run test:e2e`.

**Failure scenario.** A single compromised transitive package ships a `postinstall` that reads
`process.env.DATABASE_URL` and posts it out. `npm ci` honours the lockfile, so this requires a
lockfile-affecting change — but a Dependabot bump is exactly that, and the credential is present
during install for no reason at all.

**Status: applied.** The job-level `env:` block is gone; `DATABASE_URL` is now declared on the
`Unit and integration tests` and `End-to-end tests` steps only. Confirmed by parsing the
workflow: `jobs.verify.env` is `None`, and exactly those two steps carry the key. The
`readme.test.ts` secret assertions still hold — it remains a key sourced from
`${{ secrets.* }}`, now in two places rather than one.

**Not taken:** `--ignore-scripts` on `npm ci`. It would be a further tightening, but Playwright
and other packages rely on install lifecycle scripts, so it needs its own verification run.

### 2.4 The CI workflow declares no `permissions:`

**Class:** over-broad CI token · **Severity:** medium · **Raised by:** Platform

`grep -n permissions .github/workflows/ci.yml` is empty. The job inherits the repository default
`GITHUB_TOKEN` scope, which on repositories created before the 2023 default change is read
**and write** to `contents`, `packages` and `issues`.

**Failure scenario.** Chains with §2.2 or §2.3: any code that runs in the job reads
`GITHUB_TOKEN` off the runner and, if the default is permissive, pushes a commit to `main`.
Since `vercel.json` makes the deploy build from the repository, a push to `main` is a path to
production.

**Remediation.** Add at workflow level:

```yaml
permissions:
  contents: read
```

Nothing in this workflow writes to the repository; the conditional artifact upload needs no
extra scope.

**Status: applied** at workflow level, so it covers every job added later by default.

### 2.5 No origin or Content-Type assertion on the mutating routes

**Class:** CSRF · **Severity:** medium · **Raised by:** Identity + Injection

`SameSite=Lax` (`src/server/identity/identity-cookie.ts:39`) is the only thing standing between
a mutating route and a cross-origin write. Neither handler inspects `Origin`, `Sec-Fetch-Site`
or `Content-Type`; `await request.json()` parses the body regardless of declared media type
(`app/api/todos/route.ts:153`, `app/api/todos/[id]/route.ts:157`).

**What actually protects each route.** Truly cross-site is genuinely covered: `Lax` withholds
the cookie from a cross-site form POST, so `evil.com`'s form gets `401` at `middleware.ts:64`,
and PATCH/DELETE are unreachable by HTML form at all. **The gap is same-site cross-origin.**
`SameSite` treats any origin sharing the registrable domain as same-site, so a page on a sibling
subdomain can POST a form with `enctype="text/plain"` and a name/value pair split so the encoded
body is valid JSON. The cookie rides along and a Todo appears in the victim's list. No CORS
headers are set anywhere, so the attacker cannot read the response — this is a write-only
nuisance, not disclosure, and it needs the same same-site foothold as §3.2.

The point worth recording is that the defence is entirely one cookie attribute, one file away
from the handlers, with no second wall.

**Remediation.** Add a same-origin assertion in `middleware.ts` for non-`GET`/`HEAD` methods
under `/api/**`, beside the existing identity gate: reject when `Sec-Fetch-Site` is present and
is not `same-origin`, falling back to comparing `Origin` against `request.nextUrl.origin`.
Middleware already fronts every route handler, so one place covers all three mutating routes and
no per-handler duty is added. Require `application/json` before parsing, refusing at `415` with
the existing fixed message. AD-1 and AD-2 are untouched.

Tightening `sameSite` to `"strict"` is **not** an adequate substitute: it does not distinguish
same-site origins either, and it would break the cookie's survival across inbound links.

**Status: applied**, with one ordering change forced by the existing tests. Both checks live in
`refuseUnsafeApiRequest` in `middleware.ts` and run **after** the identity gate, not before it.
Running them first would have answered `415` to an unauthenticated `POST`, and Story 1.6 AC4
makes `401` the answer for *every* method under `app/api/` without an identity —
`middleware.test.ts` pins it. Nothing is lost defensively: a CSRF request carries the victim's
cookie by definition, so it resolves an identity and reaches the checks anyway.

Two behaviours worth recording, both pinned by tests:

- **Absent headers pass.** A request with neither `Sec-Fetch-Site` nor `Origin` is allowed.
  Every current browser sends the former, so a request without it is a server-side client or a
  test runner — neither carries a victim's ambient credentials. `e2e/api.spec.ts` depends on
  this, and refusing them would break legitimate callers while stopping nothing.
- **The media-type gate covers POST and PATCH only.** `DELETE` is exempt because
  `src/client/todos/delete-todo.ts` deliberately sends no `content-type` — it sends no body to
  describe.

Verified against a production build over HTTP: `sec-fetch-site: cross-site` → `403`,
`same-site` → `403` (the gap `SameSite=Lax` leaves open), `content-type: text/plain` → `415`,
and the full same-origin create → update → delete path still answers `201`/`200`/`204`.

### 2.6 `client-identity.ts` selects `token_hash` into the request-handling layer

**Class:** credential-derivative exposure · **Severity:** low · **Raised by:** Injection

`findClientIdentityByTokenHash` uses a bare `.select()` (`src/server/repository/client-identity.ts:34`)
and `createClientIdentity` a bare `.returning()` (`:60`). The returned `ClientIdentity` therefore
carries `tokenHash` — the SHA-256 of the live session credential — and
`src/server/identity/request-identity.ts:24-31` hands that whole object to every route handler.

**No exploit exists today.** All four handlers read `identity.id` only, so `tokenHash` never
reaches a response. It is reported because it is the exact asymmetry
`src/server/repository/todos.ts:20-26` argues against in its own comment — "the row never leaves
this module, so `owner_id` cannot reach the browser by someone spreading a result object into a
response" — applied there to `owner_id` and not applied here to a more sensitive column. One
future `Response.json(identity)` is the whole distance to a leak.

**Status: applied.** `client-identity.ts` now names an `identityColumns` projection mirroring
`todos.ts`'s `wireColumns`, used by both the `select` and the `returning`. `ClientIdentity` is
narrowed to `Pick<…, "id" | "createdAt">` — derived from the schema rather than spelled out, so
a new column reaches callers only when someone adds it to the projection deliberately.

Production code was unaffected: all four handlers read `identity.id` only, and `middleware.ts`
discards the create's return value. Two test assertions did depend on the wider shape and were
rewritten — the create's storage is now proven by looking the row back up *by* its hash rather
than by reading the hash off the returned object. A new test pins the absence directly.

### 2.7 No charset bound on Todo text

**Class:** input validation · **Severity:** low · **Raised by:** Injection

`isValidTodoText` (`src/shared/contract/validation.ts:15-18`) is a trim-and-length predicate
only — no character-class rule. The column is plain `text` with no `CHECK`
(`src/server/db/schema.ts:16`, `drizzle/0000_orange_lightspeed.sql:9`), so the 500-character cap
exists in application code alone.

**The gap is confirmed; its consequence is not.** The reviewer reasoned that a NUL code point
in the text would be rejected by Postgres and surface as a `500` where `400` is the honest
answer — but derived that from the encoding rule rather than executing it against Neon. Treat
the `500` as unverified. No data leaks either way: the fixed message and `logSafeError` hold.

**Remediation.** Add a control-character rejection to `isValidTodoText` — at minimum ` `,
with `\p{Cc}` other than newline as the fuller rule. It belongs in
`src/shared/contract/validation.ts`, where AD-11 puts the rule enforced twice, so both the input
and the route handler pick it up with no new module and `contract.test.ts`'s three-module pin
stays green. Independently, a `CHECK (char_length(text) <= 500)` added via `npm run db:generate`
would stop the cap being application-only — under AD-14, generated and committed, never pushed.

---

## 3. Defer — real, but the fix needs a decision that is not mine

### 3.1 `POST /api/todos` discloses whether a Todo id exists under another identity

**Class:** cross-tenant existence oracle · **Severity:** medium · **Raised by:** Identity

This is the most substantive finding in the review, and it was verified by hand.

`createTodo` (`src/server/repository/todos.ts:126-145`) conflicts on `todo.id` **alone**:

```ts
.onConflictDoNothing({ target: todo.id })
```

Only the follow-up `SELECT` is owner-scoped. When the insert does nothing and the owner-scoped
read finds nothing, the outcome is `foreign-owner`, which `app/api/todos/route.ts:171-179` maps
to `409` — distinct from `201` (created) and `200` (already mine).

**Attack scenario.** An attacker with a freely-obtained identity posts a candidate id. `409`
means *a Todo with that id exists and belongs to someone else*; `201` means *it exists nowhere*.
This is the only place in the API where "foreign and existing" is distinguishable from
"nonexistent" — PATCH answers `404` indistinguishably (`[id]/route.ts:173`) and DELETE answers
`204` for all three cases (`:246`), both structurally incapable of being oracles. Blind
enumeration is not feasible (UUIDv7, ~74 bits of randomness per millisecond), so this is
**confirmation of a known id**, not discovery — an id obtained from a screenshot, a log line or
a bug report. Nothing but existence leaks: the `foreign-owner` path never loads the other
owner's row. Probing also writes a junk row into the attacker's own list on every miss.

**Why deferred rather than patched.** The status split is deliberate and documented —
`app/api/todos/route.ts:55` states "The status code is what carries the distinction" — and tests
pin it. Collapsing `409` into `400`, joining the existing "this create did not happen" bucket,
closes the oracle and respects AD-1 and AD-2. But it changes a documented contract the client
may rely on for retry logic. **That is a deliberate call, not a patch.**

### 3.2 The identity cookie has no `__Host-` prefix

**Class:** session fixation · **Severity:** medium · **Raised by:** Identity

The cookie is named `client_identity` (`src/server/identity/identity-cookie.ts:9`) and set with
`httpOnly`, `secure` (unconditional — it cannot fail open), `sameSite: "lax"`, `path: "/"`,
`maxAge` 400 days, and **no `Domain`**, so it is host-only. That is correct. What is missing is
the `__Host-` prefix, which is what makes the *browser* enforce that no other origin may write
it.

**Attack scenario.** Any origin on the same registrable domain — a sibling subdomain, a
subdomain takeover, an XSS on any same-site host — can set
`client_identity=<attacker token>; Domain=.example.com; Path=/; Secure`. The victim's browser
then sends two `client_identity` cookies, and `request.cookies.get()`
(`src/server/identity/request-identity.ts:27`) returns the first, which is frequently the domain
cookie. Every Todo the victim creates then lands in the attacker's list. Here fixation **is**
full takeover, because the identity is the entire authorization model. The same write with a
junk value instead silently wipes the victim's view: `middleware.ts:68` treats an unresolvable
cookie as absent and mints a replacement over the top.

This requires the attacker to hold a same-site origin. `*.vercel.app` is on the Public Suffix
List, so the default Vercel domain is **not** exposed; a custom apex domain with any other
subdomain is.

**Why deferred rather than patched.** Renaming to `__Host-client_identity` is a one-line change
and the existing attributes already satisfy the prefix's requirements exactly. But existing
cookies under the old name stop resolving, and `middleware.ts:68` handles that by minting a
fresh identity — **a one-time Todo List loss for every current user**. That is a product
decision.

### 3.3 Identity issuance is unauthenticated, unrate-limited, and writes a row per cookie-less request

**Class:** resource exhaustion · **Severity:** medium · **Raised by:** Injection + Identity

`middleware.ts:72-73` mints a token and inserts a `client_identity` row on every cookie-less
document request, and the matcher covers every extensionless path that is not `/api` or
`/_next` — including 404s. There is no rate limit, no `Origin` check and no bot gate anywhere in
the tree.

**Already on the ledger.** `docs/implementation-artifacts/deferred-work.md:43` records this as
knowingly accepted, reasoning that "the exposure is storage cost on a free tier", and correctly
argues that narrowing the matcher trades that cost for a silent-`401` footgun.

**What is new** is that the acceptance predates there being any write endpoints, and the entry
itself defers to "the rate-limiting revisit the spine already flags". That revisit is now
overdue: the same missing rate limit also leaves `POST`/`PATCH`/`DELETE` unthrottled, and every
API request with a garbage cookie costs two indexed `SELECT`s.

**Remediation.** Rate-limit in `middleware.ts`, which already fronts both the document and
`/api/**` matchers, so one place covers identity minting and the mutating routes together. A
platform-level rule (Vercel Firewall) or `@upstash/ratelimit` keyed on IP. The DB write stays
behind `src/server/repository/` per AD-2.

---

## 4. Rejected

Recorded with the reasoning that disqualified them, so the next review need not re-derive it.

| Finding | Verdict | Why |
|---|---|---|
| Unbounded request body — no size cap before `request.json()` | low | Confirmed that Next 16.3.5 offers no route-handler body cap (`bodySizeLimit` exists only under `serverActions`, which AD-1 forbids). But Vercel is the only deploy path and imposes ~4.5MB on function bodies, and the container path that would have bypassed it no longer exists. The fix adds a guard for a case the platform already bounds. |
| `listTodos` has no `LIMIT` | low | Real (`src/server/repository/todos.ts:79-84`), but the `WHERE` is owner-scoped and correct, so the cost is self-inflicted: an identity must first insert the rows it then asks for. This is pagination — product work — not a security defect, and the fix is a coordinated AD-8 change across the client's single read site. |
| Unconditional `Secure: true` causes a mint loop on plain HTTP | false | The premise was that the container made a plain-HTTP self-host plausible. Those files are gone. The flag is also correct as written — an environment-gated `Secure` would be the actual vulnerability. |
| Todo List response is cast, not validated | low | `todo-list-query.ts:154-158` casts `body as Todo[]` after an `Array.isArray` check. React escapes whatever string arrives, so there is no XSS path; the realisable consequence is a blank screen when a malformed body reaches a renderer with no error boundary above it (`src/client/providers.tsx:33-36`). That is robustness, not security, and AD-3's single-deployable trust is the file's own stated reason. |
| User text in an `aria-label` (`todo-row.tsx:387`) | false | The reviewer that raised it concluded no defect and recommended no change. React escapes attribute values. Noted only as the one place user text lands in an attribute rather than a text node — the line to re-audit if this row is ever built outside JSX. |
| `npm audit` — 4 moderate | false | Reproduced: all four are one chain, `drizzle-kit → @esbuild-kit/esm-loader → esbuild`, advisory GHSA-67mh-4wv8-2f99. That advisory concerns `esbuild serve`, which `drizzle-kit` never starts — it uses the loader to transpile `drizzle.config.ts`. `drizzle-kit` is a devDependency. The only `fixAvailable` is `drizzle-kit@0.18.1`, a **major downgrade** that would break AD-14's `db:generate`/`db:migrate` path. Do not take it; track upstream. |

---

## 5. Verified clean

Checked and clear, recorded so the next review need not re-check:

- **AD-14 holds.** `vercel.json` is `npm run db:migrate && npm run build` — the
  committed-migration path. `db:push` exists only as a `package.json` script and appears in no
  deploy path. `src/server/db/schema.test.ts` asserts this mechanically.
- **CI runs the architecture gates.** `npm run lint` enforces AD-1/AD-2/AD-8/AD-12 and the layer
  graph; `npm test` runs the migration drift check and the token rules. No `pull_request_target`
  anywhere, so fork PRs never receive `secrets.DATABASE_URL`.
- **The identity secret is minted, never configured.** `src/server/identity/identity-token.ts:34-38`
  takes 32 bytes from `crypto.getRandomValues` and stores only the SHA-256. There is no signing
  key, no algorithm-confusion surface, no truncated MAC, and no fallback default to leak.
  Comparison is a Postgres equality on the hash of a 256-bit secret, so timing has no leverage.
- **Two walls, not one.** `middleware.ts:63-65` answers `401` for every `/api/**` request with no
  resolved identity and never mints there; every handler independently re-resolves.
- **`owner_id` cannot reach the wire.** `src/server/repository/todos.ts:20-26` pins a
  `wireColumns` projection and all four queries use it. No bare `select()` in that module.
- **PATCH and DELETE are not existence oracles.** `404` and `204` respectively, indistinguishable
  across absent / foreign / present.
- **No client-side storage of anything.** Zero `localStorage`, `sessionStorage` or `indexedDB` in
  product source. The identity token is `httpOnly` and unreadable from script.
- **No server error string is ever rendered.** `error-copy.ts:37-42` is a closed record of four
  hard-coded sentences; `TodoRequestError` synthesises its own message and never reads the
  response body's. AD-10 holds in fact, not just in comment.
- **AD-1 holds at the seam.** `fetch` appears only in the four `src/client/todos/` modules ESLint
  sanctions. Every URL is a same-origin literal plus, at most,
  `encodeURIComponent(todo.id)` — no origin, host or scheme is built from input, so there is no
  client-side SSRF.
- **Supply-chain basics.** `package-lock.json` is `lockfileVersion: 3`, 621 `resolved` entries
  and 621 matching `integrity` entries, zero from a non-`registry.npmjs.org` source. `.npmrc`
  contains only `engine-strict=true` — no registry override, no auth token.

---

## 6. Suggested order

1. **§2.4, §2.3, §2.2** — CI hardening. Three small edits to one file, no runtime effect, and
   they are the findings with a named real-world precedent.
2. **§2.6** — one projection, matching a pattern the neighbouring module already uses.
3. **§2.1 (safe subset)** — `poweredByHeader: false` plus the non-CSP headers.
4. **§2.5** — the same-origin assertion. Touches every mutating request, so it needs the full
   four-suite run behind it.
5. **§2.7** — the charset bound, whenever the validation module is next open.
6. **§3.1 and §3.2** need a decision before they can be scheduled. §3.3 is already on the
   deferred-work ledger and should be re-dated there rather than tracked twice.
7. **§2.1 (nonce-based `script-src`)** — its own piece of work, not a patch.

**All seven §2 patches are applied.** Verification after the change, from a clean run:
`npm run lint` and `npm run typecheck` pass; `npm test` is **1345 passed across 58 files**;
`npm run test:e2e` is **125 passed, 13 skipped** (the pre-existing device-projection skips). The
new middleware tests were mutation-checked — removing the guard fails ten of them, so they are
load-bearing rather than vacuous.

**Nothing in §3 was applied**; all three still need the decision each section names.

Files changed: `next.config.ts`, `middleware.ts`, `.github/workflows/ci.yml`,
`src/server/repository/client-identity.ts`, `src/shared/contract/validation.ts`, and the three
test files that pin them.
