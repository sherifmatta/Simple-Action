import { describe, expect, it } from "vitest";

import type { Todo } from "@/shared/contract/todo";

import {
  mergeTodoListById,
  removeTodoById,
  upsertTodoById,
} from "./merge-todo-list";

// Covers epics.md Story 3.3 AC3, AC5, AC7 and AC8 — AD-16's merge rule, as a
// pure function over three values.
//
// The race this file exists for is the one the epic says to test first: a
// create raised while the `GET` is still in flight, whose response then lands
// knowing nothing about it. Everything the interface does with that response
// is decided here, so it is decided without a DOM, a fetch or a component.
//
// Ids are written as real lowercase canonical UUIDv7 strings differing only
// in their timestamp field, because `id DESC` is a *string* comparison and a
// test using `"a"`/`"b"` would prove the sort against values the product
// never holds.

function todo(id: string, text: string, completed = false): Todo {
  return { id, text, completed, createdAt: "2026-09-23T10:00:00.000Z" };
}

const OLDEST = "01997c3a-1000-7000-8000-000000000001";
const MIDDLE = "01997c3a-2000-7000-8000-000000000002";
const NEWEST = "01997c3a-3000-7000-8000-000000000003";

const noneUnconfirmed: ReadonlySet<string> = new Set();

describe("mergeTodoListById — the add-during-load race (AC5, AC7)", () => {
  it("keeps an unconfirmed row the response does not know about", () => {
    const cached = [todo(NEWEST, "post the form")];
    const incoming = [todo(MIDDLE, "buy milk"), todo(OLDEST, "call mum")];

    const merged = mergeTodoListById(cached, incoming, new Set([NEWEST]));

    expect(merged.map((row) => row.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
    expect(merged).toHaveLength(3);
  });

  it("never duplicates a row the response does know about", () => {
    const optimistic = todo(NEWEST, "post the form");
    const confirmed = { ...optimistic, createdAt: "2026-09-23T11:22:33.444Z" };

    const merged = mergeTodoListById(
      [optimistic, todo(OLDEST, "call mum")],
      [confirmed, todo(OLDEST, "call mum")],
      new Set([NEWEST]),
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(confirmed);
  });

  it("puts the kept row at its `id DESC` position rather than at the front", () => {
    const merged = mergeTodoListById(
      [todo(MIDDLE, "the optimistic one")],
      [todo(NEWEST, "newer"), todo(OLDEST, "older")],
      new Set([MIDDLE]),
    );

    expect(merged.map((row) => row.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
  });

  it("drops a cached row that is not an unconfirmed create", () => {
    // A row the server no longer sends and no mutation is protecting is gone
    // — that is the whole of "the list response wins", and it is what keeps
    // AD-16's exception narrow enough for Epic 5's delete to work at all.
    const merged = mergeTodoListById(
      [todo(NEWEST, "deleted elsewhere"), todo(OLDEST, "call mum")],
      [todo(OLDEST, "call mum")],
      noneUnconfirmed,
    );

    expect(merged.map((row) => row.id)).toEqual([OLDEST]);
  });

  it("takes the response wholesale when no create is unconfirmed", () => {
    const incoming = [todo(NEWEST, "newer"), todo(OLDEST, "older")];

    expect(mergeTodoListById([todo(MIDDLE, "stale")], incoming, noneUnconfirmed)).toEqual(
      incoming,
    );
  });

  it("carries the server's record, not the optimistic one, for an id in both", () => {
    const merged = mergeTodoListById(
      [todo(NEWEST, "  post the form  ")],
      [todo(NEWEST, "post the form")],
      new Set([NEWEST]),
    );

    expect(merged[0].text).toBe("post the form");
  });

  it("keeps two unconfirmed rows at once, in `id DESC` order", () => {
    // "Type, Enter, type, Enter" is the rhythm the epic designs for, and
    // nothing makes the second Enter wait for the first `POST`. Every other
    // case here passes a one-element set, which would pass an implementation
    // that kept only the first match.
    const merged = mergeTodoListById(
      [todo(NEWEST, "second"), todo(MIDDLE, "first")],
      [todo(OLDEST, "call mum")],
      new Set([NEWEST, MIDDLE]),
    );

    expect(merged.map((row) => row.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
  });

  it("collapses only the one the response knows about, when two are in flight", () => {
    const confirmed = { ...todo(MIDDLE, "first"), createdAt: "2026-09-23T11:00:00.000Z" };

    const merged = mergeTodoListById(
      [todo(NEWEST, "second"), todo(MIDDLE, "first")],
      [confirmed, todo(OLDEST, "call mum")],
      new Set([NEWEST, MIDDLE]),
    );

    expect(merged.map((row) => row.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
    expect(merged[1]).toEqual(confirmed);
  });

  it("survives an empty cache and an empty response", () => {
    expect(mergeTodoListById(undefined, [], noneUnconfirmed)).toEqual([]);
    expect(
      mergeTodoListById([todo(NEWEST, "only one")], [], new Set([NEWEST])),
    ).toHaveLength(1);
  });
});

describe("upsertTodoById — the optimistic insert and its silent confirmation (AC3, AC8)", () => {
  it("inserts a new row at its `id DESC` position", () => {
    const list = [todo(MIDDLE, "buy milk"), todo(OLDEST, "call mum")];

    expect(upsertTodoById(list, todo(NEWEST, "post the form")).map((r) => r.id)).toEqual([
      NEWEST,
      MIDDLE,
      OLDEST,
    ]);
  });

  it("replaces a row of the same id in place, changing no position", () => {
    const before = [
      todo(NEWEST, "post the form"),
      todo(MIDDLE, "buy milk"),
      todo(OLDEST, "call mum"),
    ];
    const confirmed = {
      ...todo(NEWEST, "post the form"),
      createdAt: "2026-09-23T11:22:33.444Z",
    };

    const after = upsertTodoById(before, confirmed);

    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after[0]).toEqual(confirmed);
    expect(after).toHaveLength(3);
  });

  it("starts a list that does not exist yet, which is the add-during-load case", () => {
    expect(upsertTodoById(undefined, todo(NEWEST, "post the form"))).toEqual([
      todo(NEWEST, "post the form"),
    ]);
  });
});

// --- Story 3.4 AC1: the rollback -------------------------------------------

describe("removing the row a failed create inserted (Story 3.4 AC1)", () => {
  it("removes that id and leaves every other row exactly as it was", () => {
    const before = [
      todo(NEWEST, "post the form"),
      todo(MIDDLE, "buy milk"),
      todo(OLDEST, "call mum"),
    ];

    const after = removeTodoById(before, MIDDLE);

    expect(after).toEqual([todo(NEWEST, "post the form"), todo(OLDEST, "call mum")]);
    // Identity, not just equality: a rollback that rebuilt the surviving rows
    // would be a rollback touching Todos this mutation never created.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[2]);
  });

  it("leaves a list that never held the id alone", () => {
    const before = [todo(NEWEST, "post the form")];
    expect(removeTodoById(before, MIDDLE)).toEqual(before);
  });

  it("removes the row without restoring anything a concurrent write did", () => {
    // AD-16's whole reason for forbidding a snapshot. The list this create
    // started against held one Todo; by the time it failed, a second one had
    // arrived. Restoring the snapshot would take that second Todo away — a
    // change this mutation never made and has no business reversing.
    const atSubmit = [todo(MIDDLE, "buy milk")];
    const atFailure = [
      todo(NEWEST, "post the form"),
      todo(OLDEST, "call mum"),
      ...atSubmit,
    ];

    const after = removeTodoById(atFailure, NEWEST);

    expect(after.map((row) => row.id)).toEqual([OLDEST, MIDDLE]);
    expect(after.map((row) => row.id)).not.toEqual(atSubmit.map((row) => row.id));
  });

  it("answers an empty list when the cache holds nothing yet", () => {
    // The add-during-load race, failing: the create was raised before any
    // list existed, so there is nothing to remove the row from.
    expect(removeTodoById(undefined, NEWEST)).toEqual([]);
  });
});
