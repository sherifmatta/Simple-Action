// One skeleton row (epics.md Story 2.5 AC5, AC6, AC7 and AC8; DESIGN.md
// `components.skeleton-row`, DESIGN.md:432; mockups/key-states.html).
//
// "Skeletons are geometry, not decoration" (epic-2-context). The `<li>`'s
// class string below is the Active row's own geometry, class for class — same
// fill, same radius, same padding, same row shadow, same minimum height, same
// flex layout and gap — because the only job this component has is to hold
// the space the real row will take, so that content landing shifts nothing.
// `skeleton-row.test.ts` asserts that equality against `todo-row.tsx` rather
// than trusting the two strings to stay in step.
//
// One bar, not two, and that is what makes the zero-shift claim true. An
// Active row's content box is `14px + max(21px checkbox, 21.03px text line
// box) + 14px`; a skeleton with one 12px bar is governed by the same 21px
// checkbox placeholder and lands within a rounding error of it. A second
// stacked bar would push the content box to roughly 24px and move every row
// down by 3px the moment the real list arrived. The mockup agrees — one line
// per skeleton row.
//
// Nothing here is computed, and nothing here reads a preference. The three
// rows differ in pulse delay and bar width, and that variation lives in
// `app/globals.css` as position selectors inside the recipe: a computed
// `className` would fail `dynamicClassNames()`, an inline `style` would fail
// `opaqueMarkup()`, and an arbitrary-value width class would fail the AD-13
// scan in `app/page.test.ts`. Stillness arrives the same way — as a
// `data-still` marker the list region sets from the motion module, which the
// recipe suppresses the animation on (AR-28: one attribute, descendants
// derive).
//
// `aria-hidden`, because a placeholder is a picture of a row and not a row.
// What the region *says* while it loads — and whether it is `aria-busy` — is
// Story 2.6's, which owns every announcement in this epic.

/**
 * The three rows DESIGN.md's `components.skeleton-row.count` asks for.
 *
 * Named keys rather than indices: the count is the array's length, so there
 * is no separate number to keep in step, and no row is keyed by its position
 * in a list (AD-5's rule for real rows, kept here so the two read alike).
 */
export const SKELETON_ROW_KEYS = ["first", "second", "third"] as const;

export function SkeletonRow() {
  return (
    <li
      aria-hidden="true"
      className="skeleton-row flex min-h-touch-target-min items-center gap-4 rounded-md bg-row-active p-row-padding shadow-row"
    >
      {/*
        The checkbox placeholder and the text placeholder. Both rest at
        `{colors.hairline}` and pulse toward `{colors.tab-track}`; the resting
        fill is a token class here, on the element, and only the untokenised
        geometry and the animation live in the recipe.
      */}
      <span className="skeleton-box flex-none rounded-sm bg-hairline" />
      <span className="skeleton-bar rounded-full bg-hairline" />
    </li>
  );
}
