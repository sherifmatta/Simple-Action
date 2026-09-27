import { expect, test } from "@playwright/test";

import {
  addTodo,
  checkbox,
  deleteControl,
  deleteDialog,
  row,
  DIALOG_TITLE,
} from "./support/app";

// The checkbox, pressed by a real browser.
//
// `deferred-work.md:351` is the entry this file closes, and it is worth
// quoting because it is unusually precise about what was missing:
//
//   "No browser has pressed the checkbox — Enter and Space are asserted as the
//   *absence* of a key handler plus a synthesised click, because jsdom
//   implements no activation behaviour at all."
//
// `todo-row.render.test.tsx` presses the key for real, confirms nothing in the
// row called `preventDefault` on it, and then dispatches the click the
// platform would have dispatched. That proves there is exactly one activation
// path and no hand-written key handler competing with it. It does not prove
// the platform performs the activation, because jsdom does not: the entry
// records a probe showing zero `click` events from either key. The claim that
// Enter and Space activate was therefore read off HTML's button activation
// behaviour rather than observed — the same shape as Story 2.3's unobserved
// `position: sticky` and Story 2.4's unobserved wrap, both of which Epic 6
// measured.
//
// The status control is a `<button role="checkbox">`, which is what makes the
// question live rather than pedantic. A native `<input type="checkbox">`
// activates on Space and not on Enter; a `<button>` activates on both. The
// product's accessible role says one thing and its element says another, and
// only a browser settles which behaviour the user gets.
//
// Runs on both projects. EXPERIENCE.md writes the keyboard route as available
// on any device, and `journeys.spec.ts` already proves the delete route that
// way; the cost of the second project here is two key presses.

const TODO = "water the plants";

test.describe("the status control activates on Enter and on Space (AC9)", () => {
  test("toggles on Enter, and again on Space, with no click anywhere", async ({
    page,
  }) => {
    await page.goto("/");
    await addTodo(page, TODO);

    const control = checkbox(page, TODO);
    await control.focus();
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute("aria-checked", "false");

    await page.keyboard.press("Enter");
    await expect(control).toHaveAttribute("aria-checked", "true");
    // The row's own completed marker, not just the control's state — the whole
    // row is what the user sees change.
    await expect(row(page, TODO)).toHaveAttribute("data-completed", "true");

    // Focus survives the toggle, which is what makes the second press possible
    // without reaching for the mouse.
    await expect(control).toBeFocused();

    await page.keyboard.press(" ");
    await expect(control).toHaveAttribute("aria-checked", "false");
    await expect(row(page, TODO)).not.toHaveAttribute("data-completed", "true");
  });

  test("activates exactly once per press — one PATCH, not two", async ({
    page,
  }) => {
    await page.goto("/");
    await addTodo(page, TODO);

    // Counted from the wire rather than from the rendered state, because a
    // second activation setting the same value is invisible on screen. This is
    // the half the render test reaches for and cannot have: it proves one
    // activation path by proving the absence of a handler, and a browser that
    // fired both a key activation and a synthetic click would still satisfy it.
    const sets: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") sets.push(request.url());
    });

    const control = checkbox(page, TODO);
    await control.focus();

    await page.keyboard.press("Enter");
    await expect(control).toHaveAttribute("aria-checked", "true");
    expect(sets).toHaveLength(1);

    await page.keyboard.press(" ");
    await expect(control).toHaveAttribute("aria-checked", "false");
    expect(sets).toHaveLength(2);
  });

  test("Space activates the control rather than scrolling the page", async ({
    page,
  }) => {
    await page.goto("/");
    // Enough rows that the page has somewhere to scroll to, so a Space that
    // reached the document would move it measurably.
    //
    // Zero-padded, for the reason `audit-focus.spec.ts` gives: the accessible
    // name is the Todo's own text and `getByRole` matches it as a substring,
    // so an unpadded "1" also selects "10" and the locator is ambiguous.
    const many = Array.from(
      { length: 10 },
      (_, index) => `${TODO} ${String(index + 1).padStart(2, "0")}`,
    );
    for (const text of many) {
      await addTodo(page, text);
    }

    const control = checkbox(page, `${TODO} 01`);
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    const before = await page.evaluate(() => window.scrollY);

    await page.keyboard.press(" ");

    await expect(control).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe("the delete control answers the same two keys", () => {
  test("opens the dialog on Enter", async ({ page }) => {
    await page.goto("/");
    await addTodo(page, TODO);

    await deleteControl(page, TODO).focus();
    await page.keyboard.press("Enter");

    await expect(deleteDialog(page)).toBeVisible();
    await expect(deleteDialog(page)).toContainText(DIALOG_TITLE);
  });

  test("opens the dialog on Space", async ({ page }) => {
    await page.goto("/");
    await addTodo(page, TODO);

    await deleteControl(page, TODO).focus();
    await page.keyboard.press(" ");

    await expect(deleteDialog(page)).toBeVisible();
  });
});
