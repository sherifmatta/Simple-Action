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

/** A stored Client Identity row, as the schema defines it. */
export type ClientIdentity = typeof clientIdentity.$inferSelect;

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
    .select()
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
    .returning();

  return created;
}
