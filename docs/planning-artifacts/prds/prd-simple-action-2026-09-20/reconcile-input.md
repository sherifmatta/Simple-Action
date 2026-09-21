# Input Reconciliation — docs/input.md → prd.md + addendum.md

Every claim in `docs/input.md` traced to where it landed, or named as dropped.

## Landed cleanly

| input.md intent | Landed in |
| --- | --- |
| Simple full-stack Todo app, individual users, personal tasks | §1 Vision, §2.1 JTBD |
| Clarity and ease of use; avoid unnecessary features | §1 Vision thesis; SM-C1 counter-metric |
| Create / visualize / complete / delete | FR-1, FR-2, FR-3, FR-5 |
| Todo = short text + completion status + creation time | §3 Glossary (Todo) |
| See list immediately on open, no onboarding | FR-2; addendum §E |
| Fast/responsive, updates reflected instantly | §5 NFR (perceived responsiveness); FR-1/FR-3 consequences |
| Completed visually distinguishable | FR-2 consequence |
| Works across desktop and mobile | §5 NFR (surfaces); SM-4 |
| Sensible empty, loading, error states | FR-2 consequences; §5 NFR (state coverage); SM-3 |
| Durability across user sessions | FR-6; SM-2 |
| Auth/multi-user not required but not precluded | §5 NFR (extensibility); addendum §A migration path |
| Simplicity, performance, maintainability | §5 NFRs |
| Basic error handling client and server | §5 NFR (error handling) |
| Excludes accounts, collaboration, priority, deadlines, notifications | §6 Non-Goals |
| Success: core actions unguided, stable across refreshes, clear UX | SM-1, SM-2, SM-3, SM-4 |
| "Feel like a complete, usable product despite minimal scope" | §1 Vision; addendum §E |

## Gaps — present in input.md, thin or absent in the PRD

1. **"A small, well-defined API"** *(low)* — input.md names the API's *shape quality* as a goal. The PRD specifies behavior (FR-1…FR-6) but never states that the API surface itself should be small and coherent. Defensible: API design is an architecture-phase concern and tech-shaped, so it belongs downstream rather than in the PRD body. **Action:** carry to `bmad-architecture` rather than adding an FR.

2. **"Easy to ... deploy"** *(low)* — the §5 maintainability NFR says a developer should be able to "read, run, and extend" the codebase. `input.md` says "understand, deploy, and extend". Deployment ease was silently dropped. **Action:** add "deploy" to the maintainability NFR — one word, restores the intent.

3. **"Basic CRUD operations"** *(informational, not a gap)* — worth flagging for architecture: with text editing cut (addendum §D), the **U** in CRUD reduces to the Completion Status toggle alone. A full update endpoint is not required by any FR. Architecture should decide deliberately whether to build one anyway to keep the door open for v2 inline edit.

## Qualitative intent check

`input.md`'s tone-bearing phrases ("without any onboarding or explanation", "gracefully handle failures without disrupting the user flow", "feel like a complete, usable product") are preserved verbatim in `addendum.md` §E, so the FR structure has not flattened them out of existence.

**Verdict:** no material intent lost. Two low-severity gaps, one of which is a one-word fix.
