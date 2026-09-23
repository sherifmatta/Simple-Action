import { describe, expect, it } from "vitest";
import { readSources } from "@/test-support/markup";
import type { ErrorKind } from "@/shared/contract/errors";
import { ERROR_COPY, RETRY_LABEL } from "./error-copy";

// Covers epics.md Story 2.6 AC3, and the half of AD-10 that lives on the
// client: "the client maps `kind` to the user-facing string ... and never
// composes or forwards a server message to the interface".
//
// The strings are transcribed here a second time on purpose. A test that read
// them from `ERROR_COPY` would assert that the module equals itself; these are
// EXPERIENCE.md:72-79's own bytes, so a typo in the module fails rather than
// propagating. That is the same reason `app/globals.test.ts` retypes DESIGN.md's
// token values instead of importing the theme.

const KINDS: ErrorKind[] = ["load", "create", "update", "delete"];

describe("the four kinds map to EXPERIENCE.md's three strings", () => {
  it("says exactly what EXPERIENCE.md says, character for character", () => {
    expect(ERROR_COPY).toEqual({
      load: "Couldn't load your Todos.",
      create: "Couldn't add that Todo.",
      update: "Couldn't save that change.",
      delete: "Couldn't save that change.",
    });
  });

  it("covers every kind the contract has", () => {
    // AC1's "all four kinds modelled from the outset" reaches the copy too:
    // three of these have no producer until Epics 3 through 5, and a map
    // grown a kind at a time is how a second mapping appears.
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(ERROR_COPY[kind], kind).toMatch(/^Couldn't .+\.$/);
    }
  });

  it("gives a toggle and a delete one string, and the other two their own", () => {
    // EXPERIENCE.md:87 — the strings "split where the recovery splits", not
    // one per operation. Asserting the collision is what stops someone
    // "fixing" it into four.
    expect(ERROR_COPY.update).toBe(ERROR_COPY.delete);
    expect(new Set(Object.values(ERROR_COPY)).size).toBe(3);
    expect(ERROR_COPY.load).not.toBe(ERROR_COPY.create);
  });

  it("labels the control with the one word DESIGN.md gives it", () => {
    expect(RETRY_LABEL).toBe("Retry");
  });

  it("writes in the product's voice", () => {
    // EXPERIENCE.md's Do/Don't table: state the fact, then stop. No
    // exclamation marks, no emoji, no "Oops", no reassurance.
    for (const string of [...Object.values(ERROR_COPY), RETRY_LABEL]) {
      expect(string, string).not.toMatch(/[!?]/);
      expect(string, string).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(string, string).not.toMatch(/\b(oops|sorry|please|whoops)\b/i);
    }
  });

  it("never says Done, anywhere", () => {
    // epic-2-context: the word is banned everywhere, identifiers and tooltips
    // included.
    for (const string of Object.values(ERROR_COPY)) {
      expect(string.toLowerCase(), string).not.toContain("done");
    }
  });
});

describe("no server message reaches the interface (AD-10)", () => {
  it("is the only place a user-facing error string is written", () => {
    // The wall the mapping exists to be. A component that rendered
    // `error.message` would show "The Todo load request failed." — the
    // diagnostic string `TodoRequestError` builds from the kind, which is not
    // copy and was never reviewed as copy.
    const offenders = readSources()
      .filter(({ file }) => file.startsWith("app/") || file.startsWith("src/client/"))
      .filter(({ source }) => /\{\s*\w*(?:[Ee]rror|failure)\w*\.message\s*\}/.test(source))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("holds the strings in one module, not at their call sites", () => {
    // Comments stripped first, as `announcer.test.ts` does it. `error-banner.tsx`
    // quotes the load string in prose explaining what a stale banner looks
    // like, and a sentence about a string is not a second copy of it — only a
    // string literal the product could render is.
    const withoutComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    const declarations = readSources().filter(
      ({ file, source }) =>
        file !== "src/client/feedback/error-copy.ts" &&
        withoutComments(source).includes("Couldn't load your Todos."),
    );

    expect(declarations.map(({ file }) => file)).toEqual([]);
  });
});
