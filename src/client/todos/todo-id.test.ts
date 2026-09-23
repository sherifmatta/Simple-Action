import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mintTodoId } from "./todo-id";

// Covers epics.md Story 3.3 AC1 and AC2, and closes the `deferred-work.md`
// entry recording that "the `id DESC` ordering scheme rests on UUIDv7 being
// time-ordered, which is asserted in AD-5, `listTodos`, `useTodos` and
// `todo-list-query.ts` and tested nowhere".
//
// The assertion that closes it is the last one here, and its shape is the
// whole point: it sorts ids that came out of the *product's own* minting
// function with the *product's own* comparison, rather than hand-built ids
// that differ where the test author chose to differ them. `todos.test.ts`
// proves Postgres's `ORDER BY`; nothing proved the scheme that order relies
// on.
//
// The canonical form is restated here rather than imported from
// `src/server/validation/todo-id.ts`, which is the shape the client mints
// *for*: `eslint.config.mjs` walls client code off from `src/server/` and a
// test is not an exception to a dependency graph. What keeps the two honest
// is that they are both RFC 9562 §4 written out — version nibble `7`, variant
// bits `10`, lowercase hex — and that `route.test.ts` owns the other side of
// the handshake, where a real request meets the real validator.

const MODULE_FILE = path.join("src", "client", "todos", "todo-id.ts");

/** Lowercase canonical UUIDv7: 8-4-4-12 hex, version `7`, variant `10`. */
const CANONICAL_UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("mintTodoId (AC1, AC2)", () => {
  it("mints the lowercase canonical UUIDv7 the route handler accepts", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const id = mintTodoId();
      expect(id, id).toMatch(CANONICAL_UUID_V7);
      expect(id).toBe(id.toLowerCase());
    }
  });

  it("never mints the same id twice", () => {
    const ids = Array.from({ length: 500 }, mintTodoId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders two ids minted in the same millisecond correctly under `id DESC` (AC1, AC2)", () => {
    // The case a non-monotonic generator gets wrong, and the one AD-5 rests
    // on. Two ids share a millisecond exactly when they share the leading
    // 48-bit timestamp field — the first 13 characters of the canonical form,
    // hyphen included — so the pair is *found* rather than assumed. Asserting
    // "less than 2ms elapsed" instead would be flaky on a loaded machine and
    // vacuous at exactly 1ms, where the two ids may legitimately straddle a
    // boundary and the property goes untested while the test passes.
    let first = mintTodoId();
    let second = mintTodoId();
    for (let attempt = 0; attempt < 1000 && first.slice(0, 13) !== second.slice(0, 13); attempt += 1) {
      first = second;
      second = mintTodoId();
    }
    expect(first.slice(0, 13), "no two mints landed in the same millisecond").toBe(
      second.slice(0, 13),
    );

    // The product's sort, spelled the way `merge-todo-list.ts` spells it: a
    // string comparison, descending.
    expect([first, second].sort((left, right) => (left < right ? 1 : -1))).toEqual([
      second,
      first,
    ]);
  });

  it("orders ids minted across a millisecond boundary the same way", async () => {
    const first = mintTodoId();
    await new Promise((resolve) => {
      setTimeout(resolve, 3);
    });
    const second = mintTodoId();

    expect(second > first).toBe(true);
  });

  it("uses the pinned package rather than a second generator", () => {
    // AC2's first half, and the reason the local stand-in in
    // `identity-token.ts` was deleted in the same change: the guarantee above
    // is the package's, and a test proving it about a function that quietly
    // stopped calling the package would prove nothing.
    const source = readFileSync(path.join(process.cwd(), MODULE_FILE), "utf8");
    expect(source).toMatch(/^import \{ uuidv7 \} from "uuidv7";$/m);
    expect(source).not.toMatch(/getRandomValues/);
  });
});
