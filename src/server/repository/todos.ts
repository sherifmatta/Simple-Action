// Repository functions for the Todo (AD-2, AD-5).
//
// The first Todo module. `createTodo`, `setTodoCompleted` and `deleteTodo`
// arrive in Epics 3 through 5 and join this file; all of them take `ownerId`
// first (AD-2), because a Todo is an owned resource and a query that forgets
// the owner returns somebody else's list.
//
// These functions return the wire `Todo` shape rather than the Drizzle row,
// which is a deliberate departure from `client-identity.ts`. A Client Identity
// never crosses the wire; a Todo always does, and its row carries `owner_id` —
// the one field AD-7 keeps server-side. Projecting here means the row never
// leaves this module, so `owner_id` cannot reach the browser by someone
// spreading a result object into a response. The `Date` -> ISO-8601 conversion
// (SPINE "Dates") lands in the same place for the same reason: one conversion
// site rather than one per route handler.
import { desc, eq } from "drizzle-orm";
import { todo } from "@/server/db/schema";
import type { Todo } from "@/shared/contract/todo";
import { db } from "./client";

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
    .select({
      id: todo.id,
      text: todo.text,
      completed: todo.completed,
      createdAt: todo.createdAt,
    })
    .from(todo)
    .where(eq(todo.ownerId, ownerId))
    .orderBy(desc(todo.id));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
