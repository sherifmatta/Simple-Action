import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { matches, readMarkup, readSources, styleSheetMatches } from "@/test-support/markup";
import { ruleFor, tailwindCompiler } from "@/test-support/tailwind";
import {
  COLLAPSE_MS,
  COUNTER_FADE_MS,
  DEPARTURE_HOLD_MS,
  FIRST_RUN_NUDGE_MS,
  SKELETON_PULSE_MS,
  useReducedMotion,
} from "./motion";

// Covers epics.md Story 2.5 AC1, AC2, AC3 and AC4.
//
// AC1 is the four named constants; AC2 that `prefers-reduced-motion` is read
// in this one place and no component reads the media query itself; AC3 that
// no component inlines a duration literal; AC4 that Epics 4 and 5 import one
// shared collapse constant rather than each creating one. Three of the four
// are *absences*, and an absence has no call site to test — so most of this
// file is a scan over the whole product source, and the rest compiles the
// real `app/globals.css` through the real Tailwind engine to read back what
// the pulse rule actually says.
//
// The one behavioural claim here is the server snapshot, which needs no DOM:
// `react-dom/server` drives `useSyncExternalStore` through `getServerSnapshot`
// by definition, which is exactly the path under test. What the *client*
// snapshot does with a real media query is `todo-list.render.test.tsx`'s, in
// jsdom with `matchMedia` stubbed, because jsdom implements none.

const repositoryRoot = process.cwd();
const motionFile = path.join("src", "client", "motion", "motion.ts");
// Story 3.2's second media-query reader, and the reason the scan below asks
// which query rather than whether there is one.
const pointerFile = path.join("src", "client", "device", "pointer.ts");

const sources = readSources();
const markup = readMarkup();

const { base, compile } = tailwindCompiler();
afterAll(() => rmSync(base, { recursive: true, force: true }));
const compiled = compile(markup.flatMap(({ classes }) => classes));

/** Every product source file matching `pattern`. */
const matching = (
  within: { file: string; source: string }[],
  pattern: RegExp,
): string[] =>
  within.filter(({ source }) => pattern.test(source)).map(({ file }) => file);

const sourcesMatching = (pattern: RegExp): string[] => matching(sources, pattern);

/**
 * `file:query` for every media query written in a file that calls `matchMedia`.
 *
 * Both readers name their query as a module constant rather than inline, so
 * the call site carries an identifier and the string is elsewhere in the same
 * file — which is why this pairs the two by file instead of parsing the call.
 * A file that calls `matchMedia` and declares no query string at all would
 * report nothing and fail the assertion by absence.
 */
const MEDIA_QUERY = /"(\([a-z-]+\s*:\s*[a-z-]+\))"/g;

function mediaQueryReaders(): string[] {
  return sources
    .filter(({ source }) => /\bmatchMedia\b/.test(source))
    .flatMap(({ file, source }) =>
      [...source.matchAll(MEDIA_QUERY)].map((match) => `${file}:${match[1]}`),
    )
    .sort();
}

/**
 * The interface half of the product: `app/` plus `src/client/`.
 *
 * AC3 is about *components*, and the two scans below are its shape. Running
 * them over `src/server/` as well would be a rule this story never agreed —
 * a route handler or a repository is free to schedule work, and one already
 * holds a network deadline.
 */
const interfaceSources = sources.filter(
  ({ file }) =>
    file.startsWith(`app${path.sep}`) ||
    file.startsWith(path.join("src", "client") + path.sep),
);

// --- AC1: the four constants, seeded complete -------------------------------

describe("the module holds every duration in the product (AC1)", () => {
  it("names them all, including the three with no consumer yet", () => {
    // Seeding it complete is the whole point: Epics 4 and 5 run in parallel
    // and both import `COLLAPSE_MS`, so a module grown one constant at a time
    // would give whichever arrived second an unmerged import or a second
    // declaration (epic-2-context Cross-Story Dependencies).
    expect(SKELETON_PULSE_MS).toBe(1400);
    expect(DEPARTURE_HOLD_MS).toBe(400);
    expect(COLLAPSE_MS).toBe(180);
    expect(FIRST_RUN_NUDGE_MS).toBe(600);
    // Story 3.2's addition. The one duration no planning document gives a
    // number for, which is why it was not seeded with the other four —
    // DESIGN.md:440 and EXPERIENCE.md:144 both say the counter "fades in" and
    // neither says over how long. Pinned here all the same, because what the
    // stylesheet animates on has to be this number and not a second one.
    expect(COUNTER_FADE_MS).toBe(180);
  });

  it("takes the pulse from DESIGN.md rather than from a chosen number", () => {
    // DESIGN.md `components.skeleton-row.pulse-duration` is the authority
    // (AD-13). Read out of the document rather than re-typed here, so a
    // change there fails this rather than being mirrored into a second
    // transcription.
    const designMd = readFileSync(
      path.join(
        repositoryRoot,
        "docs/planning-artifacts/ux-designs/ux-simple-action-2026-09-20/DESIGN.md",
      ),
      "utf8",
    );
    const declared = designMd.match(/^ {4}pulse-duration:\s*(\d+)ms$/m);
    expect(declared, "DESIGN.md declares no `pulse-duration`").not.toBeNull();
    expect(SKELETON_PULSE_MS).toBe(Number(declared![1]));
  });
});

// --- AC3/AC7: one home for the pulse duration, not two ----------------------

describe("the stylesheet's pulse and the module's constant are one value (AC3, AC7)", () => {
  it("compiles the pulse at the module's duration", async () => {
    const css = await compiled;
    // Keyed on the exact selector, not on `ruleFor(css, "skeleton-row")`.
    // Five emitted rules now begin with `.skeleton-row`, including the
    // suppression, so `ruleFor` would return whichever Tailwind happened to
    // put first — the same emission-order dependence `skeleton-row.test.ts`
    // documents as unsafe, since the production minifier reorders them.
    expect(css.replace(/\s+/g, " ")).toContain(
      `.skeleton-row > * { animation: skeleton-pulse ${SKELETON_PULSE_MS}ms ease-in-out infinite; }`,
    );
    // And `ruleFor` still stands guard against the silent drop it exists for:
    // it throws when Tailwind emitted nothing for a recipe at all.
    expect(ruleFor(css, "skeleton-bar")).toContain("height: 12px");
  });

  it("emits the keyframes the pulse names, between the two DESIGN.md colours", async () => {
    const css = await compiled;
    const frames = css.match(/@keyframes skeleton-pulse\s*\{[\s\S]*?\}\s*\}/);
    expect(frames, "Tailwind dropped @keyframes skeleton-pulse").not.toBeNull();
    // Resting at hairline, pulsing toward tab-track — DESIGN.md's
    // `placeholder-fill` and `pulse-to`, as tokens rather than as values.
    expect(frames![0]).toContain("var(--color-hairline)");
    expect(frames![0]).toContain("var(--color-tab-track)");
  });

  it("would notice the two drifting apart", async () => {
    const css = await compiled;
    expect(css).not.toContain(
      `animation: skeleton-pulse ${SKELETON_PULSE_MS + 1}ms`,
    );
  });
});

// --- AC2: one reader of the preference, product-wide ------------------------

describe("the preference is read in exactly one place (AC2)", () => {
  it("is read in the motion module and in no other source file", () => {
    // Narrowed by Story 3.2, from "no other file calls `matchMedia`" to "no
    // other file asks the *motion* question".
    //
    // AC2 exists so that whether the interface moves is decided once and
    // consumed as a marker, rather than branched in a component — not so that
    // this module owns every media query in the product. Story 3.2's
    // autofocus is a second question with the same mechanism and no overlap:
    // `(pointer: fine)` decides whether the caret starts in the field, cannot
    // be expressed in CSS because it ends in a `focus()` call, and says
    // nothing about motion. Under the old scan it could only have been built
    // by moving an unrelated decision into this module.
    //
    // So the guarantee is restated rather than relaxed: the string itself is
    // still this module's alone, and every `matchMedia` caller in the product
    // is listed below with the query it asks — which is what stops the motion
    // decision being re-read under another module's name.
    expect(sourcesMatching(/prefers-reduced-motion/)).toEqual([motionFile]);
    expect(mediaQueryReaders()).toEqual(
      [
        `${motionFile}:(prefers-reduced-motion: reduce)`,
        `${pointerFile}:(pointer: fine)`,
      ].sort(),
    );
  });

  it("is not read a second time in the stylesheet", () => {
    // The mockup suppresses the pulse with a
    // `@media (prefers-reduced-motion: reduce)` block. Doing that here would
    // be two homes for one decision — and CSS cannot express the two JS-timed
    // behaviours Epics 4 and 5 change anyway, so the module has to read the
    // preference regardless and the stylesheet derives from its marker.
    // Comments are stripped before matching, which is what lets the
    // stylesheet explain its own absence.
    expect(styleSheetMatches(/prefers-reduced-motion/)).toEqual([]);
  });

  it("is reading real files, so the two assertions above are not vacuous", () => {
    const files = sources.map(({ file }) => file);
    expect(files).toContain(motionFile);
    expect(files).toContain(path.join("src", "client", "components", "todo-list.tsx"));
    expect(files).toContain(path.join("app", "layout.tsx"));
    // The repository root ships source too, and `middleware.ts` runs before
    // every matched request. A scan that says "anywhere in the product" and
    // cannot see it is not the claim it says it is.
    expect(files).toContain("middleware.ts");
    expect(files.length).toBeGreaterThanOrEqual(20);
    // And the scan finds something when there is something to find. Two
    // homes since Story 3.2, which is the shape the narrowing above admits:
    // the mechanism is shared, the question is not.
    expect(files).toContain(pointerFile);
    expect([...matching(interfaceSources, /useSyncExternalStore/)].sort()).toEqual(
      [motionFile, pointerFile].sort(),
    );
  });
});

// --- AC3/AC4: no second duration declaration anywhere ------------------------

describe("no duration is declared outside this module (AC3, AC4)", () => {
  it("declares every millisecond constant in the product here, bar one", () => {
    const declarations = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/export const ([A-Z][A-Z0-9_]*_MS)\b/g)].map(
        (match) => `${file}:${match[1]}`,
      ),
    );
    // `READ_DEADLINE_MS` is the one exemption and is named rather than
    // pattern-excluded: it is a network deadline, not a motion duration —
    // how long a read may take before it is abandoned (Story 2.2). Nothing
    // animates on it and no second module needs it.
    expect([...declarations].sort()).toEqual(
      [
        `${motionFile}:SKELETON_PULSE_MS`,
        `${motionFile}:DEPARTURE_HOLD_MS`,
        `${motionFile}:COLLAPSE_MS`,
        `${motionFile}:FIRST_RUN_NUDGE_MS`,
        `${motionFile}:COUNTER_FADE_MS`,
        `${path.join("src", "client", "todos", "todo-list-query.ts")}:READ_DEADLINE_MS`,
      ].sort(),
    );
  });

  it("inlines no millisecond literal outside this module", () => {
    // Specifically an `ms`-suffixed number — `400ms`, `1400ms`. That is the
    // spelling a duration arrives in when it is copied out of this module or
    // out of DESIGN.md, and the copy is what goes stale. A bare `1400` and a
    // seconds-suffixed `.24s` are NOT caught here: the first is
    // indistinguishable from any other integer and the second has no
    // occurrence in this codebase to justify the false positives (`15s`
    // already appears in a comment in `todo-list-query.ts`). The named-
    // constant scan above and the timer scan below are what cover a bare
    // number; nothing covers `.24s`, and saying so is better than a comment
    // that claims otherwise.
    const offenders = sources
      .filter(({ file }) => file !== motionFile)
      .flatMap(({ file, source }) =>
        [...source.matchAll(/\b\d+(?:\.\d+)?ms\b/g)].map(
          (match) => `${file}:${match[0]}`,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("schedules no timer of its own anywhere in the interface", () => {
    // A bare `setTimeout(…, 400)` is a duration literal that no constant scan
    // can see, because the number never gets a name. Scoped to `app/` and
    // `src/client/`: AC3 is about components, and a server module scheduling
    // work is not what this rule is for.
    expect(matching(interfaceSources, /\bset(?:Timeout|Interval)\s*\(/)).toEqual([]);
  });

  it("carries no Tailwind motion utility, which would smuggle a duration in", () => {
    // `duration-300`, `delay-150`, `animate-pulse` and `transition` each name
    // a timing Tailwind chose rather than one DESIGN.md did. The skeleton
    // pulse is an `@utility` recipe precisely so its duration stays the
    // module's number.
    expect(matches(markup, /^(duration-|delay-|animate-|transition($|-))/)).toEqual([]);
  });

  it("would catch each of those, so the four assertions above are not vacuous", () => {
    const planted = [
      { file: "planted.ts", source: "export const NUDGE_MS = 600;\n" },
      { file: "planted.ts", source: "const hold = 400;\nsetTimeout(tick, hold);\n" },
      { file: "planted.ts", source: "/* animation: pulse 1400ms linear; */\n" },
    ];
    expect(
      planted.flatMap(({ source }) =>
        [...source.matchAll(/export const ([A-Z][A-Z0-9_]*_MS)\b/g)].map((m) => m[1]),
      ),
    ).toEqual(["NUDGE_MS"]);
    expect(
      planted.filter(({ source }) => /\bset(?:Timeout|Interval)\s*\(/.test(source)),
    ).toHaveLength(1);
    expect(
      planted.flatMap(({ source }) => [...source.matchAll(/\b\d+(?:\.\d+)?ms\b/g)].map((m) => m[0])),
    ).toEqual(["1400ms"]);
    expect(
      matches(
        [{ file: "planted.tsx", source: "", classes: ["md:duration-300", "animate-pulse"] }],
        /^(duration-|delay-|animate-|transition($|-))/,
      ),
    ).toEqual(["planted.tsx:md:duration-300", "planted.tsx:animate-pulse"]);
  });
});

// --- The one behaviour: the hook fails toward stillness ---------------------

describe("useReducedMotion is hydration-safe and defaults to still", () => {
  function Probe() {
    return createElement("i", { "data-still": String(useReducedMotion()) });
  }

  it("reports reduced motion when there is no window to ask", () => {
    // The server snapshot is the whole of the "fail toward stillness" rule.
    // Server markup carries no preference, and the honest answer is unknown,
    // so the snapshot reports the safe unknown rather than the common one: a
    // user who asked for stillness never sees a frame of motion, and everyone
    // else's pulse begins once hydration has re-read the query.
    expect(renderToStaticMarkup(createElement(Probe))).toBe(
      '<i data-still="true"></i>',
    );
  });

  it("would fail if the server snapshot reported motion instead", () => {
    // Mutation-tested rather than asserted twice: returning `false` from
    // `getServerSnapshot` flips the string above, which is the only thing
    // standing between a reduced-motion user and one frame of pulse.
    expect(renderToStaticMarkup(createElement(Probe))).not.toBe(
      '<i data-still="false"></i>',
    );
  });
});
