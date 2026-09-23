"use client";

// The add input, wired to the create mutation (epics.md Stories 3.3 and 3.4).
//
// Story 3.2 built `AddInput` with a typed `onSubmit` seam and nothing on the
// other side of it, because `StickyTopBlock` is a Server Component and a
// function prop does not cross that boundary — the block renders its children
// and cannot hand them a callback. This component is the other side: one
// `"use client"` file whose whole job is to turn the field's submit into a
// mutation, and the mutation's failure back into a field.
//
// It is a component rather than a hook call moved into `AddInput` for a
// reason worth keeping: `useCreateTodo` needs a `QueryClientProvider`, an
// `AnnouncerProvider` and an `ErrorSlotProvider` above it, and putting it
// inside the field would make every test of the field's typing, its counter
// and its focus behaviour mount three providers to exercise none of them.
// `AddInput` stays what Story 3.2 made it — a text field with rules and no
// idea what happens next — and this file is the only thing that knows there
// is a server.
//
// Story 3.4 made the seam two-way. The text a failed add returns, the text a
// `Retry` reads and the clearing a confirmed retry does are all the field's
// business, so they go through its handle rather than through state lifted
// up here; `add-input.tsx` records why, and this file is the one place the
// two halves are joined.

import { useMemo, useRef } from "react";

import { useCreateTodo, type AddField } from "@/client/todos/use-create-todo";

import { AddInput, type AddInputHandle } from "./add-input";

export function AddTodo() {
  const field = useRef<AddInputHandle>(null);

  // Built once and never rebuilt: each call reaches through the ref when it
  // runs rather than closing over what the ref held when it was made, so the
  // object is as stable as the three functions in it. `useMemo` rather than a
  // second `useRef`, because reading `.current` during render is what
  // `react-hooks/refs` forbids — and rightly, for a value that is used.
  //
  // Each one tolerates a missing field rather than asserting one. A callback
  // arriving after an unmount should do nothing, not throw.
  const control = useMemo<AddField>(
    () => ({
      currentText: () => field.current?.currentText() ?? "",
      restoreText: (text) => field.current?.restore(text),
      clearAndFocus: () => field.current?.clearAndFocus(),
    }),
    [],
  );

  const submit = useCreateTodo(control);

  return <AddInput ref={field} onSubmit={submit} />;
}
