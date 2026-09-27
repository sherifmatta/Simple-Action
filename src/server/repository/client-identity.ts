// Repository functions for the Client Identity (AD-2, AD-7).
//
// This module's whole surface: a lookup by token hash and a create. Story 1.6's
// middleware calls both — resolve the identity the cookie carries, or mint one
// when the browser has none. The Todo functions live beside it in `todos.ts`,
// each arriving with the story that consumes it — `listTodos` with Story 2.1,
// `createTodo`, `setTodoCompleted` and `deleteTodo` with Epics 3 through 5 —
// and each taking `ownerId` as its first parameter (AD-2).
//
// `client_identity` is not an owned resource — it *is* the owner — so the
// `ownerId`-first rule does not apply to these two.
//
// The raw token never reaches this module. Hashing lives in
// `src/server/identity/` (Story 1.6); only the SHA-256 hash is stored, per AD-7.
import { eq } from "drizzle-orm";
import { clientIdentity } from "@/server/db/schema";
import { db } from "./client";

// The projection, named once. Every query in this module selects these columns
// explicitly and never `select()`, so `token_hash` cannot reach a result object
// at all — the column stays in `WHERE` clauses, which is the one place it
// belongs. This mirrors `todos.ts`'s `wireColumns` and exists for the stronger
// version of the same reason: `token_hash` is the SHA-256 of a live session
// credential, and `resolveClientIdentity` hands whatever this module returns to
// every route handler as `identity`. A bare `select()` puts that hash one
// `Response.json(identity)` away from the wire.
const identityColumns = {
  id: clientIdentity.id,
  createdAt: clientIdentity.createdAt,
};

/**
 * A stored Client Identity, as it leaves this module — never its token hash.
 *
 * Derived from the schema rather than spelled out, so a new column appears here
 * only when someone adds it to `identityColumns` deliberately.
 */
export type ClientIdentity = Pick<typeof clientIdentity.$inferSelect, "id" | "createdAt">;

/**
 * The Client Identity carrying `tokenHash`, or `undefined` when no row does.
 *
 * Absence is a normal result, not a failure: middleware calls this on every
 * document request, and "this browser has no identity yet" is the ordinary
 * first-visit path.
 *
 * @param tokenHash SHA-256 hash of the cookie token — already hashed by the caller.
 */
export async function findClientIdentityByTokenHash(
  tokenHash: string,
): Promise<ClientIdentity | undefined> {
  const rows = await db
    .select(identityColumns)
    .from(clientIdentity)
    .where(eq(clientIdentity.tokenHash, tokenHash))
    .limit(1);

  return rows.at(0);
}

/**
 * Stores a new Client Identity and returns the created row.
 *
 * The id is minted by the caller — `schema.ts` gives neither primary key a
 * DB-generated default. A `tokenHash` already stored rejects on the unique
 * constraint rather than silently no-opping; the caller sees the error.
 *
 * @param id Server-minted UUID for the new identity.
 * @param tokenHash SHA-256 hash of the cookie token — already hashed by the caller.
 */
export async function createClientIdentity(
  id: string,
  tokenHash: string,
): Promise<ClientIdentity> {
  const [created] = await db
    .insert(clientIdentity)
    .values({ id, tokenHash })
    .returning(identityColumns);

  return created;
}
