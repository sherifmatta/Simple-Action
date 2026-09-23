// The Todo's id, minted in the browser (AD-4, AD-5; epics.md Story 3.3 AC1,
// AC2).
//
// AD-4 has the client mint the id and the server never generate one, which is
// what makes merge-by-id literally true and a retried create idempotent
// rather than duplicating. AD-5 then makes that id the sort key, so the id
// carries the row's position as well as its identity: a UUIDv7's leading 48
// bits are big-endian Unix milliseconds, so `id DESC` is newest-first and an
// optimistic row's place in the list is settled the moment the user presses
// Enter — nothing re-sorts when the server answers.
//
// Both properties rest on the generator, which is why this is the package and
// not a local implementation. Two Todos created in the same millisecond share
// all 48 timestamp bits, and only a *monotonic* generator guarantees the
// second one still sorts after the first; `uuidv7`'s module-level generator
// is that single instance (RFC 9562 §6.2 method 1, the package's own
// counter), and calling `uuidv7()` rather than constructing a `V7Generator`
// is what keeps it single. A hand-written stand-in is what this replaces —
// `identity-token.ts` carried one, and two generators in one repository is
// the drift `deferred-work.md` recorded.

import { uuidv7 } from "uuidv7";

/** A fresh Todo id: lowercase canonical UUIDv7, time-ordered and monotonic. */
export function mintTodoId(): string {
  return uuidv7();
}
