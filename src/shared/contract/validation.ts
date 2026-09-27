// The Todo text rule, defined once and enforced twice (AD-11, epics.md Story
// 1.5 AC3): the client enforces it at entry, the server re-enforces it as a
// trust boundary. Both import these; neither retypes them.
//
// A boolean, not a Result: neither violation has user-facing copy. Over-length
// is a hard keystroke stop at the input and a whitespace-only submit is a
// silent no-op (EXPERIENCE.md), so no caller ever needs a reason code.
//
// Trimming is the server's job to persist, so this must be safe to call on raw
// input from either side: it trims internally, returns a verdict, and hands
// back no string. The input's character counter counts *raw* keystrokes and
// must not be derived from this predicate, which measures the trimmed length.
export const TODO_TEXT_MAX_LENGTH = 500;

// Postgres cannot store a NUL code point in a `text` value, so a text carrying
// one is refused by the database rather than by this predicate — which turns a
// caller error into a 500 on an endpoint whose honest answer is 400. The length
// rule does not catch it: a NUL is an ordinary character to `trim` and `length`.
//
// Deliberately this and nothing wider. A `\p{Cc}` rule would also reject tab,
// newline and carriage return, and this predicate gates the input component as
// well as the route handler — so widening it would turn an ordinary multi-line
// paste into a silent no-op, which is a product change and not this one's to
// make.
const UNSTORABLE_CODE_POINT = /\u0000/;

export function isValidTodoText(text: string): boolean {
  if (UNSTORABLE_CODE_POINT.test(text)) return false;

  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= TODO_TEXT_MAX_LENGTH;
}
