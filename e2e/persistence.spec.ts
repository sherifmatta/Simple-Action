import { expect, test, type BrowserContext } from "@playwright/test";

import {
  addTodo,
  checkbox,
  emptyPanel,
  expectRowTexts,
  filterTab,
  rowTexts,
  rows,
  seed,
} from "./support/app";

// FR-6 and SM-2, measured rather than reasoned about (AC3, AC4, AC5).
//
// The whole of persistence here is one cookie. `middleware.ts` mints
// `client_identity` on the document request, `identity-cookie.ts` gives it a
// 400-day `Max-Age`, and every Todo in the database is owned by the identity
// that cookie resolves to. So "survives a reload", "survives a restart" and
// "two browsers see two lists" are three questions about the same cookie, and
// each is asked here against a real browser rather than against the code that
// sets it.
//
// The cookie is `httpOnly`, so `document.cookie` cannot see it and every
// assertion below goes through `context.cookies()`.

const IDENTITY_COOKIE = "client_identity";
const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

async function identityCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  const identity = cookies.find((cookie) => cookie.name === IDENTITY_COOKIE);
  expect(identity, `no ${IDENTITY_COOKIE} cookie was issued`).toBeDefined();
  return identity;
}

test("AC3 — a reload brings back the identical list, and the Filter View back to All", async ({
  page,
}) => {
  await page.goto("/");
  await seed(page, ["renew passport", "pay rent", "send invoice"]);

  // Wait for the server to acknowledge the toggle before reloading.
  //
  // `toBeChecked()` below passes on the *optimistic* state — the checkbox
  // flips on the click, before the PATCH is sent, which is the whole point of
  // Story 4.2. So asserting it and reloading proves only that the optimistic
  // write happened, and whether the reload sees the change depends on whether
  // the request happened to land first. It usually did; under a loaded
  // machine it does not, and this test failed on exactly that race once a
  // third Playwright project was added (Story 6.2).
  //
  // What AC3 is about is what the *server* kept, so the response is what to
  // wait for. Subscribed before the click, because a response cannot be
  // awaited after it has already arrived.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/todos/") &&
      response.ok(),
  );
  await checkbox(page, "pay rent").click();
  await expect(checkbox(page, "pay rent")).toBeChecked();
  await saved;

  const before = await rowTexts(page);

  // Leave the Filter View somewhere other than All, so that "back to All"
  // means something rather than being true by default.
  await filterTab(page, "Active").click();
  await expect(filterTab(page, "Active")).toHaveAttribute("aria-selected", "true");

  await page.reload();

  await expectRowTexts(page, before);
  await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");
  await expect(checkbox(page, "pay rent")).toBeChecked();
});

test("AC4 — a context reopened from saved storage sees the same list, on a cookie that outlives the session", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/");
  await seed(page, ["renew passport", "send invoice"]);
  const before = await rowTexts(page);

  const identity = await identityCookie(first);
  // A session cookie would carry `-1`. This one is `Max-Age` 400 days, which
  // is what makes "come back next week" a property of the product rather than
  // of the browser staying open. Two days of slack, because the assertion is
  // about the order of magnitude and not about the clock.
  const nowInSeconds = Date.now() / 1000;
  expect(identity?.expires).toBeGreaterThan(
    nowInSeconds + FOUR_HUNDRED_DAYS_IN_SECONDS - 2 * 24 * 60 * 60,
  );

  // The browser, closed and reopened: a new context built from nothing but
  // what the old one had written down.
  const saved = await first.storageState();
  await first.close();

  const second = await browser.newContext({ storageState: saved });
  const reopened = await second.newPage();
  await reopened.goto("/");

  await expectRowTexts(reopened, before);
  expect((await identityCookie(second))?.value).toBe(identity?.value);

  await second.close();
});

test("AC5 — two contexts are two people: two identities, two independent lists", async ({
  browser,
}) => {
  const dana = await browser.newContext();
  const sam = await browser.newContext();
  const danaPage = await dana.newPage();
  const samPage = await sam.newPage();

  await danaPage.goto("/");
  await samPage.goto("/");

  const danaIdentity = await identityCookie(dana);
  const samIdentity = await identityCookie(sam);
  expect(danaIdentity?.value).not.toBe(samIdentity?.value);

  // Each starts empty, because each is a browser that has never been here.
  await expect(emptyPanel(danaPage)).toHaveCount(1);
  await expect(emptyPanel(samPage)).toHaveCount(1);

  await addTodo(danaPage, "book dentist");
  await addTodo(samPage, "send invoice");

  // Neither list leaks into the other, before or after a reload.
  await danaPage.reload();
  await samPage.reload();

  await expectRowTexts(danaPage, ["book dentist"]);
  await expectRowTexts(samPage, ["send invoice"]);
  await expect(rows(danaPage)).toHaveCount(1);
  await expect(rows(samPage)).toHaveCount(1);

  await dana.close();
  await sam.close();
});
