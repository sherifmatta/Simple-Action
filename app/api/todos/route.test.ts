import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_COOKIE_NAME } from "@/server/identity/identity-cookie";
import {
  hashIdentityToken,
  mintIdentityToken,
} from "@/server/identity/identity-token";
import * as routeModule from "./route";
import { GET, LOAD_FAILED_MESSAGE } from "./route";

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
const todosRepository = vi.hoisted(() => ({ listTodos: vi.fn() }));

vi.mock("@/server/repository/client-identity", () => identityRepository);
vi.mock("@/server/repository/todos", () => todosRepository);

const OWNER_ID = "0199a1b2-c3d4-7000-8000-0123456789ab";

const todoOf = (id: string, text: string) => ({
  id,
  text,
  completed: false,
  createdAt: "2026-09-22T10:00:00.000Z",
});

const requestWith = (cookie?: string, method = "GET") =>
  new NextRequest("https://simple-action.test/api/todos", {
    method,
    headers: cookie === undefined ? {} : { cookie },
  });

/** A request whose cookie resolves to `OWNER_ID`. */
function identifiedRequest(): NextRequest {
  identityRepository.findClientIdentityByTokenHash.mockResolvedValue({
    id: OWNER_ID,
    tokenHash: "irrelevant — the hash is computed from the cookie",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
  });

  return requestWith(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`);
}

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
      error: { kind: "load", message: expect.any(String) },
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
  it("exports GET and the message constant, and no second HTTP method", () => {
    // Next.js routes any exported method name it recognises. `POST` joins this
    // file with Story 3.1 and updates this list; until then an extra export is
    // an endpoint nobody designed.
    expect(Object.keys(routeModule).sort()).toEqual([
      "GET",
      "LOAD_FAILED_MESSAGE",
    ]);
  });
});

describe("GET /api/todos — a read that fails (AC6)", () => {
  // Shaped like what `neon-http` actually rejects with: Drizzle wraps the
  // driver error and the text names the statement and the relation.
  const DRIVER_ERROR = new Error(
    'Failed query: select "id", "text" from "todo" where "todo"."owner_id" = $1',
  );

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

  it("logs the failure's message and never the error object, which carries the query", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.listTodos.mockRejectedValue(DRIVER_ERROR);

    await GET(identifiedRequest());

    expect(logged).toHaveBeenCalledTimes(1);
    for (const argument of logged.mock.calls[0]) {
      expect(typeof argument).toBe("string");
    }
    expect(logged.mock.calls[0]).toContain(DRIVER_ERROR.message);
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
