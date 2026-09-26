import { expect, test, type Page } from "@playwright/test";

import {
  addInput,
  boxOf,
  card,
  interactiveElements,
  row,
  rows,
  seed,
  stickyBlock,
  todoList,
  LONG_TODO_TEXT,
} from "./support/app";

// The responsive audit (epics.md Story 6.2 AC6-AC10, and AC21's DOM half;
// EXPERIENCE.md's layout commitments, DESIGN.md:340).
//
// Three claims from earlier epics were reasoned from specifications rather
// than observed, and `deferred-work.md` records each with Epic 6 named as the
// owner:
//
//   - the sticky block holds, under the body's `overflow-x-hidden`
//     (CSS Overflow 3 §3.3 says the used overflow propagates to the viewport
//     and the body computes back to `visible` — correct reading, never seen)
//   - 500 characters wrap inside a 320px viewport rather than pushing the row
//     wide (`overflow-wrap: anywhere` and flex min-content resolution, read
//     off the specification; DESIGN.md:340 flags Poppins' wide letterforms as
//     an independent tension)
//   - the card caps at 640px and nothing appears beside it
//
// None of those is a thing jsdom or a Tailwind compilation can answer. This
// file runs in the `narrow` project — 320x568, WCAG 1.4.10's reflow floor —
// and on `touch`, whose 393px Pixel 5 is a real phone but not the floor.
//
// The width sweep drives `setViewportSize()`, which is why the `narrow`
// project sets `isMobile: false` while keeping `hasTouch`: mobile viewport
// emulation and a driven resize do not compose.

/** The widths AC7 and AC9 sample, from the reflow floor to a wide desktop. */
const WIDTHS = [320, 393, 640, 1024, 1440] as const;

/** DESIGN.md's one-column ceiling. */
const CARD_MAX = 640;

function isNarrow(): boolean {
  return test.info().project.name === "narrow";
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const element = document.scrollingElement!;
    return element.scrollWidth - element.clientWidth;
  });
}

test.describe("the input stays within a thumb's reach (AC6)", () => {
  test("keeps the sticky block pinned at the top at every scroll position", async ({
    page,
  }) => {
    await page.goto("/");
    // Enough rows to overflow the *taller* of the two viewports this test runs
    // on. `narrow` is 320x568, but `touch` is a Pixel 5 at 393x851, and eight
    // rows clear the first while fitting inside the second — which made the
    // block never pin there, because nothing scrolled.
    await seed(page, Array.from({ length: 12 }, (_, index) => `Row ${index + 1}`));

    const block = stickyBlock(page);

    // Stated as a precondition rather than assumed. If the fixture ever stops
    // overflowing the viewport, every assertion below would pass trivially —
    // the block would sit at its resting offset and never be asked to pin.
    const scrollable = await page.evaluate(() => {
      const element = document.scrollingElement!;
      return element.scrollHeight - element.clientHeight;
    });
    expect(
      scrollable,
      "the fixture does not overflow this viewport, so nothing can be pinned",
    ).toBeGreaterThan(100);

    // Where the block sits before anything has scrolled: below `main`'s
    // phone margin and the card's own top padding. `top-0` pins it *once it
    // would otherwise leave the viewport*, so its natural offset is the right
    // answer at the top and 0 is the right answer everywhere else. Asserting
    // 0 at every position would be asserting that the page is permanently
    // scrolled.
    const resting = Math.round(
      (await boxOf(block, "the sticky block at rest")).y,
    );
    expect(resting, "the block should start below the card's top edge")
      .toBeGreaterThan(0);

    for (const position of ["top", "middle", "bottom"] as const) {
      await page.evaluate((where) => {
        const element = document.scrollingElement!;
        const extent = element.scrollHeight - element.clientHeight;
        element.scrollTop =
          where === "top"
            ? 0
            : where === "middle"
              ? Math.floor(extent / 2)
              : extent;
      }, position);

      // The block's top edge stays at the viewport's top — which is the whole
      // of "one tap away", and the claim that was read off
      // `position: sticky` rather than observed. A body with
      // `overflow-x-hidden` is exactly the arrangement that is widely
      // reported to break stickiness when the declaration is on `<html>`
      // instead; this is the observation that settles it for this product.
      const box = await boxOf(block, `the sticky block, scrolled to the ${position}`);
      expect(
        Math.round(box.y),
        `the sticky block came unstuck when scrolled to the ${position}`,
      ).toBe(position === "top" ? resting : 0);

      // And the add input is inside it, so reach follows from the block.
      const field = await boxOf(addInput(page), "the add input");
      expect(field.y).toBeGreaterThanOrEqual(box.y);
      expect(field.y + field.height).toBeLessThanOrEqual(box.y + box.height + 1);
    }
  });
});

test.describe("nothing ever scrolls sideways (AC7)", () => {
  test("has no horizontal overflow at any sampled width", async ({ page }) => {
    test.skip(!isNarrow(), "the width sweep drives the viewport itself");

    await page.goto("/");
    await seed(page, ["A short one", LONG_TODO_TEXT]);

    const offenders: string[] = [];

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });

      // Web-first: wait for the layout to settle at the new width by
      // asserting on something that depends on it, rather than sleeping.
      await expect(todoList(page)).toBeVisible();

      const overflow = await horizontalOverflow(page);
      if (overflow > 0) {
        // Name the element that is too wide, because "the page scrolls
        // sideways" is not actionable on its own.
        const widest = await page.evaluate(() => {
          const limit = document.scrollingElement!.clientWidth;
          for (const element of document.querySelectorAll("*")) {
            const box = element.getBoundingClientRect();
            if (box.right > limit + 1) {
              return `${element.tagName.toLowerCase()}.${element.className || "(no class)"} → right=${box.right.toFixed(1)}`;
            }
          }
          return "(no single element exceeds the viewport)";
        });
        offenders.push(`${width}px: overflow ${overflow}px, ${widest}`);
      }
    }

    expect(offenders, "the page scrolls sideways").toEqual([]);
  });
});

test.describe("a 500-character Todo wraps rather than clipping (AC8)", () => {
  test("lays out every character at the reflow floor", async ({ page }) => {
    test.skip(!isNarrow(), "AC8 is about the 320px floor specifically");

    await page.goto("/");
    await seed(page, [LONG_TODO_TEXT]);

    const target = row(page, LONG_TODO_TEXT);
    await expect(target).toBeVisible();

    // The text node carries all 500 characters — nothing was truncated on the
    // way in.
    const text = await target.textContent();
    expect(text).toContain(LONG_TODO_TEXT);

    // Nothing is clipping or ellipsising it. These are the three declarations
    // that would hide the overflow instead of reflowing it, and DESIGN.md:340
    // names the lever as text size and line-height, never truncation.
    const textElement = target.locator("span").first();
    const styles = await textElement.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        textOverflow: computed.textOverflow,
        overflow: computed.overflow,
        whiteSpace: computed.whiteSpace,
        lineClamp: computed.getPropertyValue("-webkit-line-clamp"),
        lineHeight: computed.lineHeight,
        fontSize: computed.fontSize,
      };
    });
    expect(styles.textOverflow).toBe("clip");
    expect(styles.whiteSpace).not.toBe("nowrap");
    expect(["none", ""]).toContain(styles.lineClamp.trim());

    // The row grew to hold it rather than keeping a fixed height. A single
    // line at this font size would be about 20px; 500 characters at 320px
    // cannot be fewer than a dozen lines.
    const box = await boxOf(target, "the 500-character row");
    const lineHeight = Number.parseFloat(styles.lineHeight);
    const lines = Math.round(box.height / lineHeight);

    expect(
      lines,
      `a 500-character Todo rendered in ${lines} line(s) at 320px — it is not wrapping`,
    ).toBeGreaterThan(8);

    // And it did not push the page sideways doing it, which is the flex
    // min-content resolution that `overflow-wrap: anywhere` is relied on for.
    expect(await horizontalOverflow(page)).toBe(0);

    // The measurement AC8 asks to be recorded, rather than only asserted.
    test
      .info()
      .annotations.push({
        type: "AC8",
        description: `500 characters at 320px: row ${box.height.toFixed(1)}px tall, ${lines} lines at ${styles.fontSize}/${styles.lineHeight}`,
      });
  });
});

test.describe("the card caps and nothing appears beside it (AC9)", () => {
  test("stops at 640px and stays one column at every width", async ({ page }) => {
    test.skip(!isNarrow(), "the width sweep drives the viewport itself");

    await page.goto("/");
    await seed(page, ["One column only"]);

    const wrong: string[] = [];

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await expect(todoList(page)).toBeVisible();

      const box = await boxOf(card(page), "the card");

      // At or below the cap the card fills the viewport less its margins; above
      // it, the card stops and the ground widens around it.
      // The ceiling itself — never wider than the token, at any width.
      if (box.width > CARD_MAX + 1) {
        wrong.push(`${width}px: the card measured ${box.width.toFixed(1)}px`);
      }

      // Below the ceiling the card fills the viewport less `main`'s margin on
      // each side, which is what "the card fills the viewport less a margin"
      // means (epic-6-context). At 640px the viewport is exactly the token, so
      // the margin still applies and the card is 604px — the cap has not
      // engaged yet. It engages once the viewport exceeds the token plus both
      // margins, and only then is an exact 640 the right expectation.
      const margin = (viewportWidth: number) => viewportWidth - box.width;
      if (box.width < CARD_MAX) {
        const gutter = margin(width);
        if (gutter < 1) {
          wrong.push(`${width}px: the card has no margin beside it`);
        }
      } else if (Math.round(box.width) !== CARD_MAX) {
        wrong.push(
          `${width}px: the card should have capped at ${CARD_MAX}px, measured ${box.width.toFixed(1)}px`,
        );
      }

      // One list region, one card — no sidebar, no second column appearing at
      // a breakpoint.
      expect(await todoList(page).count(), `${width}px: not exactly one list region`).toBe(1);
      expect(await card(page).count(), `${width}px: not exactly one card`).toBe(1);
    }

    expect(wrong, "the card's width ceiling").toEqual([]);
  });
});

test.describe("a shrinking viewport re-seats the block (AC10)", () => {
  test("keeps the block pinned and re-measures when the height changes", async ({
    page,
  }) => {
    test.skip(!isNarrow(), "this test drives the viewport height itself");

    await page.goto("/");
    await seed(page, Array.from({ length: 8 }, (_, index) => `Row ${index + 1}`));

    // Scroll away from the top first — a block that is only correct at scroll
    // position zero would pass a check taken at the top.
    await page.evaluate(() => {
      const element = document.scrollingElement!;
      element.scrollTop = Math.floor(
        (element.scrollHeight - element.clientHeight) / 2,
      );
    });

    const before = await boxOf(stickyBlock(page), "the sticky block");

    // A phone's address bar collapsing, as closely as a headless browser can
    // express it. A real address bar cannot be driven here — that limitation
    // is recorded rather than claimed away — but the viewport-height change it
    // causes is exactly this, and it is what the hook's `visualViewport`
    // listener exists for.
    await page.setViewportSize({ width: 320, height: 420 });
    await expect(todoList(page)).toBeVisible();

    const after = await boxOf(stickyBlock(page), "the sticky block after the resize");
    expect(Math.round(after.y), "the block came unstuck after the resize").toBe(0);

    // The published measurement still matches the block it describes.
    const published = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sticky-block-height",
      ),
    );
    expect(Math.round(Number.parseFloat(published))).toBe(Math.ceil(after.height));

    // The block's height is unchanged by a height-only resize — its occupants
    // did not reflow — so this also confirms the re-measure wrote the same
    // number rather than a stale or absent one.
    expect(Math.round(after.height)).toBe(Math.round(before.height));
  });
});

test.describe("the banned patterns are absent from the running product (AC21)", () => {
  test("shows no toast, no undo, no second dialog and no hover-only control", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Audit me"]);

    // At most one dialog element exists in the whole document, and it is
    // closed until asked for.
    expect(await page.locator("dialog").count()).toBeLessThanOrEqual(1);
    expect(await page.locator("dialog[open]").count()).toBe(0);

    // Nothing is positioned fixed — a toast's signature, and the thing that
    // would cover the sticky block.
    const fixed = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((element) => getComputedStyle(element).position === "fixed")
        .map((element) => element.tagName.toLowerCase()),
    );
    expect(fixed, "an element is positioned fixed").toEqual([]);

    // No control offers to undo anything.
    const controls = interactiveElements(page);
    const labels: string[] = [];
    for (let index = 0; index < (await controls.count()); index += 1) {
      const text = (await controls.nth(index).textContent())?.trim() ?? "";
      const label = (await controls.nth(index).getAttribute("aria-label")) ?? "";
      labels.push(`${text} ${label}`.toLowerCase());
    }
    expect(labels.filter((entry) => /undo|restore/.test(entry))).toEqual([]);

    // Exactly one scrolling element — the page body. A nested scroller is
    // what "the card has no visible bottom edge" would otherwise become.
    const scrollers = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].filter((element) => {
        const overflow = getComputedStyle(element).overflowY;
        return (
          (overflow === "auto" || overflow === "scroll") &&
          element.scrollHeight > element.clientHeight
        );
      }).length,
    );
    expect(scrollers, "a nested scroll region exists").toBe(0);
  });

  test("grows the list without paginating it", async ({ page }) => {
    await page.goto("/");
    // Eight is enough to overflow the 320x568 viewport, which is the
    // condition a paginating list would react to. The claim is "every Todo is
    // present at once", not "many Todos are".
    await seed(page, Array.from({ length: 8 }, (_, index) => `Item ${index + 1}`));

    // No "load more", no windowing, no sentinel row that fetches when it
    // scrolls into view — every row that was created is in the DOM.
    await expect(rows(page)).toHaveCount(8);

    const moreControls = page.getByRole("button", {
      name: /load more|show more|next page/i,
    });
    expect(await moreControls.count()).toBe(0);
  });
});
