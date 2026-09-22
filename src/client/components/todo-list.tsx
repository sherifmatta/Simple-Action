"use client";

// The list region (epics.md Story 2.4; epic-2-context "2.3 creates the card
// and the sticky container that 2.4, 2.6, 2.7 and 2.8 all render inside").
//
// Story 2.3 left an empty element here and named the four stories that fill
// it. This is the first of them, and it is what finally gives `useTodos()` a
// caller: until now the hook Story 2.2 built had none, so the server's list
// reached the browser and stopped there.
//
// The client boundary is here rather than on the card or the row. `TodoCard`
// stays a Server Component — it holds no state and reads nothing — and
// `TodoRow` needs no directive of its own, because a module imported from a
// Client Component is already in the client graph ("You only need to add it
// to the files whose components you want to render directly within Server
// Components", Next.js `use client` reference). One directive, at the one
// place the tree actually crosses over.
//
// The three branches this does not have are the three that are not built yet,
// and they are a comment rather than placeholder markup for the reason
// Stories 1.7 and 2.3 both give: a placeholder is a thing a later story has to
// remember to delete. `data` is `undefined` while the read is in flight and
// after it fails, so both fall through the same guard today — Story 2.7 is
// where they must stop being the same thing, because a failure leaves the
// contents unknown rather than known-empty (AC4 there) and must show neither
// skeletons nor an empty state.
//
// `gap-row-gap` is DESIGN.md's `{spacing.row-gap}`, whose definition is the
// gap between Todo rows. Story 2.3 declined to use it for the gap between the
// card's regions on the grounds that choosing one there would be inventing a
// design value; here it is the value's own job. The `<ul>` needs no list
// reset — Tailwind's preflight already strips the marker, margin and padding.

import { useTodos } from "@/client/todos/use-todos";

import { TodoRow } from "./todo-row";

export function TodoList() {
  const { data } = useTodos();

  // Loading — Story 2.6. Load failure — Story 2.7. Empty — Story 2.8.
  if (data === undefined) return null;

  return (
    <ul className="flex flex-col gap-row-gap">
      {data.map((todo) => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
