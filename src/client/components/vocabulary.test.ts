// The one word this product does not say (epics.md Story 6.3; epic-6-context:
// "the word `Done` must appear nowhere in the product surface or the codebase
// as a filter name, label, tooltip or prose"; UX-DR37).
//
// Eight guards already exist for it — `filter-view.test.ts`,
// `filter-tabs.test.ts`, `todo-row.test.ts`, `delete-dialog.test.ts` and its
// render twin, `error-copy.test.ts`, `use-set-completed.test.ts`,
// `use-delete-todo.test.ts` — and every one of them is scoped to one file or
// one string, with inconsistent case sensitivity between them. None of them
// would notice the word arriving in a file none of them names. This is the
// tree-wide half; `e2e/audit-vocabulary.spec.ts` is the running-product half,
// which is the only one that can see a label composed at runtime.
//
// Two scoping decisions, both deliberate.
//
// **Comments are stripped.** Two shipped modules say the word in order to ban
// it — `src/client/todos/filter-view.ts` and
// `src/client/todos/use-set-completed.ts` — and about a dozen more use "done"
// as ordinary English in a comment ("is done leaving", "a done story's
// guard"). A scan that reads comments convicts exactly the files that document
// the rule. This is the same trap `banned-patterns.test.ts` already solves for
// `<dialog>` and `undo`, and this file borrows its stripper. Only code reaches
// the screen.
//
// **`docs/` is out of scope as a directory, but not by blanket exemption.**
// UX-DR37 bans the word in spec prose and the planning artifacts obey it, but
// those files also carry BMAD's own workflow vocabulary: `status: done` in
// `sprint-status.yaml`, in every spec's frontmatter, and in `epics.md`'s
// progress tables. That is machinery, not product prose, and a scan including
// it would fail on its first line for a reason that has nothing to do with the
// product. `docs/DEPLOY-RUNBOOK.md` is named individually and *is* scanned:
// it carries no workflow vocabulary, it is hand-written operational prose, and
// README.md links a reader straight into it. The exemption is for the
// artifacts, not for the folder.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  readSources,
  readStyleSheets,
  styleSheetMatches,
} from "@/test-support/markup";

const repositoryRoot = process.cwd();

/**
 * The banned word, spelled case-insensitively in the pattern itself.
 *
 * Not `/\bdone\b/i`, because `styleSheetMatches` rebuilds the pattern it is
 * handed as `new RegExp(pattern, "g")` — which keeps the source and drops
 * every flag. A pattern that carries its own case-insensitivity survives that
 * rewrite, so the stylesheet is scanned for the same thing as the source
 * rather than for the lowercase half of it.
 *
 * `\b` on both sides is load-bearing: `abandoned` and `undone` are this
 * repository's ordinary vocabulary and appear in a dozen files. The fixture at
 * the bottom of this file pins both.
 */
const BANNED = String.raw`\b[dD][oO][nN][eE]\b`;
const banned = (): RegExp => new RegExp(BANNED, "g");

/** Only code reaches the browser. `banned-patterns.test.ts`'s stripper. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every `.ts` under `e2e/`, which `readSources()` does not walk. */
function endToEndSources(): { file: string; source: string }[] {
  function walk(directory: string): string[] {
    return readdirSync(path.join(repositoryRoot, directory), {
      withFileTypes: true,
    }).flatMap((entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(relativePath);
      return path.extname(entry.name) === ".ts" ? [relativePath] : [];
    });
  }

  return walk("e2e").map((file) => ({
    file,
    source: readFileSync(path.join(repositoryRoot, file), "utf8"),
  }));
}

/**
 * The hand-written prose this repository ships, scanned **raw**.
 *
 * `code()` is a TypeScript comment stripper, and running Markdown through it
 * silently deletes any line inside a fenced code sample that begins with a
 * double slash — which is exactly where a banned label would be shown off.
 * There is nothing to strip in Markdown anyway: every word in these files is
 * addressed to a reader.
 *
 * `docs/` as a directory stays out (see the header), but these two are not
 * BMAD artifacts — they are operational prose this story wrote, one of them
 * linked from the README, and neither carries `status: done`.
 */
const PROSE = ["README.md", "AGENTS.md", "docs/DEPLOY-RUNBOOK.md"] as const;

/**
 * Everything AC5's source half scans: `app/`, `src/`, the repository root's
 * own `.ts` files (`readSources()`), `e2e/`, and the prose above.
 *
 * `readSources()` already drops `*.test.*`, which is what lets this file
 * write the word out in its own fixtures below without becoming its own first
 * offender. The end-to-end specs are *not* dropped: they are the product's
 * copy written down a second time, and a spec asserting a banned label would
 * mean the label exists.
 */
const scanned: { file: string; source: string }[] = [
  ...[...readSources(), ...endToEndSources()].map(({ file, source }) => ({
    file,
    source: code(source),
  })),
  ...PROSE.map((file) => ({
    file,
    source: readFileSync(path.join(repositoryRoot, file), "utf8"),
  })),
];

/** `file:match` for every hit. */
function hits(): string[] {
  return scanned.flatMap(({ file, source }) =>
    [...source.matchAll(banned())].map(([hit]) => `${file}:${hit}`),
  );
}

describe("the scan is not vacuous", () => {
  it("reads the whole surface AC5 names", () => {
    const files = scanned.map(({ file }) => file);
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain("middleware.ts");
    expect(files).toContain("app/layout.tsx");
    expect(files).toContain("src/client/todos/filter-view.ts");
    expect(files).toContain(path.join("e2e", "journeys.spec.ts"));
    for (const prose of PROSE) expect(files).toContain(prose);
  });

  it("still has the files whose comments say the word, so the strip is exercised", () => {
    // If these two ever stop containing it *before* stripping, the strip is
    // no longer being tested and the whole rationale above has gone stale.
    const raw = (file: string) =>
      readFileSync(path.join(repositoryRoot, file), "utf8");
    expect(raw("src/client/todos/filter-view.ts")).toMatch(banned());
    expect(raw("src/client/todos/use-set-completed.ts")).toMatch(banned());
  });
});

describe("the word appears nowhere in the codebase (AC5, source half)", () => {
  it("is absent from app/, src/, e2e/ and the repository root's own .ts files", () => {
    expect(hits()).toEqual([]);
  });

  it("is absent from the stylesheet", () => {
    // The walk first: an empty result from `styleSheetMatches` is equally
    // what a renamed `globals.css` or a changed `MARKUP_ROOTS` produces, and
    // that reads as a pass.
    expect(readStyleSheets().map(({ file }) => file)).toContain(
      path.join("app", "globals.css"),
    );

    // `styleSheetMatches` strips CSS comments before matching, for the same
    // reason this file strips TypeScript ones — `app/globals.css` discusses
    // the product's decisions at length in prose.
    expect(styleSheetMatches(banned())).toEqual([]);
  });

  it("is absent from the hand-written prose, scanned raw", () => {
    // README.md, AGENTS.md and the deploy runbook: the three documents a
    // reader meets, none of them run through the comment stripper. Asserted
    // separately from the source half because these are the files in this
    // scan a non-developer edits.
    const offenders = scanned
      .filter(({ file }) => (PROSE as readonly string[]).includes(file))
      .flatMap(({ file, source }) =>
        [...source.matchAll(banned())].map(([hit]) => `${file}:${hit}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("the pattern catches the word and spares the vocabulary", () => {
  it("matches every casing of the word itself", () => {
    for (const form of ["Done", "done", "DONE", "dOnE"]) {
      expect(form).toMatch(banned());
    }
    // And in the places it would actually land: a label, a class, a sentence.
    expect('<span>Done</span>').toMatch(banned());
    expect('{ completed: "Done" }').toMatch(banned());
    expect("Mark it done.").toMatch(banned());
  });

  it("spares `abandoned` and `undone`, which this repository says in earnest", () => {
    // Both contain the four letters and neither is the banned word. Without
    // the word boundaries this scan would report a dozen files on its first
    // run and would have been loosened instead of trusted.
    for (const ordinary of [
      "abandoned",
      "Abandoned",
      "undone",
      "leaves it undone",
      "the request was abandoned",
      "doneness",
      "predone",
    ]) {
      expect(ordinary).not.toMatch(banned());
    }
  });

  it("would report a real occurrence in a real file", () => {
    // The end-to-end shape of the scan, run against a fixture rather than
    // against the tree, so the empty result above means the tree is clean and
    // not that the machinery is broken.
    const offender = [
      { file: "fixture.tsx", source: code('const LABEL = "Done";') },
    ];
    expect(
      offender.flatMap(({ file, source }) =>
        [...source.matchAll(banned())].map(([hit]) => `${file}:${hit}`),
      ),
    ).toEqual(["fixture.tsx:Done"]);
  });

  it("would not report it from a comment, which is the point of the strip", () => {
    const commented = [
      { file: "fixture.ts", source: code('// The word `Done` is banned.\nconst a = 1;') },
      { file: "fixture2.ts", source: code('/* Never say Done here. */\nconst b = 2;') },
    ];
    expect(
      commented.flatMap(({ source }) => [...source.matchAll(banned())]),
    ).toEqual([]);
  });
});
