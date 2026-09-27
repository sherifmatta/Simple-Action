import { expect, test } from "@playwright/test";

import {
  addInput,
  banner,
  checkbox,
  describeViolations,
  emptyPanel,
  expectNoViolations,
  failNext,
  filterTab,
  holdOpen,
  openDeleteDialog,
  retryControl,
  rows,
  scanPage,
  seed,
  skeletons,
  ADD_FAILED,
  FIRST_RUN_LINE,
  ITEM_ROUTE,
  LIST_ROUTE,
  LOAD_FAILED,
  NOTHING_ACTIVE,
  NOTHING_COMPLETED,
} from "./support/app";

// The conformance scan (WCAG 2.1 AA, via axe-core).
//
// Everything else under `e2e/audit-*.spec.ts` asserts a criterion somebody
// thought to write down: Story 6.2 measured focus reach, hit areas, tab order
// and reflow one at a time. That is the right shape for the criteria this
// product's design makes specific claims about, and the wrong shape for the
// rest of the standard — an unlabelled control, a dangling `aria-labelledby`,
// a role nested where its parent is required, a missing document language, a
// contrast pair the tokens permit but the composition breaks. Nobody writes
// a bespoke test for those; an engine finds them or nothing does.
//
// So this file adds no new criteria of its own. It walks the product through
// the states the suite can already reach and asks axe the same question at
// each one, because a rule engine pointed at a single screen proves only that
// one screen. The states are the ones with distinct markup: first run, a
// populated list, each filter view, the two empty views, the error banner
// occupied, the confirmation dialog open, and the list mid-load.
//
// What this file may NOT do is quiet a rule. `scanPage`'s `disabled` argument
// exists for exactly one case — a violation whose only fix is a design-token
// change, which AD-13 puts in human hands — and every use of it must name the
// `deferred-work.md` entry that records the measurement. It is unused today.

test.describe("the product conforms to WCAG AA in every state it can reach", () => {
  test("on first run, with nothing in the list", async ({ page }) => {
    await page.goto("/");
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);

    await expectNoViolations(page, "on first run");
  });

  test("with a populated list, in each of the three filter views", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["Buy milk", "Renew the passport", "Call the dentist"]);

    // One row in each completion status, so the All view carries both row
    // treatments at once — they are different token sets, and contrast is
    // computed per element.
    await checkbox(page, "Buy milk").click();
    await expect(checkbox(page, "Buy milk")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    for (const view of ["All", "Active", "Completed"] as const) {
      await filterTab(page, view).click();
      await expect(filterTab(page, view)).toHaveAttribute("aria-selected", "true");
      await expect(rows(page).first()).toBeVisible();

      await expectNoViolations(page, `in the ${view} view`);
    }
  });

  test("with a filter view that has nothing to show", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["The only Todo"]);

    // Completed is empty while the one row is active...
    await filterTab(page, "Completed").click();
    await expect(emptyPanel(page)).toContainText(NOTHING_COMPLETED);
    await expectNoViolations(page, "in an empty Completed view");

    // ...and Active is empty once it is not. Both empty panels carry their
    // own copy and their own art, so neither stands in for the other.
    await filterTab(page, "All").click();
    await checkbox(page, "The only Todo").click();
    await expect(checkbox(page, "The only Todo")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await filterTab(page, "Active").click();
    await expect(emptyPanel(page)).toContainText(NOTHING_ACTIVE);
    await expectNoViolations(page, "in an empty Active view");
  });

  test("with the error banner occupied and Retry on screen", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["Fail me"]);

    await failNext(page, "PATCH", ITEM_ROUTE);
    await checkbox(page, "Fail me").click();
    await expect(retryControl(page)).toBeVisible();

    // The banner is the one region that appears only on failure, and its
    // pill is the only control in the product that is not always present.
    await expectNoViolations(page, "with the error banner occupied");
  });

  test("with the list itself refused, so the card holds a banner and nothing else", async ({
    page,
  }) => {
    // A different composition from the PATCH failure above: the banner sits
    // over an empty card rather than over rows, with no skeletons and no
    // empty panel — the list's contents are unknown rather than known-empty.
    await failNext(page, "GET", LIST_ROUTE);
    await page.goto("/");

    await expect(banner(page)).toContainText(LOAD_FAILED);
    await expect(rows(page)).toHaveCount(0);

    await expectNoViolations(page, "with the list read refused");
  });

  test("with an add refused and the text returned to the field", async ({ page }) => {
    await page.goto("/");
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);

    // `addTodo` waits for the server to confirm, so a refused add is driven
    // by hand. The state is distinct: the field is repopulated and focused
    // while the banner is occupied, which no other state here reaches.
    const field = addInput(page);
    await field.click();
    await field.fill("Refuse me");
    await failNext(page, "POST", LIST_ROUTE);
    await field.press("Enter");

    await expect(banner(page)).toContainText(ADD_FAILED);
    await expect(field).toHaveValue("Refuse me");

    await expectNoViolations(page, "with an add refused");
  });

  test("with the delete confirmation dialog open", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["Delete me"]);

    // `openDeleteDialog` has already waited for it to be on screen.
    await openDeleteDialog(page, "Delete me");

    // A modal surface is where the interesting rules live — the dialog's own
    // accessible name, whether the page behind it is properly inert, and
    // whether anything back there is still focusable.
    await expectNoViolations(page, "with the delete dialog open");
  });

  test("while the list is still loading", async ({ page }) => {
    // The skeletons are `aria-hidden`, which is a claim this scan can check
    // rather than take on trust: a hidden subtree that still contains a
    // focusable element is a violation, and the loading state is the one
    // state no other audit file holds still for.
    const held = await holdOpen(page, "GET", LIST_ROUTE);
    try {
      await page.goto("/");
      await held.reached;
      await expect(skeletons(page).first()).toBeVisible();

      await expectNoViolations(page, "while the list is loading");
    } finally {
      // In a `finally`, because a held request that is never let go outlives
      // the assertion that failed: the route handler stays installed and the
      // real failure is then reported behind a teardown timeout.
      held.release();
    }

    // And the release took — otherwise the scan above could be measuring a
    // state the product never actually leaves.
    await expect(skeletons(page)).toHaveCount(0);
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);
  });
});

test.describe("the scan can actually fail (negative fixture)", () => {
  test("reports an injected control that has no accessible name", async ({
    page,
  }) => {
    // Every assertion above is an absence, and an absence proved by a scan
    // that cannot fail proves nothing. The same argument
    // `audit-focus.spec.ts` makes about its clearance helper.
    //
    // A button with no name breaks 4.1.2 Name, Role, Value — level A, inside
    // the tag set above — and is the cheapest violation to inject that the
    // product itself would never produce.
    await page.goto("/");
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);

    await expectNoViolations(page, "negative fixture, before injection");

    await page.evaluate(() => {
      const offender = document.createElement("button");
      offender.id = "injected-nameless-control";
      document.body.append(offender);
    });

    const { violations } = await scanPage(page);
    const reported = describeViolations("negative fixture", violations);

    expect(
      reported.some((line) => line.includes("button-name")),
      `the scan passed a nameless button — it cannot fail, so the assertions above are vacuous: ${reported.join("; ")}`,
    ).toBe(true);
  });
});
