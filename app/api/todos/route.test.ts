import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_COOKIE_NAME } from "@/server/identity/identity-cookie";
import {
  hashIdentityToken,
  mintIdentityToken,
} from "@/server/identity/identity-token";
import {
  isValidTodoText,
  TODO_TEXT_MAX_LENGTH,
} from "@/shared/contract/validation";
import * as routeModule from "./route";
import { CREATE_FAILED_MESSAGE, GET, LOAD_FAILED_MESSAGE, POST } from "./route";

// Story 2.1 AC1 (a bare array in the contract's shape), AC3 (the handler passes
// the resolved identity and builds no query), AC5 (`401` without one, and none
// issued) and AC6 (an enveloped `load` failure whose message is never the
// driver's). AC2 and AC4 are the repository's and are proved live in
// `src/server/repository/todos.test.ts`; what this file proves is that the
// handler returns that list untouched.
//
// Both repositories are mocked, following Story 1.6's route-adjacent pattern:
// what is under test is which repository call the handler makes and with what.
// Reaching Neon here would also insert rows no exported function can delete.
const identityRepository = vi.hoisted(() => ({
  findClientIdentityByTokenHash: vi.fn(),
  createClientIdentity: vi.fn(),
}));
const todosRepository = vi.hoisted(() => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
}));

vi.mock("@/server/repository/client-identity", () => identityRepository);
vi.mock("@/server/repository/todos", () => todosRepository);

const OWNER_ID = "0199a1b2-c3d4-7000-8000-0123456789ab";

const todoOf = (id: string, text: string) => ({
  id,
  text,
  completed: false,
  createdAt: "2026-09-22T10:00:00.000Z",
});

/**
 * A driver failure shaped exactly as Drizzle constructs one.
 *
 * `DrizzleQueryError` is `` new Error(`Failed query: ${query}\nparams: ${params}`) ``
 * (`node_modules/drizzle-orm/errors.js`), thrown around every statement by
 * `drizzle-orm/pg-core/session.js`'s `queryWithCache` — so the bound
 * parameters, the submitted Todo text among them, are part of `error.message`
 * itself and not merely of some property a handler could decline to read.
 *
 * Built here rather than written out per fixture, because an AC11 assertion is
 * only worth what its fixture is: a made-up separator or made-up params would
 * let the row pass green against a leak production still has. `${params}` on an
 * array is `Array.prototype.join(",")`, which is what the template above does
 * too.
 */
function drizzleQueryError(query: string, params: string[]): Error {
  return Object.assign(new Error(`Failed query: ${query}\nparams: ${params}`), {
    query,
    params,
  });
}

const requestWith = (cookie?: string, method = "GET") =>
  new NextRequest("https://simple-action.test/api/todos", {
    method,
    headers: cookie === undefined ? {} : { cookie },
  });

/** A request whose cookie resolves to `OWNER_ID`. */
function identifiedRequest(): NextRequest {
  identifyTheCaller();

  return requestWith(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`);
}

function identifyTheCaller(): void {
  identityRepository.findClientIdentityByTokenHash.mockResolvedValue({
    id: OWNER_ID,
    tokenHash: "irrelevant — the hash is computed from the cookie",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
  });
}

/** A valid lowercase-canonical UUIDv7, the shape a client mints (AD-4). */
const SUBMITTED_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

// `body` is serialized unless it is already a string, so a test can submit
// something that is not JSON at all.
const postRequest = (body: unknown, cookie?: string) =>
  new NextRequest("https://simple-action.test/api/todos", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** A `POST` whose cookie resolves to `OWNER_ID`. */
function identifiedPost(body: unknown): NextRequest {
  identifyTheCaller();

  return postRequest(body, `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`);
}

const CREATE_ENVELOPE = {
  error: { kind: "create", message: CREATE_FAILED_MESSAGE },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("GET /api/todos — the served list (AC1, AC3)", () => {
  it("answers 200 with a bare JSON array — no envelope around it", async () => {
    const listed = [
      todoOf("0199a1b2-c3d4-7000-8000-000000000002", "second"),
      todoOf("0199a1b2-c3d4-7000-8000-000000000001", "first"),
    ];
    todosRepository.listTodos.mockResolvedValue(listed);

    const response = await GET(identifiedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual(listed);
  });

  it("serves an empty list as an empty array, not as a failure", async () => {
    todosRepository.listTodos.mockResolvedValue([]);

    const response = await GET(identifiedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("passes the resolved identity as the owner and returns the rows in the order given (AC3)", async () => {
    // Deliberately not sorted: if the handler re-ordered, this would change.
    const listed = ["c", "a", "b"].map((text) => todoOf(`id-${text}`, text));
    todosRepository.listTodos.mockResolvedValue(listed);

    const response = await GET(identifiedRequest());

    expect(todosRepository.listTodos).toHaveBeenCalledTimes(1);
    expect(todosRepository.listTodos).toHaveBeenCalledWith(OWNER_ID);
    await expect(response.json()).resolves.toEqual(listed);
  });

  it("ignores request-supplied ownership — the cookie is the only thing that names the owner", async () => {
    // The decision Story 2.1 was handed by `deferred-work.md`: the handler
    // resolves the identity itself rather than trusting one middleware
    // forwarded on a header. Pinned here so Epics 3-5, which copy this handler,
    // cannot quietly start honouring one.
    todosRepository.listTodos.mockResolvedValue([]);
    const request = identifiedRequest();
    request.headers.set("x-owner-id", "11111111-2222-7000-8000-333333333333");
    request.headers.set("x-forwarded-owner", "someone else entirely");

    await GET(request);

    expect(todosRepository.listTodos).toHaveBeenCalledWith(OWNER_ID);
  });

  it("hashes the cookie before looking the identity up — the raw token never reaches the repository", async () => {
    const token = mintIdentityToken();
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue({
      id: OWNER_ID,
      tokenHash: await hashIdentityToken(token),
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
    });
    todosRepository.listTodos.mockResolvedValue([]);

    await GET(requestWith(`${IDENTITY_COOKIE_NAME}=${token}`));

    expect(
      identityRepository.findClientIdentityByTokenHash,
    ).toHaveBeenCalledWith(await hashIdentityToken(token));
    expect(
      identityRepository.findClientIdentityByTokenHash,
    ).not.toHaveBeenCalledWith(token);
  });
});

describe("GET /api/todos — no valid identity (AC5)", () => {
  it.each([
    ["no cookie at all", undefined],
    ["an empty cookie", `${IDENTITY_COOKIE_NAME}=`],
  ])(
    "answers 401 and reads no Todos when there is %s",
    async (_case, cookie) => {
      const response = await GET(requestWith(cookie));

      expect(response.status).toBe(401);
      expect(todosRepository.listTodos).not.toHaveBeenCalled();
    },
  );

  it("answers 401 when the token names no row — a forged or stale cookie", async () => {
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue(
      undefined,
    );

    const response = await GET(
      requestWith(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.listTodos).not.toHaveBeenCalled();
  });

  it("issues no identity while refusing — the handler only ever reads (AD-17)", async () => {
    await GET(requestWith());

    expect(identityRepository.createClientIdentity).not.toHaveBeenCalled();
  });

  it("carries the shared error envelope with kind load, the kind a GET is classified by", async () => {
    const body = await (await GET(requestWith())).json();

    expect(body).toEqual({
      // Equality, not `expect.any(String)` — a driver error is a string too,
      // and this is the envelope a browser actually receives.
      error: { kind: "load", message: "No Client Identity on this request." },
    });
  });
});

describe("GET /api/todos — the response belongs to one caller", () => {
  // Every response here is keyed entirely by the identity cookie. Without these
  // two headers a shared cache may key it on the URL alone and serve one
  // person's Todo List to the next caller, and the browser may answer Story
  // 2.7's `Retry` from its own cache rather than the server.
  it.each([
    [
      "the served list",
      async () => {
        todosRepository.listTodos.mockResolvedValue([]);
        return GET(identifiedRequest());
      },
    ],
    ["the 401", async () => GET(requestWith())],
    [
      "the 500",
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        todosRepository.listTodos.mockRejectedValue(new Error("unreachable"));
        return GET(identifiedRequest());
      },
    ],
  ])(
    "marks %s private, uncacheable and varying on the cookie",
    async (_case, respond) => {
      const response = await respond();

      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toMatch(/\bCookie\b/);
    },
  );
});

describe("the route's exported surface", () => {
  // Next.js also recognises a set of route *segment config* exports. They are
  // declarations about how the route runs, not endpoints, and two of them
  // (`dynamic`, `revalidate`) are exactly how this route would state its
  // never-cached intent explicitly rather than incidentally. Excluding them
  // from the check keeps the guard aimed at what it is for: an undesigned HTTP
  // method reaching the wire.
  const SEGMENT_CONFIG = new Set([
    "dynamic",
    "dynamicParams",
    "revalidate",
    "fetchCache",
    "runtime",
    "preferredRegion",
    "maxDuration",
  ]);

  it("exports GET, POST and their two message constants, and no third HTTP method", () => {
    // `POST` joined this file with Story 3.1. `PATCH` and `DELETE` arrive with
    // Epics 4 and 5 and update this list again; until then an extra export is
    // an endpoint nobody designed.
    const surface = Object.keys(routeModule)
      .filter((name) => !SEGMENT_CONFIG.has(name))
      .sort();

    expect(surface).toEqual([
      "CREATE_FAILED_MESSAGE",
      "GET",
      "LOAD_FAILED_MESSAGE",
      "POST",
    ]);
  });
});

describe("GET /api/todos — a read that fails (AC6)", () => {
  // Shaped like what `neon-http` actually rejects with: Drizzle wraps the
  // driver error, and the message names the statement, the relation *and* the
  // bound parameters. `GET`'s only parameter is an owner id, but the handler
  // insulates itself the same way `POST` does — insulation that depended on
  // which query happened to be running would break the first time one changed.
  const SELECT_STATEMENT =
    'select "id", "text" from "todo" where "todo"."owner_id" = $1';
  const DRIVER_ERROR = drizzleQueryError(SELECT_STATEMENT, [OWNER_ID]);

  it("answers 500 with the load envelope when the repository rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.listTodos.mockRejectedValue(DRIVER_ERROR);

    const response = await GET(identifiedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { kind: "load", message: LOAD_FAILED_MESSAGE },
    });
  });

  it("never forwards the driver's text to the wire (deferred-work: the unconstrained message)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.listTodos.mockRejectedValue(DRIVER_ERROR);

    const serialized = await (await GET(identifiedRequest())).text();

    // Equality, not "some string": the driver's own text is a string too, so
    // `expect.any(String)` would pass on exactly the leak this guards against.
    expect(JSON.parse(serialized).error.message).toBe(LOAD_FAILED_MESSAGE);
    // And the belt to that brace — no fragment of the statement anywhere in the
    // body, including a future message that embedded one by accident.
    for (const fragment of ["Failed query", "owner_id", "select", '"todo"']) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("logs the statement summary and never the error object, which carries the query", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.listTodos.mockRejectedValue(DRIVER_ERROR);

    await GET(identifiedRequest());

    expect(logged).toHaveBeenCalledTimes(1);
    for (const argument of logged.mock.calls[0]) {
      expect(typeof argument).toBe("string");
    }
    // Something diagnostic survives — the statement, which this repository
    // wrote — and the bound parameters do not. Both halves matter: a log line
    // that said nothing would pass a leak check and help nobody at 3am.
    expect(logged.mock.calls[0]).toContain(`Failed query: ${SELECT_STATEMENT}`);
    for (const argument of logged.mock.calls[0]) {
      expect(argument).not.toContain("params:");
      expect(argument).not.toContain(OWNER_ID);
    }
  });

  it("answers the same enveloped 500 when the identity lookup itself fails, never an unenveloped crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    identityRepository.findClientIdentityByTokenHash.mockRejectedValue(
      new Error("Failed query: select from client_identity"),
    );

    const response = await GET(
      requestWith(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { kind: "load", message: LOAD_FAILED_MESSAGE },
    });
  });
});

// ---------------------------------------------------------------------------
// Story 3.1 — POST /api/todos
// ---------------------------------------------------------------------------
//
// AC1 (a row created and returned bare), AC2 (the id is a lowercase canonical
// UUIDv7 and the server mints nothing), AC3/AC4 (the idempotent retry and the
// foreign owner, as the repository reports them), AC5 (`ownerId` first and no
// query built here), AC6 (`401` and none issued), AC7-AC10 (the text rules,
// imported and re-enforced) and AC11 (no Todo text in a log line).
//
// The repository is mocked here for the same reason `listTodos` is: what this
// file proves is which call the handler makes, with what, and what it does with
// each of the three outcomes. That the three outcomes are *produced* correctly
// is SQL, and is proved live in `src/server/repository/todos.test.ts`.

describe("POST /api/todos — a Todo that is created (AC1, AC5)", () => {
  it("answers 201 with the created Todo bare — no envelope around it", async () => {
    const created = todoOf(SUBMITTED_ID, "Buy milk");
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: created,
    });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await expect(response.json()).resolves.toEqual(created);
  });

  it("passes the resolved identity first, then the client's id and text (AC5)", async () => {
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, "Buy milk"),
    });

    await POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));

    expect(todosRepository.createTodo).toHaveBeenCalledTimes(1);
    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      "Buy milk",
    );
  });

  it("stores the id the client sent and never one of its own (AC2)", async () => {
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, "Buy milk"),
    });

    await POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));

    expect(todosRepository.createTodo.mock.calls[0][1]).toBe(SUBMITTED_ID);
  });

  it("ignores a client-supplied completed or createdAt — the server sets both (AC1)", async () => {
    const created = todoOf(SUBMITTED_ID, "Buy milk");
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: created,
    });

    const response = await POST(
      identifiedPost({
        id: SUBMITTED_ID,
        text: "Buy milk",
        completed: true,
        createdAt: "1999-01-01T00:00:00.000Z",
        ownerId: "11111111-2222-7000-8000-333333333333",
      }),
    );

    // Three extra fields reach the handler and none reaches the repository.
    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      "Buy milk",
    );
    await expect(response.json()).resolves.toEqual(created);
  });
});

describe("POST /api/todos — a retry of a create that already landed (AC3, AC4)", () => {
  it("answers 200 with the existing row when the id is already the caller's", async () => {
    // 201-vs-200 is what lets a client tell a create from a replay; the body is
    // the stored row, which is not necessarily the text this retry submitted.
    const stored = todoOf(SUBMITTED_ID, "the text that was actually stored");
    todosRepository.createTodo.mockResolvedValue({
      outcome: "existing",
      todo: stored,
    });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "a later edit of the same id" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(stored);
  });

  it("answers 409 when the id belongs to somebody else", async () => {
    todosRepository.createTodo.mockResolvedValue({ outcome: "foreign-owner" });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }),
    );

    expect(response.status).toBe(409);
  });

  it("discloses nothing about the existing row in that 409 (AC4)", async () => {
    todosRepository.createTodo.mockResolvedValue({ outcome: "foreign-owner" });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }),
    );
    const serialized = await response.text();

    // Equality, not "some envelope": the fixed message is the whole of what a
    // refused create is told, and "that id is taken" would itself be a
    // disclosure. The status code carries the distinction.
    expect(JSON.parse(serialized)).toEqual(CREATE_ENVELOPE);
    // Not even the id it asked about is echoed, so a caller cannot probe for
    // which ids exist by reading the body rather than the status.
    expect(serialized).not.toContain(SUBMITTED_ID);
    expect(serialized).not.toContain("owner");
  });

  it("logs nothing at all for a 409 — a refusal is not a server failure (AC11)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockResolvedValue({ outcome: "foreign-owner" });

    await POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("POST /api/todos — no valid identity (AC6)", () => {
  it.each([
    ["no cookie at all", undefined],
    ["an empty cookie", `${IDENTITY_COOKIE_NAME}=`],
  ])("answers 401 and creates nothing when there is %s", async (_c, cookie) => {
    const response = await POST(
      postRequest({ id: SUBMITTED_ID, text: "Buy milk" }, cookie),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });

  it("answers 401 when the token names no row — a forged or stale cookie", async () => {
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue(
      undefined,
    );

    const response = await POST(
      postRequest(
        { id: SUBMITTED_ID, text: "Buy milk" },
        `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      ),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });

  it("issues no identity while refusing — the handler only ever reads (AD-17)", async () => {
    await POST(postRequest({ id: SUBMITTED_ID, text: "Buy milk" }));

    expect(identityRepository.createClientIdentity).not.toHaveBeenCalled();
  });

  it("carries the shared envelope with kind create, the kind a POST is classified by", async () => {
    const body = await (
      await POST(postRequest({ id: SUBMITTED_ID, text: "Buy milk" }))
    ).json();

    expect(body).toEqual({
      error: { kind: "create", message: "No Client Identity on this request." },
    });
  });

  it("answers 401 rather than 400 when the body is also invalid — identity is checked first", async () => {
    // The order matters: an unidentified caller learns nothing about this
    // endpoint's validation, and a `400` here would be that.
    const response = await POST(postRequest({ id: "not-a-uuid", text: "   " }));

    expect(response.status).toBe(401);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });
});

describe("POST /api/todos — the id must be a lowercase canonical UUIDv7 (AC2)", () => {
  it.each([
    ["uppercase hex", SUBMITTED_ID.toUpperCase()],
    ["a v4", "0199a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b"],
    ["a wrong variant nibble", "0199a1b2-c3d4-7e5f-ca9b-0c1d2e3f4a5b"],
    ["braces", `{${SUBMITTED_ID}}`],
    ["a urn prefix", `urn:uuid:${SUBMITTED_ID}`],
    ["the wrong length", SUBMITTED_ID.slice(0, -1)],
    ["no hyphens", SUBMITTED_ID.replaceAll("-", "")],
    ["an empty string", ""],
  ])("answers 400 and creates nothing for %s", async (_case, id) => {
    const response = await POST(identifiedPost({ id, text: "Buy milk" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });
});

describe("POST /api/todos — the text rules, re-enforced here (AC7, AC8, AC9, AC10)", () => {
  it("answers 400 with kind create and creates nothing for text that is empty after trimming (AC7)", async () => {
    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "   \t\n  " }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });

  it("answers 400 with kind create and creates nothing for text over the cap (AC8)", async () => {
    // The cap is the shared contract's constant, never retyped here (AC9): if
    // the ceiling moved, this case would move with it.
    const response = await POST(
      identifiedPost({
        id: SUBMITTED_ID,
        text: "a".repeat(TODO_TEXT_MAX_LENGTH + 1),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });

  it("accepts text of exactly the cap — the boundary is inclusive (AC9)", async () => {
    const atTheCap = "a".repeat(TODO_TEXT_MAX_LENGTH);
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, atTheCap),
    });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: atTheCap }),
    );

    expect(response.status).toBe(201);
    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      atTheCap,
    );
  });

  it("accepts text that is over the cap only until it is trimmed (AC9, AC10)", async () => {
    // The predicate trims before measuring, so whitespace cannot be used to
    // smuggle a 501st character past the ceiling — and cannot cause a valid
    // submit to be refused either.
    const padded = `  ${"a".repeat(TODO_TEXT_MAX_LENGTH)}  `;
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, padded.trim()),
    });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: padded }),
    );

    expect(response.status).toBe(201);
    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      padded.trim(),
    );
  });

  it("stores the trimmed form, never what the caller sent (AC10)", async () => {
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, "Buy milk"),
    });

    await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "\n\t  Buy milk  \n" }),
    );

    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      "Buy milk",
    );
    // Inner whitespace is the person's own copy and is left alone.
    expect(todosRepository.createTodo.mock.calls[0][2]).not.toBe(
      "\n\t  Buy milk  \n",
    );
  });

  it("persists exactly the string the predicate measured (AC10)", async () => {
    // `isValidTodoText` trims internally to decide and hands back no string;
    // `route.ts` then trims a second time to persist. Nothing in the types
    // pins those two trims to each other — and the contract's API is
    // deliberately a verdict, so this row is what pins them instead.
    //
    // The text below is valid *only* because of the trim: raw it is over the
    // cap, and its padding includes a non-breaking space, which `String.trim`
    // removes but a hand-rolled `replace(/ /g, "")` or `/\s/`-free trim would
    // leave behind — and one leftover character is 501, which is the exact
    // disagreement that would make the predicate's verdict a lie.
    const trimmable = ` \n\t  ${"b".repeat(TODO_TEXT_MAX_LENGTH)}   `;
    expect(trimmable.length).toBeGreaterThan(TODO_TEXT_MAX_LENGTH);
    expect(isValidTodoText(trimmable)).toBe(true);

    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, trimmable.trim()),
    });

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: trimmable }),
    );

    expect(response.status).toBe(201);
    const persisted = todosRepository.createTodo.mock.calls[0][2];
    // Exactly the length the predicate measured, and still valid by it — so
    // the string that was stored is the string that was judged.
    expect(persisted).toHaveLength(TODO_TEXT_MAX_LENGTH);
    expect(isValidTodoText(persisted)).toBe(true);
    // A fixed point: trimming what was persisted changes nothing further.
    expect(persisted.trim()).toBe(persisted);
  });

  it("keeps whitespace inside the text exactly as typed", async () => {
    todosRepository.createTodo.mockResolvedValue({
      outcome: "created",
      todo: todoOf(SUBMITTED_ID, "Buy  milk and\tbread"),
    });

    await POST(
      identifiedPost({ id: SUBMITTED_ID, text: " Buy  milk and\tbread " }),
    );

    expect(todosRepository.createTodo).toHaveBeenCalledWith(
      OWNER_ID,
      SUBMITTED_ID,
      "Buy  milk and\tbread",
    );
  });
});

describe("POST /api/todos — a body that is not a create at all", () => {
  it.each([
    ["no body fields", {}],
    ["no text", { id: SUBMITTED_ID }],
    ["no id", { text: "Buy milk" }],
    ["a numeric id", { id: 7, text: "Buy milk" }],
    ["a non-string text", { id: SUBMITTED_ID, text: 42 }],
    ["a null text", { id: SUBMITTED_ID, text: null }],
    ["a JSON array", [{ id: SUBMITTED_ID, text: "Buy milk" }]],
    ["a JSON string", '"Buy milk"'],
    ["JSON null", "null"],
    ["a JSON number", "7"],
    ["a body that is not JSON", "Buy milk"],
    ["an empty body", ""],
  ])("answers 400 and creates nothing for %s", async (_case, body) => {
    const response = await POST(identifiedPost(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
    expect(todosRepository.createTodo).not.toHaveBeenCalled();
  });

  it("never logs a malformed body — a JSON parse error quotes the input (AC11)", async () => {
    // `SyntaxError` from `JSON.parse` embeds the offending text, so letting one
    // reach the catch block would put the submitted Todo in a log line.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(identifiedPost("{ this is not JSON: Buy milk }"));

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("POST /api/todos — a create that fails", () => {
  // The text this describe submits, and — because Drizzle binds it as a
  // parameter of the insert and interpolates the parameters into the error's
  // own message — the text a rejected `createTodo` therefore hands the handler.
  // The fixture carries the *same* string the requests below send, so AC11's
  // assertion has something to bite on: a fixture whose params named a
  // different Todo could not fail however leaky the handler was.
  const SUBMITTED_TEXT = "pick up the dry cleaning";
  const INSERT_STATEMENT =
    'insert into "todo" ("id", "owner_id", "text") values ($1, $2, $3) on conflict ("id") do nothing returning "id", "text", "completed", "created_at"';
  const DRIVER_ERROR = drizzleQueryError(INSERT_STATEMENT, [
    SUBMITTED_ID,
    OWNER_ID,
    SUBMITTED_TEXT,
  ]);

  it("carries the submitted text in its own message — the fixture is the leak, not a stand-in", () => {
    // If this ever stops holding, every AC11 row below has quietly stopped
    // testing anything. `node_modules/drizzle-orm/errors.js` is the source.
    expect(DRIVER_ERROR.message).toContain(SUBMITTED_TEXT);
    expect(DRIVER_ERROR.message).toContain("\nparams:");
  });

  it("answers 500 with the create envelope when the repository rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(DRIVER_ERROR);

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
  });

  it("never forwards the driver's text to the wire", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(DRIVER_ERROR);

    const serialized = await (
      await POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }))
    ).text();

    expect(JSON.parse(serialized).error.message).toBe(CREATE_FAILED_MESSAGE);
    for (const fragment of ["Failed query", "owner_id", "insert", '"todo"']) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("reports the failure as kind create and never as kind load", async () => {
    // The two constants are siblings and must not have been collapsed into one:
    // a failed create reported as a failed read would show the wrong copy in
    // the single error slot.
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(DRIVER_ERROR);

    const body = await (
      await POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }))
    ).json();

    expect(body.error.kind).toBe("create");
    expect(body.error.message).not.toBe(LOAD_FAILED_MESSAGE);
  });

  it("logs strings only, and no Todo text in any of them (AC11)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(DRIVER_ERROR);

    await POST(identifiedPost({ id: SUBMITTED_ID, text: SUBMITTED_TEXT }));

    expect(logged).toHaveBeenCalledTimes(1);
    for (const argument of logged.mock.calls[0]) {
      expect(typeof argument).toBe("string");
      expect(argument).not.toContain(SUBMITTED_TEXT);
      // The whole parameter section, not just this one string: the next
      // column bound into this insert is the next thing to leak otherwise.
      expect(argument).not.toContain("params:");
    }
  });

  it("still logs the statement itself, so the insulation is not just silence (AC11)", async () => {
    // The cheapest way to pass the row above is to log nothing at all. What
    // `logSafeError` actually does is cut at `\nparams:`, keeping the SQL this
    // repository wrote — which carries nothing of the caller's.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(DRIVER_ERROR);

    await POST(identifiedPost({ id: SUBMITTED_ID, text: SUBMITTED_TEXT }));

    expect(logged.mock.calls[0]).toContain(`Failed query: ${INSERT_STATEMENT}`);
  });

  it("logs a name rather than a blank line when nothing survives the cut", async () => {
    // A message that is *entirely* params leaves an empty summary. The handler
    // falls back to the error's name; a failure is never logged as nothing.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const paramsOnly = new Error(`\nparams: ${SUBMITTED_TEXT}`);
    paramsOnly.name = "DrizzleQueryError";
    todosRepository.createTodo.mockRejectedValue(paramsOnly);

    await POST(identifiedPost({ id: SUBMITTED_ID, text: SUBMITTED_TEXT }));

    expect(logged.mock.calls[0]).toContain("DrizzleQueryError");
    for (const argument of logged.mock.calls[0]) {
      expect(argument).not.toContain(SUBMITTED_TEXT);
    }
  });

  it("logs nothing of the text when the rejection is not an Error at all", async () => {
    // `throw "…"` is legal, and a thrown string could be anything.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.createTodo.mockRejectedValue(SUBMITTED_TEXT);

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: SUBMITTED_TEXT }),
    );

    expect(response.status).toBe(500);
    for (const argument of logged.mock.calls[0]) {
      expect(argument).not.toContain(SUBMITTED_TEXT);
    }
  });

  it("answers the same enveloped 500 when the identity lookup itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    identityRepository.findClientIdentityByTokenHash.mockRejectedValue(
      new Error("Failed query: select from client_identity"),
    );

    const response = await POST(
      postRequest(
        { id: SUBMITTED_ID, text: "Buy milk" },
        `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(CREATE_ENVELOPE);
  });
});

describe("POST /api/todos — no identity is ever issued (AD-17)", () => {
  // AD-17 is not "a refusal issues none" — it is that a route handler never
  // issues one, full stop. `middleware.ts` is the only minting site, and a
  // handler that quietly created a Client Identity on the way to a successful
  // create would put a second one there. The `401` path is covered above; these
  // are the three answers a request that *did* carry an identity can receive.
  it.each([
    ["a 201", 201, { outcome: "created", todo: todoOf(SUBMITTED_ID, "x") }],
    ["a 200", 200, { outcome: "existing", todo: todoOf(SUBMITTED_ID, "x") }],
    ["a 409", 409, { outcome: "foreign-owner" }],
  ])("issues none on %s either", async (_case, status, outcome) => {
    todosRepository.createTodo.mockResolvedValue(outcome);

    const response = await POST(
      identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }),
    );

    expect(response.status).toBe(status);
    expect(identityRepository.createClientIdentity).not.toHaveBeenCalled();
  });
});

describe("POST /api/todos — the response belongs to one caller", () => {
  it.each([
    [
      "the 201",
      async () => {
        todosRepository.createTodo.mockResolvedValue({
          outcome: "created",
          todo: todoOf(SUBMITTED_ID, "Buy milk"),
        });
        return POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));
      },
    ],
    [
      "the 200 of an idempotent retry",
      async () => {
        todosRepository.createTodo.mockResolvedValue({
          outcome: "existing",
          todo: todoOf(SUBMITTED_ID, "Buy milk"),
        });
        return POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));
      },
    ],
    [
      "the 400",
      async () => POST(identifiedPost({ id: "not-a-uuid", text: "Buy milk" })),
    ],
    [
      "the 409",
      async () => {
        todosRepository.createTodo.mockResolvedValue({
          outcome: "foreign-owner",
        });
        return POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));
      },
    ],
    ["the 401", async () => POST(postRequest({ id: SUBMITTED_ID, text: "x" }))],
    [
      "the 500",
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        todosRepository.createTodo.mockRejectedValue(new Error("unreachable"));
        return POST(identifiedPost({ id: SUBMITTED_ID, text: "Buy milk" }));
      },
    ],
  ])(
    "marks %s private, uncacheable and varying on the cookie",
    async (_case, respond) => {
      const response = await respond();

      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toMatch(/\bCookie\b/);
    },
  );
});
