// The client's `kind` -> string map (AD-10, epics.md Story 2.6 AC3).
//
// AD-10 puts this mapping on the client and says where: "the client maps
// `kind` to the user-facing string from EXPERIENCE.md §Voice and Tone ... and
// never composes or forwards a server message to the interface". The server's
// `message` is diagnostic (`src/shared/contract/errors.ts`), and nothing in
// this file reads one — a failure classifies itself by the operation that was
// attempted, and the operation is all this map needs.
//
// Pure values, no React, for the reason `error-slot-state.ts` gives beside
// `error-slot.tsx`: the suite is `environment: "node"` (vitest.config.mts:34),
// so a table proved here needs no DOM.
//
// All four kinds are present even though only `load` is reachable in this
// epic, which is the same doctrine that seeded the error slot complete in
// Story 1.7 and the motion module complete in Story 2.5. Epics 3 through 5
// each raise one of the other three; a map grown a kind at a time is how a
// second mapping appears the first day two of those epics run in parallel.

import type { ErrorKind } from "@/shared/contract/errors";

/**
 * What the banner says, per error kind.
 *
 * Four kinds, three strings, and the collision is deliberate rather than an
 * oversight to be tidied later. EXPERIENCE.md:87 gives the reason in full: a
 * failed toggle and a failed delete share a string "because they share a
 * shape — an existing Todo the user acted on, restored on screen to what it
 * was", whereas a failed load describes an operation that saved nothing and a
 * failed add describes a creation that never completed. The strings split
 * where the *recovery* splits, not one per operation for its own sake.
 *
 * `Record<ErrorKind, string>` rather than a partial map or a function with a
 * default: adding a fifth kind to the contract should fail to compile here
 * rather than silently fall through to someone else's sentence.
 */
export const ERROR_COPY: Record<ErrorKind, string> = {
  load: "Couldn't load your Todos.",
  create: "Couldn't add that Todo.",
  update: "Couldn't save that change.",
  delete: "Couldn't save that change.",
};

/**
 * The banner's one control (EXPERIENCE.md:76-79, DESIGN.md:426).
 *
 * One word, and it is the same word for every kind — what `Retry` re-attempts
 * varies by the slot's closure, never by its label.
 */
export const RETRY_LABEL = "Retry";
