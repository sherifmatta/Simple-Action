---
title: 'Story 1.5 — Define the shared contract'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '88ef14a228d5b3dbe5050373ce63822943aa55f0'
context:
  - '{project-root}/docs/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/planning-artifacts/architecture/architecture-simple-action-2026-09-21/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/shared/contract/` holds only a `.gitkeep`. Nothing in the repository declares a Todo type, an error shape, or the 500-character rule — and the first story that needs one (2.1, serving the list) will invent it locally unless it already exists. That is exactly how a server response and a client expectation drift apart, and how the same validation rule gets retyped on both sides of the crossing with one of the two subtly wrong.

**Approach:** Write the three things AD-3, AD-10 and AD-11 name, and nothing else: the `Todo` wire shape, the `{ error: { kind, message } }` envelope with all four kinds present from the outset, and the 500-character constant plus the trim/reject-empty/cap predicate. Both sides import them; neither retypes them. No endpoint, no hook, no route handler — this story ships types, two constants and one function.

## Boundaries & Constraints

**Decided (human, at approval):**
- **The Todo wire shape is validated at the type level only.** `Todo` is a `type`; the module's only runtime exports are the 500-character constant and the text predicate. The client trusts the server's JSON rather than parsing it. This is what the dependency graph's "types only" label on the contract edges (`ARCHITECTURE-SPINE.md:65-66`) describes, it keeps the surface both layers import as small as AD-3 implies, and it adds no dependency to a Stack table that pins every other library. A hand-written `isTodo` guard and a Zod schema were the alternatives; both were declined. The exposure accepted is that a malformed Todo from the server renders as garbage instead of raising — acceptable because one deployable serves both sides and the server builds its responses from this same type.

**Always:**
- The module holds exactly the three things `ARCHITECTURE-SPINE.md:263` names: wire shape, error envelope, validation constant and predicate.
- The wire uses `camelCase` (SPINE:181), so the Todo's timestamp field is `createdAt` — an ISO-8601 UTC string, never a `Date`. `epics.md:509` writes `created_at`; the spine wins by `SOLUTION-DESIGN.md:11`.
- Vocabulary is the PRD glossary verbatim (SPINE:177): the type is `Todo`, the copy field is `text`, the boolean is `completed`. Never `Done`, `task`, `item`, `isDone`, `status`, `title` or `content` — in identifiers, comments or test names.
- The predicate caps the **trimmed** length, and 500 is valid. `epics.md:427` fixes its test boundaries.
- No `any` anywhere in the module (SPINE:186). `@typescript-eslint/no-explicit-any` already errors repo-wide.
- Every source file is kebab-case (SPINE:178) and colocates its `*.test.ts`.

**Never:**
- No request-body types (`POST {id, text}`, `PATCH {completed}`) and no `kind`→HTTP-status mapping. Both are genuinely open (`SOLUTION-DESIGN.md:142`) and belong to the endpoint stories that pick them, 3.1 and 4.1.
- No UUIDv7 validation — AD-4 puts that check on the server, in Story 3.1.
- No `fetch`, no route handler, no hook, no React.
- No import from `@/client/**` or `@/server/**`. The contract couples to neither side; the Todo type is hand-written, not `$inferSelect`ed off the Drizzle schema.
- No new or relaxed lint rule. `eslint.config.mjs:227-240` already walls this directory.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid text | `"Buy milk"` | predicate returns `true` | N/A |
| Empty string | `""` | `false` | N/A |
| Whitespace only | `"   \n\t "` | `false` — empty after trim | N/A |
| Single character | `"a"` | `true` — one is enough | N/A |
| Exactly at the cap | 500 chars | `true` — 500 is inclusive | N/A |
| Over the cap | 501 chars | `false` | N/A |
| Passes only after trimming | 500 chars wrapped in spaces (502 raw) | `true` — the cap is on the trimmed length | N/A |
| Fails even after trimming | 501 chars wrapped in spaces | `false` | N/A |
| Todo shape | the exported `Todo` type | exactly `id`, `text`, `completed`, `createdAt` — all four required, all `string` but `completed` | N/A |
| Error kinds | the exported kind union | exactly `load`, `create`, `update`, `delete` — no more, no fewer | N/A |
| No type duplicated | the tree outside `src/shared/contract/` | no other module declares a Todo shape or an error-envelope shape | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/contract/.gitkeep` -- the whole deliverable lands here; the `.gitkeep` goes once real files arrive, per Stories 1.3 and 1.4.
- `eslint.config.mjs:227-240` -- the block governing `src/shared/**`: it may import neither `@/client/**` nor `@/server/**` nor any Drizzle module. `:17-23` records the last-match-wins invariant — do not add a block for these files.
- `eslint.config.test.ts:66-72,186-199` -- three fixtures already probe `src/shared/contract/probe.ts` (Server Action, imports client, imports server). The wall is covered; this story adds no fixture.
- `src/server/db/schema.ts:22-33` -- the `todo` table the wire shape mirrors: `id` uuid, `text` text, `completed` boolean, `createdAt` timestamptz. Read it for field names only; do not import it.
- `src/server/repository/client-identity.test.ts:233-238` -- asserts a module's exact exported surface via `Object.keys(mod).sort()`. `:240-262` scans source text to prove a symbol is absent. Both patterns apply here.
- `src/server/db/schema.test.ts:19-27` -- the verbatim Matrix Test Audit header comment format every test file carries.
- `tsconfig.json:21-23` -- `@/*` → `./src/*`, so the import form is `@/shared/contract/...`. `strict: true` only; `noUncheckedIndexedAccess` is off.
- `vitest.config.mts:33` -- `src/**/*.test.ts` is already in the include globs; no config change.
- `docs/planning-artifacts/epics.md:411-429` -- Story 1.5's AC1–AC6, source of truth. `:427` fixes the predicate's test boundaries.
- `ARCHITECTURE-SPINE.md:83-87` (AD-3), `:125-129` (AD-10), `:131-135` (AD-11), `:177-186` (conventions), `:263` (tree).

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/contract/todo.ts` -- the `Todo` wire type: `id`, `text`, `completed`, `createdAt` -- AC1
- [x] `src/shared/contract/errors.ts` -- the kind union with all four kinds and the `{ error: { kind, message } }` envelope type -- AC2 -- exported as `ErrorKind` and `ErrorEnvelope`
- [x] `src/shared/contract/validation.ts` -- the 500-character constant and the trim/reject-empty/cap predicate -- AC3 -- `TODO_TEXT_MAX_LENGTH` and `isValidTodoText`
- [x] `src/shared/contract/validation.test.ts` -- every predicate row of the matrix -- AC5, Matrix Test Audit convention
- [x] `src/shared/contract/contract.test.ts` -- the three static rows: the `Todo` shape, the exact four kinds, and a repo-wide scan proving no module outside this directory declares a Todo or error-envelope shape -- AC1, AC2, AC4, AC6
- [x] remove `src/shared/contract/.gitkeep` once real files occupy the directory

**Acceptance Criteria:**
- Given the contract module, when it is typechecked and linted, then `tsc --noEmit` and `eslint --max-warnings=0` both exit 0 and no `any` appears in the directory (AC4).
- Given `src/client/` and `src/server/`, when they are searched, then neither declares its own Todo type — asserted by a persisted scan, not a one-off grep (AC1).
- Given a future endpoint, when it returns success, then the body is the bare resource or a bare array with no envelope — recorded here as the standing rule for Epics 2–5, since this story adds no endpoint (AC6).

### Review Findings

_Code review 2026-09-21 — four layers over the full Epic 1 diff._

- [x] [Review][Patch] The banned-vocabulary check reads raw source while the `any` check strips comments [src/shared/contract/contract.test.ts] — the `any` scan runs through `withoutComments()`; the `/\b(Done|task|item|isDone|title|status|content)\b/` scan runs on the raw file. `todo.ts` survives only because it writes "Completion Status" with a capital S and the regex is case-sensitive: one lowercase "status" in a prose comment fails the suite for no real reason. Strip comments there too.
- [x] [Review][Patch] `withoutComments` mis-handles regex literals containing a quote [src/shared/contract/contract.test.ts] — a scanned file holding such a literal leaves comments inside that span unstripped, so prose can be reported as a competing Todo shape. Track regex-literal state alongside quote state, or skip the file.

**Rejected**

- `todo.ts` and `errors.ts` have no colocated `*.test.ts`, against a frozen Boundaries bullet — `low`. Their coverage lives in `contract.test.ts`, which pairs with no module of that name; `contract.test.ts:395-403` hard-codes the five-file listing as an assertion. Real convention drift, but no named harm, and the fix means splitting a 429-line suite and rewriting that assertion — more than a direct correction.
- Frozen Intent says "two constants and one function"; the module exports one constant and one function — `low`, and the fix is to edit frozen spec text. Already raised and rejected as this spec's triage #20; it stands as an unresolved intent/code mismatch.

## Implementation Notes

**The exported names.** `Todo` (todo.ts); `ErrorKind` and `ErrorEnvelope` (errors.ts); `TODO_TEXT_MAX_LENGTH` and `isValidTodoText` (validation.ts). The spec fixed only `Todo`, `text` and `completed`; the rest follow the three-files-no-barrel shape in Design Notes. `ErrorEnvelope` rather than `ErrorResponse` because `AD-10` and the epic context both call it the envelope, and `status` is banned as an identifier so no `ErrorStatus`-shaped name was available anyway. The module's only runtime exports remain the constant and the predicate — the two type modules emit nothing.

**The static rows are compiler assertions with a runtime shell.** The wire shape is validated at the type level only (frozen `Decided`), so "exactly these four fields" cannot be asserted by inspecting a value. `contract.test.ts` uses the conditional-identity trick — `Exactly<A, B>` resolves to `true` only when each side is assignable to the other in an invariant position — and assigns `true` to a variable of that type. The enforcement is `npm run typecheck`, and therefore `npm run build`, **not** `npm test`: Vitest transpiles without type-checking, so a drifted `Todo` or a fifth error kind makes `tsc --noEmit` fail while those `expect` calls still pass. Plain `extends` would have accepted a `Todo` carrying extra fields. The four kinds get the same treatment plus a `Record<ErrorKind, true>`, which is exhaustive in both directions: a missing kind fails to compile and an invented one fails the excess-property check.

**The AC1 duplication scan catches a competing shape under any name.** A name-only check (`type Todo` outside the directory) would miss `type Row = { id; text; completed; createdAt }`, which is the same drift with the serial numbers filed off. The scan extracts every `type`/`interface` declaration body by brace matching — a lazy `{[^}]*}` ends at the first nested object and lets a duplicate through — and flags a body declaring `text`, `completed` and `createdAt` together, or an `error:` key wrapping a `kind`, or the kind union re-spelled as string literals. It was proved non-vacuous in both directions: an anti-vacuity test asserts it still finds the contract's own `Todo`, `ErrorKind` and `ErrorEnvelope`, and a throwaway `src/client/todos/` module declaring `LocalRow`, `Failure` and `Banner` was confirmed to fail all three assertions before being removed. A brace-less alias (the kind union is one) ends at its semicolon, which is what the first draft missed.

**Comments are stripped before both scans.** `errors.ts` contains the sentence "classify any failure", and prose about the Todo type is not a declaration of one. A small string-aware stripper removes `//` and `/* */` while keeping string and template literals, since the kind union is spelled with them. It is not a parser: a regex literal containing `//` loses the rest of its line, which costs neither scan anything it needs. The AC4 `any` check runs over the stripped source, matching the spec's "excluding the word in prose".

**The vocabulary check is case-sensitive on purpose.** `Done`, `task`, `item`, `isDone`, `title`, `status` and `content` are banned as identifiers, but `Completion Status` is the PRD glossary's own term for what `completed` carries and appears in `todo.ts`'s doc comment. A case-sensitive `status` catches the identifier and leaves the glossary term standing. `contract.test.ts` is the one file exempt from this check — it carries the banned words as the assertion data on that very line, the same exemption `client-identity.test.ts` grants itself.

**`SKIPPED_DIRECTORIES`, `SCAN_EXEMPT_FILES` and `sourceFiles` are duplicated from `client-identity.test.ts`.** Two scans now walk the tree with the same skip list. Extracting a shared test helper was declined here: it would be a new module in neither `src/server/` nor `src/shared/contract/` — the contract directory holds exactly the three things `SPINE:263` names, and the frozen `Always` block says so. If a third scan appears, that is the moment to place the helper deliberately.

**No dependency, config or lint change.** `vitest.config.mts` already includes `src/**/*.test.ts`; `eslint.config.mjs:227-240` already walls the directory and needed no fixture; nothing was installed. The two test files need no `DATABASE_URL` and no network.

## Spec Change Log

## Review Triage Log

Pass 1 — layers: blind-hunter, edge-case-hunter, verification-gap, over the diff since `baseline_commit`.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `isTodoShape` requires the literal `createdAt`, so a duplicate spelled `created_at` escapes the AC1 scan | medium | Confirmed empirically: a probe declaring `type TodoRow = { id; text; completed; created_at }` in `src/client/todos/` left the suite green. This is the spelling `epics.md:509` uses, which is what a Story 2.1 author reads. | patch |
| 2 | `isErrorEnvelopeShape`'s union fallback is the ordered regex `/"load"[\s\S]{0,80}"create"/`, so a re-spelled union in another order escapes | medium | Confirmed in the same probe: `type ApiErrorKind = "create" \| "delete" \| "load" \| "update"` (alphabetical — the likeliest retyping) was not flagged. Raised independently by two layers. | patch |
| 3 | Neither detector's regex branch is exercised by a matching declaration — the anti-vacuity test only hits the `name ===` short-circuits, so both can rot silently | medium | Confirmed by reading the test: the positive path never runs the field or union regexes. Grouped with #1/#2 — same root cause, the detectors are unpinned. | patch |
| 4 | `declarations()` lets `depth` go negative, so a brace-less alias with no semicolon swallows the rest of the file as its body | medium | Confirmed empirically: a probe starting `type Bare = string` (no semicolon) followed by a function containing the three fields failed the scan as `a competing Todo shape: [{"name":"Bare"}]` — a false positive that misattributes the violation. | patch |
| 5 | The header comment claims the `expect` calls make a drifted type fail `npm test`; they cannot — the assertions are type-level and Vitest transpiles without type-checking | medium | Confirmed empirically: adding a fifth required field to `Todo` left `npx vitest run src/shared/contract` at 22 passed while `tsc --noEmit` reported three errors. Raised by two layers. The rows are enforced, but by `npm run typecheck`, not `npm test`. | patch |
| 6 | The ISO-8601 test asserts `typeof` and `Date.parse` against a literal the test itself wrote, and `Date.parse` accepts `"Sep 21 2026"` | low | Confirmed by reading: the sample is the test's own data, so the only real assertion is the compile-time `satisfies`. Fix is a direct correction (a format regex). | patch |
| 7 | `SKIPPED_DIRECTORIES` omits `out` and `build`, both `.gitignore`d as generated; `path.extname("x.d.ts")` is `.ts` | low | Real: emitted declaration files under either would be scanned, so a built machine could see phantom duplicates while CI stays green. Fix is two strings in a set — a direct correction. | patch |
| 8 | The describe "…and nothing else (AC4)" hardcodes five filenames, but `epics.md` AC4 is only "contains no `any`" | low | Confirmed against `epics.md:425`. A later story adding a contract module would fail an assertion labelled with an unrelated AC. Fix is a relabel. | patch |
| 9 | Nothing pins that `todo.ts` and `errors.ts` emit no runtime value, though the frozen `Decided` note says the cap and the predicate are the only runtime exports | low | Confirmed: `validation.test.ts` pins its own surface, the two type modules have no equivalent. Fix is a direct addition in the precedent's style. | patch |
| 10 | `isValidTodoText` throws a `TypeError` on non-string input despite being the server's trust boundary | low | Real at the type level only: the parameter is typed `string`, `strict` is on, and no route handler exists in the tree at this baseline. Story 3.2 narrows the JSON body at its own boundary. | rejected — low, fix widens the public signature to `unknown` for state not demonstrated |
| 11 | The cap counts UTF-16 code units, so 250 emoji sit at 500; `String.trim` does not strip zero-width characters | low | Both real. But the UI counter also uses `.length`, so client and server agree — which is what AD-11 actually requires; switching to code points would break that agreement unless the UI changes too. | rejected — low, and the fix breaks the client/server agreement it is meant to protect |
| 12 | The scan misses a duplicate declared as a class, a const schema, a `typeof table.$inferSelect` alias, an inline annotation, or a two-of-three partial copy | low | Real narrowness of a heuristic. A two-of-three threshold would false-positive on a legitimate props type, and `$inferSelect` is the sanctioned server pattern (`client-identity.ts:20`), so flagging it would be wrong. | rejected — low, fix adds complexity and false positives |
| 13 | A generic type-parameter list carrying a braced default ends the body before its real one | low | Real but exotic; no such declaration exists in the tree or is likely in this product. | rejected — low, unlikely, fix adds complexity |
| 14 | A type declaration quoted inside a string literal is scanned as real code | low | Real — it is why `eslint.config.test.ts` is exempted by name. Blanking string bodies would break the kind-union detector, which reads string literals by design. | rejected — low, fix breaks a detector it needs |
| 15 | `SKIPPED_DIRECTORIES` matches on basename rather than path, so a nested `docs`/`drizzle`/`public` under `src/` would be skipped | low | Real, and the same pattern already triaged at spec-1-4 #20. Requires a future directory that does not exist. | rejected — low, unlikely, carried from spec-1-4 |
| 16 | The banned-vocabulary regex is case-sensitive, so `done`, `Task`, `Status` slip through | low | Confirmed: `done` lowercase appears nowhere in the module today. Case-insensitivity would fire on `todo.ts`'s "Completion Status", which is the PRD glossary's own term — the case sensitivity is load-bearing. | rejected — low, fix breaks on the glossary term |
| 17 | The "contains no `any`" test filters out both `.test.ts` files, so it checks three of the five | low | Real narrowness, but `@typescript-eslint/no-explicit-any` errors repo-wide — verified by linting a probe under `src/shared/contract/`. Removing the filter makes the test fail on its own title string `"contains no \`any\`"`, which `withoutComments` preserves. | rejected — low, the wall holds and the fix is more than a direct correction |
| 18 | Path handling mixes `path.sep` with a `/`-spelled constant and binds the scan to `process.cwd()` | low | Real on Windows only. `engines.node` and the whole toolchain are POSIX here, and `client-identity.test.ts` already carries the same pattern. The `\|\| file === CONTRACT_DIRECTORY` arm is genuinely dead. | rejected — low, unlikely, fix is more than a direct correction |
| 19 | `message` is unconstrained, so driver or SQL text could reach the browser through the single error slot | low | Real as a future hazard; AD-10's rule that the client never forwards a server message is already recorded in `errors.ts`'s doc comment, and no endpoint exists to construct a message yet. | defer |
| 20 | The spec's Intent says "two constants and one function"; exactly one constant is exported | low | Accurate reading of the frozen Intent block. | rejected — the fix edits this build's frozen spec |
| 21 | `sprint-status.yaml` and the spec frontmatter disagree on the story's status | false | Refuted: mid-workflow bookkeeping observed between step-03 and step-04. Both are set by the workflow itself at step-05. | rejected — false |

## Design Notes

**Three files, no barrel.** `src/server/repository/` is the precedent: `client.ts` and `client-identity.ts` sit side by side and callers import the specific module. Consumers write `import type { Todo } from "@/shared/contract/todo"` and `import { isValidTodoText, TODO_TEXT_MAX_LENGTH } from "@/shared/contract/validation"`. AC3's "the module exports" reads across the directory, which is what AD-3 means by "the single definition".

**The Todo type is hand-written.** `src/server/repository/client-identity.ts:20` derives `ClientIdentity` from `typeof clientIdentity.$inferSelect`, but `eslint.config.mjs:227-240` forbids `src/shared/` from importing `@/server/**`, and the DB and wire types genuinely differ: `createdAt` is a `Date` in Drizzle and an ISO-8601 string on the wire, and `ownerId` is a column but never a wire field (AD-7 keeps ownership server-side). Mirroring the table by hand is correct, not a shortcut.

**AC1's "neither side declares its own Todo type" has no lint rule behind it.** `epic-1-context.md:53` claims Story 1.1's rules make this enforceable; they do not — `eslint.config.mjs` restricts imports and syntax, never type declarations. The enforcement here is a persisted source-scan test in the `client-identity.test.ts:240-262` style. That is a real test that fails when a future story declares a competing shape, and it is the proportionate tool; a `no-restricted-syntax` selector banning `type Todo` outside this directory would be brittle and is barred by the frozen `Never` block.

**The predicate is a boolean, not a Result.** `EXPERIENCE.md:103,145` gives the UI no error copy for either violation — over-length is a hard keystroke stop and whitespace-only submit is a silent no-op — so no caller ever needs a reason code. The character counter counts *raw* keystrokes and must not be derived from this predicate, which measures trimmed length.

**Trimming is the server's job to persist** (`epics.md:721`), so the predicate must be safe to call on untrimmed input from either side. It trims internally and returns a verdict; it does not return the trimmed string.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0 (`--max-warnings=0`), including the pre-existing `src/shared/contract/probe.ts` boundary fixtures
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0, every matrix row covered, no new network dependency (this module needs no `DATABASE_URL`)
- `npm run build` -- expected: exit 0
- repo-wide search for `any` inside `src/shared/contract/`, excluding the word in prose -- expected: no hits (AC4)

**Manual checks (if no CLI):**
- The four error kinds are spelled `load`, `create`, `update`, `delete` and the union admits nothing else.
- The word `Done`, and the identifiers `task`, `item`, `isDone`, `status`, `title`, `content`, appear nowhere in the module or its tests.
