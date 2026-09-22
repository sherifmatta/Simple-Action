// The Todo wire shape — the single definition of what a Todo looks like as
// JSON, imported by route handlers and query hooks alike (AD-3, epics.md Story
// 1.5 AC1). Neither side declares its own; `contract.test.ts` scans the tree to
// keep that true.
//
// Hand-written rather than derived from the Drizzle schema, for two reasons:
// `eslint.config.mjs` forbids `src/shared/` from importing `@/server/**`, and
// the two shapes genuinely differ. `createdAt` is a `Date` in the table and an
// ISO-8601 UTC string here (SPINE "Dates"), and `owner_id` is a column that is
// never a wire field — ownership stays server-side (AD-7).
//
// Validated at the type level only: the client trusts the server's JSON, which
// is what the dependency graph's "types only" contract edges describe. One
// deployable serves both sides and the server builds its responses from this
// same type.
export type Todo = {
  /** UUIDv7, lowercase canonical form. Minted by the client (AD-4). */
  id: string;
  /** The Todo's copy, as the person typed it, trimmed by the server. */
  text: string;
  /** The Completion Status, as a boolean (SPINE glossary). */
  completed: boolean;
  /** ISO-8601 UTC string, server-set. Display metadata, never a sort key (AD-5). */
  createdAt: string;
};
