# Epic 1 Context: A Deployed, Runnable Foundation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up a deployed, runnable application in which every architectural seam the product depends on already exists and is enforced by tooling rather than by memory: route handlers as the only server entry point, one repository as the only database importer, one shared contract, one query client, one error slot, one announcer, and the design tokens transcribed exactly once. A developer who has never seen the repository can clone it, set a single environment variable, and be running in under five minutes with no undocumented steps — and the same commit is live on Vercel. Nothing is user-visible beyond an empty card. This epic matters because every later epic assumes these modules; building them per-feature is how the seams get skipped, and because the product's whole premise is a build small enough to finish rather than abandon.

## Stories

- Story 1.1: Scaffold the application with its layer boundaries enforced
- Story 1.2: Transcribe the design tokens and load the typeface
- Story 1.3: Create the schema and the first committed migration
- Story 1.4: Establish the repository as the only database module
- Story 1.5: Define the shared contract
- Story 1.6: Issue and resolve the Client Identity
- Story 1.7: Mount the application shell
- Story 1.8: Ship the README and the first deploy, and time the path

## Requirements & Constraints

- **Persistence mechanism (not yet observable).** This epic owns the machinery that makes a Todo List durable across reloads and browser restarts on the same browser, and independent across browsers — but nothing persists a Todo yet, and the observable behaviour is proven in later epics.
- **Extensibility is a structural constraint, not a feature.** Adding authentication and multi-user support later must remain a nullable `user_id` column plus one ownership check. Owner-first repository signatures and the identity indirection are the entirety of how that is bought.
- **Maintainability is measured, not asserted.** The clone-to-running path must be walked end to end, timed with a stopwatch, and the measurement recorded in the README. If it exceeds five minutes, either the setup changes or the requirement is renegotiated — and that outcome is recorded now, not discovered at the end.
- **Vocabulary is fixed and used verbatim in code as well as copy:** `Todo`, `Todo List`, `Completion Status`, `Active`, `Completed`, `Client Identity`, `Filter View`. The Todo's text column is named `text` — never `title`, `content`, `task`, or `item`. The word **Done** is banned everywhere, including in identifiers, tooltips, and prose.
- **Secrets.** `DATABASE_URL` is the sole required secret. No config file holds a secret and no secret has a committed default. Local development requires no Docker and no local database install.

## Technical Decisions

- **Stack pins are binding:** Node.js 24 LTS · Next.js 16.3.x · React 19.3 · TypeScript 6.x · TanStack Query 5.103.x · Tailwind CSS 4.3.x · Drizzle ORM 0.45.x · Drizzle Kit 0.31.x · uuidv7 1.2.x · PostgreSQL (Neon) 18 · Vitest 5.x · Playwright 1.62.x. TypeScript 7.x must **not** be installed — it drops the JavaScript Compiler API the Next.js default backend calls into, and installing it fails with a misleading "required package(s) are not installed" error. Drizzle 1.0 is beta and deliberately skipped.
- **One crossing only.** UI → query hooks → `fetch` → route handler → repository → Drizzle → Postgres. Every client–server interaction goes through a REST route handler under `app/api/`; Server Actions are used nowhere. Only modules under `src/server/repository/` may import the Drizzle client, and every repository function takes `ownerId` as its first parameter. Nothing on the server imports from client code. Because the product is one deployable, these are enforced by lint rules — the boundary is otherwise a convention rather than a wall.
- **Repository scope is deliberately thin here.** Identity lookup-by-token-hash and identity create only. The Todo functions arrive in the epics that consume them.
- **Shared contract** is the single definition of the Todo JSON shape, the error envelope, and the validation constants. The envelope is `{ error: { kind, message } }` with `kind` constrained to exactly `load`, `create`, `update`, `delete` — all four present from the outset, not grown a kind at a time. Success responses are the bare resource or a bare array with no envelope. Validation is one 500-character constant plus one predicate that trims, rejects empty-after-trim, and caps — imported by both sides, never retyped, unit-tested at its boundaries. No `any` in this module.
- **Client Identity** is a 256-bit random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie with an explicit long `Max-Age` (not a session cookie — that attribute is what makes survival across a browser restart true). Only its SHA-256 hash is stored; the raw token appears nowhere at rest. Todos reference the identity row's id, never the token. The token authorizes nothing beyond its own list and must never become authentication. Minting happens **only** in middleware on the document request, before any API call is possible; API routes read the identity, never mint one, and return `401` without it.
- **Data model:** two tables — `client_identity` (uuid PK, unique text token hash, timestamptz created) and `todo` (uuid PK, uuid owner FK, text, boolean completed, timestamptz created). Exactly one index beyond the keys: `(owner_id, id DESC)`.
- **Migrations** are generated as SQL files, committed, and applied by the deploy step. The push command is local-only and appears in no deploy, preview, or production script.
- **Conventions:** files and directories kebab-case; components PascalCase one per file; hooks `useX`; repository functions verb-first and owner-scoped. UUIDv7 lowercase canonical on the wire and in the database. `timestamptz` in Postgres, ISO-8601 UTC on the wire, server-set only. `camelCase` on the wire, `snake_case` in the database, with the Drizzle schema owning the mapping and no other module translating. TypeScript `strict: true`. Server logging via platform `console` only, with no Todo text in any log line.
- **App shell** mounts once at the root: a query client with `['todos']` as the only query key the application will ever use; exactly one polite and one assertive live region, announced to via a single `announce(message, urgency)` function, with no component declaring its own `aria-live`; and one error slot holding `{ kind, retry } | null` where a newer error replaces an older one and the replaced operation is not retried.
- **Environments:** local, Vercel preview (per pull request), and production — identical in shape, differing only in which Neon branch `DATABASE_URL` points at.

## UX & Interaction Patterns

- Design tokens are transcribed **exactly once** into the Tailwind v4 `@theme` block in `app/globals.css`: 22 colour tokens, 10 typography roles, 4 radii, the spacing scale plus named structural tokens, and the component recipes — each carrying its original token name. No hex literal and no arbitrary-value class may appear anywhere else in the codebase; a value not in the theme must be added there before it can be used.
- Poppins loads through `next/font` with the specified fallback stack, metric-adjusted so the webfont swap contributes zero layout shift — the skeleton rows in the next epic depend on this.
- Two shadow recipes only (card and row), plus the green re-tint for a Completed row and the two filter-tab inset shadows. Shadows are tinted with the ground's blue-violet, never neutral black, and elevation never encodes state.
- The focus ring is a soft glow with exactly one variant: on a Completed row the hue steps down to the deeper accent. Geometry, blur, and opacity are identical in both; the ring never changes the size of the element it surrounds and is never suppressed for aesthetics.
- Completed-row styling is expressed once — the row sets a single variant marker and descendants derive from it; no component re-tests Completion Status to pick a colour.
- The only visible result of this epic is an empty card on the ground at its correct maximum width, centred. Nothing else renders.

## Cross-Story Dependencies

- Stories 1.3 → 1.4 → 1.6 are a chain: the schema must exist before the repository can query it, and the repository's identity functions must exist before middleware can mint and resolve an identity.
- Story 1.1's lint rules are what make 1.4's "only importer" and 1.5's "no duplicated types" enforceable rather than aspirational — build them first, not last.
- Story 1.2 is independent of the server chain and can run in parallel with 1.3–1.6.
- Story 1.7 depends on 1.2 (the card renders from theme tokens) and on 1.5 (the error slot's kinds come from the contract).
- Story 1.8 depends on everything else and on the Neon project and branches existing.
- **Downstream:** every later epic assumes the contract, repository, identity, error slot, announcer, and theme exist. Epic 2 seeds the shared motion module — it is deliberately *not* part of this epic.
- **Open item — no starter template is named.** The architecture pins a stack but names no scaffold. The implied path is the Next.js scaffold with the version pins applied afterward. This affects Story 1.1 and should be confirmed before it starts.
