# Input Reconciliation — `imports/dribbble-22456682-todo-list-app.png` → DESIGN.md / EXPERIENCE.md

Dribbble shot 22456682 "Todo List App", supplied by the user as colour and look-and-feel inspiration. Reconciled against the 35 binding decisions in `.memlog.md` and the scope fixed by `prds/prd-simple-action-2026-09-20/prd.md` + `addendum.md`.

**Note on "Where it lives".** `DESIGN.md` and `EXPERIENCE.md` are still discovery stubs; every token below is currently held in `.memlog.md` and is distilled into the spines at Finalize. Citations are `.memlog.md` line numbers, `prd.md` section/FR, or `addendum.md` section.

---

## 1. What the shot is

A 1044×1650 presentation image showing two iPhone screens twice: once as untethered white rounded rectangles tilted in perspective on a pale lavender backdrop, and once flat inside iPhone 14 Pro device frames on the same backdrop. **Screen one** is a home view on a white ground: a "Hello Jack, / You have work today" greeting with a bell icon and a scattered-dot overflow icon; a 2×2 grid of flat-filled, shadowless pastel stat tiles (Today 6 periwinkle, Scheduled 5 yellow, All 14 mint, Overdue 3 pink), each with a translucent circular icon badge, a bottom-left label and a large bold bottom-right numeral; a small "Today's Task" heading; then five task rows, each on its own pale-lavender pill-shaped sub-surface with a soft diffuse shadow, carrying a small grey meta line (calendar glyph + "Today", clock glyph + "4:50 PM") *above* a larger dark title, an unfilled blue ring checkbox at the leading edge and a three-dot chip at the trailing edge. One row ("Shop for groceries") is expanded into three square sub-task checkboxes and a "+ Add Sub-Task" link chip; the last row ("Read book", dated Yesterday 10:30 PM, under a "Today's Task" heading) is cropped by the screen edge. A blue circular FAB floats bottom-right, overlapping that last row. **Screen two** is "All Task List": a back arrow and title above six full-bleed, vertically shingled category cards (Grocery, Educational, Home Related, Work Related, Mandatory Work, Personal Notes) — five pastels and one saturated dark green — each carrying a category name, an "N Notes" subtitle, an "N Completed" pill in a lighter tint of its own card colour, and a diagonal ↗ open affordance. There is no text input, no filter control, no completed item, no dialog, and no empty, loading, or error state anywhere in the image.

---

## 2. Adopted

Visual qualities carried through intact. 14 items.

| Quality in shot | What it became | Where it lives |
| --- | --- | --- |
| Soft pastel palette on a light field, no dark variant anywhere | Light mode only; no dark mode | `.memlog.md:15`, `:20` |
| Pale lavender field colour | `--ground #E7EAF6` (page ground) | `.memlog.md:17`, `:39` |
| White rounded surface holding the content | `--card #FFFFFF`, radius 18px | `.memlog.md:17`, `:39` |
| Each list item on its own rounded sub-surface rather than separated by rules | One rounded surface per Todo, radius 14px | `.memlog.md:17`, `:39` |
| Generous corner radii throughout; fully-round pills for chips | Radii: card 18px, row 14px, pills 999px | `.memlog.md:39` |
| Large-blur, low-opacity, downward shadows — things float, nothing has an outline | `--shadow-card 0 18px 46px -18px rgba(37,44,74,.18)` + `0 2px 10px -4px rgba(37,44,74,.06)`; `--shadow-row 0 8px 22px -12px rgba(37,44,74,.20)` + `0 1px 3px rgba(37,44,74,.04)` | `.memlog.md:39` |
| Airy density — wide padding inside rows, wide gaps between them | "Airy density" as a stated direction | `.memlog.md:15` |
| Geometric sans with wide round bowls | Poppins → Century Gothic → Futura → Avenir Next → system fallbacks | `.memlog.md:21`, `:39` |
| Thin, rounded, uniform-stroke line icons | Thin rounded line icons as the icon rule | `.memlog.md:15` |
| One saturated blue as the only action colour (ring checkboxes, FAB, "+ Add Sub-Task" link) against an otherwise unsaturated UI | `--accent #2680EB` — all fills, strokes, checkmarks and focus rings | `.memlog.md:16`, `:35`, `:39` |
| Mint pastel (the "All" tile, the "Personal Notes" card) | `--row-complete #C3E9D7` | `.memlog.md:16`, `:39` |
| A large hollow ring checkbox at the leading edge as the row's unambiguous primary affordance, sized as a real thumb target | Checkbox as the leading-edge toggle; 44px minimum target | `.memlog.md:19`, `:30` |
| Pill-shaped status chips | Pill radius 999px, used for the filter segmented control | `.memlog.md:38`, `:39` |
| Colour as a semantic encoder — it *means* something rather than decorating | "Colour encodes Completion Status, nothing else" (the referent is changed; see §3) | `.memlog.md:16` |

---

## 3. Adapted

Taken, then changed. 8 items.

| Taken | Changed to | Why | What was lost |
| --- | --- | --- | --- |
| **Pastel fills encode category** — six hues carrying six distinctions | Colour encodes **Completion Status** only: Active row white `#FFFFFF`, Completed row mint `#C3E9D7` (`.memlog.md:16`) | Simple Action has no categories and will never have them. `prd.md` §3 Glossary: a Todo "belongs to exactly one Todo List"; §6: "Not a task organizer. No projects, tags, priority, search, or sort" | **The most consequential translation in this reconciliation.** The shot's colour carries roughly six simultaneous distinctions at a glance and lets a user scan by type without reading a word. Simple Action's colour now carries exactly one boolean. Three specific losses: (a) the palette collapses from six hues to two states, so a list of all-Active Todos is a white list on lavender relieved only by blue ring checkboxes — the import's visual richness is an artefact of category data this product does not have, and no amount of token-copying recovers it; (b) in the shot colour is informative *and* free, because nothing depends on reading it; in the spine mint is doing accessibility duty, so it cannot be chosen for looks — it had to be tuned to keep text at 4.5:1 (`.memlog.md:36`, `:40`), which pins it to a narrow lightness band; (c) the shot's colour scales with content (more categories, more colour), whereas Simple Action's colour density is fixed by how many things happen to be done |
| **Tinted rows on a white ground** | Inverted: white rows on a lavender ground | An Active row must be the neutral, colourless default so that mint can mean something. A tinted Active row would compete with the Completed state | The shot's shadows fall on white, where they read crisply. The same shadow values on `#E7EAF6` are muted, so perceived elevation is weaker than in the import. The spine keeps the shadow tokens but not the conditions that made them work |
| **Two surface layers** (screen → row) | Three layers (ground → card → row), `.memlog.md:17` | A full-bleed phone mock does not translate to a desktop browser window; §5 NFR requires one responsive interface for phone *and* desktop | Every added layer spends contrast headroom. The shot's economy — one fill, one shadow, done — is not preserved |
| **`#E7EAF6` as the ground** | Same value, different role | — | Provenance: this colour is sampled from the Dribbble *presentation backdrop* behind the phone mockups, not from any pixel of the app UI. The spine's most prominent colour is taken from a canvas, not from a design. Defensible, but it should not be described as inherited from the interface |
| **Three-dot overflow chip** as the per-row action affordance | Swipe-to-reveal on touch, trailing icon on hover, keyboard equivalent required (`.memlog.md:32`) | Only one row action exists, so a menu is one interaction too many | Discoverability. The shot's dot chip is permanently visible; swipe is invisible. Already logged as an override against SM-1 (`.memlog.md:33`) and only partly mitigated by the one-time 24px nudge (`.memlog.md:34`) |
| **"Today's Task" section heading** | Inset segmented filter control: recessed track `#EDEEF7`, raised white selected chip, label `#1B65C2` (`.memlog.md:38`) | FR-4 requires switchable All / Active / Completed, not a static label | A heading labels and costs nothing; a control filters and adds state. The shot's segmentation is free; the spine's is navigation, which `prd.md` §4.4 Notes explicitly worries about |
| **"N Completed" tint-on-tint pill** | Pill form kept; colouring discarded in favour of white chip on recessed track, `#1B65C2` label at 5.70:1 | The shot's pills are light-tint-on-light-tint and fail contrast, worst on the dark green and hot pink cards | The shot's pills are visually quieter than the spine's — they recede into their card. The accessible version is louder than intended |
| **`#2680EB` used as both fill and text colour** (white on blue FAB, blue on white link) | Split into two tokens: `#2680EB` for fills/strokes/checkmarks/focus rings, `--accent-deep #1B65C2` for accent *text* (`.memlog.md:35`) | White on `#2680EB` is 3.91:1 — below AA | Single-token simplicity. The import's blue is not accessible as the import uses it |

---

## 4. Rejected

Deliberately not carried over. 13 items.

| Element in shot | Reason it is excluded |
| --- | --- |
| "Hello Jack, / You have work today" greeting | There is no name to greet. `prd.md` §3: Client Identity is "not a user account; carries no credentials and no personal data". §1: "No sign-up, no tour, no settings." Logged at `.memlog.md:18`. The second line is also encouragement, which `.memlog.md:28` bans outright ("no personality, no encouragement") |
| Today / Scheduled / All / Overdue stat tiles | "Scheduled" and "Overdue" require due dates: `prd.md` §6 "Not a planner. No due dates, reminders, recurrence"; FR-1 Out of Scope names "due dates". "Today" requires date grouping, which no FR defines. "All" is a derived metric no FR asks for, and adding it runs into SM-C1 (feature count as a counter-metric). `.memlog.md:18` |
| Categories with "N Notes" counts (the whole second screen's data model) | `prd.md` §3: exactly one Todo List per Client Identity; §6 "Not a task organizer. No projects, tags…". `.memlog.md:16`, `:18` |
| Sub-tasks and the "+ Add Sub-Task" link | `prd.md` FR-1 **Out of Scope** names "sub-tasks" explicitly. `.memlog.md:18` |
| Notification bell | `prd.md` §6: "No … notifications." `.memlog.md:18` |
| Due timestamps ("Today 4:50 PM", "Yesterday 10:30 PM") | `prd.md` §6 no due dates; FR-1 Out of Scope "due dates". A Todo *has* a creation timestamp (§3) but FR-2 uses it only to order newest-first — it is never displayed. `.memlog.md:18` |
| Floating action button (+) | `prd.md` §4.1: "A single always-visible text input at the top of the screen creates Todos" and consecutive capture must need "no extra interaction". A FAB inserts an interaction before every capture. It also occludes list content in the shot itself. `.memlog.md:10`, `:18` |
| The second screen ("All Task List") and its back arrow | `.memlog.md:10`: IA inherited from the PRD is a **single screen**. `prd.md` §7.1 lists no navigation. A back arrow implies a stack that does not exist |
| Multi-pastel category palette (pink / periwinkle / yellow / dark green / hot pink / mint) | `.memlog.md:16`: colour encodes Completion Status, nothing else. There are no categories to encode. Only the mint survives, re-pointed |
| The dark green "Work Related" card | Breaks the pastel system it sits in (one saturated dark among five pastels) and fails contrast on its own body text — "14 Notes" is near-black on dark green. Against the WCAG 2.2 AA floor at `.memlog.md:30` |
| Shingled, overlapping, full-bleed card stack | No analogous content exists, and the pattern is structurally fragile: each card's bottom is occluded by the next, so card height cannot vary with content, and there is no scroll affordance. Portfolio garnish — it photographs well at a fixed six cards and breaks at five or twenty |
| The ↗ diagonal open affordance | Nothing to navigate to on a single screen |
| "Task", "Notes", "Sub-Task" as nouns | `prd.md` §3 fixes the vocabulary (Todo, Todo List, Completion Status, Filter View) and `.memlog.md:11` holds interface copy to it. Only "Completed" is reusable verbatim |
| Circular translucent icon badges on the tiles | No tiles to decorate. The glyphs are also ambiguous on their own terms — the "All" icon is a refresh/sync arrow and the "Overdue" icon is an unresolvable spiral |

---

## 5. Dropped qualitative ideas

Things the shot does well that are captured nowhere in the spines and will simply be lost. No action is planned on any of these; they are recorded so the loss is deliberate rather than accidental. 10 items.

1. **The screen answers a question before any row is read.** The 2×2 tile block means you learn the shape of your day from the top 200px — how much is due, how much is late — without parsing a single task title. Simple Action's screen has no at-a-glance layer at all: to know how much is left you count rows, or tap **Active** and count those. Nothing in either spine surfaces a number anywhere in the interface. The cheapest honest version of this quality — a count on the Active filter tab — was never considered in any of the 35 decisions. This is the single largest loss from the import.

2. **Two-line row anatomy.** Each row carries a small grey meta line *above* a larger dark title. Placing the label above the content gives every row internal hierarchy, a consistent left rag, and two type sizes to set a rhythm against; it is what makes a row read as a card rather than as a line of text. Simple Action's row is one line at one size. With no meta line and nothing put in its place, rows will read flatter and more uniform than the import — the visual interest of the shot's list comes substantially from this, not from the pill shape.

3. **Most of the shot's colour is not load-bearing.** The tiles and the category cards are coloured because a coloured screen feels alive, not because the colour is required to understand anything. `.memlog.md:16` converts colour into a strictly functional resource and forbids the decorative layer entirely — the only chromatic events left on a Simple Action screen are the accent blue and a mint row. The rule is right for accessibility and wrong for mood, and nothing in the spine reintroduces mood by another means (no illustration, no gradient, no texture, no second neutral).

4. **Variable row height treated as a content signal.** The "Shop for groceries" row grows to hold its sub-tasks; the list breathes unevenly and the tall row obviously carries more. Simple Action permits 500 characters (FR-1), so rows *will* vary in height — but no decision says whether that is welcomed (wrap freely, tall rows are fine, the list has rhythm) or suppressed (clamp to two lines, ellipsis, uniform rows). The shot has a clear position; the spine has a gap that will be filled arbitrarily at build time.

5. **The bottom of the list is deliberately cropped.** The last row is cut by the screen edge, which signals "more below" with no scrollbar and no chevron. A soft intentional bottom crop is a free scroll cue. The spine's contained white card has a finite, fully-visible bottom edge — on a phone, a card that ends reads as a list that ends. No decision addresses scroll affordance or how the card's bottom edge behaves when content overflows.

6. **Icons are set in translucent circular badges that do real work.** The badge isolates a 1.5px line icon from a saturated pastel so the glyph stays legible on yellow and on hot pink. The spine has almost no iconography (checkbox, delete, retry) and never states an icon stroke weight, a size, or what happens when an icon sits on the mint Completed row — which is exactly the case the shot solved and the spine has not.

7. **Not one hairline rule appears anywhere in the shot.** Every boundary is produced by fill or by shadow. That is a disciplined, coherent surface language and it is a large part of why the design reads as soft. `.memlog.md:38` introduces a hairline token `#E3E2F0` with no stated rule for when a hairline is permitted, which quietly leaves the door open to a bordered look the import never has.

8. **Bold numerals as display typography.** The counts (6, 5, 14, 3) are set large, bold and bottom-right-aligned; they are the only display moment in the design and they anchor each tile. Simple Action has no numeral in the interface at all except the character counter that fades in around 450 (`.memlog.md:24`) — small, muted and transient by design. The spine specifies one bold weight and one regular weight and no display scale; its typographic range is materially narrower than the import's.

9. **Pastel works here because it fills large areas.** A pastel at small area reads as grey. The spine uses mint as a full row fill, which is correct, but never states the rule — "pastels are large-area fills only, never accents". Without it, someone will eventually put `#C3E9D7` on a 12px badge and it will disappear.

10. **The 2×2 tile grid is the one genuinely reusable responsive primitive in the shot** — it reflows to 1×4 on a wide screen without any redesign. `.memlog.md:18` takes nothing structural from the import ("only the surface language transfers"), so Simple Action's entire responsive structure, desktop included, is invented with no visual antecedent in the import or in `.working/`.

---

## 6. Conflicts

Where the shot's implicit design logic pulls against a requirement or a logged decision.

| Conflict | Detail |
| --- | --- |
| **FAB vs. always-visible input** | The shot's whole capture model is deferred behind a floating button, which buys list density. `prd.md` §4.1 / FR-1 requires the input pinned at the top, always visible, clearing on submit and retaining focus, with consecutive capture costing "no extra interaction". These are incompatible philosophies, not incompatible pixels |
| **Colour classifies vs. colour states** | The shot's implicit logic is that colour is a taxonomy. `prd.md` §6 forbids any classification axis. `.memlog.md:16` wins; see §3 for what that costs |
| **"Taken as-is from the import" is not literally true** | `.memlog.md:15` says the direction is "anchored to the Dribbble import" and `:17` says the surface treatment is "taken as-is". The import's app ground is white with tinted rows; the spine's ground is lavender with white rows, and the lavender is sampled from the presentation backdrop behind the mockups. The direction is import-*derived*, not import-*as-is*. Recorded so a downstream reader does not open the PNG expecting to find `#E7EAF6` in the interface |
| **Phone-only source vs. responsive requirement** | `prd.md` §5 NFR and SM-4 require a layout comfortable on desktop with no horizontal scrolling. The import contains no desktop artwork whatsoever. Every desktop decision in the spines is unsourced |
| **One happy state vs. SM-3** | The shot depicts a single populated, successful state. `prd.md` §5 (state coverage) and SM-3 make empty, loading and error first-class acceptance criteria. The import contributes nothing to the skeleton rows (`.memlog.md:27`), the fixed error banner (`:22`), or the delete dialog (`:23`) — all three were invented with no reference to check against |
| **The import is not an accessible artefact** | "14 Notes" is near-black on the dark green card; the "N Completed" pills are tint-on-tint; white text sits on `#2680EB` at 3.91:1. The AA floor at `.memlog.md:30` means several of the shot's most characteristic moves cannot be copied at all, and two tokens exist purely to repair them (`:35` `--accent-deep`, `:36` tuned completed greys) |
| **A visible row action was available and not taken** | The import solves per-row actions with a permanently visible dot chip. The spine chose a hidden swipe (`.memlog.md:32`), which required an override against `addendum.md` §E ("no onboarding or explanation") and SM-1's unguided-success bar, logged at `:33` and mitigated at `:34`. The import offered a compliant alternative |
| **Fixed glossary vs. the shot's loose vocabulary** | The import uses "Task", "Notes", "Sub-Task" and "Completed" interchangeably. `prd.md` §3 fixes four terms and `.memlog.md:11` binds interface copy to them. Only "Completed" survives |
| **Evidential gap: the import cannot arbitrate the thing it was imported for** | Every checkbox in both screens is empty. No completed item appears anywhere in the image. The mint fill + filled checkmark + strikethrough treatment (`.memlog.md:19`) — the product's single most important visual state under FR-2 — has no antecedent in the source it was nominally drawn from |

**Standing rule: the spines win on conflict with any mock, wireframe, or import.**
