import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { classNamesOf, parseTsx, readMarkup } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import { COUNTER_FADE_MS } from "@/client/motion/motion";
import { TODO_TEXT_MAX_LENGTH } from "@/shared/contract/validation";
import {
  ADD_INPUT_PLACEHOLDER,
  COUNTER_APPEARS_AT,
  ENTER_HINT_LABEL,
  SUBMIT_NOT_YET_WIRED,
} from "./add-input";

// Covers epics.md Story 3.2 AC1, AC4, AC5, AC7, AC8 and AC9 — the half of the
// story that is a property of the source and of what it compiles to.
//
// The other half is behaviour and lives in `add-input.render.test.tsx`: Enter
// clearing and retaining focus, a whitespace-only submit changing nothing, the
// counter's threshold, and autofocus on pointer but not on touch. Split the
// way every component in this repository is split, because most of what is
// asserted here is either an *absence* (nothing disabled, no danger class, no
// duration literal) or a value that only exists after Tailwind has run.

const repositoryRoot = process.cwd();
const designRoot = path.join(
  "docs",
  "planning-artifacts",
  "ux-designs",
  "ux-simple-action-2026-09-20",
);

const addInputFile = path.join("src", "client", "components", "add-input.tsx");
const stickyFile = path.join(
  "src",
  "client",
  "components",
  "sticky-top-block.tsx",
);

const markup = readMarkup();
const sourceOf = (file: string): string =>
  markup.find(({ file: found }) => found === file)?.source ??
  (() => {
    throw new Error(`${file} is not in the markup surface`);
  })();

const addInputSource = sourceOf(addInputFile);
const stickySource = sourceOf(stickyFile);

/**
 * The source with its comments removed.
 *
 * Most of what this file asserts is an absence — nothing disabled, no danger
 * class, no second media query, no literal ceiling — and both of these files
 * discuss every one of those at length in prose, exactly as they should. Only
 * code reaches the browser, which is the same reason `styleSheetMatches`
 * strips CSS comments before matching.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const addInputCode = code(addInputSource);
const stickyCode = code(stickySource);
const classes = classNamesOf(addInputSource, "add-input.tsx");

const planningDocument = (name: string): string =>
  readFileSync(path.join(repositoryRoot, designRoot, name), "utf8");

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));
const compiled = compile(markup.flatMap(({ classes: found }) => found));

/**
 * The `className` string on the one `<element>` in this file that carries
 * `marker` — or on the one `<element>` there is, when no marker is given.
 *
 * One element's classes, never several elements' merged. There are two
 * `<span>`s in this component and their classes overlap, so a union would let
 * the counter's assertions pass on the hint's classes and the hint's on the
 * counter's: move `rounded-full` onto the counter, or leave `text-counter` on
 * the counter alone, and a merged list still contains everything either
 * assertion asks for. Hence the marker, and hence the throw when more than one
 * element matches — a silently merged list is the failure this helper exists
 * to avoid, so it refuses to produce one.
 */
function classesOn(element: string, marker?: string): string[] {
  const sourceFile = parseTsx("add-input.tsx", addInputSource);
  const found: string[][] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile) === element) {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(sourceFile) === "className" &&
            attribute.initializer &&
            ts.isStringLiteral(attribute.initializer)
          ) {
            found.push(attribute.initializer.text.split(/\s+/).filter(Boolean));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const named = `<${element}>${marker === undefined ? "" : ` carrying \`${marker}\``}`;
  const matching =
    marker === undefined ? found : found.filter((classes) => classes.includes(marker));
  if (matching.length === 0) throw new Error(`no ${named} with classes`);
  if (matching.length > 1) {
    throw new Error(
      `${matching.length} elements match ${named} — these assertions are about one element's classes`,
    );
  }
  return matching[0];
}

// --- AC1: interactive from first paint --------------------------------------

describe("the field never waits on anything (AC1)", () => {
  it("is never disabled and never read-only", () => {
    // Asserted as an absence in the source rather than on a rendered
    // attribute, because the failure this guards against is a later story
    // adding `disabled={isPending}` while wiring the mutation — which is a
    // one-line change that no rendered assertion written today would be
    // looking at.
    expect(addInputCode).not.toMatch(/\bdisabled\b/);
    expect(addInputCode).not.toMatch(/\breadOnly\b/);
    expect(addInputCode).not.toMatch(/\baria-disabled\b/);
  });

  it("reads no query, so there is nothing for it to wait on", () => {
    // The stronger form of the claim above: a field that holds no query
    // cannot be gated on one. `useTodos` and `useQuery` are what a load state
    // would arrive through.
    expect(addInputCode).not.toContain("useTodos");
    expect(addInputCode).not.toContain("useQuery");
    expect(addInputCode).not.toContain("useMutation");
  });

  it("sits above the banner region inside the one sticky block", () => {
    // Placed into Story 2.3's container rather than re-implementing
    // stickiness — `todo-card.test.ts` holds that rule for the whole tree.
    // Being first in the block is also AC9's tab order: the input comes
    // before `Retry` and before Epic 4's tabs because it is first in the DOM.
    expect(stickySource).toContain("<AddInput />");
    expect(stickySource.indexOf("<AddInput")).toBeLessThan(
      stickySource.indexOf("<ErrorBannerRegion"),
    );
    expect(classes).not.toContain("sticky");
    expect(classes).not.toContain("fixed");
  });

  it("sits under the block's own inset, with the mockup's gap below it", async () => {
    // The fifth recipe this story wrote, and the only one nothing compiled:
    // delete or misspell `@utility top-block-stack` and every other assertion
    // in this file stays green while the block's 10px inset and the gap above
    // the banner vanish — an unrecognised utility is dropped silently, which
    // is the whole reason these tests read the emitted rule back.
    //
    // Both values are `mockups/key-states.html:254`, transcribed rather than
    // tokenised (the story's planning decision 2). The inset is what keeps
    // the input off the viewport edge the moment the block pins.
    const css = await compiled;
    const recipe = ruleFor(css, "top-block-stack");
    expect(recipe).toContain("padding-top: 10px");
    expect(recipe).toContain("gap: 10px");
    expect(classNamesOf(stickySource, "sticky-top-block.tsx")).toContain(
      "top-block-stack",
    );
  });

  it("is given no props by the block, because none can cross the boundary", () => {
    // The plan had `StickyTopBlock` declare the placeholder and pass it as
    // `onSubmit`. It cannot: the block is a Server Component and a function
    // prop does not cross that boundary. The seam is the prop's default
    // instead, and this is what would notice it being "fixed" back.
    expect(stickyCode).not.toContain("onSubmit");
    // The seam is inert *and* is the prop's default. `toBeUndefined()` on the
    // return value said nothing — every function without an explicit return
    // satisfies it — where what matters is that nothing is wired behind it
    // yet: an empty body, typed as the submit seam and doing nothing with it.
    expect(SUBMIT_NOT_YET_WIRED.toString().replace(/\s+/g, "")).toBe("()=>{}");
    expect(addInputSource).toContain("onSubmit = SUBMIT_NOT_YET_WIRED");
    // And Story 3.3 is named where the replacement happens, so the seam is
    // findable from the file rather than from this test.
    expect(addInputSource).toContain("Story 3.3");
  });
});

// --- AC8: the copy and the two text roles -----------------------------------

describe("the placeholder and the typed text (AC8)", () => {
  it("takes the placeholder from EXPERIENCE.md rather than from a chosen string", () => {
    // Read out of the document rather than re-typed here, the way
    // `motion.test.ts` reads the pulse duration out of DESIGN.md: a change
    // there fails this rather than being mirrored into a second
    // transcription.
    const declared = planningDocument("EXPERIENCE.md").match(
      /^\| Input placeholder \| `([^`]+)` \|$/m,
    );
    expect(declared, "EXPERIENCE.md declares no input placeholder").not.toBeNull();
    expect(ADD_INPUT_PLACEHOLDER).toBe(declared![1]);
    expect(ADD_INPUT_PLACEHOLDER).toBe("what needs doing?");
  });

  it("uses the one string as both the placeholder and the accessible name", () => {
    // There is no visible label and nowhere to put one (DESIGN.md:334 — the
    // card opens straight into the input). A placeholder is a weak accessible
    // name, so the same constant is given as `aria-label`; naming it twice
    // from one constant is what keeps them from drifting.
    expect(addInputSource).toContain("placeholder={ADD_INPUT_PLACEHOLDER}");
    expect(addInputSource).toContain("aria-label={ADD_INPUT_PLACEHOLDER}");
  });

  it("renders typed text in text-primary at the input-text role", () => {
    const field = classesOn("input");
    expect(field).toContain("text-input-text");
    expect(field).toContain("text-text-primary");
    expect(field).toContain("placeholder:text-text-placeholder");
  });

  it("compiles those three to DESIGN.md's tokens", async () => {
    const css = await compiled;
    // `{typography.input-text}` is 14.5 / 400, and it already existed — this
    // story is its first consumer.
    const role = ruleFor(css, "text-input-text");
    expect(role).toContain("font-size: 14.5px");
    expect(role).toContain("font-weight: 400");
    expect(ruleFor(css, "text-text-primary")).toContain(
      "var(--color-text-primary)",
    );
    expect(ruleFor(css, "placeholder:text-text-placeholder")).toContain(
      "var(--color-text-placeholder)",
    );
  });
});

// --- The recipe: what DESIGN.md gives and what has no token -----------------

describe("the input is DESIGN.md's `components.input-add` (AC8, AC9)", () => {
  it("carries the tokened half as classes on the element", () => {
    const box = classesOn("div");
    // `background: {colors.card}`, `radius: {rounded.md}`,
    // `padding: {spacing.4} {spacing.5}`, the row shadow and the control
    // border colour. DESIGN.md beats the mockup on the padding (AD-13): the
    // mockup's `12px 13px` is untokenised and `{spacing.4}`/`{spacing.5}` is
    // 12px/14px.
    for (const required of [
      "bg-card",
      "rounded-md",
      "py-4",
      "px-5",
      "shadow-row",
      "border-border-control",
      "focus-within:shadow-focus",
      // The mockup's accent edge on focus (`mockups/key-states.html:240`),
      // which DESIGN.md does not contradict. Listed here because it was
      // carried by the element and asserted nowhere: it could have been
      // deleted without a single failure.
      "focus-within:border-accent",
    ]) {
      expect(box).toContain(required);
    }
    // And no `border` class beside the recipe's `border-width`: Tailwind's
    // `.border` is emitted after the recipe and would reset 1.5px to 1px.
    expect(box).not.toContain("border");
  });

  it("compiles the padding to the two spacing tokens, not to the mockup's values", async () => {
    const css = await compiled;
    expect(ruleFor(css, "py-4")).toContain("var(--spacing-4)");
    expect(ruleFor(css, "px-5")).toContain("var(--spacing-5)");
  });

  it("carries the untokenised half in the recipe", async () => {
    const css = await compiled;
    const recipe = ruleFor(css, "input-add");
    // DESIGN.md `components.input-add.border` — `1.5px solid`.
    expect(recipe).toContain("border-width: 1.5px");
    // AC9's width half. It cannot be a class: `todo-card.test.ts` bans the
    // whole `min-w-*` family tree-wide, which is why `retry-pill` reads the
    // same token the same way.
    expect(recipe).toContain("min-width: var(--spacing-touch-target-min)");
  });

  it("takes the height half of the 44px floor as a class", () => {
    expect(classesOn("div")).toContain("min-h-touch-target-min");
  });

  it("lets the field shrink inside the row", async () => {
    // An `<input>`'s automatic minimum size is its intrinsic width — its
    // `size` attribute's worth of characters — so without this the row grows
    // past the card on a narrow phone once the counter is showing. The class
    // that says it is banned tree-wide, so it is in the recipe.
    const css = await compiled;
    expect(ruleFor(css, "input-add-field")).toContain("min-width: 0");
    expect(classesOn("input")).toContain("flex-1");
  });

  it("paints the ring rather than suppressing it", async () => {
    // `outline-none` on the field is not a suppression: the ring is painted
    // by the wrapper's `focus-within:shadow-focus`, around the whole control
    // rather than around the text box inside it. DESIGN.md:386 — never
    // suppressed.
    const css = await compiled;
    expect(classesOn("input")).toContain("outline-none");
    // Tailwind inlines the theme value into the utility rather than emitting
    // `var(--shadow-focus)`, so the assertion is on what the token *is* —
    // DESIGN.md's 1px accent edge and 5px bloom — read back through the
    // accent token it is composed from.
    const ring = ruleFor(css, "focus-within:shadow-focus");
    expect(ring).toContain("var(--color-accent)");
    expect(ring).toContain("box-shadow:");
    // And the border takes the accent alongside it, which is the mockup's
    // other half of the focus state. A class that compiles to nothing is
    // dropped silently, so the rule is read back rather than trusted.
    const edge = ruleFor(css, "focus-within:border-accent");
    expect(edge).toContain("var(--color-accent)");
    expect(edge).toContain("border-color:");
  });
});

// --- AC4 and AC5: the ceiling and the counter -------------------------------

describe("the ceiling stops typing and changes nothing else (AC4)", () => {
  it("is the browser's own stop, at the shared contract's number", () => {
    // `maxLength` means there is no moment at which this component holds an
    // over-long value and has to decide what to do about it — which is what
    // makes "nothing about the interface changes" true by construction.
    expect(addInputSource).toContain("maxLength={TODO_TEXT_MAX_LENGTH}");
    expect(TODO_TEXT_MAX_LENGTH).toBe(500);
  });

  it("imports the cap and the predicate rather than retyping either (AD-11)", () => {
    expect(addInputSource).toContain('from "@/shared/contract/validation"');
    expect(addInputSource).toContain("isValidTodoText");
    // The two numbers this component may write are the counter's threshold
    // and nothing else. A literal 500 here would be the second home for the
    // cap that AD-11 exists to prevent.
    const literals = [...addInputCode.matchAll(/\b\d{3,}\b/g)].map((m) => m[0]);
    expect(literals).toEqual([String(COUNTER_APPEARS_AT)]);
  });

  it("is keyed on nothing, so nothing can change at exactly 500", () => {
    // The ceiling appears in this file only as `maxLength`. No comparison
    // against it, no class chosen by it, no branch on it — a colour change,
    // a weight change or a shake at the ceiling would have to be one of
    // those.
    expect(addInputCode).not.toMatch(/TODO_TEXT_MAX_LENGTH\s*[<>=]/);
    expect(addInputCode).not.toMatch(/[<>=]=?\s*TODO_TEXT_MAX_LENGTH/);
  });
});

describe("the counter is a bare numeral that fades in at 450 (AC5)", () => {
  it("takes its threshold and its ceiling from DESIGN.md", () => {
    const design = planningDocument("DESIGN.md");
    const appearsAt = design.match(/^ {4}appears-at: (\d+)$/m);
    const ceiling = design.match(/^ {4}ceiling: (\d+)$/m);
    expect(appearsAt, "DESIGN.md declares no `appears-at`").not.toBeNull();
    expect(ceiling, "DESIGN.md declares no `ceiling`").not.toBeNull();
    expect(COUNTER_APPEARS_AT).toBe(Number(appearsAt![1]));
    expect(TODO_TEXT_MAX_LENGTH).toBe(Number(ceiling![1]));
  });

  it("counts down rather than up, and renders nothing but the number", () => {
    // `format: bare-numeral` — no unit, no label, no `of 500`. The whole of
    // the counter's markup is one expression.
    expect(addInputSource).toContain("{TODO_TEXT_MAX_LENGTH - text.length}");
    expect(addInputCode).not.toMatch(/\bleft\b|\bremaining\b|characters|\/ *500|of 500/i);
  });

  it("is absent below the threshold rather than present and empty", () => {
    expect(addInputSource).toContain("text.length < COUNTER_APPEARS_AT ? null");
  });

  it("is muted and never on the danger ramp", () => {
    const counter = classesOn("span", "char-counter");
    expect(counter).toContain("text-counter");
    expect(counter).toContain("text-text-muted");
    // "It is not an error and never takes the danger ramp" (DESIGN.md:442).
    // Scoped to the whole file rather than to the counter's element, because
    // the ramp arriving on the *box* at the ceiling would be the same
    // failure.
    expect(classes.filter((name) => name.includes("danger"))).toEqual([]);
  });

  it("fades in at the motion module's duration, not at a number of its own", async () => {
    // `motion.test.ts` bans a `transition-` or `duration-` class anywhere in
    // the markup and a millisecond literal outside the motion module, so the
    // fade is a recipe and its duration is `COUNTER_FADE_MS` spelled a second
    // time in CSS — which is exactly the skeleton pulse's arrangement, and is
    // asserted the same way rather than trusted.
    const css = await compiled;
    const recipe = ruleFor(css, "char-counter");
    expect(recipe).toContain(`counter-fade-in ${COUNTER_FADE_MS}ms`);
    // Every duration the stylesheet gives this animation, not one wrong
    // number ruled out: `not.toContain("… 181ms")` would pass a stylesheet
    // that animated at 400ms. The claim is that the fade has exactly one
    // duration in the whole sheet and that it is the module's.
    const durations = [...css.matchAll(/counter-fade-in (\d+)ms/g)].map(
      (match) => Number(match[1]),
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((ms) => ms === COUNTER_FADE_MS)).toBe(true);
    expect(css).toMatch(/@keyframes counter-fade-in/);
  });

  it("reserves the counter's width, so the field's text does not move", async () => {
    // `tabular-nums` equalises digit widths, not digit counts: without a
    // reserved width the span narrows by a character at 10 → 9 and the
    // `flex-1` field grows into the space, shifting the caret and the typed
    // text mid-keystroke. The counter runs 50 → 0, so two digits is the
    // range. It is in the recipe rather than on the element because
    // `todo-card.test.ts:188` bans the `min-w-*` family tree-wide — the same
    // reason `input-add`'s width floor is there.
    const css = await compiled;
    expect(ruleFor(css, "char-counter")).toContain("min-width: 2ch");
    expect(classesOn("span", "char-counter")).toContain("tabular-nums");
  });

  it("holds still under the one marker the motion module produces", async () => {
    // The `data-still` pattern, as `skeleton-row` does it: the component sets
    // an attribute and the stylesheet suppresses on it, so no `className` in
    // the product is ever branched on a preference (AR-28).
    const css = await compiled;
    expect(ruleFor(css, "char-counter")).toContain('[data-still="true"] > &');
    expect(addInputSource).toContain("data-still={still ? true : undefined}");
    expect(addInputCode).not.toContain("matchMedia");
  });
});

// --- AC7: the Enter hint ----------------------------------------------------

describe("the Enter hint is a hint, gated by capability (AC7)", () => {
  it("shows only where there is a pointer, decided in CSS", async () => {
    // EXPERIENCE.md:245 — capability, not width. Written as a media feature
    // inside the recipe, it is also the reason this component reads no second
    // media query of its own.
    const css = await compiled;
    const recipe = ruleFor(css, "enter-hint");
    expect(recipe).toContain("display: none");
    expect(recipe).toContain("@media (pointer: fine)");
    // And not as a width breakpoint, which is the wrong test in both
    // directions: a 1280px tablet is touch and a 700px laptop window is not.
    expect(classes.filter((name) => /^(sm|md|lg|xl):/.test(name))).toEqual([]);
  });

  it("is not in the tab order and is not a control", () => {
    expect(ENTER_HINT_LABEL).toBe("Enter");
    expect(addInputCode).not.toContain("<button");
    expect(addInputCode).not.toContain("tabIndex");
    expect(addInputSource).toMatch(/aria-hidden="true"\s+className="enter-hint/);
  });

  it("carries DESIGN.md's pill as classes on the element", () => {
    const hint = classesOn("span", "enter-hint");
    // `enter-hint-border: 1px solid {colors.border-control}` — 1px is
    // Tailwind's own `border` default, so the only untokenised thing about
    // this pill is where it shows. `enter-hint-radius: {rounded.full}`,
    // `enter-hint-text: {colors.text-muted}`,
    // `enter-hint-typography: {typography.counter}`.
    for (const required of [
      "border",
      "border-border-control",
      "rounded-full",
      "text-counter",
      "text-text-muted",
    ]) {
      expect(hint).toContain(required);
    }
  });
});

// --- The client boundary ----------------------------------------------------

describe("the client boundary is declared here", () => {
  it("declares itself a Client Component before anything else", () => {
    expect(addInputSource.trimStart().startsWith('"use client";')).toBe(true);
  });

  it("leaves the block above it a Server Component", () => {
    // `todo-list.test.ts` holds the same rule from the other side. It is
    // restated here because this story is what put a Client Component
    // directly inside the block, and the cheap fix for the prop that cannot
    // cross — a `"use client"` on the block — would pull the card's whole
    // subtree across without failing anything else.
    expect(stickySource).not.toMatch(/^\s*["']use client["']/m);
  });
});
