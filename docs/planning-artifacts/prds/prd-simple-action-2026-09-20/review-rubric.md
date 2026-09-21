# PRD Quality Review — Simple Action

## Overall verdict

This PRD is decision-ready and unusually honest for its size: the four contested choices are stated as choices, each carries a `[NOTE FOR PM]` naming what was given up, and the counter-metrics genuinely constrain the build rather than decorate it. What is at risk is downstream precision — the Filter View interacts with creation and completion in ways nothing specifies, which is exactly the class of gap that turns into an arbitrary developer decision at story time. One broken cross-reference and one glossary inconsistency should be fixed before this feeds architecture.

## 1. Decision-readiness — **strong**

Every contested call is visible. §4.2, §4.3, and §4.4 each carry a `[NOTE FOR PM]` sitting on a real tension rather than a safe checkpoint: filters may not be earned at this list size, the confirmation dialog fights the responsiveness goal, and a cleared browser orphans the list with no recovery. The Open Questions are genuinely open — none of them are answered in the following sentence.

The PRD does not smooth to neutral. §1 states a thesis it can be wrong about ("a deliberately small product can still feel finished"), and §7.2 names editing as "the most likely first regret" rather than burying it in a list.

### Findings
- **low** Undo framing is slightly circular (§7.2 / §9 Q1) — §7.2 says undo is "replaced by the confirmation dialog," while Q1 asks whether to reconsider the dialog in favor of undo. Both are true but the reader ping-pongs. *Fix:* in §7.2, write "deferred pending the Q1 decision" instead of "replaced".

## 2. Substance over theater — **strong**

No persona section, which is correct — the JTBD list plus three named-protagonist UJs carry all the user context the FRs need, and no persona exists that fails to drive a decision. The Vision is not swappable into another PRD; "finish beats coverage" is a specific bet. NFRs are mostly product-specific rather than the usual scalable/secure/reliable boilerplate.

### Findings
- **medium** Maintainability NFR is adjectival (§5) — "a developer new to the codebase should be able to read, run, and extend it without a walkthrough" has no bound and no test. It is the one NFR in the section that reads as furniture. *Fix:* bound it with something checkable, e.g. "a README gets a new developer from clone to running app in under five minutes, with no undocumented steps."

## 3. Strategic coherence — **strong**

The features serve one arc rather than reading as a backlog. The counter-metrics are the strongest part of the document: SM-C2 ("a todo app succeeds when the user leaves quickly") is a real constraint that would stop an engagement-optimizing decision later, which is precisely what counter-metrics are for. MVP scope kind is coherently *experience*-shaped, and the scope logic matches.

The one incoherence — Filter Views adding navigation to a zero-onboarding product — is identified by the PRD itself in §4.2 Notes and §9 Q3 rather than hidden. Naming your own inconsistency is not the same as having one.

## 4. Done-ness clarity — **adequate**

Every FR carries testable consequences, and most are genuinely verifiable ("the input clears on successful submission and retains focus", "a different browser or device sees a different, independent Todo List"). No "handles X gracefully" phrasing survives in the FRs.

The weakness is interaction coverage. FR-4 introduces a Filter View that changes what is on screen, but FR-1 and FR-3 are both written as though the list is always unfiltered. An engineer implementing these has to invent the answer.

### Findings
- **high** Creating a Todo while a non-All Filter View is active is unspecified (§4.1 FR-1 / §4.2 FR-4) — §4.1 says a new Todo "adds to the top of the Todo List", but if the active Filter View is **Done**, a new Active Todo cannot appear there. Nothing says whether the view switches to All, the Todo is created invisibly, or creation is disabled. *Fix:* add a consequence to FR-1 — recommend "creating a Todo switches the Filter View to All so the new Todo is always visible."
- **high** Toggling Completion Status while a filter is active is unspecified (§4.2 FR-3 / FR-4) — completing a Todo under the **Active** filter should presumably make it disappear from view, which is a startling interaction that deserves a stated decision (and possibly a transition). *Fix:* add a consequence to FR-3 stating whether the Todo leaves the current Filter View immediately, and whether anything softens it.
- **low** SM-1 uses "without instruction or hesitation" (§8) — "hesitation" is not observable. Acceptable at hobby stakes where the metric is a self-check. *Fix:* optional — "without instruction, and without backtracking".

## 5. Scope honesty — **strong**

§6 Non-Goals does real work: five entries phrased as "not a X" statements, which is the form that actually prevents scope creep at ticket level. §7.2 gives reasons, not just a list. Assumptions are tagged inline and the index round-trips cleanly.

Open-items density is 4 Open Questions + 5 assumptions + 4 `[NOTE FOR PM]` callouts = 13. For a hobby-stakes PRD that is healthy, not alarming — none of them block starting work.

## 6. Downstream usability — **adequate**

This PRD is chain-top: it feeds architecture, then epics and stories. IDs are contiguous and every cross-reference resolves (FR-1…FR-6, UJ-1…UJ-3, SM-1…SM-4 plus SM-C1/C2). Each section survives being pulled out alone. Two mechanical defects need fixing before handoff, both listed below.

### Findings
- **medium** Glossary drift between "Done" and "Completed" (§3 / §4.2 FR-4) — Completion Status values are **Active** and **Completed**, but the Filter Views are **All**, **Active**, **Done**. "Active" doubles as status and filter name while "Completed" silently becomes "Done". Downstream story writers will use both terms interchangeably. *Fix:* rename the filter to **Completed** for exact symmetry, or keep "Done" as deliberate UI copy and state the mapping explicitly in the Glossary entry.

## 7. Shape fit — **strong**

Correctly shaped for what it is: hobby stakes, UX-sensitive, chain-top. Three UJs with named protagonists is the right density — enough to carry context inline, not so many that they become furniture. No enterprise clusters were pulled in, and Cross-Cutting NFRs is the single adapt-in section, which matches a product whose non-functional paragraph in `input.md` was genuinely load-bearing.

### Findings
- **low** Length overshoots the agreed stakes (whole document) — hobby stakes targeted roughly two pages; the PRD runs closer to four, almost entirely in FR consequences. Defensible, since those consequences become acceptance criteria downstream, but it is a deviation from the agreed calibration and the user should choose knowingly.

## Mechanical notes

- **Broken cross-reference (§0)** — Document Purpose says assumptions are "indexed in §9", but the Assumptions Index is §10 (§9 is Open Questions). Introduced when Cross-Cutting NFRs was inserted as §5 and shifted the tail. *Fix:* change to §10.
- **Assumptions Index round-trip** — clean. Five inline `[ASSUMPTION]` tags (FR-1 ×2, FR-2, FR-4, §5), five index entries, exact match both directions.
- **ID continuity** — clean. No gaps, no duplicates. All "Realizes UJ-N" and "Validates FR-N" references resolve.
- **UJ protagonists** — all three named (Dana ×2, Sam) with context inline. No floating UJs. UJ-3 is noticeably thinner than UJ-1/UJ-2 and has no edge case; acceptable at this scope.
- **Bare `[NOTE FOR PM]` tag (§7.2)** — the editing entry ends with the tag rather than framing a note. Cosmetic.
