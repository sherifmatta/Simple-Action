import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../providers";
import { AnnouncerProvider } from "./announcer";

import {
  liveRegionText,
  nextAnnouncement,
  SILENCE,
  type Announcement,
} from "./announcement";

// Covers epics.md Story 1.7 AC2 ("exactly one polite live region and exactly
// one assertive live region exist") and AC3 ("no component declares aria-live;
// announcing is done by calling the single announce(message, urgency)
// function"), plus the announcement values those regions render.
//
// Both ACs are claims about the *whole codebase*, not about one render, and
// `vitest.config.mts:30` runs under `environment: "node"` with no DOM, so they
// are proved the way `app/layout.test.ts` proves the font swap: by parsing the
// real TypeScript AST, and by scanning the tree the way
// `src/server/repository/client-identity.test.ts:227-260` scans it.
//
// The lint rule in `eslint.config.mjs` is the wall — including the implicit
// live regions (`role="alert" | "status" | "log"`), which carry an implied
// `aria-live` in ARIA and which this textual scan does not see. This scan is
// the complementary proof: that the wall's exemption is where it is supposed
// to be, that `aria-live` reaching the DOM through a string escapes neither,
// and that the announcer has not quietly grown a third region.

const repositoryRoot = process.cwd();
const ANNOUNCER_FILE = path.join("src", "client", "feedback", "announcer.tsx");

describe("announcement values", () => {
  it("starts silent, so an unused region announces nothing on mount", () => {
    expect(liveRegionText(SILENCE)).toBe("");
  });

  it("renders the message it was given", () => {
    expect(liveRegionText(nextAnnouncement(SILENCE, "Todo added"))).toBe(
      "Todo added",
    );
  });

  it("changes the rendered text when the same message is announced twice, so a screen reader re-reads it", () => {
    const first = nextAnnouncement(SILENCE, "Todo added");
    const second = nextAnnouncement(first, "Todo added");
    expect(liveRegionText(second)).not.toBe(liveRegionText(first));
  });

  it("changes it back on the third identical announcement, and never accumulates", () => {
    let announcement: Announcement = SILENCE;
    const rendered: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      announcement = nextAnnouncement(announcement, "Todo added");
      rendered.push(liveRegionText(announcement));
    }
    // Alternates between exactly two forms, and neither grows.
    expect(new Set(rendered).size).toBe(2);
    for (const text of rendered) {
      expect(text.trimEnd()).toBe("Todo added");
      expect(text.length).toBeLessThanOrEqual("Todo added".length + 1);
    }
  });

  it("adds nothing a screen reader would voice — the only added character is U+00A0", () => {
    const once = liveRegionText(nextAnnouncement(SILENCE, "Todo added"));
    const twice = liveRegionText(
      nextAnnouncement(nextAnnouncement(SILENCE, "Todo added"), "Todo added"),
    );
    const added = [once, twice].map((text) => text.replace("Todo added", ""));
    expect(added.sort()).toEqual(["", " "]);
  });

  it("does not carry a previous message's text into the next announcement", () => {
    const first = nextAnnouncement(SILENCE, "Todo added");
    expect(
      liveRegionText(nextAnnouncement(first, "Todo deleted")).trimEnd(),
    ).toBe("Todo deleted");
  });
});

// --- The live regions themselves --------------------------------------------

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Every literal `aria-live="…"` value declared as a JSX attribute. */
function ariaLiveValues(sourceFile: ts.SourceFile): string[] {
  const values: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === "aria-live"
    ) {
      const initializer = node.initializer;
      values.push(
        initializer && ts.isStringLiteral(initializer)
          ? initializer.text
          : "<non-literal>",
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return values;
}

describe("AD-12 — exactly two live regions, both in the announcer (AC2)", () => {
  const source = readFileSync(
    path.join(repositoryRoot, ANNOUNCER_FILE),
    "utf8",
  );
  const values = ariaLiveValues(parse(ANNOUNCER_FILE, source));

  it("declares exactly one polite and exactly one assertive region, and nothing else", () => {
    expect(values.sort()).toEqual(["assertive", "polite"]);
  });

  it("is a Client Component, because React context is unavailable in Server Components", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("renders both regions unconditionally, so neither is inserted at the moment its text arrives", () => {
    // A region created in the same commit as its text is not announced by most
    // screen readers. A ternary or `&&` immediately around an `aria-live`
    // element is the shape that introduces that bug.
    expect(source).not.toMatch(/[?&]{1,2}[^\n]*<\w+[^>]*aria-live/);
  });

  it("finds the regions by parsing, so the scan below cannot pass vacuously", () => {
    expect(values).toHaveLength(2);
  });
});

// --- Nothing else in the tree declares one ----------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  ".git",
  ".claude",
  ".vercel",
  "coverage",
  "drizzle",
  "docs",
  "public",
  "_bmad",
]);

// Both of these carry `aria-live` as assertion *data* rather than declaring a
// region: this file's own expectations, and the ESLint fixtures that prove the
// rule rejects it. `eslint.config.test.ts` gets the same exemption in
// `client-identity.test.ts`, for the same reason.
const SCAN_EXEMPT_FILES = new Set([
  "eslint.config.test.ts",
  path.join("src", "client", "feedback", "announcer.test.ts"),
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(repositoryRoot, directory || "."), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = directory
      ? path.join(directory, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : sourceFiles(relativePath);
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
    if (SCAN_EXEMPT_FILES.has(relativePath)) return [];
    return [relativePath];
  });
}

// Comments are stripped before the scan, the way `contract.test.ts` strips
// them: `app/layout.tsx` and `announcement.ts` both *discuss* `aria-live` in
// prose, and prose about a live region is not a live region. Matching the
// bare word would flag every file that explains the rule — including the rule
// itself in `eslint.config.mjs` — and a scan that cries wolf gets deleted.
//
// What remains must then look like a declaration (`aria-live="polite"`,
// `"aria-live": "polite"`), not a mention. That is the shape the ESLint rule
// denies, so the two agree on what a violation is.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const ARIA_LIVE_DECLARATIONS = [
  // `aria-live="polite"`, `aria-live={urgency}`, `"aria-live": "polite"`.
  /["']?aria-live["']?\s*[=:]/,
  // `el.setAttribute("aria-live", "polite")` — the imperative spelling, where
  // the name is an argument and what follows it is a comma.
  /setAttribute\(\s*["']aria-live["']/,
];

function declaresAriaLive(source: string): boolean {
  const code = withoutComments(source);
  return ARIA_LIVE_DECLARATIONS.some((pattern) => pattern.test(code));
}

describe("AD-12 — no component declares its own aria-live (AC3)", () => {
  const files = sourceFiles("");

  it("walks the real tree, so an empty result would mean a broken scan", () => {
    expect(files).toContain(ANNOUNCER_FILE);
    expect(files).toContain(path.join("app", "layout.tsx"));
    expect(files.length).toBeGreaterThan(10);
  });

  it("finds a declared `aria-live` nowhere but the announcer", () => {
    const declaring = files.filter(
      (file) =>
        file !== ANNOUNCER_FILE &&
        declaresAriaLive(readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    expect(
      declaring,
      `aria-live must exist only in ${ANNOUNCER_FILE}; found in ${JSON.stringify(declaring)}`,
    ).toEqual([]);
  });

  it("would catch an explicitly declared region in any of its spellings, so the empty result above means something", () => {
    // Negative fixtures, the convention `eslint.config.test.ts` and
    // `app/layout.test.ts` both follow: an assertion that only ever runs
    // against passing input proves nothing about what it would reject.
    //
    // Scope, stated honestly: this scan sees the literal token `aria-live`.
    // The *implicit* live regions — `role="alert" | "status" | "log"` — carry
    // an implied `aria-live` in ARIA and would not appear here; they are
    // walled by `noAriaLive` in eslint.config.mjs instead, with fixtures in
    // eslint.config.test.ts. Neither wall can see a region assembled at
    // runtime from string fragments.
    for (const violating of [
      `export const Probe = () => <div aria-live="polite" />;`,
      `export const Probe = () => <div aria-live={urgency} />;`,
      `export const probe = { "aria-live": "assertive" };`,
      `export const probe = createElement("div", { "aria-live": "polite" });`,
      `node.setAttribute("aria-live", "polite");`,
    ]) {
      expect(declaresAriaLive(violating), violating).toBe(true);
    }
  });

  it("does not flag prose about the rule, which is why the real files above pass", () => {
    for (const mentioning of [
      `// No component declares its own aria-live — call announce() instead.`,
      `/* aria-live="off" is the absence of an announcement, not a kind. */`,
      `const message = "AD-12: no component declares its own aria-live.";`,
    ]) {
      expect(declaresAriaLive(mentioning), mentioning).toBe(false);
    }
  });

  it("would catch a second region added to the announcer's own directory", () => {
    // Anti-vacuity for the filter above: the scan reads every sibling module,
    // not just the ones that happen to exist today.
    const siblings = files.filter((file) =>
      file.startsWith(path.join("src", "client", "feedback") + path.sep),
    );
    expect(siblings.length).toBeGreaterThan(1);
  });
});

describe("the announcer is the only announcing surface", () => {
  it("exports the hook and the provider, and nothing that writes to a region directly", () => {
    const source = readFileSync(
      path.join(repositoryRoot, ANNOUNCER_FILE),
      "utf8",
    );
    const exported = [...source.matchAll(/^export (?:function|const) (\w+)/gm)]
      .map((match) => match[1])
      .sort();
    expect(exported).toEqual(["AnnouncerProvider", "useAnnounce"]);
  });
});

// --- The rendered DOM, not just the source ----------------------------------
//
// AC2 is literally "Given the mounted root, When **the DOM is inspected**".
// Every assertion above reads source text, which cannot see a region that is
// rendered conditionally, mounted twice, or dropped by the provider.
//
// `react-dom/server` renders to an HTML string with no `document`, so the real
// output is inspectable under `environment: "node"` without adding jsdom —
// which `vitest.config.mts:30-32` deliberately has not installed. The
// components are built with `createElement` rather than JSX so this stays a
// `.test.ts` and needs no change to the include globs.

describe("AD-12 — the rendered DOM carries exactly two live regions (AC2)", () => {
  const liveRegions = (html: string) =>
    [...html.matchAll(/aria-live="(\w+)"/g)].map((match) => match[1]).sort();

  it("renders one polite and one assertive region around its children", () => {
    const html = renderToStaticMarkup(
      createElement(
        AnnouncerProvider,
        null,
        createElement("p", null, "the app"),
      ),
    );
    expect(liveRegions(html)).toEqual(["assertive", "polite"]);
    expect(html).toContain("<p>the app</p>");
  });

  it("renders both regions empty, so nothing is announced on first paint", () => {
    const html = renderToStaticMarkup(createElement(AnnouncerProvider, null));
    expect(html).toMatch(/<div aria-live="polite"[^>]*><\/div>/);
    expect(html).toMatch(/<div aria-live="assertive"[^>]*><\/div>/);
  });

  it("hides both regions visually while leaving them to screen readers", () => {
    const html = renderToStaticMarkup(createElement(AnnouncerProvider, null));
    // `sr-only`, not `hidden` / `display:none` — a hidden live region is not
    // announced at all.
    expect(html.match(/class="sr-only"/g)).toHaveLength(2);
    expect(html).not.toMatch(/aria-hidden="true"[^>]*aria-live/);
  });

  it("the whole shell still yields exactly two regions, not four", () => {
    const html = renderToStaticMarkup(
      createElement(AppProviders, null, createElement("main", null)),
    );
    expect(liveRegions(html)).toEqual(["assertive", "polite"]);
  });

  it("refuses a second AnnouncerProvider rather than rendering four regions", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(
          AnnouncerProvider,
          null,
          createElement(AnnouncerProvider, null),
        ),
      ),
    ).toThrow(/already mounted/);
  });
});
