// The one query key this application will ever use (AD-8, epics.md Story 1.7
// AC1).
//
// AD-8's rule is "there is exactly one query key, `['todos']`". A key spelled
// at each call site is a rule that holds until someone writes `['todos', id]`
// or `['todo-list']` and nothing objects; declaring it once, here, is what
// turns it into something a later story imports rather than retypes.
//
// `as const` matters: TanStack Query keys are compared structurally, so the
// tuple must stay readonly and must not be mutated in place by a caller.
//
// Deliberately not wrapped in a key factory. A factory exists to build
// *several* keys from parameters; this product has one key and AD-8 forbids a
// second, so a factory would model a shape the architecture rules out.
export const TODOS_QUERY_KEY = ["todos"] as const;

export type TodosQueryKey = typeof TODOS_QUERY_KEY;
