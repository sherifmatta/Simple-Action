// The server's check on a client-minted Todo id (AD-4, epics.md Story 3.1 AC2).
//
// Ids are minted in the browser and arrive over the wire, so the id is caller
// input like any other field and is re-checked here as a trust boundary — the
// same posture `src/shared/contract/validation.ts` describes for the text.
//
// Hand-written rather than imported, for three reasons. The `uuidv7` package
// exports a generator and no validator, so it would not satisfy AC2 even once
// Story 3.3 installs it. Postgres's own `uuid` type accepts a v4 and normalises
// case, so letting the column decide would satisfy neither half of AC2 and
// would move the refusal from a `400` to a driver error. And it cannot live in
// `src/shared/contract/`: `contract.test.ts` pins that directory to exactly
// three modules and their two test files.
//
// Server-side only on purpose. The client mints its own ids through one
// generator and never needs to validate what it just produced; what needs
// checking is what crosses the wire.

/**
 * Whether `value` is a UUIDv7 in lowercase canonical form.
 *
 * RFC 9562 layout, anchored end to end:
 *
 *   - 8-4-4-4-12 lowercase hex, hyphen-separated — so `{braces}`, a
 *     `urn:uuid:` prefix, an unhyphenated string and any other length are all
 *     refused by the anchors rather than by a case of their own;
 *   - the version nibble (first of the third group) is `7`, which is what
 *     rejects the v4 that `randomUUID()` produces;
 *   - the variant nibble (first of the fourth group) is `8`, `9`, `a` or `b`,
 *     the RFC 9562 `10x` variant.
 *
 * Lowercase is required rather than normalised. A Todo id is the idempotency
 * key of its create (AC3) and Postgres's `uuid` type compares two spellings of
 * the same id as equal, so accepting both would let one Todo hold two spellings
 * across the client cache and the wire while the database saw one row.
 *
 * `$` in JavaScript matches the end of input and not the end of a line, so a
 * trailing newline is refused too.
 */
export function isCanonicalUuidV7(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
