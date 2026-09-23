import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isCanonicalUuidV7 } from "./todo-id";

// Story 3.1 AC2: a submitted Todo id must be a well-formed UUIDv7 in lowercase
// canonical form. This file is the whole of that criterion's unit coverage; the
// route handler's own tests prove the `400` it produces.
//
// Nothing of the product is imported but the predicate itself. `node:crypto`'s
// `randomUUID()` appears below only as a v4 — a shape this validator must
// refuse — and is the standard library, not a module this unit is coupled to.
//
// There is deliberately no cross-check against a generator here. The generator
// whose output has to survive this predicate is the *client's* Todo-id minting,
// which AD-4 owns and Story 3.3 replaces with the `uuidv7` package; that call
// site does not exist yet. Asserting against `mintIdentityId()` would look like
// the same guard and would not be one: it mints the *Client Identity* id, a
// different generator at a different call site that never reaches this
// validator, so it could keep passing while the id this file exists to check
// was refused. The real cross-check belongs to Story 3.3, next to the generator
// it is about.

const VALID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("isCanonicalUuidV7 — what it accepts", () => {
  it("accepts a lowercase canonical UUIDv7", () => {
    expect(isCanonicalUuidV7(VALID)).toBe(true);
  });

  it.each(["8", "9", "a", "b"])(
    "accepts the RFC 9562 variant nibble %s",
    (nibble) => {
      expect(isCanonicalUuidV7(`${VALID.slice(0, 19)}${nibble}${VALID.slice(20)}`)).toBe(
        true,
      );
    },
  );

  it("accepts every RFC 9562 layout the random bits can produce", () => {
    // What a cross-check against a generator could prove and this proves
    // instead: for a v7, only the version and variant nibbles are constrained,
    // so any generator's output is accepted as long as those two are right. The
    // ids below are assembled from random hex rather than from a generator, so
    // this depends on nothing but RFC 9562 — see the file header for why the
    // generator cross-check is Story 3.3's and not this file's.
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const hexes = (count: number) =>
      Array.from({ length: count }, hex).join("");

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const variant = "89ab"[Math.floor(Math.random() * 4)];
      const candidate = `${hexes(8)}-${hexes(4)}-7${hexes(3)}-${variant}${hexes(3)}-${hexes(12)}`;

      expect(isCanonicalUuidV7(candidate)).toBe(true);
    }
  });

  it("accepts an all-zero random section — nothing here requires entropy", () => {
    expect(isCanonicalUuidV7("00000000-0000-7000-8000-000000000000")).toBe(true);
  });
});

describe("isCanonicalUuidV7 — what it refuses", () => {
  it("refuses a v4, which is the id a careless server would have generated", () => {
    // `randomUUID()` is a v4. AC2's version check is the half that catches an
    // id minted by something other than the product's UUIDv7 generator.
    expect(isCanonicalUuidV7(randomUUID())).toBe(false);
    expect(isCanonicalUuidV7("0199a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b")).toBe(false);
  });

  it.each(["0", "1", "6", "8", "f"])(
    "refuses version nibble %s — only 7 is a UUIDv7",
    (nibble) => {
      expect(
        isCanonicalUuidV7(`${VALID.slice(0, 14)}${nibble}${VALID.slice(15)}`),
      ).toBe(false);
    },
  );

  it.each(["0", "1", "7", "c", "d", "e", "f"])(
    "refuses variant nibble %s — RFC 9562 admits only 8, 9, a and b",
    (nibble) => {
      expect(
        isCanonicalUuidV7(`${VALID.slice(0, 19)}${nibble}${VALID.slice(20)}`),
      ).toBe(false);
    },
  );

  it("refuses uppercase hex, including a single uppercase digit", () => {
    expect(isCanonicalUuidV7(VALID.toUpperCase())).toBe(false);
    expect(isCanonicalUuidV7("0199A1B2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")).toBe(false);
    expect(isCanonicalUuidV7(`${VALID.slice(0, 35)}A${VALID.slice(36)}`)).toBe(
      false,
    );
  });

  it.each([
    ["braces", `{${VALID}}`],
    ["a urn prefix", `urn:uuid:${VALID}`],
    ["no hyphens", VALID.replaceAll("-", "")],
    ["a trailing newline", `${VALID}\n`],
    ["a leading space", ` ${VALID}`],
    ["a trailing space", `${VALID} `],
    ["a truncated last group", VALID.slice(0, -1)],
    ["an extra hex digit", `${VALID}a`],
    ["an empty string", ""],
    ["a non-hex digit", `${VALID.slice(0, 1)}g${VALID.slice(2)}`],
    ["misplaced hyphens", "0199a1b2c-3d4-7e5f-8a9b-0c1d2e3f4a5b"],
  ])("refuses %s", (_case, value) => {
    expect(isCanonicalUuidV7(value)).toBe(false);
  });
});
