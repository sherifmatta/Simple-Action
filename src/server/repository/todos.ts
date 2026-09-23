// Repository functions for the Todo (AD-2, AD-5).
//
// The first Todo module. `setTodoCompleted` joined it with Story 4.1 and
// `deleteTodo` arrives in Epic 5, as `createTodo` did with Story 3.1; all of
// them take `ownerId` first (AD-2), because a Todo is an owned resource and a
// query that forgets the owner returns somebody else's list.
//
// These functions return the wire `Todo` shape rather than the Drizzle row,
// which is a deliberate departure from `client-identity.ts`. A Client Identity
// never crosses the wire; a Todo always does, and its row carries `owner_id` —
// the one field AD-7 keeps server-side. Projecting here means the row never
// leaves this module, so `owner_id` cannot reach the browser by someone
// spreading a result object into a response. The `Date` -> ISO-8601 conversion
// (SPINE "Dates") lands in the same place for the same reason: one conversion
// site rather than one per route handler.
import { and, desc, eq } from "drizzle-orm";
import { todo } from "@/server/db/schema";
import type { Todo } from "@/shared/contract/todo";
import { db } from "./client";

// The wire projection, named once. Every query in this module selects these
// four columns explicitly and never `select()`, so `owner_id` cannot reach a
// result object at all — the column stays in `WHERE` clauses, which is the one
// place AD-7 lets it appear.
const wireColumns = {
  id: todo.id,
  text: todo.text,
  completed: todo.completed,
  createdAt: todo.createdAt,
};

// The single `Date` -> ISO-8601 conversion site (SPINE "Dates"). Its parameter
// is annotated inline rather than through a named type: a declaration spelling
// out `text`, `completed` and `createdAt` together is a competing Todo shape,
// and `contract.test.ts` fails the suite for one anywhere outside the contract
// directory.
function toWireTodo(row: {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}): Todo {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * What a create did, and to what.
 *
 * Three outcomes rather than a Todo-or-nothing, because the three are three
 * different HTTP answers and the route handler must choose between them without
 * looking at a Drizzle result: `created` is a `201`, `existing` is the
 * idempotent retry's `200`, and `foreign-owner` is the `409` that discloses
 * nothing (epics.md Story 3.1 AC3, AC4). Carrying the verdict here rather than
 * inferring it at the handler is what keeps AD-2's "the route handler builds no
 * query" true of the decision as well as of the SQL.
 *
 * It wraps `Todo` instead of restating its fields, so the contract stays the
 * one definition of what a Todo looks like.
 */
export type CreateTodoResult =
  | { outcome: "created"; todo: Todo }
  | { outcome: "existing"; todo: Todo }
  | { outcome: "foreign-owner" };

/**
 * The caller's Todo List, newest first.
 *
 * Ordered `id DESC` and never by `created_at` (AD-5): a Todo id is a UUIDv7, so
 * it is time-ordered, and an optimistic row minted in the browser already sits
 * at its final position before the server has set a timestamp. The
 * `(owner_id, id DESC)` index in `schema.ts` exists for exactly this query.
 *
 * An empty list is a normal result, not a failure — it is the Todo List of
 * someone who has not added anything yet.
 *
 * @param ownerId The Client Identity whose Todos to return. Never optional:
 *   omitting the scope is how one person's list becomes everyone's.
 */
export async function listTodos(ownerId: string): Promise<Todo[]> {
  const rows = await db
    .select(wireColumns)
    .from(todo)
    .where(eq(todo.ownerId, ownerId))
    .orderBy(desc(todo.id));

  return rows.map(toWireTodo);
}

/**
 * Stores a Todo under `ownerId`, or reports what already holds its id.
 *
 * The id is the client's (AD-4) and is therefore also the idempotency key: a
 * retry of a create whose answer the browser never saw arrives carrying the
 * same id, and must leave the user with one Todo rather than two (Story 3.1
 * AC3). `neon-http` has no interactive transaction (`client.ts`), so a
 * read-then-write would be racy between two retries of the same submit. The
 * insert is the arbiter instead: `ON CONFLICT (id) DO NOTHING` either writes a
 * row and returns it, or writes nothing and returns nothing — and the existing
 * row is never updated, so "the stored row is not modified" holds structurally
 * rather than by a branch that remembered to be careful.
 *
 * The follow-up `SELECT` runs only when nothing was returned, and is scoped to
 * `(id, owner_id)` rather than to `id` alone. A row the caller does not own
 * therefore reads as absent here, and this function reports `foreign-owner`
 * without ever having held the other person's text — there is nothing for a
 * later change to leak. The same verdict covers the vanishingly narrow race in
 * which the conflicting row is deleted between the two statements; `409` is the
 * honest answer to "that id is not yours to create" in both cases.
 *
 * `completed` and `created_at` are deliberately not passed: `schema.ts` defaults
 * them, so the Completion Status of a new Todo is `false` and the timestamp is
 * the server's clock, neither of them a caller-supplied value (AC1).
 *
 * @param ownerId The Client Identity the Todo belongs to. First, and never
 *   optional (AD-2) — a create that forgets the owner writes into the void the
 *   foreign key is there to prevent.
 * @param id The client-minted UUIDv7. Validated before it reaches here; this
 *   module never generates one (AC2).
 * @param text The Todo's copy, already trimmed by the caller (AC10).
 */
export async function createTodo(
  ownerId: string,
  id: string,
  text: string,
): Promise<CreateTodoResult> {
  const inserted = await db
    .insert(todo)
    .values({ id, ownerId, text })
    .onConflictDoNothing({ target: todo.id })
    .returning(wireColumns);

  const created = inserted.at(0);
  if (created) return { outcome: "created", todo: toWireTodo(created) };

  const existing = await db
    .select(wireColumns)
    .from(todo)
    .where(and(eq(todo.id, id), eq(todo.ownerId, ownerId)))
    .limit(1);

  const row = existing.at(0);
  if (!row) return { outcome: "foreign-owner" };

  return { outcome: "existing", todo: toWireTodo(row) };
}

/**
 * Sets one Todo's Completion Status to the value asked for, and reports back
 * the stored row — or `undefined` when the caller owns no such Todo.
 *
 * A **set**, never a toggle (epics.md Story 4.1 AC1, AC2). The value the user
 * asked for travels all the way down: nothing here reads the current column to
 * decide what to write, so a retry of a request whose answer the browser never
 * saw stores the same value a second time rather than flipping it back (AC3).
 * Idempotency is the shape of the operation, not a guard that remembered to run.
 *
 * One statement, not a read-then-write. `neon-http` has no interactive
 * transaction (`client.ts`), so a check-then-update would be racy — and it
 * would also hold the other owner's row in memory on the very path that is
 * supposed to learn nothing about it. The `WHERE` clause *is* the ownership
 * check, and `RETURNING` reports whether it matched.
 *
 * `undefined` therefore covers both "no such Todo" and "not the caller's Todo",
 * and covers them indistinguishably: the two states produce the same empty
 * result, so this function could not tell them apart even if a later change
 * wanted it to. That is what lets the route handler answer `404` to both
 * without a decision of its own (AC4).
 *
 * Only `completed` is in the `SET`: `text` and `created_at` are untouched by
 * this path, which is why the returned row still carries the text the person
 * typed and the server's original timestamp.
 *
 * @param ownerId The Client Identity the Todo must belong to. First, and never
 *   optional (AD-2, AC5) — an update that forgets the owner is an update to
 *   somebody else's Todo.
 * @param id The Todo's id, already checked for canonical UUIDv7 form by the
 *   route handler before it reaches here.
 * @param completed The Completion Status to store, as the caller asked for it.
 */
export async function setTodoCompleted(
  ownerId: string,
  id: string,
  completed: boolean,
): Promise<Todo | undefined> {
  const updated = await db
    .update(todo)
    .set({ completed })
    .where(and(eq(todo.id, id), eq(todo.ownerId, ownerId)))
    .returning(wireColumns);

  const row = updated.at(0);

  return row && toWireTodo(row);
}
