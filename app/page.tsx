// The one screen (epics.md Story 1.7 AC5).
//
// An empty card on the ground, at DESIGN.md's maximum width, centred — and
// nothing else. No wordmark, no title bar, no greeting: DESIGN.md §Layout is
// explicit that there is nothing above the add input, so a placeholder heading
// here would be a thing later stories have to remember to delete.
//
// This is the `components.card` recipe, transcribed from DESIGN.md:339-352,
// 398-400 entirely out of the tokens Story 1.2 put in `app/globals.css`'s
// `@theme` block — `{colors.card}`, `{rounded.lg}`, the card shadow,
// `{spacing.6}` block padding, `{spacing.gutter}` inline padding and
// `{spacing.card-max-width}`. Every class below compiles to a `var(--…)`
// reference; no hex literal and no arbitrary-value class appears (AD-13).
//
// `{spacing.margin-phone}` on the wrapper is what keeps ground visible on all
// sides below 640px, "so the card reads as an object on a field rather than as
// the page" (DESIGN.md:352). The ground itself is on `<body>` in
// app/layout.tsx.
//
// The card's contents — add input, error banner region, filter tabs, list, in
// that fixed order — arrive with Epics 2-4. Until then the card is genuinely
// empty, which is the whole of what this epic is meant to show.
export default function Page() {
  return (
    <main className="p-margin-phone">
      <div className="mx-auto max-w-card-max-width rounded-lg bg-card px-gutter py-6 shadow-card" />
    </main>
  );
}
