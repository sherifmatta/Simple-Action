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

export function isValidTodoText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= TODO_TEXT_MAX_LENGTH;
}
