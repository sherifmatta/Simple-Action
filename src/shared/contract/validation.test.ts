import { describe, expect, it } from "vitest";
import * as validation from "./validation";
import { TODO_TEXT_MAX_LENGTH, isValidTodoText } from "./validation";

// Matrix rows covered here (spec-1-5-define-the-shared-contract.md, frozen
// `## I/O & Edge-Case Matrix`):
//   - "Valid text"
//   - "Empty string"
//   - "Whitespace only"
//   - "Single character"
//   - "Exactly at the cap"
//   - "Over the cap"
//   - "Passes only after trimming"
//   - "Fails even after trimming"
// The remaining rows are static assertions about the exported types and the
// rest of the tree; they live in `contract.test.ts`.
//
// Nothing here needs `DATABASE_URL` or a network: the module is two exports and
// a pure function.

const repeat = (count: number) => "a".repeat(count);

describe("src/shared/contract/validation.ts — the exported surface (AC3)", () => {
  it("exports exactly the cap and the predicate", () => {
    expect(Object.keys(validation).sort()).toEqual([
      "TODO_TEXT_MAX_LENGTH",
      "isValidTodoText",
    ]);
  });

  it("caps Todo text at 500 characters", () => {
    expect(TODO_TEXT_MAX_LENGTH).toBe(500);
  });
});

describe("isValidTodoText — accepts (AC5)", () => {
  it("accepts ordinary text (matrix row 'Valid text')", () => {
    expect(isValidTodoText("Buy milk")).toBe(true);
  });

  it("accepts a single character (matrix row 'Single character')", () => {
    expect(isValidTodoText("a")).toBe(true);
  });

  it("accepts exactly 500 characters — the cap is inclusive (matrix row 'Exactly at the cap')", () => {
    expect(isValidTodoText(repeat(TODO_TEXT_MAX_LENGTH))).toBe(true);
  });

  it("accepts 500 characters wrapped in spaces — the cap is on the trimmed length (matrix row 'Passes only after trimming')", () => {
    const padded = ` ${repeat(TODO_TEXT_MAX_LENGTH)} `;

    expect(padded.length).toBe(TODO_TEXT_MAX_LENGTH + 2);
    expect(isValidTodoText(padded)).toBe(true);
  });
});

describe("isValidTodoText — rejects (AC5)", () => {
  it("rejects the empty string (matrix row 'Empty string')", () => {
    expect(isValidTodoText("")).toBe(false);
  });

  it("rejects whitespace only — empty after trim (matrix row 'Whitespace only')", () => {
    expect(isValidTodoText("   \n\t ")).toBe(false);
  });

  it("rejects 501 characters (matrix row 'Over the cap')", () => {
    expect(isValidTodoText(repeat(TODO_TEXT_MAX_LENGTH + 1))).toBe(false);
  });

  it("rejects 501 characters wrapped in spaces — trimming does not save it (matrix row 'Fails even after trimming')", () => {
    expect(isValidTodoText(` ${repeat(TODO_TEXT_MAX_LENGTH + 1)} `)).toBe(false);
  });

  it("rejects a NUL code point, which Postgres cannot store in a `text` column", () => {
    // Without this the value passes the predicate, reaches the insert as a
    // bound parameter, and is refused by the database — turning a caller error
    // into a 500 where 400 is the honest answer. The length rule does not catch
    // it: "a\u0000b" trims to three characters.
    expect(isValidTodoText("a\u0000b")).toBe(false);
    expect(isValidTodoText("\u0000")).toBe(false);
  });

  it("still accepts the whitespace a person can actually type", () => {
    // The rule is deliberately NUL and nothing else. `isValidTodoText` also
    // gates the input component (`add-input.tsx`), so a wider control-character
    // rule would turn an ordinary multi-line paste into a silent no-op.
    expect(isValidTodoText("line one\nline two")).toBe(true);
    expect(isValidTodoText("a\tb")).toBe(true);
    expect(isValidTodoText("a\r\nb")).toBe(true);
  });
});

describe("isValidTodoText — the verdict is all it returns", () => {
  it("hands back a boolean, never the trimmed string — persisting the trim is the server's job", () => {
    expect(typeof isValidTodoText("  Buy milk  ")).toBe("boolean");
  });
});
