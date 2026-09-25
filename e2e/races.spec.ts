import { expect, test } from "@playwright/test";

import {
  addInput,
  apiResponse,
  banner,
  commitThenDrop,
  confirmDelete,
  expectRowTexts,
  failNext,
  holdOpen,
  listChildren,
  openDeleteDialog,
  recordRequests,
  refetchOnFocus,
  retryControl,
  row,
  rows,
  seed,
  skeletons,
  ADD_FAILED,
  ITEM_ROUTE,
  LIST_ROUTE,
  LOAD_FAILED,
  SAVE_FAILED,
} from "./support/app";

// The three states the optimistic layer exists for, and the three that no
// amount of reading the code settles (AC11, AC12, AC13).
//
// Each is produced by holding a real request open or by letting one reach the
// server and keeping its answer from the page. Nothing here is simulated at
// the module boundary: the browser issues the requests, the server answers
// them, and the interception decides only *when* and *whether* the page hears.

test.describe("AC11 — a Todo added while the list is still arriving", () => {
  test("renders above the skeletons, and survives the merge exactly once", async ({
    page,
  }) => {
    // The `GET` left the browser before this Todo existed, so the list it
    // brings back cannot contain it. The documented optimistic recipe would
    // have cancelled that read; AD-16 forbids it, so the read lands and the
    // merge is what has to keep the new row.
    const list = await holdOpen(page, "GET", LIST_ROUTE);
    const create = await holdOpen(page, "POST", LIST_ROUTE);

    await page.goto("/");
    await expect(skeletons(page)).toHaveCount(3);

    // Nothing here is disabled or gated on the list, so she can type into a
    // field whose list has not arrived.
    await addInput(page).click();
    await addInput(page).fill("send invoice");
    await addInput(page).press("Enter");

    await expect(row(page, "send invoice")).toHaveCount(1);

    // Above the three skeletons, in document order: the new Todo is the first
    // thing in the region and the pulsing placeholders are still underneath
    // it, which is what "no layout shift, and the new row is where you put it"
    // looks like from the outside.
    expect(
      await listChildren(page).evaluateAll((items) =>
        items.map((item) => (item.classList.contains("skeleton-row") ? "skeleton" : "row")),
      ),
    ).toEqual(["row", "skeleton", "skeleton", "skeleton"]);

    // The list arrives, knowing nothing about the new Todo.
    list.release();
    await expect(skeletons(page)).toHaveCount(0);
    await expect(row(page, "send invoice")).toHaveCount(1);

    // And the create is confirmed afterwards: still exactly one, never
    // dropped and never duplicated.
    const confirmed = apiResponse(page, "POST", "/api/todos");
    create.release();
    expect((await confirmed).status()).toBe(201);
    await expect(row(page, "send invoice")).toHaveCount(1);
    await expect(rows(page)).toHaveCount(1);
    await expect(banner(page)).toBeEmpty();

    await page.reload();
    await expectRowTexts(page, ["send invoice"]);
  });
});

test.describe("AC12 — a create the server heard and the page did not", () => {
  test("retries the same id and leaves exactly one Todo behind", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["renew passport"]);

    const creates = recordRequests(page, "POST", "/api/todos");

    // The uncertain failure: `route.fetch()` forwards the POST and waits for
    // the real answer — so the row is committed — and `route.abort()` then
    // hands the page a transport error. An ordinary 500 would be a *certain*
    // failure and a bare abort would never reach the server at all.
    await commitThenDrop(page, "POST", LIST_ROUTE);

    await addInput(page).click();
    await addInput(page).fill("send invoice");
    await addInput(page).press("Enter");

    await expect(banner(page)).toContainText(ADD_FAILED);
    await expect(row(page, "send invoice")).toHaveCount(0);
    // The first attempt has settled — the banner is raised in `onError` and
    // exists only because it did — so the replay below cannot race it. Two
    // simultaneous POSTs of one id could answer `201`/`200` in either order;
    // sequential ones cannot.
    expect(creates.count()).toBe(1);

    const replay = apiResponse(page, "POST", "/api/todos");
    await retryControl(page).click();

    // `onConflictDoNothing` on the id, then an owner-scoped re-read: the
    // second POST of the same id is not a conflict, it is the same Todo.
    expect((await replay).status()).toBe(200);
    await expect(row(page, "send invoice")).toHaveCount(1);
    await expect(banner(page)).toBeEmpty();

    expect(creates.count()).toBe(2);
    const first = creates.body(0) as { id: string };
    const second = creates.body(1) as { id: string };
    expect(second.id).toBe(first.id);

    // The assertion the whole criterion is about: one row, not two.
    await page.reload();
    await expectRowTexts(page, ["send invoice", "renew passport"]);
  });
});

test.describe("AC13 — a newer failure arriving over an older banner", () => {
  test("shows the newer copy, and re-sends only the newer operation", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["renew passport", "pay rent"]);

    const reads = recordRequests(page, "GET", "/api/todos");
    const deletes = recordRequests(page, "DELETE", "/api/todos/");

    // The older failure: a background re-read that fails. The rows stay on
    // screen — a failed refetch does not discard what already landed — so
    // there is still something to delete.
    await failNext(page, "GET", LIST_ROUTE);
    await refetchOnFocus(page);
    await expect(banner(page)).toContainText(LOAD_FAILED);
    const readsWhenLoadFailed = reads.count();

    // The newer failure, arriving while that banner is displayed.
    await failNext(page, "DELETE", ITEM_ROUTE);
    await openDeleteDialog(page, "pay rent");
    await confirmDelete(page).click();

    // One slot, and the newer entry is in it.
    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(banner(page)).not.toContainText(LOAD_FAILED);
    await expect(retryControl(page)).toHaveCount(1);
    await expect(row(page, "pay rent")).toHaveCount(1);

    // The replaced operation is not re-sent — not when it was replaced, and
    // not when `Retry` is pressed. `retryCurrentError` empties the slot and
    // then invokes the entry it took out, so the only closure that can run is
    // the delete's.
    await retryControl(page).click();
    await expect(row(page, "pay rent")).toHaveCount(0);
    expect(deletes.count()).toBe(2);
    expect(reads.count()).toBe(readsWhenLoadFailed);
  });

  test("a load failure never displaces a mutation's banner — the product's documented asymmetry", async ({
    page,
  }) => {
    // The I/O matrix for this criterion writes the pair the other way round: a
    // delete fails, then a load fails, and the banner carries the newer copy.
    // The shipped product does not do that, and does not do it on purpose —
    // `error-banner.tsx` raises a read failure only into an *empty* slot, and
    // `error-banner.test.ts` pins that with "raises into an empty slot only,
    // and never over another kind". A mutation always raises; a read waits.
    //
    // Epic 6 measures, so this is recorded as a finding in the story's
    // frontmatter `deferred` and characterised here rather than patched: the
    // fix would be a change to product source, which this story may not make.
    await page.goto("/");
    await seed(page, ["pay rent"]);

    const reads = recordRequests(page, "GET", "/api/todos");

    await failNext(page, "DELETE", ITEM_ROUTE);
    await openDeleteDialog(page, "pay rent");
    await confirmDelete(page).click();
    await expect(banner(page)).toContainText(SAVE_FAILED);

    await failNext(page, "GET", LIST_ROUTE);
    await refetchOnFocus(page);
    await expect.poll(() => reads.count()).toBeGreaterThan(0);

    // The older mutation banner stands; the read failure is held back until
    // the slot empties, which is the behaviour the guard was written for.
    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expect(banner(page)).not.toContainText(LOAD_FAILED);
  });
});
