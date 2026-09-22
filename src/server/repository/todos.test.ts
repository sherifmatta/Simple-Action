import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { clientIdentity, todo } from "@/server/db/schema";
import { db } from "./client";
import * as todosRepository from "./todos";
import { listTodos } from "./todos";

// Story 2.1 AC1 (the wire shape), AC2 (`id DESC`, never `created_at`), AC3 (the
// `ownerId`-first signature) and AC4 (one caller's rows only), live against the
// Neon branch `DATABASE_URL` points at — the pattern Story 1.4 established, and
// the only way to prove an ordering and a `WHERE` clause actually hold.
//
// Every row this file inserts is removed in `afterAll`, `todo` before
// `client_identity` because of the foreign key. This file may delete directly:
// it lives inside `src/server/repository/`, the one directory AD-2 lets hold
// the Drizzle client, and the repository exports no delete for either table.

const insertedTodoIds: string[] = [];
const insertedOwnerIds: string[] = [];

afterAll(async () => {
  if (insertedTodoIds.length > 0) {
    await db.delete(todo).where(inArray(todo.id, insertedTodoIds));
  }
  if (insertedOwnerIds.length > 0) {
    await db
      .delete(clientIdentity)
      .where(inArray(clientIdentity.id, insertedOwnerIds));
  }
});

/** A `client_identity` row to hang Todos off — the foreign key requires one. */
async function freshOwner(): Promise<string> {
  const id = randomUUID();
  insertedOwnerIds.push(id);
  await db
    .insert(clientIdentity)
    .values({ id, tokenHash: `test-${randomUUID().replaceAll("-", "")}` });
  return id;
}

// Three ids sharing a random 35-character prefix and differing only in their
// last hex digit, so their `id DESC` order is known ("...3" > "...2" > "...1")
// while the prefix keeps them unique against a concurrent run on the same
// branch. Generating three `randomUUID()`s instead would leave the expected
// order unknown, which is the one thing AC2 needs stated.
function orderedIds(): [string, string, string] {
  const prefix = randomUUID().slice(0, -1);
  return [`${prefix}1`, `${prefix}2`, `${prefix}3`];
}

async function insertTodo(values: {
  id: string;
  ownerId: string;
  text: string;
  completed?: boolean;
  createdAt?: Date;
}) {
  insertedTodoIds.push(values.id);
  await db.insert(todo).values(values);
}

describe("listTodos — against the live branch", () => {
  it("returns the caller's Todos in the shared contract's shape, and nothing else (AC1)", async () => {
    const ownerId = await freshOwner();
    const id = randomUUID();
    await insertTodo({ id, ownerId, text: "Buy milk", completed: true });

    const [only] = await listTodos(ownerId);

    // The keys, exactly — an extra one would mean `owner_id` reached the wire.
    expect(Object.keys(only).sort()).toEqual([
      "completed",
      "createdAt",
      "id",
      "text",
    ]);
    expect(only.id).toBe(id);
    expect(only.text).toBe("Buy milk");
    expect(only.completed).toBe(true);
    // An ISO-8601 UTC string, not a Date (SPINE "Dates").
    expect(only.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(new Date(only.createdAt).getTime()).not.toBeNaN();
  });

  it("orders by id DESC and not by created_at (AC2)", async () => {
    const ownerId = await freshOwner();
    const [low, middle, high] = orderedIds();

    // `created_at` is deliberately the reverse of `id` order: sorting by the
    // timestamp would return [low, middle, high] and pass a weaker assertion.
    await insertTodo({
      id: low,
      ownerId,
      text: "lowest id, newest timestamp",
      createdAt: new Date("2026-09-22T12:00:00.000Z"),
    });
    await insertTodo({
      id: middle,
      ownerId,
      text: "middle id, middle timestamp",
      createdAt: new Date("2026-09-22T11:00:00.000Z"),
    });
    await insertTodo({
      id: high,
      ownerId,
      text: "highest id, oldest timestamp",
      createdAt: new Date("2026-09-22T10:00:00.000Z"),
    });

    const listed = await listTodos(ownerId);

    expect(listed.map((entry) => entry.id)).toEqual([high, middle, low]);
  });

  it("returns only the rows the given owner holds (AC4)", async () => {
    const mine = await freshOwner();
    const theirs = await freshOwner();
    const ourIds = [randomUUID(), randomUUID()];
    await insertTodo({ id: ourIds[0], ownerId: mine, text: "mine, one" });
    await insertTodo({ id: ourIds[1], ownerId: mine, text: "mine, two" });
    await insertTodo({ id: randomUUID(), ownerId: theirs, text: "not mine" });

    const listed = await listTodos(mine);

    expect(listed.map((entry) => entry.id).sort()).toEqual([...ourIds].sort());
    expect(listed.map((entry) => entry.text)).not.toContain("not mine");
  });

  it("returns an empty array for an owner holding no Todos — a normal result, not a failure", async () => {
    await expect(listTodos(await freshOwner())).resolves.toEqual([]);
  });

  it("takes ownerId as its first parameter (AC3)", () => {
    // `Function.length` stops at the first defaulted or rest parameter, so this
    // pins the position of `ownerId` and not the absence of a second argument —
    // a future `listTodos(ownerId, options = {})` would have length 1 too. The
    // `ownerId`-first half is what AD-2 is about; the arity is the compiler's.
    expect(listTodos.length).toBe(1);
  });
});

describe("repository scope — the Todo module", () => {
  it("exports the list and nothing more yet; create, set and delete arrive with Epics 3 to 5", () => {
    expect(Object.keys(todosRepository).sort()).toEqual(["listTodos"]);
  });
});
