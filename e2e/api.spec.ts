import { randomBytes } from "node:crypto";

import {
  expect,
  test as base,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

// The four methods as the wire actually serves them.
//
// `app/api/todos/route.test.ts` and `app/api/todos/[id]/route.test.ts` already
// call every handler exhaustively — and both of them `vi.mock` the repository
// and the identity store. That is the right shape for a handler test: it
// proves the handler's own arithmetic, the status it picks, the envelope it
// picks, the order it checks things in. It cannot prove the stack the handler
// runs inside, because in those tests the stack is a stub.
//
// So nothing in this repository has ever asserted that:
//
//   - `middleware.ts`'s matcher actually catches `/api/**`. The handlers'
//     own `401` is described in their source as "a second wall rather than
//     the only one"; the first wall is a regular expression in a config
//     object that no test has ever driven over HTTP.
//   - the repository's `WHERE owner_id` clause filters. Every handler test
//     asserts that `identity.id` is *passed first*; a repository that
//     accepted the argument and ignored it would satisfy all of them, and
//     one caller would read another's list. AD-2's convention is pinned by
//     `todos.test.ts`, which is the same query against the same branch — but
//     the composition of cookie, middleware, handler and SQL is not.
//   - the client-minted id survives the round trip, or that `id DESC` is an
//     ordering the database performs rather than one a mock returned.
//
// This file is that composition: a production build, a real Neon branch, a
// real `Secure` cookie, and no mocks anywhere. It speaks only HTTP, so it
// imports nothing from `src/` — the same rule `support/app.ts` keeps, for the
// same reason. Every string the server sends is spelled out here and asserted
// by equality; a renamed constant is meant to fail these specs.
//
// It runs on the `pointer` project only (see `playwright.config.ts`). HTTP has
// no pointer capability, and running it under `touch` as well would measure
// the same request twice and report the second one as if it were evidence.

/** What the server says, verbatim, at each of the failures below. */
const NO_IDENTITY = "No Client Identity on this request.";
const CREATE_FAILED = "The Todo could not be created.";
const UPDATE_FAILED = "The Todo could not be updated.";
const DELETE_FAILED = "The Todo could not be deleted.";

/** `TODO_TEXT_MAX_LENGTH`, spelled out because this file imports no source. */
const TEXT_CAP = 500;

/**
 * A canonical lowercase UUIDv7, built byte by byte rather than by the library
 * the client uses.
 *
 * The server's gate is a regular expression over the canonical form
 * (`src/server/validation/todo-id.ts`), so the version nibble and the variant
 * bits are the contract — and writing them out here is what lets the refusal
 * cases below be precise about which bit they broke. `crypto.randomUUID()`
 * would answer a v4 and be refused for the wrong reason.
 */
function mintId(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/**
 * A caller with an identity, obtained the way a browser obtains one.
 *
 * The cookie is `Secure` and minted by the middleware on a document request,
 * never by a route handler (AD-17) — so there is no API call that issues one,
 * and the only honest way to get one is to load the page. `context.request`
 * then shares that context's cookie jar, which is also why this goes through a
 * real `BrowserContext` rather than Playwright's bare `request` fixture: the
 * browser's `Secure`-over-localhost handling is the behaviour under test.
 */
async function identify(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("textbox")).toBeAttached();
  await page.close();
  return context;
}

// Playwright names a fixture's second argument `use`, and this repository's
// eslint config runs `react-hooks/rules-of-hooks` over `e2e/` — which reads any
// bare `use(...)` as React 19's hook and fails the lint. The parameter is
// positional, so it is called `provide` here. That is the whole reason; there
// is nothing else behind the name.
const test = base.extend<{
  caller: APIRequestContext;
  anotherCaller: APIRequestContext;
  stranger: APIRequestContext;
}>({
  caller: async ({ browser }, provide) => {
    const context = await identify(browser);
    await provide(context.request);
    await context.close();
  },
  anotherCaller: async ({ browser }, provide) => {
    const context = await identify(browser);
    await provide(context.request);
    await context.close();
  },
  // Never visits the page, so it never receives a cookie. A fresh context
  // rather than the `request` fixture, so the only difference between this
  // caller and the two above is the one being tested.
  stranger: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await provide(context.request);
    await context.close();
  },
});

/**
 * Every answer the API gives belongs to one caller and to no cache.
 *
 * Asserted on each response rather than once, because `privateToTheCaller()`
 * is applied per return statement and there are more than twenty of them.
 */
function expectPrivate(response: APIResponse): void {
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["vary"] ?? "").toMatch(/\bCookie\b/i);
}

/** The error envelope, whole — nothing of the row, the query or the caller. */
function envelope(kind: string, message: string) {
  return { error: { kind, message } };
}

test.describe("no identity reaches no part of the API", () => {
  test("answers 401 in the envelope each method is classified by", async ({
    stranger,
  }) => {
    const id = mintId();

    const answers = [
      { kind: "load", response: await stranger.get("/api/todos") },
      {
        kind: "create",
        response: await stranger.post("/api/todos", {
          data: { id, text: "never stored" },
        }),
      },
      {
        kind: "update",
        response: await stranger.patch(`/api/todos/${id}`, {
          data: { completed: true },
        }),
      },
      { kind: "delete", response: await stranger.delete(`/api/todos/${id}`) },
    ];

    for (const { kind, response } of answers) {
      expect(response.status(), `${kind} was not refused`).toBe(401);
      expect(await response.json()).toEqual(envelope(kind, NO_IDENTITY));
      expectPrivate(response);
    }
  });

  test("refuses before it reads the body, so a malformed create is still a 401", async ({
    stranger,
  }) => {
    const response = await stranger.post("/api/todos", {
      headers: { "content-type": "application/json" },
      data: "{ not json at all",
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual(envelope("create", NO_IDENTITY));
  });

  test("issues no identity while refusing (AD-17)", async ({ stranger }) => {
    const response = await stranger.get("/api/todos");

    expect(response.headers()["set-cookie"]).toBeUndefined();
    // And the refusal is repeatable: nothing about the first one made the
    // second one succeed.
    expect((await stranger.get("/api/todos")).status()).toBe(401);
  });
});

test.describe("a create, round-tripped through the database", () => {
  test("starts the caller with an empty list, served as a bare array", async ({
    caller,
  }) => {
    const response = await caller.get("/api/todos");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
    expectPrivate(response);
  });

  test("stores the client's id and sets completed and createdAt itself", async ({
    caller,
  }) => {
    const id = mintId();

    const created = await caller.post("/api/todos", {
      data: {
        id,
        text: "walk the dog",
        // Smuggled, and ignored: the server owns both of these (AC1).
        completed: true,
        createdAt: "1999-01-01T00:00:00.000Z",
      },
    });

    expect(created.status()).toBe(201);
    expectPrivate(created);

    const todo = await created.json();
    expect(todo).toEqual({
      id,
      text: "walk the dog",
      completed: false,
      createdAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(todo.createdAt))).toBe(false);

    // The read is the half a mocked handler cannot reach: the row came back
    // from Postgres, not from the response that created it.
    expect(await (await caller.get("/api/todos")).json()).toEqual([todo]);
  });

  test("serves the list id DESC, which is an ordering the database performs", async ({
    caller,
  }) => {
    const ids = [mintId(), mintId(), mintId()];
    for (const [index, id] of ids.entries()) {
      const response = await caller.post("/api/todos", {
        data: { id, text: `todo ${index}` },
      });
      expect(response.status()).toBe(201);
    }

    const listed = await (await caller.get("/api/todos")).json();

    expect(listed.map((todo: { id: string }) => todo.id)).toEqual(
      [...ids].sort().reverse(),
    );
  });

  test("answers the same create twice with the stored row, and stores it once", async ({
    caller,
  }) => {
    const id = mintId();
    const body = { id, text: "buy milk" };

    const first = await caller.post("/api/todos", { data: body });
    expect(first.status()).toBe(201);

    const retry = await caller.post("/api/todos", { data: body });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toEqual(await first.json());

    expect(await (await caller.get("/api/todos")).json()).toHaveLength(1);
  });
});

test.describe("one caller's rows are invisible to another (AD-7)", () => {
  test("does not list them", async ({ caller, anotherCaller }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "private matter" } });

    expect(await (await anotherCaller.get("/api/todos")).json()).toEqual([]);
    // Not a mutual emptiness: the row is still there for the caller who owns it.
    expect(await (await caller.get("/api/todos")).json()).toHaveLength(1);
  });

  test("answers 404 to a PATCH of a row that is not the caller's, and changes nothing", async ({
    caller,
    anotherCaller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "private matter" } });

    const refused = await anotherCaller.patch(`/api/todos/${id}`, {
      data: { completed: true },
    });

    expect(refused.status()).toBe(404);
    expect(await refused.json()).toEqual(envelope("update", UPDATE_FAILED));
    expectPrivate(refused);
    // Byte-for-byte what a row that never existed answers (AC4).
    const missing = await anotherCaller.patch(`/api/todos/${mintId()}`, {
      data: { completed: true },
    });
    expect(await missing.text()).toBe(await refused.text());

    const [owned] = await (await caller.get("/api/todos")).json();
    expect(owned.completed).toBe(false);
  });

  test("answers a DELETE of a row that is not the caller's without deleting it", async ({
    caller,
    anotherCaller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "private matter" } });

    const refused = await anotherCaller.delete(`/api/todos/${id}`);

    // 204, exactly as an owned delete answers — the refusal is indistinguishable
    // from success, which is the point (AC3).
    expect(refused.status()).toBe(204);
    expect(await refused.text()).toBe("");

    expect(await (await caller.get("/api/todos")).json()).toHaveLength(1);
  });

  test("answers 409 to a create reusing another caller's id, and discloses nothing", async ({
    caller,
    anotherCaller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", {
      data: { id, text: "the text nobody else may learn" },
    });

    const refused = await anotherCaller.post("/api/todos", {
      data: { id, text: "mine now" },
    });

    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual(envelope("create", CREATE_FAILED));
    expect(await refused.text()).not.toContain("nobody else may learn");
    expectPrivate(refused);

    // And the row it refused to name is untouched.
    const [owned] = await (await caller.get("/api/todos")).json();
    expect(owned.text).toBe("the text nobody else may learn");
  });
});

test.describe("what the wire refuses, and what it leaves behind", () => {
  test("refuses an id that is not a canonical lowercase UUIDv7", async ({
    caller,
  }) => {
    const canonical = mintId();
    const refused = [
      canonical.toUpperCase(),
      canonical.replace(/-7/, "-4"), // a v4 in a v7's place
      canonical.replace(/-/g, ""),
      "not-an-id",
    ];

    for (const id of refused) {
      const response = await caller.post("/api/todos", {
        data: { id, text: "walk the dog" },
      });
      expect(response.status(), `${id} was accepted`).toBe(400);
      expect(await response.json()).toEqual(envelope("create", CREATE_FAILED));
    }

    expect(await (await caller.get("/api/todos")).json()).toEqual([]);
  });

  test("refuses text that is empty once trimmed, and text over the cap", async ({
    caller,
  }) => {
    const refused = ["", "   ", "\n\t ", "x".repeat(TEXT_CAP + 1)];

    for (const text of refused) {
      const response = await caller.post("/api/todos", {
        data: { id: mintId(), text },
      });
      expect(response.status(), `${text.length} chars was accepted`).toBe(400);
      expect(await response.json()).toEqual(envelope("create", CREATE_FAILED));
      expectPrivate(response);
    }

    expect(await (await caller.get("/api/todos")).json()).toEqual([]);
  });

  test("accepts exactly the cap, and stores the trimmed form", async ({
    caller,
  }) => {
    const atTheCap = "x".repeat(TEXT_CAP);

    const boundary = await caller.post("/api/todos", {
      data: { id: mintId(), text: atTheCap },
    });
    expect(boundary.status()).toBe(201);

    // Over the cap before trimming, at it after — accepted, and stored trimmed.
    const padded = await caller.post("/api/todos", {
      data: { id: mintId(), text: `   ${atTheCap}   ` },
    });
    expect(padded.status()).toBe(201);
    expect((await padded.json()).text).toBe(atTheCap);

    const listed = await (await caller.get("/api/todos")).json();
    expect(listed.map((todo: { text: string }) => todo.text)).toEqual([
      atTheCap,
      atTheCap,
    ]);
  });

  test("refuses a body that is not a create at all", async ({ caller }) => {
    const refused = [
      { data: "{ not json at all" },
      { data: { text: "no id" } },
      { data: { id: mintId() } },
      { data: { id: mintId(), text: 42 } },
      { data: [] },
    ];

    for (const request of refused) {
      const response = await caller.post("/api/todos", {
        headers: { "content-type": "application/json" },
        ...request,
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual(envelope("create", CREATE_FAILED));
    }

    expect(await (await caller.get("/api/todos")).json()).toEqual([]);
  });

  test("checks the path id's form before it reads the body", async ({
    caller,
  }) => {
    const response = await caller.patch("/api/todos/not-an-id", {
      headers: { "content-type": "application/json" },
      data: "{ not json at all",
    });

    // 400 on the id, not a 500 from the parse that never happened.
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual(envelope("update", UPDATE_FAILED));
  });

  test("refuses a set that does not name a boolean", async ({ caller }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "walk the dog" } });

    for (const data of [{}, { completed: "true" }, { completed: null }]) {
      const response = await caller.patch(`/api/todos/${id}`, { data });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual(envelope("update", UPDATE_FAILED));
    }

    const [unchanged] = await (await caller.get("/api/todos")).json();
    expect(unchanged.completed).toBe(false);
  });

  test("refuses a delete of an id that is not canonical", async ({ caller }) => {
    const response = await caller.delete("/api/todos/not-an-id");

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual(envelope("delete", DELETE_FAILED));
    expectPrivate(response);
  });
});

test.describe("a completion status set over the wire", () => {
  test("writes completed and nothing else, and the next read agrees", async ({
    caller,
  }) => {
    const id = mintId();
    const created = await (
      await caller.post("/api/todos", { data: { id, text: "walk the dog" } })
    ).json();

    const updated = await caller.patch(`/api/todos/${id}`, {
      // Smuggling two fields the handler must not write.
      data: { completed: true, text: "rewritten", createdAt: "1999-01-01" },
    });

    expect(updated.status()).toBe(200);
    expectPrivate(updated);
    expect(await updated.json()).toEqual({ ...created, completed: true });

    expect(await (await caller.get("/api/todos")).json()).toEqual([
      { ...created, completed: true },
    ]);

    // Idempotent in the sense that matters: the same request twice sends the
    // value asked for both times, never its inverse.
    const again = await caller.patch(`/api/todos/${id}`, {
      data: { completed: true },
    });
    expect((await again.json()).completed).toBe(true);

    const back = await caller.patch(`/api/todos/${id}`, {
      data: { completed: false },
    });
    expect((await back.json()).completed).toBe(false);
  });
});

test.describe("a delete over the wire", () => {
  test("answers 204, removes the row, and answers the retry the same way", async ({
    caller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "walk the dog" } });

    const first = await caller.delete(`/api/todos/${id}`);
    expect(first.status()).toBe(204);
    expect(await first.text()).toBe("");
    expectPrivate(first);

    expect(await (await caller.get("/api/todos")).json()).toEqual([]);

    const retry = await caller.delete(`/api/todos/${id}`);
    expect(retry.status()).toBe(first.status());
    expect(await retry.text()).toBe("");
  });

  test("removes a completed row exactly as it removes an active one", async ({
    caller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "walk the dog" } });
    await caller.patch(`/api/todos/${id}`, { data: { completed: true } });

    expect((await caller.delete(`/api/todos/${id}`)).status()).toBe(204);
    expect(await (await caller.get("/api/todos")).json()).toEqual([]);
  });
});

test.describe("the method surface", () => {
  test("serves GET and POST on the list, PATCH and DELETE on the one Todo, and nothing else", async ({
    caller,
  }) => {
    const id = mintId();
    await caller.post("/api/todos", { data: { id, text: "walk the dog" } });

    const unsupported = [
      { method: "PUT", url: "/api/todos" },
      { method: "PATCH", url: "/api/todos" },
      { method: "DELETE", url: "/api/todos" },
      { method: "GET", url: `/api/todos/${id}` },
      { method: "POST", url: `/api/todos/${id}` },
      { method: "PUT", url: `/api/todos/${id}` },
    ];

    for (const { method, url } of unsupported) {
      const response = await caller.fetch(url, { method, data: {} });
      expect(
        response.status(),
        `${method} ${url} answered ${response.status()}`,
      ).toBe(405);
    }

    // And the row is still there, so none of the refusals did any work.
    expect(await (await caller.get("/api/todos")).json()).toHaveLength(1);
  });
});
