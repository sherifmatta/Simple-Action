---
name: Simple Action
description: A personal Todo List that opens to a usable state and asks nothing of the person using it. Soft pastel surfaces on a pale lavender ground, light mode only, one screen.
status: final
sources:
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/prd.md"
  - "{planning_artifacts}/prds/prd-simple-action-2026-09-20/addendum.md"
updated: 2026-09-20
colors:
  ground: '#E7EAF6'
  card: '#FFFFFF'
  row-active: '#FFFFFF'
  row-complete: '#C3E9D7'
  accent: '#2680EB'
  accent-deep: '#1B65C2'
  on-accent: '#FFFFFF'
  text-primary: '#24243A'
  text-muted: '#5A5A75'
  text-completed: '#5F5F7A'
  text-placeholder: '#71718B'
  hairline: '#E3E2F0'
  border-control: '#8C8BAC'
  danger-bg: '#F6E7E1'
  danger-border: '#E6CCC0'
  danger-text: '#8E3B22'
  danger-fill: '#8E3B22'
  on-danger-fill: '#FFFFFF'
  tab-track: '#EDEEF7'
  tab-selected-bg: '#FFFFFF'
  tab-selected-text: '#1B65C2'
typography:
  dialog-title:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.35'
  todo-text:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 14.5px
    fontWeight: '400'
    lineHeight: '1.45'
  input-text:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 14.5px
    fontWeight: '400'
    lineHeight: '1.45'
  empty-message:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  empty-sub:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  banner-message:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 13.5px
    fontWeight: '500'
    lineHeight: '1.4'
  tab-label:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 12.5px
    fontWeight: '500'
    lineHeight: '1'
  tab-label-selected:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 12.5px
    fontWeight: '600'
    lineHeight: '1'
  button-label:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 12.5px
    fontWeight: '600'
    lineHeight: '1.3'
  counter:
    fontFamily: '"Poppins", "Century Gothic", "Futura", "Avenir Next", -apple-system, "Segoe UI", system-ui, sans-serif'
    fontSize: 11.5px
    fontWeight: '500'
    lineHeight: '1.3'
rounded:
  sm: 7px
  md: 14px
  lg: 18px
  full: 999px
spacing:
  '1': 4px
  '2': 6px
  '3': 9px
  '4': 12px
  '5': 14px
  '6': 18px
  '7': 22px
  '8': 32px
  row-gap: 9px
  row-padding: 14px
  gutter: 18px
  margin-phone: 18px
  touch-target-min: 44px
  card-max-width: 640px
components:
  card:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    shadow: '0 18px 46px -18px rgba(37,44,74,.18), 0 2px 10px -4px rgba(37,44,74,.06)'
    padding-block: '{spacing.6}'
    padding-inline: '{spacing.gutter}'
    max-width: '{spacing.card-max-width}'
  todo-row-active:
    background: '{colors.row-active}'
    text: '{colors.text-primary}'
    typography: '{typography.todo-text}'
    radius: '{rounded.md}'
    padding: '{spacing.row-padding}'
    gap: '{spacing.4}'
    shadow: '0 8px 22px -12px rgba(37,44,74,.20), 0 1px 3px rgba(37,44,74,.04)'
    min-height: '{spacing.touch-target-min}'
  todo-row-completed:
    background: '{colors.row-complete}'
    text: '{colors.text-completed}'
    typography: '{typography.todo-text}'
    radius: '{rounded.md}'
    padding: '{spacing.row-padding}'
    shadow: '0 8px 22px -14px rgba(37,74,58,.34)'
    text-decoration: 'line-through 1.5px {colors.text-completed}'
    min-height: '{spacing.touch-target-min}'
  checkbox:
    size: 21px
    radius: '{rounded.sm}'
    border: '1.75px solid {colors.border-control}'
    background: '{colors.row-active}'
    checked-background-on-active: '{colors.accent}'
    checked-border-on-active: '{colors.accent}'
    checked-background-on-complete: '{colors.accent-deep}'
    checked-border-on-complete: '{colors.accent-deep}'
    checked-glyph: '{colors.on-accent}'
    hit-area: '{spacing.touch-target-min}'
    focus-ring: '0 0 0 1px {colors.accent}, 0 0 0 5px rgba(38,128,235,.30)'
    focus-ring-on-complete: '0 0 0 1px {colors.accent-deep}, 0 0 0 5px rgba(27,101,194,.30)'
  input-add:
    background: '{colors.card}'
    border: '1.5px solid {colors.border-control}'
    radius: '{rounded.md}'
    padding: '{spacing.4} {spacing.5}'
    typography: '{typography.input-text}'
    text: '{colors.text-primary}'
    placeholder: '{colors.text-placeholder}'
    leading-glyph: '{colors.accent}'
    shadow: '0 8px 22px -12px rgba(37,44,74,.20), 0 1px 3px rgba(37,44,74,.04)'
    focus-ring: '0 0 0 1px {colors.accent}, 0 0 0 5px rgba(38,128,235,.30)'
    enter-hint-border: '1px solid {colors.border-control}'
    enter-hint-text: '{colors.text-muted}'
    enter-hint-typography: '{typography.counter}'
    enter-hint-radius: '{rounded.full}'
    autofocus-pointer: true
    autofocus-touch: false
  filter-tabs:
    track-background: '{colors.tab-track}'
    track-radius: '{rounded.full}'
    track-padding: '{spacing.1}'
    track-shadow: 'inset 0 1px 3px rgba(36,36,58,.10)'
    label: '{colors.text-muted}'
    typography: '{typography.tab-label}'
    selected-background: '{colors.tab-selected-bg}'
    selected-label: '{colors.tab-selected-text}'
    selected-typography: '{typography.tab-label-selected}'
    selected-shadow: '0 2px 6px -2px rgba(36,36,58,.22), 0 1px 1px rgba(36,36,58,.05)'
    min-height: '{spacing.touch-target-min}'
    count: true
    count-typography: '{typography.tab-label}'
    count-gap: '{spacing.1}'
  error-banner:
    background: '{colors.danger-bg}'
    border: '1px solid {colors.danger-border}'
    radius: '{rounded.md}'
    padding: '{spacing.4} {spacing.4}'
    text: '{colors.danger-text}'
    typography: '{typography.banner-message}'
    icon: '{colors.danger-text}'
    retry-border: '1.5px solid {colors.danger-text}'
    retry-text: '{colors.danger-text}'
    retry-radius: '{rounded.full}'
    retry-typography: '{typography.button-label}'
  dialog-delete:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    padding: '{spacing.7}'
    shadow: '0 18px 46px -18px rgba(37,44,74,.18), 0 2px 10px -4px rgba(37,44,74,.06)'
    title: '{colors.text-primary}'
    title-typography: '{typography.dialog-title}'
    scrim: 'rgba(36,36,58,.32)'
    cancel-border: '1.5px solid {colors.border-control}'
    cancel-text: '{colors.text-muted}'
    confirm-background: '{colors.danger-fill}'
    confirm-border: '1.5px solid {colors.danger-fill}'
    confirm-text: '{colors.on-danger-fill}'
    button-radius: '{rounded.full}'
    button-typography: '{typography.button-label}'
    button-min-height: '{spacing.touch-target-min}'
    initial-focus: cancel
  skeleton-row:
    background: '{colors.row-active}'
    radius: '{rounded.md}'
    padding: '{spacing.row-padding}'
    shadow: '0 8px 22px -12px rgba(37,44,74,.20), 0 1px 3px rgba(37,44,74,.04)'
    placeholder-fill: '{colors.hairline}'
    pulse-to: '{colors.tab-track}'
    pulse-duration: 1400ms
    count: 3
  char-counter:
    text: '{colors.text-muted}'
    typography: '{typography.counter}'
    appears-at: 450
    ceiling: 500
    format: bare-numeral
  empty-state:
    border: '1.5px dashed {colors.hairline}'
    radius: '{rounded.md}'
    padding: '{spacing.8} {spacing.6}'
    align: center
    ring-size: 40px
    ring-radius: '{rounded.full}'
    ring-background: '{colors.row-complete}'
    ring-glyph: '{colors.text-completed}'
    ring-glyph-size: 18px
    ring-glyph-stroke: 1.7px
    ring-gap: '{spacing.4}'
    line: '{colors.text-primary}'
    line-typography: '{typography.empty-message}'
    sub: '{colors.text-muted}'
    sub-typography: '{typography.empty-sub}'
    sub-gap: '{spacing.1}'
  delete-action:
    icon: '{colors.text-muted}'
    icon-hover: '{colors.danger-text}'
    revealed-background: '{colors.danger-fill}'
    revealed-icon: '{colors.on-danger-fill}'
    radius: '{rounded.md}'
    hit-area: '{spacing.touch-target-min}'
    focus-ring: '0 0 0 1px {colors.accent}, 0 0 0 5px rgba(38,128,235,.30)'
    focus-ring-on-complete: '0 0 0 1px {colors.accent-deep}, 0 0 0 5px rgba(27,101,194,.30)'
---

# Simple Action — Design Spine

> How Simple Action looks. Behaviour, copy and flows live in `EXPERIENCE.md`.
>
> Every load-bearing contrast pair in the product is computed and tabulated in §Dos and don'ts, under *Contrast — every load-bearing pair*. Rendered references are listed below and linked inline at the sections they illustrate. **The spines win on conflict with any mock, wireframe, or import.**

**What's where.** Every token value — colour, type, radius, spacing, component recipe — is in this document's frontmatter. Per-colour rationale is in §Colors. Per-component visual specs are in §Components. Every load-bearing contrast ratio is in §Dos and don'ts, in the *Contrast — every load-bearing pair* table. Flagged tensions and accepted costs are marked **Flagged tension.** and **Accepted cost.**, and there are four: mint's one exception and `{colors.border-control}`'s visible borders in §Colors, Poppins' wrap width in §Typography, and the single error region in §Components. Behaviour, copy and flows are in `EXPERIENCE.md`.

**Rendered references.**

| File | What it shows |
|---|---|
| [`mockups/key-main.html`](mockups/key-main.html) | The screen at rest at phone and desktop width: card on ground, input, filter tabs, a populated list. The canonical composition. |
| [`mockups/key-states.html`](mockups/key-states.html) | Every component that only exists in a non-resting state: the skeleton row, all three empty states, both error banners, the character counter at its two thresholds. |
| [`mockups/key-delete.html`](mockups/key-delete.html) | The delete path end to end: row at rest, swipe revealed, dialog open, first-run nudge. The reference for `{components.delete-action}` and `{components.dialog-delete}`. |
| [`mockups/color-themes.html`](mockups/color-themes.html) | Lavender Mist beside the three ramps it was chosen over — Cool Slate, Warm Ink, Graphite Print. |
| [`imports/dribbble-22456682-todo-list-app.png`](imports/dribbble-22456682-todo-list-app.png) | The supplied Dribbble import the visual direction is inspired by. |

## Brand & Style

Simple Action is a personal Todo List with one screen and six requirements. The governing aesthetic is quoted verbatim from the PRD: *a deliberately small product can still feel finished*. Finish beats coverage. Nothing in this document exists to make the product look larger than it is.

The visual direction is inspired by the supplied Dribbble import, [`imports/dribbble-22456682-todo-list-app.png`](imports/dribbble-22456682-todo-list-app.png) — Dribbble shot 22456682, supplied as colour and look-and-feel inspiration, and the source shot for the pastel-on-lavender register, the rounded per-item sub-surfaces, the diffuse shadow recipe and the geometric-sans register. What transfers is a surface language: soft pastel palette on a pale lavender ground, a floating white card, each Todo its own rounded sub-surface with a diffuse low-contrast shadow, generous radii, airy density, geometric sans, thin rounded line icons. Layered and tactile — the list reads as a small stack of physical cards resting on coloured paper, not as rows in a table.

**Inspired by, not faithful to — and the difference matters.** Two corrections are on the record and neither is cosmetic. First, `#E7EAF6` was sampled from the shot's *presentation backdrop* — the canvas the phone mockups are photographed on — not from the app UI. The shot's app ground is white with lavender-tinted rows; this spine inverts that relationship, white rows on a lavender ground, because an Active row has to be the colourless default for mint to mean anything. Second, the import contains no completed item at all — every checkbox in it is empty — so it offers no evidence for the mint fill, filled checkmark and strikethrough treatment. That treatment is an original decision made here. The import is a mood reference with two named borrowings, not an authority; where this document and the import disagree, there is no conflict to resolve because the import never ruled on it. Nothing here rests on the import's authority, because on the product's central state the import has none.

Only a bounded part of the *surface language* transfers. The structure does not. The greeting header, the Today / Scheduled / All / Overdue stat tiles, the category cards with note counts, sub-tasks, the notification bell, per-item timestamps, the floating action button and the second screen are all out of PRD scope and are not adopted; several are explicit Non-Goals. The import's category-coded multi-pastel scheme is rejected on the same grounds: the import colours its items by category, Simple Action has no categories, and a second colour axis would be inventing a product. The import is a material reference, not a layout reference. The full item-by-item reconciliation — 14 adopted, 8 adapted, 13 rejected, 10 losses accepted — is in [`reconcile-dribbble-shot.md`](reconcile-dribbble-shot.md), which is the complete account.

The chosen theme is Lavender Mist — soft, tonal, dissolving into the page. Its register is deliberate: a neutral ramp tinted toward the ground so that chrome recedes and the only things that assert themselves are a Todo's text, its Completion Status, and the single blue action accent. Light mode only. There is no dark mode, and adding one is out of scope: light mode alone matches the import and keeps the surface count at one.

## Colors

Palette provenance: this ramp is variation 4, Lavender Mist, of the four-variation comparison in [`mockups/color-themes.html`](mockups/color-themes.html) — that sheet shows Lavender Mist beside the three it was chosen over (Cool Slate, Warm Ink, Graphite Print), each holding the locked globals constant and varying only the neutral ramp, danger hue, filter-tab treatment and focus ring. It is the record of what this palette is *instead of*.

Colour carries exactly one piece of meaning in this product: Completion Status. It carries nothing else. There are no categories, no priorities, no due states, so there is no second colour axis to encode. Every colour below either builds the surface, carries text, marks the single action accent, or reports failure.

| Token | Value | Used for | Never used for | Ratio |
|---|---|---|---|---|
| `{colors.ground}` | `#E7EAF6` | The pale lavender page field the card floats on. It exists to make the white card read as a raised object rather than as the page itself. | A text background, a row fill, or a per-state tint. | — |
| `{colors.card}` | `#FFFFFF` | The single container holding input, filter tabs and list. One card per screen. | A component background — sub-surfaces get their own tokens. | — |
| `{colors.row-active}` | `#FFFFFF` | The fill of an Active Todo. Identical in value to `{colors.card}`; it is a separate token because it means something (Completion Status = Active) and the card does not. | A Completed row. | — |
| `{colors.row-complete}` | `#C3E9D7` | Mint. The fill of a Completed Todo, and the only pastel fill in the product. Exactly one named exception: the 40px glyph ring in `{components.empty-state}`, which per [`mockups/key-states.html`](mockups/key-states.html) carries the mint on all three empty views, not only the Completed one. | Anywhere else — not on badges, not to mean "success" after an add. Mint means *Completed*, full stop. | — |
| `{colors.accent}` | `#2680EB` | The single action accent: fills, strokes, icon glyphs, the checked checkbox *on an Active row*, the leading plus in the input, and the focus ring on every surface that is not mint. | Carrying text. Any surface of `{colors.row-complete}`. Decoration. Encoding state — the checked checkbox is accent because it is a control that has fired, not because blue is a status colour. | 3.91:1 on white, which passes the 3:1 floor for non-text graphics and fails the 4.5:1 floor for text. **2.97:1** on `{colors.row-complete}`, which fails WCAG 1.4.11 — which is why both things that can be drawn on a mint row, the checked checkbox and the focus ring, change value there. |
| `{colors.accent-deep}` | `#1B65C2` | The selected filter-tab label, any other accent-toned text, the checked checkbox fill and border on a Completed row, and the focus ring on a Completed row. | Fills, strokes or the focus ring anywhere off mint. | 5.70:1 on white; **4.33:1** on `{colors.row-complete}`. |
| `{colors.on-accent}` | `#FFFFFF` | The checkmark glyph inside a checked checkbox. Glyph only. | A text colour on accent surfaces, because there are none. | — |
| `{colors.text-primary}` | `#24243A` | Lavender-tinted near-black. Todo text, input text, dialog title, the empty state's first line. | Labels or metadata; those step down. | 15.12:1 on white, 11.49:1 on mint. |
| `{colors.text-muted}` | `#5A5A75` | Unselected filter-tab labels and their counts, the character counter, the `Enter` hint, the empty state's *second* line only, and the delete icon at rest once hover reveals it. | Todo text. Signalling a disabled state — nothing in this product is disabled. | 6.66:1 on white, 5.55:1 on the ground. |
| `{colors.text-completed}` | `#5F5F7A` | Todo text and the strikethrough on a Completed row. | Any surface other than `{colors.row-complete}`. | **4.69:1** on `{colors.row-complete}` — the tightest pair in the system. |
| `{colors.text-placeholder}` | `#71718B` | The input placeholder only, so the placeholder is readable rather than a ghost. | A general "secondary text" colour. | 4.73:1 on white. |
| `{colors.hairline}` | `#E3E2F0` | Decorative use only: the empty state's dashed panel edge and the skeleton's resting fill. | **A control boundary.** Every component boundary that once used it has moved to `{colors.border-control}`. | **1.28:1** on white, far under the 3:1 non-text floor. |
| `{colors.border-control}` | `#8C8BAC` | All component boundaries: the unchecked checkbox border, the add input's border, the Cancel button's edge, the `Enter` hint's edge. | — | **3.28:1** on white, which satisfies WCAG 1.4.11 for the boundary that identifies a control. |
| `{colors.danger-bg}` | `#F6E7E1` | The error banner's fill. The ramp is a muted clay/terracotta, earthy and de-escalated rather than alarm-red, because failures in this product are recoverable in place and the colour should say *hiccup*, not *alarm*. | Validation hints, the character counter, or any accent role. | — |
| `{colors.danger-border}` | `#E6CCC0` | The error banner's 1px border. | Validation hints, the character counter, or any accent role. | — |
| `{colors.danger-text}` | `#8E3B22` | The banner message, its leading line icon, and the Retry outline and label. This ramp owns the error banner and its Retry outline and nothing else. | Validation hints, the character counter, any accent role, or a fill — the fill is `{colors.danger-fill}`. | 6.23:1 on `{colors.danger-bg}`. |
| `{colors.danger-fill}` | `#8E3B22` | The same clay, inverted: the clay as a *solid fill* carrying a white label. Two surfaces only, and both sit at the point of no return — the revealed swipe delete panel and the confirm button in the delete dialog. | A third surface. It is held as its own token rather than reusing `{colors.danger-text}` as a fill, because the two have opposite roles and a value shared today must not be assumed shared tomorrow; the de-escalated banner and the committed destructive surface are deliberately different weights of the same hue. | — |
| `{colors.on-danger-fill}` | `#FFFFFF` | The white label on `{colors.danger-fill}`, and the icon on the revealed swipe panel. | — | **7.50:1** on `{colors.danger-fill}`. |
| `{colors.tab-track}` | `#EDEEF7` | The recessed segmented-control track behind the filter tabs, and the bright end of the skeleton pulse. Non-text. | — | — |
| `{colors.tab-selected-bg}` | `#FFFFFF` | The raised selected filter-tab chip. | — | — |
| `{colors.tab-selected-text}` | `#1B65C2` | The raised selected chip's label. The value is `{colors.accent-deep}` by another name; it is held as its own token so the tab treatment can be reasoned about without touching the accent ramp. | — | 5.70:1 on `{colors.tab-selected-bg}`. |

Three tokens have a derivation story the table cannot carry.

**`{colors.accent-deep}` — the step-down.** It is derived from `{colors.accent}` for two reasons. First, accent-coloured *text* must clear 4.5:1, and `#1B65C2` on white is 5.70:1. Second, anything drawn on a Completed row must clear 3:1 against mint, which `{colors.accent}` does not: `#2680EB` on `{colors.row-complete}` is **2.97:1**, below the 3:1 non-text floor. That is the identical arithmetic for both things that can be drawn on a mint row, the checked checkbox and the focus ring alike: a focus indicator is a non-text graphic that identifies the currently focused control, so 1.4.11 applies to it exactly as it applies to the checkbox, and the 4px bloom does not rescue it — a bloom at 30% opacity over mint is fainter than the 1px edge, not stronger. `#1B65C2` on `{colors.row-complete}` is **4.33:1**. So `{colors.accent-deep}` carries the selected filter-tab label, any other accent-toned text, the checked checkbox fill and border on a Completed row, and the focus ring on a Completed row. Two components, one rule: on mint the accent steps down a value. Everywhere else — every fill, stroke and focus ring on white or on the ground — it stays on `{colors.accent}`, so the accent hue reads as one colour that darkens on one surface, not as two colours.

**`{colors.text-completed}` — tuned darker.** It is deliberately tuned *darker* than a conventional muted grey: mint is bright enough that ordinary muted greys fail contrast on it. **This is the tightest pair in the system at 4.69:1** — see the contrast warning in §Dos and don'ts.

**`{colors.hairline}` — a decorative-only licence.** `#E3E2F0` on white is **1.28:1**, far under the 3:1 non-text floor, so it may **never** be the only thing marking the boundary of a control. WCAG 1.4.11 does not apply to purely decorative separators, and that exemption is the whole of this token's remaining licence: the empty state's dashed panel edge and the skeleton's resting fill, both of which are ornament around content rather than the edge of anything operable. Every component boundary that once used it has moved to `{colors.border-control}`.

**Flagged tension.** Mint's one named exception — the 40px glyph ring in `{components.empty-state}` — sits against mint's single meaning in the same breath. It is held because the ring is a glyph frame at 40px rather than a row fill, and because an empty view has no row whose status it could be misread as; it is the first thing to remove if mint's single meaning ever blurs.

**Accepted cost.** With `{colors.border-control}` on every control boundary, control borders now read visibly darker than the import's airy borderless treatment. The import produces every boundary with fill or shadow and carries no hairline anywhere — a coherent surface language this token breaks on purpose, because an unchecked checkbox whose only edge is 1.28:1 is not a control a partially-sighted user can find.

## Typography

One typeface: Poppins, with `Century Gothic`, `Futura`, `Avenir Next` and system fallbacks behind it. Poppins is the geometric sans that matches the import's register — round, open, unfussy, and legible at small sizes without looking technical.

The ramp is short because the screen is short. There are ten roles and no display sizes:

| Role | Where |
|---|---|
| `{typography.dialog-title}` 16 / 600 | The delete confirmation question |
| `{typography.todo-text}` 14.5 / 400 | Todo text in every row, Active or Completed |
| `{typography.input-text}` 14.5 / 400 | Text being typed into the add input |
| `{typography.empty-message}` 14 / 400 | The first line of all three empty states |
| `{typography.empty-sub}` 13 / 400 | The second line, which only the All empty state has |
| `{typography.banner-message}` 13.5 / 500 | The error banner message |
| `{typography.tab-label}` 12.5 / 500 | Unselected filter tabs, and the count on every tab |
| `{typography.tab-label-selected}` 12.5 / 600 | The selected filter tab |
| `{typography.button-label}` 12.5 / 600 | Retry, Cancel, Delete |
| `{typography.counter}` 11.5 / 500 | The remaining-character count and the `Enter` hint |

There is no title role, because there is no title. The card opens straight into the input; the product name appears in the browser tab title and nowhere on the surface.

Rules. Todo text wraps; it **never** truncates with an ellipsis and never clips. A Todo can be 500 characters long and all 500 must be readable in the row — the row grows, the list reflows, and nothing scrolls sideways. No all-caps labels on the product surface. One uppercase tracked caption style exists, for section captions in the working mockups only. No letter-spacing adjustments anywhere on the product surface.

**Flagged tension.** Poppins has wide round letterforms, and long Todo text on a narrow phone will wrap more aggressively than a narrower grotesque would. This must be checked at the 500-character ceiling on the smallest supported viewport before the type ramp is considered settled. If it fails, the lever is `{typography.todo-text}` size and line-height — not truncation, and not a different meaning of "finished".

## Layout & Spacing

One screen. One column. Always. The screen at rest is rendered at both widths in [`mockups/key-main.html`](mockups/key-main.html).

The scale is 4 / 6 / 9 / 12 / 14 / 18 / 22 / 32 px, with named tokens for the recurring structural gaps: `{spacing.row-gap}` 9px between Todo rows, `{spacing.row-padding}` 14px inside a row, `{spacing.gutter}` 18px as the card's inline padding, and `{spacing.margin-phone}` 18px between the card and the viewport edge on a phone.

Vertical order inside the card is fixed and never reorders: add input → error banner region → filter tabs → list. There is nothing above the input — no wordmark, no title bar, no greeting. The card opens straight into the thing the user came to do. The add input is pinned at the top and is always visible; the error banner region sits directly beneath it and owns every error in the product.

Within the list, rows are ordered newest-first by creation timestamp, and nothing else ever moves them. Completing a Todo does not sink it, un-completing it does not raise it, and there is no second sort. A row only leaves its position by leaving the Filter View entirely, or by being deleted. See `EXPERIENCE.md` for the behaviour; the layout consequence is that the list's vertical order is stable under every interaction the product has.

The card is `{spacing.card-max-width}` 640px wide at most, and centred on the ground. One column at every breakpoint — 640px is where the card stops growing and starts centring, not where a second column appears. Below 640px the card fills the viewport less `{spacing.margin-phone}` on each side, so on a phone there is ground visible on all sides and the card reads as an object on a field rather than as the page. There is no breakpoint at which the layout becomes multi-column, grows a sidebar, or gains a second region. It is the same screen, wider, and then it stops.

`{spacing.touch-target-min}` 44px is a hard floor for every interactive element: the checkbox hit area, each filter tab, the delete affordance, Retry, Cancel and Delete. Where the visual mark is smaller than 44px — the checkbox is a 21px square — the hit area is padded out to 44px without changing the mark.

No horizontal scrolling on the page body, **ever**, at any viewport width. If content is too wide, the content changes, not the page.

**Scroll model — the page scrolls, and the card grows with the list.** There is no nested scroll container anywhere in the product. The card has no fixed height: it grows downward as Todos are added, and when it outgrows the viewport it is the page body that scrolls, not a region inside it. One consequence, stated so it is not mistaken for a bug: once the list is long the card has no visible bottom edge. The rounded lower corners and the card shadow are below the fold, and the mint-and-white stack runs off the bottom of the screen. Nothing is added to cue "more below" — no fade, no inner shadow, no scrollbar of its own. The page's own scrollbar is the cue, and a list that continues past the edge of the screen is the most ordinary signal a web page has.

**Sticky block — the add input and the filter tabs hold at the top of the viewport.** "Pinned, always visible" means sticky in the CSS sense, not merely first in source order: as the page scrolls, `{components.input-add}`, the error banner region and `{components.filter-tabs}` detach from the card's flow and hold at the top of the viewport while the list runs underneath them. The block stays on `{colors.card}` so the rows scroll behind an opaque surface rather than a translucent one. This is what makes add one tap away however long the list runs — a user 200 Todos deep never scrolls back up to capture the next one. The list is the only part of the card that moves.

**Layout requirement — WCAG 2.4.11 Focus Not Obscured (AA).** The layout must set `scroll-padding-top`, and `scroll-margin-top` on focusable row descendants, to at least the rendered height of the whole sticky block — input plus banner region plus tabs plus the gaps between them — measured live rather than hard-coded, because the banner region's occupancy changes that height. This is a layout requirement, not a nicety: without it the sticky treatment fails 2.4.11 the first time someone tabs past the fold. `EXPERIENCE.md` §Accessibility Floor owns the requirement itself and the behaviour it commits to.

## Elevation & Depth

Depth is tonal and diffuse, never hard. Shadows are tinted with the ground's blue-violet (`rgba(37,44,74,…)`) rather than neutral black, so the whole stack reads as lit by the same soft light.

Two shadow recipes, and only two:

- **Card shadow** — `0 18px 46px -18px rgba(37,44,74,.18), 0 2px 10px -4px rgba(37,44,74,.06)`. Applied to the one card and to the delete dialog. Large blur, low opacity, strong negative spread: the card floats, it does not pop.
- **Row shadow** — `0 8px 22px -12px rgba(37,44,74,.20), 0 1px 3px rgba(37,44,74,.04)`. Applied to every Todo row, the add input, and the skeleton row. A Completed row swaps to `0 8px 22px -14px rgba(37,74,58,.34)` — the same recipe re-tinted green so the mint surface's shadow belongs to it rather than sitting under it as a lavender bruise.

Two inset shadows exist as exceptions, both on the filter tabs: `inset 0 1px 3px rgba(36,36,58,.10)` recesses the track, and `0 2px 6px -2px rgba(36,36,58,.22), 0 1px 1px rgba(36,36,58,.05)` raises the selected chip out of it. This is the only place in the product where something is pushed *in*.

Elevation never encodes state. A Completed row is not raised or lowered relative to an Active one; only its fill, glyph and text change. Hover does not raise rows.

The focus ring is a soft glow, not a shadow: `0 0 0 1px {colors.accent}, 0 0 0 5px rgba(38,128,235,.30)`. One 1px accent edge plus a 4px low-opacity bloom. It is always visible on keyboard focus and it is **never** suppressed for aesthetics.

The ring has one variant, and the reason for it is measured, not tonal. On a Completed row the ring is `{components.checkbox.focus-ring-on-complete}` — `0 0 0 1px {colors.accent-deep}, 0 0 0 5px rgba(27,101,194,.30)` — at 4.33:1. On an Active row, and on every control that is not sitting on mint (the input, the filter tabs, Retry, Cancel, Delete), it stays `{colors.accent}` on white at 3.91:1. Geometry, blur and opacity are identical in both; only the hue value steps down. The ring never changes the size of the element it surrounds. §Colors `{colors.accent-deep}` carries the argument for the step-down.

## Shapes

Three radii and a pill.

- `{rounded.sm}` 7px — the checkbox square. Small enough to read as a control, round enough to belong.
- `{rounded.md}` 14px — every sub-surface inside the card: Todo rows, the add input, the error banner, the skeleton row, the revealed delete action, and the dashed empty-state panel.
- `{rounded.lg}` 18px — the card itself and the delete dialog. The outer container is rounder than the things inside it, which is what makes the stack read as nested objects rather than as one flat surface with lines drawn on it.
- `{rounded.full}` 999px — the filter-tab track, the selected chip, and all buttons (Retry, Cancel, Delete).

Nothing is square-cornered. Nothing is a perfect circle except the 40px glyph ring in `{components.empty-state}`. The logic is the import's: soft, tactile, slightly pillowy, the corner radius of a physical card rather than a browser default.

Icons are thin rounded line icons — consistent stroke weight, rounded caps and joins, no filled shapes except the checkmark glyph inside a checked checkbox.

## Components

Twelve components, each rendered in one of the three mockups below.

### `card`

The one container. `{colors.card}` fill, `{rounded.lg}`, card shadow, `{spacing.6}` block padding and `{spacing.gutter}` inline padding, `{spacing.card-max-width}` maximum width, centred on `{colors.ground}`. It holds input, error banner region, filter tabs and list, in that order, and it is the only thing on the page. Rendered in [`mockups/key-main.html`](mockups/key-main.html).

### `todo-row-active`

`{colors.row-active}` fill, `{rounded.md}` corners, row shadow, `{spacing.row-padding}` inside, `{spacing.4}` gap between checkbox and text. Text is `{typography.todo-text}` in `{colors.text-primary}`. Minimum height `{spacing.touch-target-min}`. Wraps to as many lines as the text needs. Rendered in [`mockups/key-main.html`](mockups/key-main.html).

### `todo-row-completed`

Identical geometry to `{components.todo-row-active}`; three state changes, all simultaneous. Fill swaps to `{colors.row-complete}`, text swaps to `{colors.text-completed}` with a 1.5px line-through in the same colour, and the checkbox fills. The shadow also re-tints to the green recipe. Three redundant cues — fill, glyph, strikethrough — so the state is **never** carried by colour alone, and so a Completed Todo is distinguishable without reading the text. Every focusable control inside this row — its checkbox and its delete control — takes the `-on-complete` focus ring, because the mint it is drawn on takes `{colors.accent}` below the 1.4.11 floor. Rendered in [`mockups/key-main.html`](mockups/key-main.html).

### `checkbox`

21px square, `{rounded.sm}`, 1.75px `{colors.border-control}` border on `{colors.row-active}` when unchecked. Checked, the fill and border both take the accent — but which accent depends on the row it sits on. On an Active row it is `{colors.accent}` on white, 3.91:1. On a Completed row it is `{colors.accent-deep}` on `{colors.row-complete}`, 4.33:1, because `{colors.accent}` on mint is 2.97:1 and would fail WCAG 1.4.11 on the one control whose state the row's whole meaning turns on. The glyph inside is `{colors.on-accent}` in both cases. Its focus ring follows the same rule: `{components.checkbox.focus-ring}` on an Active row, `{components.checkbox.focus-ring-on-complete}` on a Completed one, because a ring in `{colors.accent}` on mint is the same 2.97:1 failure as the fill. Hit area padded to `{spacing.touch-target-min}` in both dimensions.

### `input-add`

Pinned at the top of the card, always visible. `{colors.card}` fill, 1.5px `{colors.border-control}` border, `{rounded.md}`, row shadow, `{spacing.4}`/`{spacing.5}` padding. A thin `{colors.accent}` plus glyph leads. Placeholder in `{colors.text-placeholder}`, entered text in `{colors.text-primary}` at `{typography.input-text}`. Focus-within paints the ring. A small pill `Enter` hint sits at the trailing edge on pointer-width viewports — 1px `{colors.border-control}` edge, `{colors.text-muted}` label at `{typography.counter}`, `{rounded.full}`; it is a hint, not a button, and it is not in the tab order. Autofocus is carried by `{components.input-add.autofocus-pointer}` and `{components.input-add.autofocus-touch}` in this document's frontmatter; the rule and its rationale live in `EXPERIENCE.md` §Component Patterns. Rendered in [`mockups/key-main.html`](mockups/key-main.html).

### `filter-tabs`

An inset segmented control, not a row of buttons. Recessed `{colors.tab-track}` track at `{rounded.full}` with `{spacing.1}` padding and an inset shadow. Three equal-width segments: All, Active, Completed. Unselected labels are `{colors.text-muted}` at `{typography.tab-label}`. The selected segment becomes a raised `{colors.tab-selected-bg}` chip with `{colors.tab-selected-text}` label at `{typography.tab-label-selected}` and a small drop shadow. Each segment is at least `{spacing.touch-target-min}` tall. All three segments carry a count — `All 4`, `Active 2`, `Completed 2` — set in `{typography.tab-label}` in the segment's own label colour, `{spacing.1}` after the name, on one line. A count of zero renders as `0`; it **never** hides, because a disappearing number is a layout shift and a silence. This is the one at-a-glance number in the product, and it is the cheapest honest recovery of the thing the import's stat tiles did that this design otherwise gives up entirely. Rendered in [`mockups/key-main.html`](mockups/key-main.html).

### `error-banner`

One fixed region directly under `{components.input-add}`, present in the layout whether or not it is occupied; all three of its messages are rendered in [`mockups/key-states.html`](mockups/key-states.html). `{colors.danger-bg}` fill, 1px `{colors.danger-border}`, `{rounded.md}`, `{spacing.4}` padding. A `{colors.danger-text}` line icon leads, the message follows in `{typography.banner-message}` at `{colors.danger-text}`, and a pill Retry button sits at the trailing edge: transparent fill, 1.5px `{colors.danger-text}` border, `{colors.danger-text}` label at `{typography.button-label}`.

**Accepted cost.** This single region owns failed load, failed add, failed toggle and failed delete, which means it can be visually distant from the row that actually failed. The trade was taken deliberately — one predictable place beats four inline treatments in a product this small.

### `dialog-delete`

Centred modal on a `rgba(36,36,58,.32)` scrim, rendered open over the list in [`mockups/key-delete.html`](mockups/key-delete.html). `{colors.card}` fill, `{rounded.lg}`, card shadow, `{spacing.7}` padding. Title in `{typography.dialog-title}` at `{colors.text-primary}`. Two pill buttons at `{rounded.full}`, each at least `{spacing.touch-target-min}` tall: Cancel is transparent with a 1.5px `{colors.border-control}` edge and a `{colors.text-muted}` label; Delete is a solid `{colors.danger-fill}` with an `{colors.on-danger-fill}` label at 7.50:1 — the only filled button in the product, because it is the only interaction that cannot be taken back. Initial focus lands on Cancel, not Delete: the safe default that destructive dialogs conventionally use, and consistent with a product where nothing else is ever lost. No third button, no checkbox, no "don't ask again".

### `skeleton-row`

The exact geometry of `{components.todo-row-active}`: same fill, same `{rounded.md}`, same padding, same row shadow, same minimum height. Inside, a `{colors.hairline}` block stands in for the checkbox and one or two `{colors.hairline}` bars stand in for the text, pulsing gently toward `{colors.tab-track}` over `{components.skeleton-row.pulse-duration}`. Three of them, per [`mockups/key-states.html`](mockups/key-states.html), staggered a little so the pulse is not a single flat beat. Because the geometry is identical, there is zero layout shift when real content lands. The card, input and filter tabs are already real and interactive while skeletons are showing — only the list is skeletal.

### `empty-state`

The list region when a Filter View resolves to nothing, rendered for all three views in [`mockups/key-states.html`](mockups/key-states.html). One centred dashed panel: 1.5px dashed `{colors.hairline}` — decorative, not a control boundary, which is why hairline is still correct here — at `{rounded.md}`, `{spacing.8}` block and `{spacing.6}` inline padding. Anatomy, top to bottom: a 40px `{rounded.full}` ring filled `{colors.row-complete}` holding an 18px 1.7px-stroke line glyph in `{colors.text-completed}` (a plus on the All view, a check on Active and Completed), then `{spacing.4}`; then two text roles, and only the All view uses both — the first line at `{typography.empty-message}` in `{colors.text-primary}`, then `{spacing.1}`, then an optional second line at `{typography.empty-sub}` in `{colors.text-muted}`. The All view reads `Nothing here yet.` over `Type above to add your first Todo.`; Active and Completed carry the first line alone, because a user with nothing outstanding needs no instruction. Strings and their behaviour live in `EXPERIENCE.md`.

### `char-counter`

A remaining-character count in `{typography.counter}` at `{colors.text-muted}`, positioned at the trailing edge of `{components.input-add}` and shown at both its thresholds in [`mockups/key-states.html`](mockups/key-states.html). A bare numeral — `38`, with no unit, label or suffix — which is the plain-and-unadorned voice applied to a number. Absent below 450 characters, fading in at `{components.char-counter.appears-at}` and counting down to the `{components.char-counter.ceiling}` hard stop. Nothing about its appearance changes at exactly 500: the count reaches `0`, keystrokes stop producing characters, and the number that has been counting down all along is the explanation. No colour change, no weight change, no shake. It exists so the stop at 500 is never mysterious. It is not an error and **never** takes the danger ramp.

### `delete-action`

Two presentations of one action, both rendered in [`mockups/key-delete.html`](mockups/key-delete.html) along with the first-run nudge that exposes the second. On pointer devices, a thin trailing line icon appears on row hover in `{colors.text-muted}`, moving to `{colors.danger-text}` on its own hover. On touch, swiping a row leftward reveals a solid `{colors.danger-fill}` panel behind it at `{rounded.md}` with an `{colors.on-danger-fill}` icon — the filled treatment, matching the dialog's confirm button, so the two surfaces on the delete path read as one escalation rather than two unrelated clay objects. Both presentations are at least `{spacing.touch-target-min}`. Both take `{components.delete-action.focus-ring}` on an Active row and `{components.delete-action.focus-ring-on-complete}` on a Completed one — a Todo can be deleted in either Completion Status, so this control is reachable on mint and its ring has to clear 3:1 there. Neither presentation is the only route to delete — the keyboard route is specified in `EXPERIENCE.md`.

## Dos and don'ts

### Dos and don'ts

| Do | Don't |
|---|---|
| Carry Completion Status with three simultaneous cues — mint fill, filled checkmark, strikethrough in `{colors.text-completed}` | Let colour carry status alone, anywhere, ever. If the mint is removed the state must still be readable |
| Use `{colors.accent}` for fills, strokes, checkmark and the focus ring on every surface that is not mint | Set any text in `{colors.accent}` — it is 3.91:1 on white and fails AA for text |
| Use `{colors.accent-deep}` for every accent-toned text, the selected tab label, and both the checked checkbox and the focus ring on a Completed row | Use `{colors.accent-deep}` for fills, strokes or the focus ring anywhere off mint — the accent hue must read as one colour that darkens on one surface |
| Put `{colors.accent}` on white and `{colors.accent-deep}` on mint — for the checked checkbox and for the focus ring alike | Put `{colors.accent}` on mint — 2.97:1, below the 1.4.11 floor, whether it is the control that carries the product's only state or the ring that says where the keyboard is |
| Keep the focus ring's geometry, blur and opacity identical in both variants and change only the hue value | Argue that the 4px bloom carries the ring on mint — a 30%-opacity bloom is fainter than the 1px edge that already fails, not stronger |
| Use `{colors.border-control}` for every boundary that identifies a control | Use `{colors.hairline}` for anything operable — at 1.28:1 on white it marks nothing; it is for decorative use only |
| Use `{colors.danger-fill}` with `{colors.on-danger-fill}` for the two committed destructive surfaces | Use `{colors.danger-text}` as a fill, or `{colors.danger-bg}` for the confirm button — the banner is de-escalated on purpose and the confirm button is not |
| Keep one pastel, `{colors.row-complete}`, meaning exactly one thing | Adopt the import's category-coded multi-pastel scheme. Simple Action has no categories, and colour has no second job here |
| Ship light mode only | Add a dark mode, a theme toggle, or a settings surface to hold one |
| Take the bounded things the import actually gave — the rounded per-item sub-surface, the diffuse low-contrast shadow, the geometric sans, the thin line icons | Take the import's structure — greeting header, stat tiles, category cards, note counts, sub-tasks, bell, timestamps, FAB, second screen |
| Describe the direction as import-**inspired** | Describe the lavender ground or the mint Completed row as inherited from the import — the ground came from its presentation backdrop, and the import has no completed item in it at all |
| Tint shadows with the ground's blue-violet, or green under mint | Use neutral black shadows, hard borders for hierarchy, or elevation to encode state |
| Keep the error banner in its one fixed region under the input | Scatter inline error treatments per row, or use a toast |
| Pad every hit area to `{spacing.touch-target-min}` even when the mark is smaller | Shrink targets to tighten the layout |
| Let Todo text wrap to as many lines as it needs | Truncate with an ellipsis, clip, or allow the page body to scroll sideways |
| Use the word Completed | Use "Done" — as a filter name, a label, an icon tooltip, or in spec prose |

### Contrast — every load-bearing pair

Text and non-text, with its computed ratio and the criterion it answers to. Nothing here is asserted; each ratio is computed from the two hex values named in the row.

| Pair | Ratio | Criterion | Verdict |
|---|---|---|---|
| `{colors.text-primary}` on `{colors.card}` / `{colors.row-active}` — Todo text, input text, dialog title | 15.12:1 | 1.4.3 | Passes |
| `{colors.text-primary}` on `{colors.row-complete}` — the empty state's first line is on the card, but this is the headroom if primary ever lands on mint | 11.49:1 | 1.4.3 | Passes |
| `{colors.text-muted}` on `{colors.card}` — tab labels and counts, counter, `Enter` hint, empty-state second line | 6.66:1 | 1.4.3 | Passes |
| `{colors.text-muted}` on `{colors.ground}` | 5.55:1 | 1.4.3 | Passes |
| `{colors.text-completed}` on `{colors.row-complete}` — Todo text and strikethrough on a Completed row | **4.69:1** | 1.4.3 | Passes, **no headroom** |
| `{colors.text-placeholder}` on `{colors.card}` — the input placeholder | 4.73:1 | 1.4.3 | Passes |
| `{colors.danger-text}` on `{colors.danger-bg}` — banner message and Retry label | 6.23:1 | 1.4.3 | Passes |
| `{colors.tab-selected-text}` on `{colors.tab-selected-bg}` — the selected tab label | 5.70:1 | 1.4.3 | Passes |
| `{colors.accent-deep}` on `{colors.card}` — any accent-toned text | 5.70:1 | 1.4.3 | Passes |
| `{colors.on-danger-fill}` on `{colors.danger-fill}` — the Delete button label, the swipe panel's icon | **7.50:1** | 1.4.3 for the label, 1.4.11 for the icon | Passes |
| `{colors.border-control}` on `{colors.card}` — unchecked checkbox border, input border, Cancel edge, `Enter` hint edge | **3.28:1** | 1.4.11 | Passes |
| `{colors.accent}` on `{colors.card}` — checked checkbox on an Active row, leading plus glyph, focus ring on every surface that is not mint | 3.91:1 | 1.4.11 | Passes |
| `{colors.accent-deep}` on `{colors.row-complete}` — checked checkbox on a Completed row | **4.33:1** | 1.4.11 | Passes |
| `{colors.accent-deep}` on `{colors.row-complete}` — **the focus ring on a Completed row**, checkbox or delete control | **4.33:1** | 1.4.11 | Passes |
| `{colors.accent}` on `{colors.row-complete}` — **the pair this design does not use**, for the checked checkbox or the focus ring | **2.97:1** | 1.4.11 | **Fails** — recorded so nobody re-derives it |
| `{colors.hairline}` on `{colors.card}` — empty-state dashed panel, skeleton resting fill | **1.28:1** | 1.4.11 does **not** apply | Exempt: purely decorative separators and placeholder ornament, no control boundary and no information |
| `{colors.row-complete}` against `{colors.row-active}` — the fill that distinguishes a Completed row from an Active one | 1.32:1 | 1.4.11 does not apply on its own | The fill is never the only cue: the filled checkmark (4.33:1) and the strikethrough carry the state independently, per 1.4.1 |
| `{colors.tab-selected-bg}` against `{colors.tab-track}` — the raised selected chip | 1.16:1 | 1.4.11 does not apply on its own | The chip fill is never the only cue: the selected label changes colour and weight, and `aria-selected` carries it programmatically |

> **Contrast warning — the tightest pair in the system.** `{colors.text-completed}` `#5F5F7A` on `{colors.row-complete}` `#C3E9D7` measures **4.69:1**. It clears the WCAG AA 4.5:1 floor for normal text with almost no headroom. Do not darken the mint and do not lighten that grey — either move breaks AA — without re-computing the ratio first. Every other text pair in the system has room; this one does not.

> **Three 1.4.11 corrections are on the record, and they are one rule applied three times.** The checked checkbox moved off `{colors.accent}` on mint; every control boundary moved off `{colors.hairline}`; and the focus ring moved off `{colors.accent}` on mint. Each was found by computing a ratio rather than by looking at the screen, which is why the table above exists and why nothing in it is asserted.
