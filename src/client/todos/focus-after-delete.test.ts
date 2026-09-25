import { describe, expect, it } from "vitest";

import type { Todo } from "@/shared/contract/todo";
import { focusTargetAfterDelete } from "./focus-after-delete";

// Story 5.2 AC13, and the whole of EXPERIENCE.md:202's second half: "focus goes
// to the first focusable control of the row that took its place — the checkbox
// — or to the input if the list is now empty. Focus is never dropped to the
// document body."
//
// A pure function, so this is a pure test: a list and an id in, one of two
// answers out, no DOM and no component. The half that *is* a DOM — that the
// answer is turned into something focusable — is `todo-list.render.test.tsx`'s.

const todo = (id: string): Todo => ({
  id,
  text: `Todo ${id}`,
  completed: false,
  createdAt: "2026-09-25T09:00:00.000Z",
});

/** Three rows in render order, newest first, as the list actually arrives. */
const [first, middle, last] = [todo("a"), todo("b"), todo("c")];
const three = [first, middle, last];

describe("the row that took the deleted row's place", () => {
  it("is the row after it, wherever in the list it was", () => {
    // Reading down the list, focus stays where the eye already is: the row
    // below moves up into the position the finger or the caret was on.
    expect(focusTargetAfterDelete(three, first.id)).toEqual({
      kind: "row",
      id: middle.id,
    });
    expect(focusTargetAfterDelete(three, middle.id)).toEqual({
      kind: "row",
      id: last.id,
    });
  });

  it("is the row before it when the deleted row was last", () => {
    // The only case where focus travels backwards, because there is no row
    // after the last one to move up — and it travels the shortest distance it
    // can rather than jumping to the top of the list.
    expect(focusTargetAfterDelete(three, last.id)).toEqual({
      kind: "row",
      id: middle.id,
    });
  });

  it("is the surviving row when there were exactly two", () => {
    const two = [first, middle];
    expect(focusTargetAfterDelete(two, first.id)).toEqual({
      kind: "row",
      id: middle.id,
    });
    expect(focusTargetAfterDelete(two, middle.id)).toEqual({
      kind: "row",
      id: first.id,
    });
  });
});

describe("the input, when there is no row left to take the place", () => {
  it("is the answer when the deleted row was the only one", () => {
    expect(focusTargetAfterDelete([first], first.id)).toEqual({
      kind: "input",
    });
  });

  it("is the answer for an id this list never held", () => {
    // A stale dialog, or a row a concurrent change removed first. The honest
    // answer is the one control the list region is guaranteed to still have
    // above it — and never "nothing", which is the body-focus failure the
    // return type has no way to express.
    expect(focusTargetAfterDelete(three, "not-in-this-list")).toEqual({
      kind: "input",
    });
    expect(focusTargetAfterDelete([], first.id)).toEqual({ kind: "input" });
  });
});

describe("the rule is a function of the list it is given", () => {
  it("reads the list it is handed and nothing else", () => {
    // The caller passes the *visible* list — the active Filter View's rows —
    // because the row that takes a deleted row's place is the next row on
    // screen, and the next row in the whole cache may not be on screen at all.
    // Two arrangements of the same three Todos, and the answers differ.
    expect(focusTargetAfterDelete([first, last], first.id)).toEqual({
      kind: "row",
      id: last.id,
    });
    expect(focusTargetAfterDelete([first, middle], first.id)).toEqual({
      kind: "row",
      id: middle.id,
    });
  });

  it("changes nothing it is given", () => {
    const list = [...three];
    focusTargetAfterDelete(list, middle.id);
    expect(list).toEqual(three);
  });

  it("answers with an id that is in the list it was given", () => {
    // The point of the type's `row` case: whatever comes back is something the
    // caller can still find on screen. An answer naming the deleted row would
    // pass a shape assertion and focus an element on its way out.
    for (const target of three) {
      const answer = focusTargetAfterDelete(three, target.id);
      expect(answer.kind).toBe("row");
      if (answer.kind !== "row") throw new Error("unreachable");
      expect(answer.id).not.toBe(target.id);
      expect(three.map(({ id }) => id)).toContain(answer.id);
    }
  });
});
