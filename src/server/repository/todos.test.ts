import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { clientIdentity, todo } from "@/server/db/schema";
import { mintIdentityId } from "@/server/identity/identity-token";
import { db } from "./client";
import * as todosRepository from "./todos";
import { createTodo, listTodos, setTodoCompleted } from "./todos";

// Story 2.1 AC1 (the wire shape), AC2 (`id DESC`, never `created_at`), AC3 (the
// `ownerId`-first signature) and AC4 (one caller's rows only), live against the
// Neon branch `DATABASE_URL` points at — the pattern Story 1.4 established, and
// the only way to prove an ordering and a `WHERE` clause actually hold.
//
// Story 4.1 AC1, AC3, AC4 and AC5 join them again for `setTodoCompleted`: that
// the owner scoping lives in the `UPDATE`'s own `WHERE`, and that a repeat
// stores the value asked for rather than its inverse, are both properties of
// the statement the database runs and of nothing a mock could stand in for.
//
// Story 3.1 AC1, AC3, AC4 and AC5 join them for `createTodo`. Its idempotency
// is `ON CONFLICT (id) DO NOTHING` plus an owner-scoped read, which is SQL the
// database has to actually perform: a mock would prove only that the branch
// exists. The route handler's own tests mock this module and prove what it does
// with each of the three outcomes.
//
// Every row this file inserts is removed in `afterAll`, `todo` before
// `client_identity` because of the foreign key. This file may delete directly:
// it lives inside `src/server/repository/`, the one directory AD-2 lets hold
// the Drizzle client, and the repository exports no delete for either table.
//
// One id source, `mintIdentityId()`, for both tables. Both `client_identity.id`
// and `todo.id` are UUIDv7 in production (SPINE "Ids", AD-4), and a file that
// minted owners with `randomUUID()` would be seeding half its fixtures with a
// v4 — an id shape neither column ever actually holds, and one the server's own
// `isCanonicalUuidV7` refuses. Story 3.3 installs the `uuidv7` package for the
// *client's* Todo-id minting; this file's ids are fixtures, not that call site.

/** A fresh lowercase-canonical UUIDv7 — the shape both tables' keys take. */
const freshId = mintIdentityId;

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
  const id = freshId();
  insertedOwnerIds.push(id);
  await db
    .insert(clientIdentity)
    .values({ id, tokenHash: `test-${freshId().replaceAll("-", "")}` });
  return id;
}

// Three ids sharing a 35-character prefix and differing only in their last hex
// digit, so their `id DESC` order is known ("...3" > "...2" > "...1") while the
// prefix's 74 random bits keep them unique against a concurrent run on the same
// branch. Generating three ids outright instead would leave the expected order
// unknown, which is the one thing AC2 needs stated.
function orderedIds(): [string, string, string] {
  const prefix = freshId().slice(0, -1);
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
    const id = freshId();
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
    const ourIds = [freshId(), freshId()];
    await insertTodo({ id: ourIds[0], ownerId: mine, text: "mine, one" });
    await insertTodo({ id: ourIds[1], ownerId: mine, text: "mine, two" });
    await insertTodo({ id: freshId(), ownerId: theirs, text: "not mine" });

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

describe("createTodo — against the live branch", () => {
  /** A client-minted id, registered for cleanup before anything writes it. */
  function submittedId(): string {
    const id = freshId();
    insertedTodoIds.push(id);
    return id;
  }

  /** The stored row, `owner_id` included — what no wire shape may carry. */
  async function storedRow(id: string) {
    const rows = await db.select().from(todo).where(eq(todo.id, id));
    return rows.at(0);
  }

  it("writes the row and returns it in the shared contract's shape (AC1)", async () => {
    const ownerId = await freshOwner();
    const id = submittedId();
    const before = Date.now();

    const result = await createTodo(ownerId, id, "Buy milk");

    expect(result.outcome).toBe("created");
    if (result.outcome === "foreign-owner") throw new Error("unreachable");

    // The keys, exactly — an extra one would mean `owner_id` reached the wire.
    expect(Object.keys(result.todo).sort()).toEqual([
      "completed",
      "createdAt",
      "id",
      "text",
    ]);
    expect(result.todo.id).toBe(id);
    expect(result.todo.text).toBe("Buy milk");
    // Neither is a caller-supplied value: the schema defaults both.
    expect(result.todo.completed).toBe(false);
    expect(result.todo.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(new Date(result.todo.createdAt).getTime()).toBeGreaterThanOrEqual(
      before - 60_000,
    );
  });

  it("stores the row under the given owner, where listTodos then finds it", async () => {
    const ownerId = await freshOwner();
    const id = submittedId();

    await createTodo(ownerId, id, "Buy milk");

    await expect(listTodos(ownerId)).resolves.toEqual([
      expect.objectContaining({ id, text: "Buy milk", completed: false }),
    ]);
  });

  it("takes ownerId as its first parameter (AC5)", () => {
    // The same reasoning as `listTodos` above: what AD-2 is about is the
    // position of `ownerId`, and the arity is the compiler's.
    expect(createTodo.length).toBe(3);
  });

  it("returns the existing row and writes nothing on a same-owner retry (AC3)", async () => {
    const ownerId = await freshOwner();
    const id = submittedId();
    const first = await createTodo(ownerId, id, "Buy milk");
    if (first.outcome !== "created") throw new Error("the first create failed");

    // The retry carries a different text on purpose: a create that fell through
    // to an `UPDATE` would overwrite the stored row and pass a weaker check.
    const retry = await createTodo(ownerId, id, "a different text entirely");

    expect(retry.outcome).toBe("existing");
    if (retry.outcome === "foreign-owner") throw new Error("unreachable");
    expect(retry.todo).toEqual(first.todo);
    expect(retry.todo.text).toBe("Buy milk");

    // And one row, not two — the whole point of the idempotency rule.
    await expect(listTodos(ownerId)).resolves.toHaveLength(1);
  });

  it("leaves the stored row untouched across that retry (AC3)", async () => {
    const ownerId = await freshOwner();
    const id = submittedId();
    await createTodo(ownerId, id, "Buy milk");
    const before = await storedRow(id);
    // `storedRow` answers `undefined` for a row that is not there, so without
    // this the comparison below is `undefined === undefined` and passes for a
    // seeding create that silently wrote nothing.
    expect(before).toBeDefined();

    await createTodo(ownerId, id, "a different text entirely");

    // Every column, `owner_id` and `created_at` included: nothing moved.
    await expect(storedRow(id)).resolves.toEqual(before);
  });

  it("refuses an id another owner holds, and touches nothing (AC4)", async () => {
    const theirs = await freshOwner();
    const mine = await freshOwner();
    const id = submittedId();
    await createTodo(theirs, id, "their Todo");
    const before = await storedRow(id);
    // As above: `undefined === undefined` would pass for a seeding create that
    // never landed, and then the `foreign-owner` verdict would mean nothing.
    expect(before).toBeDefined();

    const result = await createTodo(mine, id, "my Todo");

    // No row for me, and theirs unchanged — including its text, which a create
    // that resolved the conflict by owner *after* reading would have replaced.
    expect(result).toEqual({ outcome: "foreign-owner" });
    await expect(storedRow(id)).resolves.toEqual(before);
    await expect(listTodos(mine)).resolves.toEqual([]);
    await expect(listTodos(theirs)).resolves.toHaveLength(1);
  });

  it("carries nothing of the other owner's row in that refusal (AC4)", async () => {
    const theirs = await freshOwner();
    const mine = await freshOwner();
    const id = submittedId();
    await createTodo(theirs, id, "a secret they typed");

    const result = await createTodo(mine, id, "my Todo");

    // The refusal is one key. There is no row here for a later change to leak.
    expect(Object.keys(result)).toEqual(["outcome"]);
    expect(JSON.stringify(result)).not.toContain("a secret they typed");
  });

  it("settles two interleaved retries — one create, one existing, one row (AC3)", async () => {
    // The reason `createTodo` is `ON CONFLICT DO NOTHING` and not read-then-
    // write: `neon-http` has no interactive transaction (`client.ts`), so two
    // retries of the same submit can interleave. Every other row in this
    // describe is sequential and would pass against the racy implementation
    // too; this one actually issues both inserts at once.
    const ownerId = await freshOwner();
    const id = submittedId();

    const [first, second] = await Promise.all([
      createTodo(ownerId, id, "the first attempt"),
      createTodo(ownerId, id, "the retry"),
    ]);

    // Which retry wins is the database's business; that exactly one did is not.
    expect([first.outcome, second.outcome].sort()).toEqual([
      "created",
      "existing",
    ]);
    // And one row in the table, not two — the whole point of the rule.
    await expect(
      db.select().from(todo).where(eq(todo.id, id)),
    ).resolves.toHaveLength(1);
    await expect(listTodos(ownerId)).resolves.toHaveLength(1);
  });

  it("rejects, and writes nothing, when the owner has no client_identity row", async () => {
    // The foreign key on `todo.owner_id` is what makes this the obvious driver
    // failure — and the one that produces the error whose message carries the
    // submitted text, since Drizzle interpolates the bound parameters into it
    // (`node_modules/drizzle-orm/errors.js`). `route.ts`'s `logSafeError` is
    // the insulation; this is the path that makes the insulation necessary, and
    // without a row here nothing in the suite ever drives a real one.
    const strangerId = freshId();
    const id = submittedId();

    await expect(createTodo(strangerId, id, "Buy milk")).rejects.toThrow();

    await expect(storedRow(id)).resolves.toBeUndefined();
  });

  it("stores exactly the text it was given — trimming is the caller's (AC10)", async () => {
    // The route handler trims before calling; this module stores what it gets,
    // so the trim has one home rather than two that can disagree.
    const ownerId = await freshOwner();
    const id = submittedId();

    const result = await createTodo(ownerId, id, "Buy  milk and\tbread");

    if (result.outcome === "foreign-owner") throw new Error("unreachable");
    expect(result.todo.text).toBe("Buy  milk and\tbread");
  });
});

describe("setTodoCompleted — against the live branch", () => {
  // No `submittedId()` equivalent here: every row this describe writes goes in
  // through `insertTodo`, which registers it for cleanup itself. `createTodo`
  // needs its own because the id is registered before the *repository* writes
  // it, and nothing else would.

  /** The stored row, `owner_id` included — what no wire shape may carry. */
  async function storedRow(id: string) {
    const rows = await db.select().from(todo).where(eq(todo.id, id));
    return rows.at(0);
  }

  it("sets completed to true and returns the row in the shared contract's shape (AC1)", async () => {
    const ownerId = await freshOwner();
    const id = freshId();
    await insertTodo({ id, ownerId, text: "Buy milk" });

    const updated = await setTodoCompleted(ownerId, id, true);

    expect(updated).toBeDefined();
    if (!updated) throw new Error("unreachable");
    // The keys, exactly — an extra one would mean `owner_id` reached the wire.
    expect(Object.keys(updated).sort()).toEqual([
      "completed",
      "createdAt",
      "id",
      "text",
    ]);
    expect(updated.completed).toBe(true);
    // An ISO-8601 UTC string, not a Date (SPINE "Dates").
    expect(updated.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    // And the column itself moved, not only the returned object.
    await expect(storedRow(id)).resolves.toMatchObject({ completed: true });
  });

  it("sets completed to false on a row that was completed (AC1)", async () => {
    const ownerId = await freshOwner();
    const id = freshId();
    await insertTodo({ id, ownerId, text: "Buy milk", completed: true });

    const updated = await setTodoCompleted(ownerId, id, false);

    expect(updated?.completed).toBe(false);
    await expect(storedRow(id)).resolves.toMatchObject({ completed: false });
  });

  it("stores the value asked for a second time rather than its inverse (AC3)", async () => {
    // The reason this is a set and not a toggle: a retry of a request whose
    // answer the browser never saw must leave the same value behind. A toggle
    // would pass the row above and fail here.
    const ownerId = await freshOwner();
    const id = freshId();
    await insertTodo({ id, ownerId, text: "Buy milk" });

    const first = await setTodoCompleted(ownerId, id, true);
    const second = await setTodoCompleted(ownerId, id, true);

    expect(second).toEqual(first);
    expect(second?.completed).toBe(true);
    await expect(storedRow(id)).resolves.toMatchObject({ completed: true });
  });

  it("settles two concurrent repeats on the value both asked for (AC3)", async () => {
    // Every other row in this describe is sequential; this one issues both
    // updates at once, which is what a browser retrying a toggle actually
    // does. What it demonstrates is that interleaving changes neither answer
    // nor the stored value — not that a read-then-write implementation would
    // fail here, because with both requests asking for the same value it
    // would not. The set-rather-than-toggle shape is what the sequential
    // repeat above pins; this row pins that concurrency does not disturb it.
    const ownerId = await freshOwner();
    const id = freshId();
    await insertTodo({ id, ownerId, text: "Buy milk" });

    const [first, second] = await Promise.all([
      setTodoCompleted(ownerId, id, true),
      setTodoCompleted(ownerId, id, true),
    ]);

    expect(first?.completed).toBe(true);
    expect(second?.completed).toBe(true);
    await expect(storedRow(id)).resolves.toMatchObject({ completed: true });
  });

  it("leaves text and created_at exactly as they were (AC1)", async () => {
    const ownerId = await freshOwner();
    const id = freshId();
    const createdAt = new Date("2026-09-20T09:30:00.000Z");
    await insertTodo({ id, ownerId, text: "Buy  milk and\tbread", createdAt });

    const updated = await setTodoCompleted(ownerId, id, true);

    expect(updated?.text).toBe("Buy  milk and\tbread");
    expect(updated?.createdAt).toBe(createdAt.toISOString());
    await expect(storedRow(id)).resolves.toMatchObject({
      text: "Buy  milk and\tbread",
      createdAt,
      ownerId,
    });
  });

  it("answers undefined and touches nothing for a Todo another owner holds (AC4)", async () => {
    const theirs = await freshOwner();
    const mine = await freshOwner();
    const id = freshId();
    await insertTodo({ id, ownerId: theirs, text: "their Todo" });
    const before = await storedRow(id);
    // `storedRow` answers `undefined` for a row that is not there, so without
    // this the comparison below is `undefined === undefined` and passes for a
    // seeding insert that silently wrote nothing.
    expect(before).toBeDefined();

    const refused = await setTodoCompleted(mine, id, true);

    // Nothing back, and nothing changed — every column, `completed` included.
    expect(refused).toBeUndefined();
    await expect(storedRow(id)).resolves.toEqual(before);
  });

  it("answers undefined for a well-formed id that names no row at all", async () => {
    // The same answer as the foreign owner above, from the same empty result:
    // the owner-scoped `WHERE` makes the two states indistinguishable, which
    // is what lets the route handler answer `404` to both without choosing.
    const ownerId = await freshOwner();

    await expect(setTodoCompleted(ownerId, freshId(), true)).resolves.toBe(
      undefined,
    );
  });

  it("changes no other row of the caller's own list", async () => {
    const ownerId = await freshOwner();
    const [target, bystander] = [freshId(), freshId()];
    await insertTodo({ id: target, ownerId, text: "the one being set" });
    await insertTodo({ id: bystander, ownerId, text: "the one left alone" });

    await setTodoCompleted(ownerId, target, true);

    await expect(storedRow(bystander)).resolves.toMatchObject({
      completed: false,
      text: "the one left alone",
    });
  });

  it("takes three parameters, none of them defaulted or rest (AC5)", () => {
    // Arity, and only arity: `Function.length` cannot see which parameter is
    // which, so this would pass just as well for `(id, completed, ownerId)`.
    // What pins `ownerId` *first* is the live rows above — the foreign-owner
    // and unknown-id rows both call `setTodoCompleted(owner, id, value)` and
    // would fail against any other order, because the `WHERE` would then be
    // matching an owner id against `todo.id`. This row is the compiler's half:
    // a fourth parameter, or a defaulted third, would change it.
    expect(setTodoCompleted.length).toBe(3);
  });
});

describe("repository scope — the Todo module", () => {
  it("exports the list, the create and the set, and nothing more yet; delete arrives with Epic 5", () => {
    // `CreateTodoResult` is a type and emits no runtime value, so it does not
    // appear here — the surface this pins is the functions.
    expect(Object.keys(todosRepository).sort()).toEqual([
      "createTodo",
      "listTodos",
      "setTodoCompleted",
    ]);
  });
});
