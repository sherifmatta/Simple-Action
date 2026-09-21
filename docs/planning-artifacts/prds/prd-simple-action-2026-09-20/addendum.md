# Addendum — Simple Action

Depth that belongs to downstream work (architecture, UX) rather than the PRD body. Nothing here is a requirement; it is context and rejected-alternative rationale so later decisions do not get re-litigated from scratch.

## A. Persistence mechanism — options considered

The PRD states *what* must be true (FR-6: a Todo List is durable per browser, independent across devices). The *how* is an architecture decision. Three options were weighed:

| Option | Behavior | Why not chosen |
| --- | --- | --- |
| One shared server-side list | Every visitor sees the same Todo List | Honest and simplest, but breaks the "personal tasks" framing the moment a second person opens it |
| **Per-browser, server-stored** *(chosen)* | Anonymous Client Identity in browser storage keys a server-side Todo List | Chosen: personal lists without building authentication; backend still owns persistence as `input.md` requires |
| Browser-only (localStorage) | No server persistence at all | Contradicts `input.md`'s "backend responsible for persisting and retrieving todo data"; would leave the backend with nothing to do |

**Notes for architecture.** The Client Identity is an opaque token, not a credential — it authorizes nothing and must not be treated as authentication. Anyone holding it can read and modify that Todo List, which is acceptable only because the data is non-sensitive and the product is single-user. The migration path to real accounts is to attach an existing Client Identity's Todo List to a newly created account on first sign-in; keeping the Todo List keyed by an indirection rather than by the token itself makes that migration cheap.

## B. Deletion safety — options considered

- **Immediate, no confirm** — fastest, matches the "instantaneous" goal, accepts occasional loss of one line of text.
- **Undo toast (~5s)** — best feel-to-safety ratio; costs transient client state and a deferred server call or a soft-delete.
- **Confirmation dialog** *(chosen)* — safest, no hidden state, but a modal on every delete works against the responsiveness goal.

Recorded because the choice is reversible and worth re-feeling once the interaction exists in a real build. See PRD §9 Open Question 1.

## C. Completed-Todo presentation — options considered

- **Inline styling only** — struck-through in place, single list, zero navigation. Lightest.
- **Sunken Completed section** — active on top, done below; needs ordering rules.
- **Filter tabs All / Active / Completed** *(chosen)* — most control; adds navigation state. Originally labelled "Done"; renamed during review so Filter View names match Completion Status values exactly and downstream story writers cannot drift between the two terms.

The chosen option is the TodoMVC convention, which makes it familiar but also means it was adopted partly by convention rather than from this product's needs. See PRD §9 Open Question 3.

## D. Editing — deliberately excluded

Text editing was excluded to keep v1 minimal; the workaround is delete-and-retype, which the confirmation dialog makes a three-interaction operation. This combination (no edit + confirmed delete) is the sharpest usability trade in the product. If a v2 is scoped, inline edit is the first thing to add — it needs one FR, one editing UI state, and a partial-update endpoint.

## E. Qualitative intent from `docs/input.md`

Phrasing worth preserving because the FR structure flattens it:

- *"feel like a complete, usable product despite its deliberately minimal scope"* — the governing aesthetic. Finish beats coverage.
- *"without any onboarding or explanation"* — no tour, no tooltips, no first-run wizard. The screen explains itself or it has failed.
- *"easy to understand, deploy, and extend by future developers"* — a maintainability goal aimed as much at the builder-as-learner as at any future team.
- *"gracefully handle failures without disrupting the user flow"* — errors are recoverable in place; nothing dead-ends.
