import { expect, test } from "@playwright/test";

import {
  addInput,
  addTodo,
  banner,
  cancelDelete,
  checkbox,
  confirmDelete,
  deleteControl,
  deleteDialog,
  emptyPanel,
  expectNoFirstRunNudge,
  expectNothingInstructional,
  expectRowTexts,
  failNext,
  filterTab,
  holdOpen,
  liveRegion,
  openDeleteDialog,
  retryControl,
  revealDeleteControl,
  row,
  rowTexts,
  rows,
  seed,
  skeletons,
  DIALOG_TITLE,
  FIRST_RUN_LINE,
  FIRST_RUN_SUB,
  LOAD_FAILED,
  NOTHING_ACTIVE,
  NOTHING_COMPLETED,
  SAVE_FAILED,
} from "./support/app";

// The four journeys of EXPERIENCE.md §Key Flows, driven end to end against a
// production build (AC1, AC2).
//
// Every test opens with a document navigation, always. `middleware.ts` mints
// the Client Identity on document requests only — its second matcher entry
// answers `/api/**` with `401` and mints nothing — so a context that reached
// the API first would see 401s for the rest of its life.
//
// Every test's fixtures are created through the UI, so each fresh context owns
// its own rows and no test can see another's. Nothing here touches the
// database directly.

/** Run this block only on the device the journey is written for. */
function onlyOn(project: "pointer" | "touch", why: string): void {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== project, why);
  });
}

test.describe("UJ-1 — Dana clears the morning list from her phone", () => {
  onlyOn("touch", "UJ-1 is written as a phone journey (EXPERIENCE.md:263).");

  test("completes a Todo in place, then narrows to what is left", async ({ page }) => {
    await page.goto("/");

    // Her list as she left it yesterday: four Todos, one Completed. Ids are
    // uuidv7 and the list is ordered `id DESC`, so what is on screen is the
    // reverse of the order they were added in.
    await seed(page, ["book dentist", "pay rent", "water plants", "send invoice"]);
    await checkbox(page, "water plants").click();
    await expect(checkbox(page, "water plants")).toBeChecked();

    // Step 2 — four Todos, three Active, one Completed, All selected.
    await expect(filterTab(page, "All")).toHaveAccessibleName("All 4");
    await expect(filterTab(page, "Active")).toHaveAccessibleName("Active 3");
    await expect(filterTab(page, "Completed")).toHaveAccessibleName("Completed 1");
    await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");

    const before = await rowTexts(page);
    const positionOfDentist = before.findIndex((text) => text.includes("book dentist"));
    expect(positionOfDentist).toBeGreaterThanOrEqual(0);

    // Step 3 — she taps the checkbox on `book dentist`.
    await checkbox(page, "book dentist").click();
    await expect(checkbox(page, "book dentist")).toBeChecked();
    await expect(row(page, "book dentist")).toHaveAttribute("data-completed", "true");

    // "The row stays where it is; completing something does not move it."
    const after = await rowTexts(page);
    expect(after).toEqual(before);
    expect(after[positionOfDentist]).toContain("book dentist");

    await expect(filterTab(page, "All")).toHaveAccessibleName("All 4");
    await expect(filterTab(page, "Active")).toHaveAccessibleName("Active 2");
    await expect(filterTab(page, "Completed")).toHaveAccessibleName("Completed 2");

    await expect(await liveRegion(page, "polite")).toContainText("book dentist, Completed");

    // Step 4 — the Active segment. A client-side narrowing of a list that is
    // already here, so no request goes out.
    await filterTab(page, "Active").click();
    await expect(filterTab(page, "Active")).toHaveAttribute("aria-selected", "true");

    // Step 5, the climax — two Todos remain and nothing else is on screen.
    await expect(rows(page)).toHaveCount(2);
    await expectRowTexts(page, ["send invoice", "pay rent"]);
    await expect(row(page, "book dentist")).toHaveCount(0);
    await expect(row(page, "water plants")).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveCount(0);
  });

  test("edge case — the toggle fails and is taken back as visibly as it was made", async ({
    page,
  }) => {
    // The four failure paths are proved in full in `failures.spec.ts`; this is
    // the journey's own edge case, walked as EXPERIENCE.md:271 writes it.
    await page.goto("/");
    await seed(page, ["book dentist"]);

    await failNext(page, "PATCH", "**/api/todos/*");
    await checkbox(page, "book dentist").click();

    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(checkbox(page, "book dentist")).not.toBeChecked();
    await expect(row(page, "book dentist")).toHaveCount(1);
  });
});

test.describe("UJ-2 — Sam adds a task at a laptop and finds it after a refresh", () => {
  onlyOn("pointer", "UJ-2 is written as a laptop journey (EXPERIENCE.md:273).");

  test("types straight in, and finds it again after a reload", async ({ page }) => {
    await page.goto("/");

    // Step 1 — the input already has focus. It autofocuses on pointer devices
    // and not on touch, which is why this journey is pinned to this project.
    await expect(addInput(page)).toBeFocused();
    await expect(emptyPanel(page)).toHaveCount(1);

    // Steps 2 and 3 — he types and presses Enter, with no mouse anywhere.
    await addInput(page).pressSequentially("send invoice");
    await addInput(page).press("Enter");

    await expect(rows(page).first()).toContainText("send invoice");
    await expect(addInput(page)).toHaveValue("");
    await expect(addInput(page)).toBeFocused();
    await expect(await liveRegion(page, "polite")).toContainText("send invoice, added");

    // Step 4 — the next one straight away. He happens to be looking at
    // Completed when he types it, and the Filter View snaps to All so the new
    // Todo cannot be created out of sight.
    await filterTab(page, "Completed").click();
    await expect(filterTab(page, "Completed")).toHaveAttribute("aria-selected", "true");
    await addInput(page).pressSequentially("book the venue");
    await addInput(page).press("Enter");
    await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");
    await expect(rows(page).first()).toContainText("book the venue");

    // Steps 5 and 6, the climax — an hour later, a reload. `send invoice` is
    // still there and still Active, with no account and no sign-in behind it,
    // and the Filter View is back to All.
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expectRowTexts(page, ["book the venue", "send invoice"]);
    await expect(checkbox(page, "send invoice")).not.toBeChecked();
    await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");
  });

  test("edge case — Enter on an empty or whitespace-only input does nothing at all", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(emptyPanel(page)).toHaveCount(1);

    await addInput(page).press("Enter");
    await expect(rows(page)).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveCount(1);

    // "nothing is created, no error is shown, the input is not cleared."
    await addInput(page).pressSequentially("   ");
    await addInput(page).press("Enter");
    await expect(rows(page)).toHaveCount(0);
    await expect(addInput(page)).toHaveValue("   ");
    await expect(banner(page)).toBeEmpty();
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);
  });
});

test.describe("UJ-3 — Dana removes something she no longer needs", () => {
  test("the swipe route opens the dialog, and Delete removes the row for good", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "touch",
      "The swipe is the phone route (EXPERIENCE.md:286).",
    );
    await page.goto("/");
    await seed(page, ["renew passport", "cancel the gym"]);

    // Step 2 — she swipes the row leftward and the delete action is revealed.
    await revealDeleteControl(page, "cancel the gym");
    await expect(deleteControl(page, "cancel the gym")).toHaveCSS("opacity", "1");

    // Step 3 — the dialog, over the list, with focus on Cancel.
    await deleteControl(page, "cancel the gym").click();
    await expect(deleteDialog(page)).toBeVisible();
    await expect(deleteDialog(page)).toHaveAccessibleName(DIALOG_TITLE);
    await expect(cancelDelete(page)).toBeFocused();

    // Steps 4 and 5, the climax — gone immediately, and still gone after a
    // reload. There is nothing pending and nothing to confirm twice.
    await confirmDelete(page).click();
    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(row(page, "cancel the gym")).toHaveCount(0);
    await expect(await liveRegion(page, "polite")).toContainText("cancel the gym, deleted");

    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "renew passport")).toHaveCount(1);
  });

  test("the hover route opens the same dialog at a laptop", async ({ page }) => {
    test.skip(
      test.info().project.name !== "pointer",
      "The hover reveal is `@media (pointer: fine)` only.",
    );
    await page.goto("/");
    await seed(page, ["cancel the gym"]);

    // At rest the control is invisible and untappable. `toBeVisible()` is true
    // even then — it is hidden by opacity rather than by display — so the
    // opacity is what says so.
    await expect(deleteControl(page, "cancel the gym")).toHaveCSS("opacity", "0");

    await revealDeleteControl(page, "cancel the gym");
    await deleteControl(page, "cancel the gym").click();
    await expect(deleteDialog(page)).toHaveAccessibleName(DIALOG_TITLE);
  });

  test("the keyboard route reaches the same dialog on any device", async ({ page }) => {
    // Mandatory, and not a fallback: a gesture-only or hover-only affordance
    // would fail the WCAG 2.2 AA floor, so the control is always rendered and
    // always in the tab order, and `:focus-visible` reveals it outside the
    // pointer media query.
    await page.goto("/");
    await seed(page, ["cancel the gym"]);

    const control = deleteControl(page, "cancel the gym");
    await addInput(page).click();
    for (let press = 0; press < 8; press += 1) {
      if (await control.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("opacity", "1");

    await page.keyboard.press("Enter");
    await expect(deleteDialog(page)).toHaveAccessibleName(DIALOG_TITLE);
  });

  test("edge case — Cancel closes the dialog, restores focus, and leaves the list alone", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["renew passport", "cancel the gym"]);

    await openDeleteDialog(page, "cancel the gym");
    await expect(cancelDelete(page)).toBeFocused();
    await cancelDelete(page).click();

    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(deleteControl(page, "cancel the gym")).toBeFocused();
    await expect(rows(page)).toHaveCount(2);
    await expectRowTexts(page, ["cancel the gym", "renew passport"]);
  });

  test("Escape is the same answer as Cancel", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["cancel the gym"]);

    await openDeleteDialog(page, "cancel the gym");
    await page.keyboard.press("Escape");

    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(row(page, "cancel the gym")).toHaveCount(1);
  });
});

test.describe("UJ-4 — Dana's first ever session", () => {
  onlyOn("touch", "UJ-4 rewinds UJ-1's protagonist to day one, on the same phone.");

  // AC2's executable form. The script below is strictly forward: every step is
  // a new interaction, no step repeats or undoes an earlier one, and nowhere
  // does it return to something already done in order to make the next step
  // work. If the screen needed explaining, this is the test that could not be
  // written without a step that explains it.
  test("adds, completes and deletes with no instruction and no backtracking", async ({
    browser,
  }) => {
    // A browser that has never been here: no Client Identity, no Todos.
    const context = await browser.newContext();
    const page = await context.newPage();

    // Steps 1 and 2 — an identity is issued, and the list resolves to the
    // first-run empty state rather than to content or to a blank screen.
    await page.goto("/");
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_SUB);
    await expect(filterTab(page, "All")).toHaveAccessibleName("All 0");
    await expect(filterTab(page, "Active")).toHaveAccessibleName("Active 0");
    await expect(filterTab(page, "Completed")).toHaveAccessibleName("Completed 0");
    // "There is no tour, no tooltip, no welcome modal, and nothing to dismiss."
    await expectNothingInstructional(page);
    await expect(deleteDialog(page)).toHaveCount(0);

    // Step 3 — her first Todo. The empty state is replaced by one row.
    await addTodo(page, "pick up keys");
    await expect(emptyPanel(page)).toHaveCount(0);
    await expect(addInput(page)).toHaveValue("");
    await expect(addInput(page)).toBeFocused();
    await expectNothingInstructional(page);

    // Step 4 — a second, without touching the screen again.
    await addInput(page).pressSequentially("call the landlord");
    await addInput(page).press("Enter");
    await expect(rows(page)).toHaveCount(2);

    // Step 5 — she completes one, then walks all three segments once.
    await checkbox(page, "pick up keys").click();
    await expect(checkbox(page, "pick up keys")).toBeChecked();

    await filterTab(page, "Completed").click();
    await expectRowTexts(page, ["pick up keys"]);

    await filterTab(page, "Active").click();
    await expectRowTexts(page, ["call the landlord"]);

    await filterTab(page, "All").click();
    await expect(rows(page)).toHaveCount(2);
    await expectNothingInstructional(page);

    // Step 6 — she reloads, to see whether it is real.
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expectRowTexts(page, ["call the landlord", "pick up keys"]);
    await expect(checkbox(page, "pick up keys")).toBeChecked();
    await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");

    // Step 7 — the first-run swipe nudge. Story 5.D1 is deferred, so this beat
    // is *not* in the shipped product: it is asserted absent rather than
    // expected. The topmost row is at rest and its delete lane is closed.
    await expectNoFirstRunNudge(page, "call the landlord");
    await expectNothingInstructional(page);

    // Step 8, the climax — she swipes, taps, is asked once, and confirms.
    // Nothing above taught her the gesture, which is the cost the deferred
    // nudge leaves on the table and why this step is that story's tripwire.
    await openDeleteDialog(page, "call the landlord");
    await expect(deleteDialog(page)).toHaveAccessibleName(DIALOG_TITLE);
    await confirmDelete(page).click();
    await expect(row(page, "call the landlord")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);

    // She has added, completed and deleted, with no instruction anywhere in
    // the session and no step walked twice — which is SM-1.
    await expectNothingInstructional(page);

    await context.close();
  });

  test("edge case — a first-ever load that fails shows neither skeletons nor the empty state", async ({
    browser,
  }) => {
    // "with the request failed, the list's contents are unknown rather than
    // known-empty, and showing `Nothing here yet.` would be a lie on a first
    // visit — the one moment a user has no way to tell the difference."
    const context = await browser.newContext();
    const page = await context.newPage();

    await failNext(page, "GET", "**/api/todos");
    await page.goto("/");

    await expect(banner(page)).toContainText(LOAD_FAILED);
    await expect(skeletons(page)).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveCount(0);

    // `Retry` re-requests and returns to the skeleton.
    const second = await holdOpen(page, "GET", "**/api/todos");
    await retryControl(page).click();
    await expect(skeletons(page)).toHaveCount(3);
    second.release();
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);
    await expect(banner(page)).toBeEmpty();

    await context.close();
  });
});

test.describe("the three empty panels, each reached by using the product", () => {
  test("each names the view it is empty in", async ({ page }) => {
    await page.goto("/");
    await expect(emptyPanel(page)).toContainText(FIRST_RUN_LINE);

    await addTodo(page, "one thing");
    await filterTab(page, "Completed").click();
    await expect(emptyPanel(page)).toContainText(NOTHING_COMPLETED);

    await filterTab(page, "All").click();
    await checkbox(page, "one thing").click();
    await expect(checkbox(page, "one thing")).toBeChecked();

    await filterTab(page, "Active").click();
    await expect(emptyPanel(page)).toContainText(NOTHING_ACTIVE);
  });
});
