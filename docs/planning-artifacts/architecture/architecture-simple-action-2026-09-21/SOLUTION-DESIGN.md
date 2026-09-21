---
title: Simple Action — Solution Design
status: final
created: 2026-09-21
updated: 2026-09-21
companion_to: ARCHITECTURE-SPINE.md
---

# Simple Action — Solution Design

> The reasoning behind `ARCHITECTURE-SPINE.md`. The spine is the contract a builder follows; this is the argument for why it says what it says. Where the two disagree, **the spine wins** — it is the thing that gets enforced.

## 1. What is being built

A personal Todo List on one screen. Add, complete, delete, filter. No accounts, no onboarding, no settings. It persists per browser and it is expected to feel finished rather than feel large.

The requirements arrive already thought through. The PRD fixes six functional requirements and a vocabulary; `DESIGN.md` fixes every colour, type role and contrast ratio; `EXPERIENCE.md` fixes every state, string and interaction. **Almost nothing about the product was decided here.** What was decided here is the set of structural calls that a PRD and a UX spec deliberately leave open — and specifically the ones where two people, or two agent runs, building different parts could each be correct and still produce a system that doesn't fit together.

## 2. The shape of the problem

The instinct with a todo app is that it is a CRUD problem. It isn't — not this one.

Read `EXPERIENCE.md` closely and the product is a **client-side state machine with a database attached**:

- All three mutations render before the server confirms, and revert visibly if it refuses.
- One error region owns four kinds of failure, and its single `Retry` control does something different for each.
- Filter switching fires no network request at all.
- A Todo can be created *while the list that will contain it is still loading*, and the spec commits to a specific resolution: merge by id, never dropped, never duplicated.

That last one is the whole architecture in miniature. It is a race the UX author deliberately chose to allow — because an input that is interactive in appearance only is worse than one that works — and having allowed it, they specified exactly how it resolves. The architecture's job was to find a set of rules under which that specification is *implementable* rather than merely describable.

Everything downstream follows from taking that seriously.

## 3. The decisions, in the order they were made

### 3.1 One deployable, not two

The first fork was whether to build a single full-stack application or a separate client and API service.

A split would have produced a real HTTP boundary — a wall rather than a convention — and with it a natural place for authentication to attach later, which the PRD names as a constraint. But it costs roughly a day of setup: two deploy targets, CORS or a proxy, and a README requirement ("clone to running in under five minutes") that stops being inherited and starts being engineered.

**One deployable won**, because the PRD's own success condition is *finish* and its counter-metric is feature count. The cost is real and it was bought back deliberately, with two rules rather than with hope:

- **AD-2** — only the repository module may touch the database, and every repository function takes `ownerId` first. That makes "there is one place a future auth check clamps onto" a structural property rather than an intention.
- **AD-1** — route handlers are the only server entry point; Server Actions are not used. Without this, the codebase grows two APIs, both idiomatic, with two error models.

A third option — server-rendered, HTMX-style — was ruled out early. It would have fought the spec on every optimistic interaction.

### 3.2 Next.js, with its cost stated

Next.js 16 is the LTS line with the deepest ecosystem and the shortest deploy path. TanStack Start is arguably the better *fit* — router and query in one family, which is precisely this product's shape — but it reached 1.0 only in March 2026 and mid-2026 sources still hedge on production readiness.

The honest cost of Next.js here: **React Server Components buy this product almost nothing.** The entire card is interactive and optimistic, so nearly every component is a client component and App Router functions mostly as a file-based router with API routes. That is conceptual weight paid for machinery that goes unused. It was accepted because when something breaks, there is already an answer written for Next.js, and for a project whose failure mode is abandonment, that matters more than elegance.

### 3.3 Postgres everywhere, on Neon

SQLite would have been the simplest mental model — the database is a file — and would have allowed offline development. But it rules out Vercel entirely, turning "one deployable" into a container with a volume you must not lose.

The tempting middle option, **SQLite locally and Postgres in production, was rejected outright.** Two dialects produce a class of bug that exists only in production, which is exactly the divergence a spine exists to prevent. Naming it as rejected is more useful than leaving it unmentioned, because it is the option someone will otherwise propose.

Neon's branching turns the local database into a connection string rather than a Docker install, which is how the five-minute README requirement is met without an undocumented step.

### 3.4 The client generates the id

This is the least obvious decision in the spine and the one the most depends on.

The default is that the server generates ids. Under that model an optimistic row carries a temporary id and gets reconciled on response — which works fine, *until the add-during-load race*. Then the client holds an optimistic row with a temporary id and receives a list containing a row with a real id, and has no way to know they are the same Todo. The only remaining option is matching on text, which breaks the first time someone adds "buy milk" twice.

**So the client mints a UUIDv7 and sends it** (AD-4). Merge-by-id is then literally true: the optimistic row's id *is* the server id from birth. Two further properties fall out for free:

- **Create becomes idempotent.** A `Retry` after a timeout where the outcome is unknown re-sends the same id; the server recognises it and returns the existing row. That is how "never duplicated" becomes a guarantee rather than a hope.
- **UUIDv7 is time-ordered**, which resolves ordering.

On ordering (AD-5): `created_at` is server-set, as FR-1 requires, but it is *not* the sort key — `id DESC` is. The reason is that an optimistic row has an id immediately and a server timestamp only later. Sort by timestamp and every reconciliation is a potential re-sort, needing a pin-to-top special case. Sort by id and the row's position is final the moment it is minted, which is what `EXPERIENCE.md` means when it says the list's order is stable under every interaction.

### 3.5 Identity as an indirection

The PRD addendum did most of this work already: the Client Identity is an opaque token, it authorizes nothing, and the Todo List must be keyed by an indirection rather than by the token itself so that attaching real accounts later stays cheap.

The architecture adds the mechanics — an `HttpOnly`, `Secure`, `SameSite=Lax` cookie rather than `localStorage` plus a header, and the token stored only as a SHA-256 hash. Hashing costs one line and means a leaked database dump does not hand over live sessions.

A pleasant consequence worth naming: because the token is random and hashed, there is no signing key. **`DATABASE_URL` is the only secret in the system** — which is most of how the five-minute README requirement is actually met.

### 3.6 TanStack Query owns the optimistic machine

Something has to own optimistic mutation with rollback. Hand-rolling it is where this project would have gone wrong quietly: story by story, three mutations acquire three different rollback mechanisms, and the bug that results is the kind that only shows up under a race.

TanStack Query does exactly this job, and **AD-8** fixes one shape for all three mutations so they cannot drift.

## 4. Three problems that needed real answers

Writing the spine was straightforward until it was tested adversarially — building two hypothetical units that each obey every rule and asking whether they still fit. Three did not.

### 4.1 Rollback that undoes someone else's work

The textbook optimistic-update recipe snapshots the cache in `onMutate` and restores that snapshot in `onError`. With one mutation at a time, it is correct. With two in flight, it is not: a failing create restores a snapshot taken *before* a toggle that has since succeeded, and silently reverts it.

`EXPERIENCE.md` never asks for a list-wide restore. It says *the row* reverts. So AD-8 now forbids snapshot rollback: **a failing mutation reverses only the entity it changed.**

### 4.2 The recipe that deletes the Todo

Worse, and more interesting. That same recipe *begins* by cancelling in-flight queries — and here that directly contradicts the spec.

`EXPERIENCE.md` is explicit about the add-during-load race: the skeletons keep pulsing, the list still arrives, and it merges with the optimistic row. Cancel the load and the list never lands. Let it land without merging and it overwrites the cache, and the Todo the user just typed disappears.

**AD-16** resolves it: a create must not cancel the list query, and the list response merges into the cache by id rather than replacing it. Toggle and delete may still cancel, because they act on rows the server already knows about. This is the one place where following the library's documented pattern would have produced a bug that precisely violates a promise the UX doc had already made in writing.

### 4.3 Two identities for one first-time user

`EXPERIENCE.md` makes the input live before the list arrives — deliberately, so a thought can be captured the instant the page paints. But on a *first-ever* visit there is no identity cookie yet. If a `GET` and a `POST` are both in flight and each is allowed to mint an identity, the user's first Todo lands in a different Todo List from the one being read.

**AD-17** moves identity issuance to middleware, on the document request, before any API call is possible. Route handlers now read an identity and never create one; a request without one is a `401`. The race cannot occur because there is no window in which the cookie is absent.

None of these three was visible from reading the requirements. All three were reachable by ordinary, correct-looking implementations of them.

## 5. What was deliberately not done

- **No authentication.** Out of scope, and the path is kept open by AD-7 and AD-2 rather than by building any of it.
- **No soft delete.** The PRD says deletion is permanent. A `deleted_at` column would put a filter on every query for a v2 that may never come. If Open Question 1 resolves toward undo, that is a schema addition and a new AD.
- **No observability stack.** Platform logs only. At these stakes that is the whole story.
- **TypeScript 6, not 7.** 7.0.2 is current but ships the Go-based compiler and drops the JavaScript Compiler API that Next.js's default backend calls into. Under Next 16.3 it needs `experimental.useTypeScriptCli`, and without that flag the build fails with a misleading *"required package(s) are not installed"*. That failure mode is recorded in the spine so the upgrade, when it happens, costs minutes.
- **Drizzle 0.45, not the 1.0 beta.** A project whose stated risk is abandonment is not the place to debug a beta.

## 6. Risks worth watching

| Risk | Where it bites | Signal to watch for |
| --- | --- | --- |
| The optimistic layer is the whole product's complexity, concentrated | AD-8, AD-16 — create, toggle and delete interacting under failure | Any bug that only reproduces with two actions in flight. This is why Playwright with route interception is in scope rather than optional. |
| One deployable means the boundary is a convention | AD-1, AD-2 | A `fetch` in a component, or a Drizzle import outside the repository. Cheap to catch with a lint rule; worth adding one. |
| Poppins is wide, and Todo text can be 500 characters | `DESIGN.md` flags this itself | Check wrapping at the 500-character ceiling on the smallest viewport before the type ramp is considered settled. |
| Clearing browser storage orphans the list with no recovery | AD-7, and the PRD calls this its sharpest edge | Unchanged by this architecture — it is the direct cost of having no accounts, accepted knowingly. |
| No offline development | Neon | A plane, a train, a bad connection. |

## 7. How to read the spine

`ARCHITECTURE-SPINE.md` is terse on purpose. Each `AD` carries three lines:

- **Binds** — what it governs.
- **Prevents** — the specific way two independently-built pieces would otherwise diverge. This is the *reason the rule exists*, and if it reads as vague, the rule probably shouldn't be there.
- **Rule** — the enforceable constraint.

Anything not fixed by an `AD`, a convention, or the dependency graph is genuinely open, and the code owns it once the code exists. The `Deferred` section is not a backlog; it is the list of things the spine explicitly declines to decide, each with the reason it can wait.

Full decision history, including the options rejected and why, is in `.memlog.md`.
