import { expect, test } from "@playwright/test";

import {
  addInput,
  assertClearOfStickyBlock,
  boxOf,
  checkbox,
  confirmDelete,
  deleteControl,
  deleteDialog,
  failNext,
  filterTab,
  interactiveElements,
  openDeleteDialog,
  retryControl,
  revealDeleteControl,
  row,
  rows,
  seed,
  stickyBlock,
  tabSequence,
  ADD_INPUT_LABEL,
  ITEM_ROUTE,
  RETRY,
} from "./support/app";

// The focus audit (epics.md Story 6.2 AC3-AC6, AC10, AC16-AC20; UX-DR21,
// EXPERIENCE.md:194, 198, 202).
//
// Everything here was previously read off source rather than measured. Tab
// order was inferred from element order, the focus ring from a `box-shadow`
// token, the 44px hit areas from a CSS custom property, and UX-DR21's "never
// even partially covered" from nothing at all, because until this story the
// offset it describes did not exist.
//
// So every assertion below reads geometry or computed style out of a real
// Chromium at a real viewport. Two rules hold throughout:
//
//   - Rectangles, not screenshots and not `toBeInViewport()`. The question is
//     whether one box overlaps another, and `assertClearOfStickyBlock` reports
//     both boxes on failure, because "by how much, and which way" is what the
//     reader needs next.
//   - Web-first assertions only. `waitForTimeout` appears nowhere in this
//     suite; where something has to settle, the assertion waits for it.
//
// A list long enough to scroll is the precondition for most of this, and
// `seed()` creates through the UI, so the fixture is 25 real Todos rather
// than a seeded database.

/**
 * Enough rows that the bottom of the list is well below the fold.
 *
 * Zero-padded, and that matters: `row()` filters by `hasText`, which is a
 * substring match, so an unpadded "Todo 01" also selects "Todo 10" through
 * "Todo 19" and every lookup in this file would be ambiguous.
 */
const MANY = Array.from(
  { length: 25 },
  (_, index) => `Todo ${String(index + 1).padStart(2, "0")}`,
);

/** Where the list can be, vertically, without a second scroll position. */
const SCROLL_POSITIONS = ["top", "middle", "bottom"] as const;

async function scrollTo(
  page: import("@playwright/test").Page,
  position: (typeof SCROLL_POSITIONS)[number],
): Promise<void> {
  await page.evaluate((where) => {
    const element = document.scrollingElement!;
    const extent = element.scrollHeight - element.clientHeight;
    element.scrollTop =
      where === "top" ? 0 : where === "middle" ? Math.floor(extent / 2) : extent;
  }, position);
}

test.describe("a focused control is never covered by the sticky block (AC3)", () => {
  test("clears the block when a row below the fold takes focus", async ({ page }) => {
    await page.goto("/");
    await seed(page, MANY);

    // The last row is the one furthest below the fold, so it is the row the
    // browser has to scroll the most to reach — and the one that would land
    // underneath the block if `scroll-padding-top` were unset.
    const last = row(page, "Todo 01");
    await last.scrollIntoViewIfNeeded();

    const control = checkbox(page, "Todo 01");
    await control.focus();

    await assertClearOfStickyBlock(page, control, "the last row's checkbox");
  });

  test("clears it for the delete control as well as the checkbox (AC2)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, MANY);

    // Both focusable descendants carry `scroll-clear-sticky`; the delete
    // control is the one that is revealed by focus, so this also exercises
    // the reveal happening while the scroll is being corrected.
    const target = deleteControl(page, "Todo 01");
    await row(page, "Todo 01").scrollIntoViewIfNeeded();
    await target.focus();

    await assertClearOfStickyBlock(page, target, "the last row's delete control");
  });

  test("keeps clearing it at every scroll position, in every view (AC5)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, MANY);

    // Give the Completed view something to hold, so all three views have rows
    // and the nine combinations are all real.
    await checkbox(page, "Todo 02").click();
    await checkbox(page, "Todo 04").click();

    for (const view of ["All", "Active", "Completed"] as const) {
      await filterTab(page, view).click();

      const count = await rows(page).count();
      expect(count, `the ${view} view has no rows to focus`).toBeGreaterThan(0);

      for (const position of SCROLL_POSITIONS) {
        await scrollTo(page, position);

        // The last visible row at this position — the one nearest the block
        // after the scroll, and so the one most likely to be covered.
        const control = rows(page).last().getByRole("checkbox");
        await control.focus();

        await assertClearOfStickyBlock(
          page,
          control,
          `a checkbox in the ${view} view, scrolled to the ${position}`,
        );
      }
    }
  });
});

test.describe("the offset re-measures when the block changes (AC4)", () => {
  test("still clears when the banner is occupied under a focused control", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, MANY);

    const block = stickyBlock(page);
    const atRest = await boxOf(block, "the sticky block");

    // Focus a row control first, then force the banner open underneath it —
    // the order that matters, because a measurement taken once at load would
    // now be stale.
    const control = checkbox(page, "Todo 03");
    await row(page, "Todo 03").scrollIntoViewIfNeeded();
    await control.focus();

    await failNext(page, "PATCH", ITEM_ROUTE);
    await control.click();
    await expect(retryControl(page)).toBeVisible();

    // MEASURED, and it contradicts the assumption this story was planned on.
    // epic-6-context says "the error banner region's occupancy changes the
    // block's height". It does not, for a one-line message: `banner-region`
    // reserves `touch-target-min + 2*spacing-4 + 2px` whether or not it holds
    // anything (app/globals.css:398), precisely so that "appearing does not
    // shift the list" (DESIGN.md:426). The block is the same height occupied
    // as empty, and that is the product working as designed.
    //
    // The reservation is one line tall by assumption, and `app/globals.css`
    // says so outright — "a message that wraps is taller than any fixed
    // reservation". The wrapping case is where the block really does grow,
    // and it is exercised in the test below rather than assumed here.
    const occupied = await boxOf(block, "the sticky block with the banner open");
    expect(
      Math.round(occupied.height),
      "the reserved region should make an occupied banner cost no height",
    ).toBe(Math.round(atRest.height));

    // What the criterion is actually about: the clearance still holds.
    await control.blur();
    await control.focus();
    await assertClearOfStickyBlock(
      page,
      control,
      "a checkbox with the error banner occupying the block",
    );
  });

  test("publishes the block's real height in every state and at every width", async ({
    page,
  }) => {
    // `pointer` only. This test drives `setViewportSize()`, and the `touch`
    // project is a Pixel 5 with `isMobile: true` — the combination
    // `playwright.config.ts` gives `narrow` its `isMobile: false` to avoid,
    // because mobile viewport emulation and a driven resize do not compose.
    // The labels below name real widths, which would also be wrong there.
    test.skip(
      test.info().project.name !== "pointer",
      "the width sweep needs a project that is not emulating a mobile viewport",
    );

    await page.goto("/");
    await seed(page, MANY);

    const block = stickyBlock(page);
    const measurements: string[] = [];

    async function checkHere(what: string): Promise<void> {
      const box = await boxOf(block, `the sticky block ${what}`);
      const published = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          "--sticky-block-height",
        ),
      );

      expect(
        Math.round(Number.parseFloat(published)),
        `${what}: the published height does not match the block`,
      ).toBe(Math.ceil(box.height));

      // The offset the browser will actually use has to agree too — a
      // property that is correct while `scroll-padding-top` resolves to
      // something else would pass the check above and still cover a control.
      const padding = await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollPaddingTop,
      );
      expect(Number.parseFloat(padding), `${what}: scroll padding`).toBe(
        Math.ceil(box.height),
      );

      measurements.push(`${what}: ${box.height.toFixed(1)}px`);
    }

    await checkHere("at rest, 1280px");

    // Occupied.
    await failNext(page, "PATCH", ITEM_ROUTE);
    await checkbox(page, "Todo 03").click();
    await expect(retryControl(page)).toBeVisible();
    await checkHere("with the banner open, 1280px");

    // And narrow, where the message wraps and the tabs are tightest.
    for (const width of [640, 393, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await expect(retryControl(page)).toBeVisible();
      await checkHere(`with the banner open, ${width}px`);
    }

    // MEASURED. epic-6-context planned this story on the assumption that
    // "the error banner region's occupancy changes the block's height", and
    // it never does — at any supported width. `banner-region` reserves
    // `touch-target-min + 2*spacing-4 + 2px` = 78px, and the 44px `Retry`
    // pill is the tallest thing in that row, so even a message wrapped to two
    // lines at 320px still fits inside the reservation. The block measures
    // the same in all five states above.
    //
    // That is the product working as designed (DESIGN.md:426 — "appearing
    // does not shift the list"), and it is recorded rather than asserted away:
    // the re-measurement machinery is still load-bearing for the viewport
    // changes AC10 covers, and it is what keeps this true if the copy or the
    // reservation ever changes.
    test.info().annotations.push({
      type: "AC4",
      description: measurements.join("; "),
    });

    // Focus still clears the block in the narrowest, fullest state.
    const control = checkbox(page, "Todo 05");
    await row(page, "Todo 05").scrollIntoViewIfNeeded();
    await control.focus();
    await assertClearOfStickyBlock(
      page,
      control,
      "a checkbox at 320px with the banner open",
    );
  });
});

test.describe("the clearance check can actually fail (negative fixture)", () => {
  test("reports a covered control when the offset is taken away", async ({
    page,
  }) => {
    // Every AC3 assertion above is an absence — "the control is not covered" —
    // and an absence proved by a helper that cannot fail proves nothing. This
    // removes the published height, which is precisely the state the product
    // was in before this story, and shows the same helper rejecting it.
    await page.goto("/");
    await seed(page, MANY);

    // A row in the middle of the list, not the last one: the last row cannot
    // be scrolled to the top of the viewport because the page runs out of
    // scroll first, so it stays clear of the block no matter what the offset
    // says — and the fixture would prove nothing.
    const control = checkbox(page, "Todo 12");
    await row(page, "Todo 12").scrollIntoViewIfNeeded();
    await control.focus();

    // With the offset in place, the control clears the block.
    await assertClearOfStickyBlock(page, control, "the checkbox, offset intact");

    // Take the measurement away and re-scroll the control to the top the way
    // an unpadded browser would, then confirm the helper objects.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--sticky-block-height", "0px");
      document.getElementById("sticky-top-block");
    });
    await control.evaluate((element) => element.scrollIntoView({ block: "start" }));

    let failed = false;
    try {
      await assertClearOfStickyBlock(page, control, "the checkbox, offset removed");
    } catch {
      failed = true;
    }

    expect(
      failed,
      "the clearance helper passed a control scrolled under the block — it cannot fail, so the AC3 assertions above are vacuous",
    ).toBe(true);
  });
});

test.describe("the offset is applied where the product says it is (AC1, AC2)", () => {
  test("resolves scroll padding on the root and scroll margin on the controls", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Measure me"]);

    const measured = await boxOf(stickyBlock(page), "the sticky block");

    const padding = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    expect(Number.parseFloat(padding)).toBe(Math.ceil(measured.height));

    // Both focusable row descendants, as AC2 names them.
    for (const [what, locator] of [
      ["checkbox", checkbox(page, "Measure me")],
      ["delete control", deleteControl(page, "Measure me")],
    ] as const) {
      const margin = await locator.evaluate(
        (element) => getComputedStyle(element).scrollMarginTop,
      );
      expect(
        Number.parseFloat(margin),
        `the ${what} does not carry the sticky offset as scroll margin`,
      ).toBe(Math.ceil(measured.height));
    }
  });

  test("falls back to 0px if the measurement never arrives (AC2)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Fallback"]);

    // Both declarations read `var(--sticky-block-height, 0px)`, and the
    // fallback is the load-bearing half: a browser without `ResizeObserver`,
    // a crash in the client bundle, or a server render that never hydrates
    // leaves the property unset. What must not happen is
    // `scroll-padding-top: var(--undefined)`, which is an invalid declaration
    // and would take the whole rule with it.
    //
    // Simulated by removing the property the hook published, which is exactly
    // the state those three cases leave behind.
    await page.evaluate(() =>
      document.documentElement.style.removeProperty("--sticky-block-height"),
    );

    const padding = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    expect(Number.parseFloat(padding)).toBe(0);

    const margin = await checkbox(page, "Fallback").evaluate(
      (element) => getComputedStyle(element).scrollMarginTop,
    );
    expect(Number.parseFloat(margin)).toBe(0);

    // `0px`, not the empty string and not `auto`: an unresolvable
    // `var(--sticky-block-height)` with no fallback would make the whole
    // declaration invalid, and the property would report its initial value.
    // Reading the raw string is what tells those apart — `parseFloat("auto")`
    // is `NaN`, which the numeric assertion above would already have caught,
    // but `parseFloat("0px")` and `parseFloat("0")` are both 0.
    expect(padding).toBe("0px");
  });

  test("hard-codes nothing — the property tracks the block (AC1)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["One"]);

    const block = await boxOf(stickyBlock(page), "the sticky block");
    const published = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sticky-block-height",
      ),
    );

    expect(published.trim()).not.toBe("");
    expect(Math.round(Number.parseFloat(published))).toBe(
      Math.ceil(block.height),
    );
  });
});

test.describe("the tab order is the reading order (AC16, AC17)", () => {
  test("runs input, Retry, the three tabs, then each row's two controls", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["First", "Second"]);

    // Occupy the banner so `Retry` is in the order, which is the case
    // EXPERIENCE.md:194 describes and the only one where the region
    // contributes a tab stop.
    await failNext(page, "PATCH", ITEM_ROUTE);
    await checkbox(page, "First").click();
    await expect(retryControl(page)).toBeVisible();

    // Start from the very top of the document, so the first Tab lands on the
    // first control rather than wherever focus happened to be.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.locator("body").click({ position: { x: 1, y: 1 } });

    const order = await tabSequence(page, 7);

    // Newest-first ordering means "Second" is the first row, so the row
    // controls at the end of the sequence are its.
    //
    // The names are the product's real accessible names, not tidied ones: a
    // filter tab is named with its count ("All 2"), because the count is part
    // of what a screen reader reads, and the delete control names the Todo it
    // would remove ("Delete Second") rather than saying "Delete" seven times
    // in a list of seven rows. Both are the right behaviour, and asserting
    // the literal names is what keeps this test honest about what is spoken.
    expect(order).toEqual([
      `input:${ADD_INPUT_LABEL}`,
      `button:${RETRY}`,
      "button:All 2",
      "button:Active 2",
      "button:Completed 0",
      "button:Second",
      "button:Delete Second",
    ]);
  });

  test("makes every row's delete control reachable and visible on focus (AC17)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Reachable"]);

    const control = deleteControl(page, "Reachable");

    // It starts hidden — that is the reveal the audit is checking, and
    // without this the assertion below could pass on a control that was
    // always visible.
    await expect(control).toHaveCSS("opacity", "0");

    await control.focus();

    // Focus alone reveals it. `toHaveCSS` is web-first, so it waits out the
    // transition rather than sampling mid-fade.
    await expect(control).toHaveCSS("opacity", "1");
    await expect(control).toBeFocused();
  });
});

test.describe("every interactive element is big enough to hit (AC18)", () => {
  test("reaches at least 44px in both dimensions, dialog included", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Measure my controls"]);

    // The delete control is revealed before measuring: a control mid-fade has
    // a box, but it is not the box a finger would meet.
    await revealDeleteControl(page, "Measure my controls");

    const undersized: string[] = [];

    async function measureAll(where: string): Promise<void> {
      const controls = interactiveElements(page);
      const count = await controls.count();
      expect(count, `no interactive elements found ${where}`).toBeGreaterThan(0);

      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        if (!(await control.isVisible())) continue;

        const measured = await control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          let width = rect.width;
          let height = rect.height;

          // DESIGN.md:354 — "the hit area is padded out to 44px without
          // changing the mark". Both `checkbox-hit-area` and
          // `delete-hit-area` deliver that as a centred `::after` overlay, so
          // the element's own border box is the *mark*, not the target. The
          // overlay is what a pointer actually meets.
          const after = getComputedStyle(element, "::after");
          if (after.content !== "none" && after.content !== "") {
            width = Math.max(width, Number.parseFloat(after.width) || 0);
            height = Math.max(height, Number.parseFloat(after.height) || 0);
          }

          // The add input's reach is its bordered wrapper — `input-add`
          // carries `min-width` and the element carries
          // `min-h-touch-target-min` — and the `<input>` inside it is only as
          // tall as its text.
          const wrapper = element.closest(".input-add");
          if (wrapper !== null) {
            const box = wrapper.getBoundingClientRect();
            width = Math.max(width, box.width);
            height = Math.max(height, box.height);
          }

          const label =
            element.getAttribute("aria-label") ??
            element.textContent?.trim() ??
            element.tagName.toLowerCase();

          return { width, height, label };
        });

        if (measured.width < 44 || measured.height < 44) {
          undersized.push(
            `${where}: "${measured.label}" reaches ${measured.width.toFixed(1)}x${measured.height.toFixed(1)}`,
          );
        }
      }
    }

    await measureAll("on the list");

    // The dialog's own buttons, which are on a surface that only exists while
    // it is open and so are never measured by a pass over the list alone.
    await openDeleteDialog(page, "Measure my controls");
    await expect(deleteDialog(page)).toBeVisible();
    await measureAll("in the delete dialog");

    expect(undersized, "controls below the 44px floor").toEqual([]);
  });
});

test.describe("focus is visible, and trapped only where it should be (AC19, AC20)", () => {
  test("gives every focusable control a visible focus indicator (AC20)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Ring me"]);

    // One Active row and one Completed row, because the ring is a different
    // token on mint (`shadow-focus-on-complete`) and a control that lost its
    // ring on only one of the two surfaces would pass a single-row check.
    await seed(page, ["Complete me"]);
    await checkbox(page, "Complete me").click();
    await expect(checkbox(page, "Complete me")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const ringless: string[] = [];
    for (const [what, locator] of [
      ["the add input", addInput(page)],
      ["an Active row's checkbox", checkbox(page, "Ring me")],
      ["a Completed row's checkbox", checkbox(page, "Complete me")],
      ["a row's delete control", deleteControl(page, "Ring me")],
      ["the All tab", filterTab(page, "All")],
    ] as const) {
      await locator.focus();

      // The ring is painted by a `box-shadow` — on the input it is the
      // wrapper's `focus-within`, which is why the shadow is read from the
      // focused element *or* its parent rather than from the element alone.
      const shadow = await locator.evaluate((element) => {
        const own = getComputedStyle(element).boxShadow;
        if (own !== "none") return own;
        const parent = element.parentElement;
        return parent === null ? "none" : getComputedStyle(parent).boxShadow;
      });

      if (shadow === "none" || shadow === "") ringless.push(what);
    }

    expect(ringless, "controls with no visible focus indicator").toEqual([]);
  });

  test("keeps focus off the page behind the dialog, and Escape releases it (AC19)", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Trap me"]);

    await openDeleteDialog(page, "Trap me");
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();

    // What "trapped" has to mean operationally: no control *behind* the
    // dialog can be reached. Asserted that way rather than as "focus never
    // leaves the dialog subtree", because Chromium's tab cycle for a modal
    // `<dialog>` passes through the browser's own UI, where
    // `document.activeElement` reports `body` — a wrap through the user
    // agent, not a leak to the page. Treating that as a failure would be
    // measuring the browser rather than the product.
    const reachedBehind: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");

      const leaked = await page.evaluate(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) return null;

        const modal = document.querySelector("dialog[open]");
        if (modal !== null && modal.contains(active)) return null;

        // Focus is on a real element that is not in the dialog. If it is one
        // of the page's own controls, the dialog is not trapping.
        const label =
          active.getAttribute("aria-label") ??
          active.textContent?.trim().slice(0, 40) ??
          "";
        return `${active.tagName.toLowerCase()}:${label}`;
      });

      if (leaked !== null) reachedBehind.push(`stop ${index + 1} → ${leaked}`);
    }

    expect(
      reachedBehind,
      "a control behind the dialog took focus while it was open",
    ).toEqual([]);

    // Escape closes it, and the platform restores focus to the trigger. That
    // restore is the half EXPERIENCE.md:202 is about — a dialog close is
    // exactly where focus gets dropped to the document body — so it is
    // asserted rather than described.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const restored = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) return "(body)";
      return (
        active.getAttribute("aria-label") ??
        active.textContent?.trim().slice(0, 40) ??
        active.tagName.toLowerCase()
      );
    });
    expect(restored, "focus was dropped when the dialog closed").not.toBe(
      "(body)",
    );
    expect(restored).toContain("Delete");
  });

  test("does not trap focus on the page itself (AC19)", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["Let me out"]);

    // Tab well past the last control. With no dialog open, focus must be able
    // to leave the document — a page that cycles forever is a keyboard trap
    // under 2.1.2, and the usual cause is a hand-rolled focus handler.
    const stops = await tabSequence(page, 12);

    // `(body)` is what `tabSequence` reports when focus has left the page's
    // controls — either to the browser chrome or back to the document.
    expect(
      stops.includes("(body)"),
      `focus never left the page's controls: ${stops.join(" -> ")}`,
    ).toBe(true);
  });

  test("closes the dialog on Escape without deleting anything", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Still here"]);

    await openDeleteDialog(page, "Still here");
    await page.keyboard.press("Escape");

    await expect(deleteDialog(page)).toBeHidden();
    await expect(row(page, "Still here")).toBeVisible();

    // And the dialog still works afterwards — an Escape that left the element
    // in a half-closed state would show up here rather than in the assertion
    // above.
    await openDeleteDialog(page, "Still here");
    await expect(deleteDialog(page)).toBeVisible();
    await confirmDelete(page).click();
    await expect(row(page, "Still here")).toBeHidden();
  });
});
