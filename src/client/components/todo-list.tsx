"use client";

// The list region (epics.md Story 2.4; Story 2.5 AC5, AC9, AC10 and AC11;
// epic-2-context
// "The list region is a persistent element ... so skeletons have something to
// mount into and the swap costs no layout shift").
//
// Story 2.3 left an empty element here and named the stories that fill it.
// Story 2.4 was the first of them, and it is what finally gave `useTodos()` a
// caller: until then the hook Story 2.2 built had none, so the server's list
// reached the browser and stopped there. Story 2.5 is the second, and it
// takes back the one thing 2.4 got wrong — the guard that returned `null`
// removed the region from the DOM in exactly the two states that most need
// something to render into, which `deferred-work.md` recorded at the time.
// The `<ul>` is unconditional now; only its contents resolve.
//
// The order those contents resolve in is the whole of this component:
//
//   in flight  -> three skeleton rows, in the Active row's geometry
//   resolved   -> one row per Todo, in the order the server sent them
//   otherwise  -> nothing, and the region is still here
//
// "Otherwise" is a failed read, and rendering nothing is deliberate rather
// than unfinished. A failure leaves the list's contents *unknown* rather than
// known-empty, so it may show neither skeletons nor an empty state
// (epic-2-context: "A load failure is not an empty list"). The banner, the
// `Retry` control, the empty state and every announcement are Story 2.6's,
// and they are a comment rather than placeholder markup for the reason
// Stories 1.7 and 2.3 both give: a placeholder is a thing a later story has
// to remember to delete.
//
// `isPending` is true only when there is no data and no error, which is
// precisely "the initial load is in flight". It is false for every optimistic
// mutation, which is what keeps an add, a toggle or a delete from ever
// showing a skeleton (AC10). Two later stories widen the branch rather than
// re-key it here: Story 2.6 must return the region to skeletons while `Retry`
// re-runs a read that is currently in the `error` state, and Story 3.3 must
// keep the skeletons pulsing beneath an optimistic row added during load
// (EXPERIENCE.md:149), which an `isPending` keyed to cache contents cannot do
// once the cache has been written to.
//
// The client boundary is here rather than on the card or the row. `TodoCard`
// stays a Server Component — it holds no state and reads nothing — and
// `TodoRow`, `SkeletonRow` and the motion module need no directive of their
// own, because a module imported from a Client Component is already in the
// client graph ("You only need to add it to the files whose components you
// want to render directly within Server Components", Next.js `use client`
// reference). One directive, at the one place the tree actually crosses over.
//
// `gap-row-gap` is DESIGN.md's `{spacing.row-gap}`, whose definition is the
// gap between Todo rows. Story 2.3 declined to use it for the gap between the
// card's regions on the grounds that choosing one there would be inventing a
// design value; here it is the value's own job. The `<ul>` needs no list
// reset — Tailwind's preflight already strips the marker, margin and padding.

import { useReducedMotion } from "@/client/motion/motion";
import { useTodos } from "@/client/todos/use-todos";

import { SKELETON_ROW_KEYS, SkeletonRow } from "./skeleton-row";
import { TodoRow } from "./todo-row";

export function TodoList() {
  const { isPending, data } = useTodos();
  // One attribute, set from the product's only reader of the preference; the
  // recipes in `app/globals.css` derive the stillness from it (AR-28). No
  // component branches on a duration and no `className` here is computed.
  const still = useReducedMotion();

  return (
    <ul
      data-still={still ? true : undefined}
      className="flex flex-col gap-row-gap"
    >
      {/*
        The empty state — Story 2.6. It is a branch of this region.
        Its error banner is not: DESIGN.md fixes the order as add input →
        error banner region → filter tabs → list, and `sticky-top-block.tsx`
        already reserves slot 2 for it. A banner inside a `<ul>` would also
        be invalid content. What this region owes a failed read is what it
        does above — stay in the DOM and show nothing.
      */}
      {isPending
        ? SKELETON_ROW_KEYS.map((key) => <SkeletonRow key={key} />)
        : data?.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
    </ul>
  );
}
