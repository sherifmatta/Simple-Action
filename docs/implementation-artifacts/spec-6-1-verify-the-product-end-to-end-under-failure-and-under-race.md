---
title: 'Story 6.1: Verify the product end to end, under failure, and under race'
type: 'feature'
created: '2026-09-25'
baseline_revision: 'ad09a31c6e190499d15091bebab40a72b532e0a8'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/implementation-artifacts/epic-6-context.md'
  - '{project-root}/docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/EXPERIENCE.md'
warnings: ['oversized', 'multiple-goals']
deferred:
  - id: 'AC6-green-ci-run'
    what: >-
      The CI workflow is delivered and its command sequence is verified locally,
      but no green run on GitHub Actions has been observed. AC6 anticipates this
      and asks for it to be recorded rather than claimed.
    evidence: >-
      `.github/workflows/ci.yml` exists and triggers on push and pull_request,
      running `npm ci`, `npx playwright install --with-deps chromium`,
      `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`
      with `DATABASE_URL` from `secrets.DATABASE_URL`. That exact sequence was
      run locally on this commit and passed: lint clean, typecheck clean,
      `Test Files 53 passed (53) / Tests 1213 passed (1213)` with zero skipped,
      and `40 passed / 8 skipped` across the two Chromium projects with
      Playwright starting the server itself via `npm run build && npm start`.
      The workflow has never run: this work was not pushed, and a
      `DATABASE_URL` repository secret has to be configured on
      `sherifmatta/Simple-Action` before it could go green.
    settles_it: >-
      Add a `DATABASE_URL` repository secret pointing at a dedicated Neon CI
      branch (never production), push, and attach the green run.
  - id: 'AC13-matrix-direction'
    what: >-
      The I/O matrix writes AC13's pair as "delete fails, then a load fails →
      banner shows the newer copy". The shipped product does the opposite in
      that direction, by design: a read failure is raised only into an *empty*
      error slot, so a mutation's banner is never displaced by a later load
      failure. The criterion's own wording — a newer failure arriving while an
      older banner is displayed — is met and tested in the direction the product
      does implement (an older load banner replaced by a newer delete failure).
    evidence: >-
      `src/client/components/error-banner.tsx` guards the raise with
      `if (slot !== null || isFetching) return;`, and
      `src/client/components/error-banner.test.ts:259` pins it with the test
      "raises into an empty slot only, and never over another kind", explaining
      that emptying the slot is what brings the load failure back. The shipped
      behaviour is characterised end to end in
      `e2e/races.spec.ts` — "a load failure never displaces a mutation's banner
      — the product's documented asymmetry".
    settles_it: >-
      Either amend the matrix row to the direction the product implements, or
      open a product story to make a read failure replace a mutation banner.
      Changing `error-banner.tsx` is a product change and outside Epic 6's scope.
---

<intent-contract>

## Intent

**Problem:** Five epics shipped every control, state and failure path, and every claim about the assembled product is still an assertion. `e2e/` holds one `.gitkeep`; Playwright is not installed; no browser has ever rendered this application in a test. AR-31 names Playwright with route interception as in-scope tooling precisely because the optimistic layer is where the complexity is concentrated, and that layer's four revert paths, its add-during-load race and its retry idempotency have never been observed end to end.

**Approach:** Install Playwright, drive the four journeys against a production build, force each of the four failures with `page.route`, and close the two Vitest gaps the hook-level suites left. Epic 6 measures a finished artifact: this story writes tests and CI, and changes **no product source**. Where a measurement fails, the failure is recorded as a finding — not patched here.

## Boundaries & Constraints

**Always:**
- **Tests only.** Nothing under `app/`, `src/client/`, `src/server/`, `src/shared/`, `middleware.ts` or `app/globals.css` is edited. Epic 6's scoping rule is that construction leaking in converts "prove it" into "do it later". A criterion that cannot pass without product change is a **finding**, recorded in frontmatter `deferred` with evidence, not a fix.
- Locators are role- and text-based. There is **no `data-testid` anywhere in this repository** and this story adds none — adding one to product source would be a product change.
- **Chromium only.** `identity-cookie.ts` sets `secure: true`; Chromium stores Secure cookies on `http://localhost`, WebKit and Firefox may drop them. A second browser project would produce a wall of 401s that looks like a product defect and is not.
- Tests run against a **production build** (`next build` → `next start`), as `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` recommends, not `next dev`.
- Every test opens with a document navigation. `middleware.ts` mints the identity cookie only on document requests; its second matcher entry answers `/api/**` with 401 and never mints. An API-first context gets 401, always.
- Waiting is done with web-first assertions and a timeout above the departure's `400ms` hold + `180ms` collapse. **Never `waitForTimeout`.**
- Exact copy is asserted by equality against the product's own strings: `Couldn't load your Todos.` / `Couldn't add that Todo.` / `Couldn't save that change.` (update **and** delete share this one) and `Retry`.
- `package.json` pins dev tooling exactly (`vitest: "5.0.1"`, `typescript: "6.0.3"`). `@playwright/test` is pinned exactly too.

**Never:**
- Never write the literal `aria-live="…"` in an e2e spec. `announcer.test.ts:215-231` walks the whole tree and fails any file matching `/["']?aria-live["']?\s*[=:]/`; `e2e/` is **not** in its `SKIPPED_DIRECTORIES` and `.spec.ts` is **not** in its `SCAN_EXEMPT_FILES`. Use `[aria-live]` (attribute presence — no `=`, so no match) plus `getAttribute("aria-live")`.
- Never re-declare the `Todo` shape or the error envelope in a spec (`contract.test.ts:348` AD-3), never import drizzle or `src/server/db` (`client-identity.test.ts:237` AD-2), and never write the string `["todos"]` (`providers.test.ts:80` AD-8). These six tree-walking scans do not skip `e2e/`. Note the asymmetry: `middleware.test.ts:431` exempts `/\.(test|spec)\.[cm]?[jt]sx?$/` and names `e2e/`'s `.spec.ts` in its comment, but `e2e/support/app.ts` is **not** a spec file and carries no exemption from any scan.
- Never assert the first-run swipe nudge. **Story 5.D1 is deferred and the nudge does not exist** — UJ-4 step 7 is not in the shipped product.
- Never assert a difference between PATCH's 404 and its wrong-owner answer (identical by design), and never assert DELETE's body (204, empty, for success / already-gone / foreign-owner alike).
- Never use strict `toHaveText` on a live region: `announcement.ts`'s `liveRegionText` appends a trailing space on every even-numbered announcement. Use `toContainText`.
- Never mutate the database outside a browser context. Each test's fixtures are created through the UI, so each fresh context owns its own rows.
- Never bare `getByRole('button', { name: 'Delete' })` — it collides with each row's `aria-label="Delete {text}"`. Scope it to the dialog.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load failure (AC7) | `page.route` fails `GET /api/todos` | Banner reads `Couldn't load your Todos.`; `li.skeleton-row` count is 0 and `.empty-panel` is absent | `Retry` returns 3 skeletons and re-requests |
| Add failure (AC8) | `POST /api/todos` failed | Optimistic row removed; input holds the text with caret at end; banner `Couldn't add that Todo.` | `Retry` re-sends the **same id** |
| Toggle failure (AC9) | `PATCH` failed, row had departed the Active view | Row returns at its original index in its previous status; banner `Couldn't save that change.` | `Retry` re-requests the status the user asked for |
| Delete failure (AC10) | `DELETE` failed | Row returns at its original `id DESC` index; banner `Couldn't save that change.` | `Retry` re-deletes and **no dialog opens** |
| Add during load (AC11) | `GET` held open, Enter pressed, then `GET` fulfilled | Optimistic row renders above the 3 skeletons; after merge the text appears **exactly once** | n/a |
| Uncertain create (AC12) | `route.fetch()` forwards POST, response aborted to the page; `Retry` sends the same id | Server holds exactly one row (`onConflictDoNothing` + owner-scoped re-read); reload shows one | Second POST answers 200, not 409 |
| Newer error replaces older (AC13) | A load fails, then a delete fails over it | Banner shows the newer copy; the replaced operation is **not** re-sent | Slot is emptied before the retry closure runs. The reverse pair cannot occur: `error-banner.tsx:105` raises a read failure only into an *empty* slot |
| Reload (AC3) | `page.reload()` | Identical list, identical order; Filter View back to **All** | n/a |
| Context restart (AC4) | Context closed, reopened from `storageState` | Identical list — the 400-day `Max-Age` cookie survives | n/a |
| Two contexts (AC5) | Two `browser.newContext()` | Two distinct identities, two independent lists | n/a |

</intent-contract>

## Code Map

**What exists, and what does not**
- `e2e/.gitkeep` — the directory is empty. Playwright is **not** in `package.json`. `npm view @playwright/test version` → **`1.63.0`**.
- `vitest.config.mts:36-43` — `include` covers `*.test.ts(x)`, `src/**`, `app/**`. It does **not** match `e2e/**/*.spec.ts`, so Vitest and Playwright cannot collect each other's files. Leave it alone.
- `tsconfig.json` — `include: ["**/*.ts", …]`, so `e2e/*.spec.ts` **is** typechecked by `npm run typecheck`. Playwright 1.63 honours `paths`, but prefer relative imports; `@/` from `e2e/` is untested here.
- `eslint.config.mjs:332-338` — the baseline `no-restricted-syntax` set is `"use server"`, `aria-live`, unapproved query keys, stray `useQuery`, drizzle dynamic import. None of it bites a Playwright spec. `globalIgnores` (`:351-364`) does not list `e2e/`, so the specs **are** linted, and `npm run lint` is `--max-warnings=0`.
- `.gitignore` — has no Playwright entries.
- No `.github/` directory exists. AC6 has nothing to run in.

**Locators (verified against source — do not re-derive)**
- Add input — `add-input.tsx`: `<input id="add-todo-input" aria-label="what needs doing?" maxLength={500}>` → `getByRole('textbox', { name: 'what needs doing?' })`. Autofocuses only when `usePointerCapability()` (`src/client/device/pointer.ts`, `matchMedia("(pointer: fine)")`) settles `"fine"` — so **not** in a touch project. Submit is Enter keydown on the input; there is no `<form>` and no submit button.
- Filter tabs — `filter-tabs.tsx`: `<div role="tablist" aria-label="Filter View">` with three `<button role="tab" aria-selected>`; accessible name **includes the count** (`All 4`, `Active 3`). Counts read `0` until the list lands. Use a regex name or the exact counted string; assert selection via `aria-selected`.
- List — `todo-list.tsx`: `<ul aria-label="Todo List" aria-busy>` → `getByRole('list', { name: 'Todo List' })`. `aria-busy` present only while loading.
- Row — `todo-row.tsx`: `<li>` carrying `data-completed` / `data-departing` / `data-deleting` / `data-revealed`, each `"true"` or **absent**. Checkbox: `<button role="checkbox" id="todo-{id}-checkbox" aria-checked aria-labelledby="todo-{id}-text">`, accessible name = the Todo text → `getByRole('checkbox', { name: text })`, `toBeChecked()` works. Delete control: `<button aria-label="Delete {text}">`, always rendered and always in the tab order.
- Delete reveal — `app/globals.css` `@utility delete-action`: at rest `opacity: 0; pointer-events: none`; revealed by `@media (pointer: fine) .group:hover &`, `&:focus-visible`, or `[data-revealed="true"] &`. Playwright's `.click()` auto-hovers, so the pointer route works. `toBeVisible()` is **true even at rest** — assert `toHaveCSS('opacity', '0')` instead.
- Swipe — `todo-row.tsx` handles React `onTouchStart/Move/End`, **not** pointer events: `touchscreen.tap()` and `mouse` will not drive it. Latch: horizontal delta must exceed vertical, and `origin.x - clientX > 32` reveals. Drive it with `locator.dispatchEvent('touchstart'|'touchmove'|'touchend', { touches: [...] })`.
- Dialog — `delete-dialog.tsx`: native `<dialog aria-labelledby="delete-dialog-title">` via `showModal()` → `getByRole('dialog')`, name `Delete this Todo?`; `<h2 id="delete-dialog-title">`; `Cancel` carries `autoFocus` and is the Escape target; `Delete` needs dialog scoping.
- Banner — `error-banner.tsx`: `<div class="banner-region">` with **no role and no aria-live**; the assertive announcement is delegated to the announcer. Locate by copy; `Retry` is `getByRole('button', { name: 'Retry' })`.
- Skeletons — `skeleton-row.tsx`: exactly **3** `<li aria-hidden="true" class="skeleton-row">`. `getByRole('listitem')` will not see them; use `page.locator('li.skeleton-row')`.
- Empty state — `empty-state.tsx`: `.empty-panel`; `Nothing here yet.` + `Type above to add your first Todo.` / `Nothing active.` / `Nothing completed yet.`.
- Live regions — `announcer.tsx`: exactly two, `sr-only`, mounted once in `providers.tsx`.

**Server behaviour the failure tests depend on (read-only evidence)**
- `src/server/repository/todos.ts` — create is `.insert(todo).values({id, ownerId, text}).onConflictDoNothing({target: todo.id}).returning(...)`, falling through to an owner-scoped re-read. Second POST of the same id → **200 with the stored row**, foreign owner → **409**. **AC12 is satisfiable today**; the second POST's text is structurally ignored.
- Ids are minted **client-side** (`src/client/todos/todo-id.ts`, uuidv7); `schema.ts` has no `defaultRandom()`. POST body is `{ id, text }`; response is a bare `Todo`, `201` on insert / `200` on replay. Order is `.orderBy(desc(todo.id))`, newest-first, backed by `todo_owner_id_id_idx`.
- `src/shared/contract/errors.ts` — every failure answers `{ error: { kind, message } }` with fixed exported constants. DELETE answers `204` unconditionally (`app/api/todos/[id]/route.ts`), so verify a deletion with a follow-up read, never with the response.
- `middleware.ts` — cookie `client_identity`, `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `maxAge` 400 days (`identity-cookie.ts`). `httpOnly` means `document.cookie` cannot see it; use `context.cookies()`.
- Client give-up is `AbortSignal.timeout(15_000)`. An "uncertain failure" must be produced by route interception, not by a server error.

**Vitest: the only two real gaps** (audited — everything else is green)
- AC14 (a–d) — fully covered by `src/client/todos/merge-todo-list.test.ts`. AC15's toggle and delete halves, and AC16's toggle and delete halves, are covered by `use-set-completed.test.ts` and `use-delete-todo.test.ts`. AC17's `src/shared/contract/validation.test.ts` passes.
- **`src/client/todos/use-create-todo.test.ts` does not exist** — it is the only mutation hook with no direct test, so it has neither the structural "no whole-list snapshot" guard its two siblings carry nor an AC16 concurrency case. Copy the guards from `use-delete-todo.test.ts` ("takes no whole-list snapshot, and reads the cache once at most") and `use-set-completed.test.ts` ("leaves a concurrent toggle's change alone when the first fails").
- `use-create-todo.ts:142` `onMutate` → `upsertTodoById`; `:212` `onError` → `removeTodoById`; returns no context.
- **AC18's inherited caveat is closed.** A full run today: `Test Files 52 passed (52) / Tests 1203 passed (1203)`, zero skipped — the live-branch repository tests ran for real. `client.ts` throws at import when `DATABASE_URL` is unset, so they cannot skip silently. Re-confirm, do not re-litigate.

## Tasks & Acceptance

**Execution:**

- `package.json` — add `"@playwright/test": "1.63.0"` to `devDependencies` (exact, matching the file's convention) and a `"test:e2e": "playwright test"` script. Do not fold e2e into `npm test`; `npm run build` already chains `lint && typecheck && next build` and the Playwright `webServer` will run it.
- `playwright.config.ts` — **new**. `testDir: "e2e"`, `baseURL: "http://localhost:3000"`, `webServer: { command: "npm run build && npm start", url, reuseExistingServer: !process.env.CI, timeout }` generous enough for a cold `next build`. Two Chromium projects only: `pointer` (desktop, `pointer: fine` → autofocus and hover-reveal) and `touch` (`hasTouch: true`, coarse pointer → no autofocus, swipe-reveal). `forbidOnly: !!process.env.CI`, `retries` on CI only, `trace: "on-first-retry"`. Record in a comment why no WebKit/Firefox project exists (the `secure` cookie).
- `e2e/support/app.ts` — **new**. The locator vocabulary from the Code Map as named helpers, plus: `addTodo(page, text)` (type + Enter + await the row), `seed(page, texts)`, `failNext(page, method, pattern)` / `holdOpen(page, pattern)` built on `page.route`, and `liveRegion(page, urgency)` using `[aria-live]` + `getAttribute` — **never the literal declaration**. One module so the AD-12 taboo is kept in one place.
- `e2e/journeys.spec.ts` — **new**. UJ-1 (touch project: land, toggle `book dentist`, assert the row holds position and the counts change, switch to Active, assert only the remaining Actives are on screen) and its edge case; UJ-2 (pointer project: assert the input is focused on arrival, type, Enter, assert top-of-list + cleared input that keeps focus + Filter View forced to All, then reload) and its whitespace-only edge case; UJ-3 (touch: swipe-reveal via dispatched touch events → dialog → `Delete`, plus the pointer hover route and the keyboard route, all three reaching the same dialog, and `Cancel` returning focus to the control that opened it); UJ-4 (a fresh context: empty state, add two, complete one, walk all three tabs, reload). **UJ-4 asserts no nudge**, and asserts no tour/tooltip/coach-mark/dismissable element exists at any step — that absence is AC2's executable form, together with the script being strictly forward with no step that undoes an earlier one.
- `e2e/persistence.spec.ts` — **new**. AC3 (reload → identical list, Filter View back to All), AC4 (save `storageState`, close the context, reopen from it → identical list, and assert the `client_identity` cookie's `expires` is far future via `context.cookies()`), AC5 (two contexts → two distinct identity cookie values and two independent lists).
- `e2e/failures.spec.ts` — **new**. AC7–AC10, each asserting its exact banner copy, its revert-in-place behaviour and its retry semantics, per the I/O matrix. AC9 runs twice: once with the row in view and once after it has departed the Active view. AC10 asserts `getByRole('dialog')` does not open on `Retry`.
- `e2e/races.spec.ts` — **new**. AC11 (hold `GET` open, submit, assert the optimistic row renders above `li.skeleton-row`, fulfil, assert the text appears exactly once), AC12 (`route.fetch()` then abort so the server sees the POST and the page does not; `Retry`; then reload and assert exactly one row — and assert the replay answered `200`, sent only after the first attempt settled, since two simultaneous retries can race to `201`/`200` either way), AC13 (fail a delete, then fail a load, assert the banner carries the newer copy and that no second request is issued for the replaced operation).
- `src/client/todos/use-create-todo.test.ts` — **new**. The structural pair (`onMutate` resolves `undefined`; at most one `getQueryData` in the source) and the AC16 concurrency case (two creates in flight, one rejects, the other's optimistic row survives), plus AC15's "a failing create removes only its own row" at hook altitude rather than only in `add-todo.render.test.tsx`.
- `.github/workflows/ci.yml` — **new**. On push and pull request: Node from `.nvmrc`, `npm ci`, `npx playwright install --with-deps chromium`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, with `DATABASE_URL` from repository secrets. Upload the Playwright report on failure. State in a comment that the secret must point at a Neon **branch**, not production.
- `.gitignore` — add `/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/`.
- `README.md` — add `npm run test:e2e` to the Scripts table and one line under Testing naming the production-build requirement and the Chromium-only constraint. Table and prose only; Story 6.3 re-verifies the document as a whole.

**Acceptance Criteria:**
- Given the Playwright suite, when `npm run test:e2e` runs against a production build, then UJ-1, UJ-2, UJ-3 and UJ-4 each pass as a scripted journey, with UJ-1/UJ-3 in the touch project and UJ-2 in the pointer project. *(AC1)*
- Given UJ-4, when it runs, then every step is a forward interaction with no repetition of an earlier step, no instructional element is present in the DOM at any point, and the deferred first-run nudge is asserted absent rather than expected. *(AC2)*
- Given `.github/workflows/ci.yml`, when it is read, then it triggers on push and pull request, runs `lint`, `typecheck`, `npm test` and `npm run test:e2e` against the checked-out commit with `DATABASE_URL` supplied from secrets; and when that same sequence is run locally, then it passes. The green CI run itself needs a push and a configured secret, so it is recorded in `deferred` rather than claimed. *(AC6)*
- Given a browser context restarted from a saved `storageState`, when the page loads, then the Todo List is identical and the `client_identity` cookie's expiry is ~400 days out; and given two independent contexts, then each holds a different identity cookie and sees an independent list. *(AC4, AC5)*
- Given each of the four forced failures, when the revert runs, then the banner carries the exact copy in the I/O matrix, the affected row is restored in its original position, and `Retry` behaves as that row specifies — re-sending the same id for a create, and opening no dialog for a delete. *(AC7–AC10)*
- Given the add-during-load race, when the held list request is fulfilled, then the optimistic row rendered above the three skeleton rows and the Todo is present **exactly once** after the merge. *(AC11)*
- Given a create whose POST reached the server but whose response never reached the page, when `Retry` sends the same id and the page is then reloaded, then exactly one Todo exists. *(AC12)*
- Given a newer failure arriving while an older banner is displayed, when the banner updates, then it carries the newer copy and no request is issued for the replaced operation. *(AC13)*
- Given `npm test`, when it runs, then `use-create-todo.ts` is proved to take no whole-list snapshot, to read the cache at most once, to remove only its own row on failure, and to leave a concurrent mutation's change intact — closing the last AC15/AC16 gap. *(AC15, AC16)*
- Given the whole Vitest suite, when it runs with a working `DATABASE_URL`, then 100% pass with **zero skipped**, and the live-branch repository tests are among those that ran. *(AC17, AC18)*
- Given the repository, when the six tree-walking source scans run, then they still pass with `e2e/` populated — no spec declares `aria-live`, re-declares the contract, names `["todos"]`, or imports the database. *(regression wall)*
- Given a criterion that cannot pass without changing product source, when it is found, then it is recorded in frontmatter `deferred` with evidence and **no product file is edited**. *(epic scoping rule)*

## Spec Change Log

**2026-09-25 — AC13's matrix row amended to the direction the product implements.**
The row originally read "Delete fails, then a load fails → banner shows the newer
copy". That pair is unreachable by design: `error-banner.tsx:105` guards with
`if (slot !== null || isFetching) return;`, pinned by `error-banner.test.ts:259`
("raises into an empty slot only, and never over another kind"). A mutation
failure always takes the slot; a read failure waits for it to empty. The row was
written during planning without checking that guard, and the Matrix Test Audit
correctly refused it.

`epics.md` AC13 is direction-agnostic — "a newer error arriving while an older
one is displayed … shows the newer one and the replaced operation is not
retried" — and is satisfied, so the criterion never needed the product to
change. The row now names the reachable pair. **KEEP on re-derivation:** the
excluded direction must stay characterised as a *passing* test
(`e2e/races.spec.ts:169`), not asserted as a defect; and the finding
`AC13-matrix-direction` stays in `deferred` as the record of why.

**2026-09-25 — AC13's I/O matrix row does not describe the shipped product.** The
row reads "Delete fails, then a load fails → banner shows the newer copy". That
direction is impossible today and impossible on purpose:
`error-banner.tsx` raises a read failure only into an empty error slot, and
`error-banner.test.ts` pins that with "raises into an empty slot only, and never
over another kind". The criterion itself — a newer failure arriving over an
older banner — is satisfied and tested in the direction the product implements,
with the asymmetry characterised in `e2e/races.spec.ts`. Recorded as a finding
(`AC13-matrix-direction`) rather than fixed, per the epic scoping rule.

## Review Triage Log

## Design Notes

**Why AC6 cannot be fully demonstrated in-session, and what is delivered instead.** AC6 asks that the suite pass in CI against the same commit that deploys. The workflow file, its trigger, and its command sequence are this story's to write and are verifiable locally by running that exact sequence. The green CI run itself needs a push plus a `DATABASE_URL` repository secret, which is outside an unattended run's reach. Deliver the workflow, verify the sequence locally, and record the unobserved half in `deferred` with what would settle it — do not claim a CI run that did not happen.

**Forcing an uncertain failure (AC12).** `route.abort()` alone never reaches the server, and a server error is a *certain* failure. The shape that matches the criterion is `const response = await route.fetch(); await route.abort();` — the server commits the row, the page sees a transport failure, and the ordinary add-revert path runs. `Retry` then re-sends the same client-minted id into `onConflictDoNothing`.

**Why the touch/pointer split is two projects rather than two tests.** `usePointerCapability()` latches on the first non-`"unknown"` answer from `matchMedia("(pointer: fine)")`, so autofocus and the hover-reveal lane are properties of the context, not of the test. UJ-1 and UJ-3 are written as phone journeys in EXPERIENCE.md and UJ-2 as a laptop journey; the projects make that literal.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, `--max-warnings=0`, with `e2e/` linted.
- `npm run typecheck` -- expected: clean; `e2e/*.spec.ts` is inside `tsconfig.json`'s `include`.
- `npm test` -- expected: all files pass, **zero skipped**, count above today's 1203, and the live repository tests among those that ran.
- `npx playwright install chromium` then `npm run test:e2e` -- expected: both projects green.
- `npm test -- src/client/feedback/announcer.test.ts src/shared/contract/contract.test.ts src/client/providers.test.ts src/client/todos/use-todos.test.ts src/server/repository/client-identity.test.ts middleware.test.ts` -- expected: the six tree-walking scans still pass with `e2e/` populated. Run this early — it is the likeliest surprise.

**Manual checks (if no CLI):**
- `git status` shows no modification to any file under `app/`, `src/client/`, `src/server/`, `src/shared/`, `middleware.ts` or `app/globals.css` — new `*.test.ts` files aside. A diff touching product source means the scoping rule was broken.

## Auto Run Result

Status: done
Blocking condition: none

**Verified on the final tree.**
- `npm run lint` — clean (`--max-warnings=0`, with `e2e/` linted).
- `npm run typecheck` — clean.
- `npm test` — `Test Files 53 passed (53) / Tests 1213 passed (1213)`, zero
  skipped, up from 52/1203. Run **eight consecutive times, 8/8 green** after the
  flake below was fixed.
- `npm run test:e2e` — `40 passed, 8 skipped` across both Chromium projects, run
  twice. The 8 skips are project gating (UJ-1/3/4 touch-only, UJ-2
  pointer-only), not disabled tests.
- The six tree-walking source scans pass with `e2e/` populated.
- Every I/O matrix row is covered by a test that ran and passed.

**AC18's inherited caveat is closed.** The 2026-09-22 sprint change proposal
recorded 8 failing live-branch repository tests on stale Neon credentials, which
left Story 2.1's four repository criteria asserted rather than demonstrated.
Those tests now run for real against a working `DATABASE_URL` and pass. They
cannot skip silently — `src/server/repository/client.ts` throws at import when
the variable is unset.

**A latent flake this story surfaced and fixed.** `src/server/db/schema.test.ts`
wrote its drift probe's config to `.drift-probe-<pid>.config.ts` at the
repository **root**, then deleted it. Six other test files walk that root reading
every source file, so under parallel workers a scan could list the probe and
then fail `ENOENT` reading it after the probe finished. Observed 3 failures in 7
runs, always `providers.test.ts`'s AD-8 query-key scan. Pre-existing, not created
here: adding a 53rd test file changed worker scheduling enough for the race to
land. The probe's config now lives inside `node_modules/.cache/drift-probe-<pid>/`
beside its own output, with absolute `schema` and `out` paths — `node_modules` is
already in all six scans' skip lists. Re-verified that the probe still *detects*
drift rather than passing vacuously: a column added to `schema.ts` fails the test,
and `schema.ts` was restored unchanged. Permitted under Epic 6's "fixes surfaced
by an audit" exception; it is test infrastructure, and no product source changed.

**Repaired during verification.** The implementation subagent's README edit
misfired and replaced two rows of the NFR-6 measurement table (`npm ci` 6.1 s and
`npm run db:migrate` 1.0 s) with a stray `Script | What it does` header, leaving
the 10.6 s total unreconcilable. That table is Story 1.8's recorded evidence and
Story 6.3 AC2 compares against it, so both rows were restored.

**Also corrected.** `use-create-todo.test.ts` asserted both
`toBeLessThanOrEqual(1)` and `toEqual([])` on the same `getQueryData` count; the
second made the first vacuous and contradicted its own comment. Dropped, keeping
the ceiling the comment describes.

**Product source is untouched.** The diff covers `e2e/`, `playwright.config.ts`,
`package.json`, `.github/`, `.gitignore`, `README.md`, and two test files
(`src/client/todos/use-create-todo.test.ts` new,
`src/server/db/schema.test.ts` flake fix). Nothing under `app/`, `src/client/`
(components/hooks), `src/server/` (runtime), `src/shared/`, `middleware.ts` or
`app/globals.css` changed.

**One criterion is accepted as deferred, not demonstrated.** `AC6-green-ci-run`:
`.github/workflows/ci.yml` is delivered and its exact command sequence passes
locally, but no GitHub Actions run has occurred. It needs a push plus a
`DATABASE_URL` repository secret pointing at a dedicated Neon CI branch, never
production. Accepted by the user on 2026-09-25 as the basis for marking this
story done; the entry stays open in `deferred` until a green run is attached.

`AC13-matrix-direction` remains recorded in `deferred` as the provenance of the
matrix amendment logged in the Spec Change Log above.
