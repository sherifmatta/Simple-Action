import { expect, test } from "@playwright/test";

import {
  addInput,
  apiResponse,
  banner,
  checkbox,
  confirmDelete,
  deleteDialog,
  emptyPanel,
  expectRowTexts,
  failNext,
  filterTab,
  holdOpen,
  liveRegion,
  openDeleteDialog,
  recordRequests,
  retryControl,
  row,
  rowTexts,
  rows,
  seed,
  skeletons,
  ADD_FAILED,
  ITEM_ROUTE,
  LIST_ROUTE,
  LOAD_FAILED,
  SAVE_FAILED,
} from "./support/app";

// The four failure paths, forced rather than inspected for (AC7-AC10).
//
// Every failure below is produced by `page.route` dropping a request, which is
// the mechanism AR-31 names and the only one that produces the *transport*
// failure the optimistic layer is written against. A 500 from the server would
// also revert, but it would never reach the state where the page cannot tell
// whether the server heard — and that state is what `races.spec.ts` is for.
//
// Each test asserts three things, because the criterion names three: the exact
// copy, the revert in place, and what `Retry` then does.

test.describe("AC7 — the list read fails", () => {
  test("says so, shows neither skeletons nor an empty state, and re-requests on Retry", async ({
    page,
  }) => {
    const reads = recordRequests(page, "GET", "/api/todos");
    await failNext(page, "GET", LIST_ROUTE);
    await page.goto("/");

    await expect(banner(page)).toContainText(LOAD_FAILED);
    // The list's contents are unknown rather than known-empty, so the region
    // shows nothing at all: no pulsing skeletons that will never resolve, and
    // no `Nothing here yet.` that would be a lie.
    await expect(skeletons(page)).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveCount(0);
    await expect(retryControl(page)).toBeVisible();
    await expect(await liveRegion(page, "assertive")).toContainText(LOAD_FAILED);
    expect(reads.count()).toBe(1);

    // `Retry` returns three skeletons and re-requests.
    const second = await holdOpen(page, "GET", LIST_ROUTE);
    await retryControl(page).click();
    await expect(skeletons(page)).toHaveCount(3);
    expect(reads.count()).toBe(2);

    second.release();
    await expect(skeletons(page)).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveCount(1);
    await expect(banner(page)).toBeEmpty();
  });
});

test.describe("AC8 — the create fails", () => {
  test("takes the row back, hands the text back with the caret at the end, and retries the same id", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["renew passport"]);

    const creates = recordRequests(page, "POST", "/api/todos");
    const held = await holdOpen(page, "POST", LIST_ROUTE);

    await addInput(page).click();
    await addInput(page).fill("send invoice");
    await addInput(page).press("Enter");

    // Optimistic first: the row is on screen before the server has answered.
    await expect(row(page, "send invoice")).toHaveCount(1);
    await expect(rows(page).first()).toContainText("send invoice");

    held.drop();

    // Then taken back, with the text returned to the field rather than lost.
    await expect(row(page, "send invoice")).toHaveCount(0);
    await expect(banner(page)).toContainText(ADD_FAILED);
    await expect(addInput(page)).toHaveValue("send invoice");
    await expect(addInput(page)).toBeFocused();
    expect(
      await addInput(page).evaluate((field: HTMLInputElement) => ({
        start: field.selectionStart,
        end: field.selectionEnd,
        length: field.value.length,
      })),
    ).toEqual({ start: 12, end: 12, length: 12 });

    // `Retry` re-sends the *same id*. That is what makes the retry idempotent
    // at the server, and it is the whole of why the id is minted client-side.
    const replay = apiResponse(page, "POST", "/api/todos");
    await retryControl(page).click();
    await expect(row(page, "send invoice")).toHaveCount(1);
    await expect(banner(page)).toBeEmpty();
    expect((await replay).ok()).toBe(true);

    expect(creates.count()).toBe(2);
    const first = creates.body(0) as { id: string; text: string };
    const second = creates.body(1) as { id: string; text: string };
    expect(second.id).toBe(first.id);
    expect(second.text).toBe("send invoice");

    // And it is one Todo, not two, once the list is read afresh.
    await page.reload();
    await expectRowTexts(page, ["send invoice", "renew passport"]);
  });
});

test.describe("AC9 — the toggle fails", () => {
  test("puts the row back in its place while it is still on screen", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["renew passport", "pay rent", "send invoice"]);
    const before = await rowTexts(page);

    const updates = recordRequests(page, "PATCH", "/api/todos/");
    await failNext(page, "PATCH", ITEM_ROUTE);

    await checkbox(page, "pay rent").click();
    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(checkbox(page, "pay rent")).not.toBeChecked();
    await expectRowTexts(page, before);
    await expect(await liveRegion(page, "assertive")).toContainText(SAVE_FAILED);

    // `Retry` re-requests the status the user asked for, not the one the row
    // is showing after the rollback.
    await retryControl(page).click();
    await expect(checkbox(page, "pay rent")).toBeChecked();
    await expect(banner(page)).toBeEmpty();
    expect(updates.count()).toBe(2);
    expect(updates.body(1)).toEqual({ completed: true });
  });

  test("brings the row back to the Active view after it has already departed", async ({
    page,
  }) => {
    // The harder half of AC9, and the reason the departure exists at all. The
    // row is not merely reverted in place — it has left the view entirely,
    // played its hold and its collapse, and has to come back to the index it
    // left from.
    await page.goto("/");
    await seed(page, ["renew passport", "pay rent", "send invoice"]);

    await filterTab(page, "Active").click();
    const before = await rowTexts(page);
    expect(before).toEqual(["send invoice", "pay rent", "renew passport"]);

    const held = await holdOpen(page, "PATCH", ITEM_ROUTE);
    await checkbox(page, "pay rent").click();

    // Hold the request until the row has genuinely gone: the 400ms hold and
    // the 180ms collapse both play out, and the assertion is what waits for
    // them. Dropping the request earlier would cancel the departure instead,
    // which is the other half of this criterion and not this test.
    await expect(row(page, "pay rent")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);

    held.drop();

    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(row(page, "pay rent")).toHaveCount(1);
    await expect(checkbox(page, "pay rent")).not.toBeChecked();
    await expectRowTexts(page, before);
    await expect(filterTab(page, "Active")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("AC10 — the delete fails", () => {
  test("puts the row back at its `id DESC` index, and Retry opens no second dialog", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["renew passport", "pay rent", "send invoice"]);
    const before = await rowTexts(page);
    expect(before).toEqual(["send invoice", "pay rent", "renew passport"]);

    const deletes = recordRequests(page, "DELETE", "/api/todos/");
    await failNext(page, "DELETE", ITEM_ROUTE);

    await openDeleteDialog(page, "pay rent");
    await confirmDelete(page).click();
    await expect(deleteDialog(page)).toHaveCount(0);

    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(row(page, "pay rent")).toHaveCount(1);
    // Back between the two it sat between, not appended to the end.
    await expectRowTexts(page, before);

    // `Retry` re-deletes straight away. The retry closure lives in the error
    // slot rather than in the list, so there is no confirmation on this path
    // at all — the user already confirmed, and being asked again would be the
    // product doubting them.
    const replay = apiResponse(page, "DELETE", "/api/todos/");
    await retryControl(page).click();
    await expect(row(page, "pay rent")).toHaveCount(0);
    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(banner(page)).toBeEmpty();
    expect((await replay).status()).toBe(204);
    expect(deletes.count()).toBe(2);
    expect(deletes.all()[1]?.url()).toBe(deletes.all()[0]?.url());

    // Gone at the server too, which a `204` could never have told us.
    await page.reload();
    await expectRowTexts(page, ["send invoice", "renew passport"]);
  });
});
