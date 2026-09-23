"use client";

// The add input, wired to the create mutation (epics.md Story 3.3).
//
// Story 3.2 built `AddInput` with a typed `onSubmit` seam and nothing on the
// other side of it, because `StickyTopBlock` is a Server Component and a
// function prop does not cross that boundary — the block renders its children
// and cannot hand them a callback. This component is the other side: one
// `"use client"` file whose whole job is to turn the field's submit into a
// mutation.
//
// It is a component rather than a hook call moved into `AddInput` for a
// reason worth keeping: `useCreateTodo` needs a `QueryClientProvider` and an
// `AnnouncerProvider` above it, and putting it inside the field would make
// every test of the field's typing, its counter and its focus behaviour mount
// two providers to exercise neither. `AddInput` stays what Story 3.2 made it
// — a text field with rules and no idea what happens next — and this file is
// the only thing that knows there is a server.
//
// It is also where Story 3.4 lands: returning the user's text to the field
// after a failed add is a value flowing back *into* `AddInput`, and this is
// the component that will hold it.

import { useCreateTodo } from "@/client/todos/use-create-todo";

import { AddInput } from "./add-input";

export function AddTodo() {
  const submit = useCreateTodo();

  return <AddInput onSubmit={submit} />;
}
