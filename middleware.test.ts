import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDENTITY_COOKIE_MAX_AGE_SECONDS,
  IDENTITY_COOKIE_NAME,
} from "@/server/identity/identity-cookie";
import { hashIdentityToken } from "@/server/identity/identity-token";
import { config, middleware } from "./middleware";

// Story 1.6 AC1 (mint on a document request with no cookie), AC2 (the cookie's
// attributes as the browser receives them), AC3 (a valid cookie mints nothing),
// AC4 (a request under app/api/ without an identity is answered 401 and creates
// nothing), AC5 (only the SHA-256 hash is handed to the repository), AC6 (the
// minting code exists only in this file) and AC7 (two browsers, two identities).
//
// The repository is mocked. Story 1.4's live tests already prove that
// `createClientIdentity` writes the row and `findClientIdentityByTokenHash`
// reads it back; what this file tests is which of them middleware calls, with
// what, and on which paths — and a spy states "no identity is created" more
// directly than a row count can. It also keeps the suite from leaving rows on
// the Neon branch: Story 1.4 fixed the repository's surface at a lookup and a
// create, so there is no delete to clean up with.
const repository = vi.hoisted(() => ({
  findClientIdentityByTokenHash: vi.fn(),
  createClientIdentity: vi.fn(),
}));

vi.mock("@/server/repository/client-identity", () => repository);

const identityRow = (id: string, tokenHash: string) => ({
  id,
  tokenHash,
  createdAt: new Date("2026-09-21T00:00:00.000Z"),
});

const request = (pathname: string, { cookie, method = "GET" }: RequestOptions = {}) =>
  new NextRequest(`https://simple-action.test${pathname}`, {
    method,
    headers: cookie === undefined ? {} : { cookie },
  });

type RequestOptions = { cookie?: string; method?: string };

/** The cookie the response asks the browser to store, parsed into its attributes. */
function setCookie(response: Response): Record<string, string> | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) return undefined;

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...value] = part.trim().split("=");
      return [name.toLowerCase(), value.join("=")];
    }),
  );
}

/** The `(id, tokenHash)` the one create was called with. */
function createdIdentity(): { id: string; tokenHash: string } {
  expect(repository.createClientIdentity).toHaveBeenCalledTimes(1);
  const [id, tokenHash] = repository.createClientIdentity.mock.calls[0];
  return { id, tokenHash };
}

beforeEach(() => {
  vi.resetAllMocks();
  repository.createClientIdentity.mockImplementation(async (id: string, tokenHash: string) =>
    identityRow(id, tokenHash),
  );
});

// ---------------------------------------------------------------------------
// The matcher
// ---------------------------------------------------------------------------

describe("the matcher decides where an identity can be issued (AD-17)", () => {
  // `unstable_doesMiddlewareMatch` runs the real `getMiddlewareMatchers`
  // conversion — the same path-to-regexp pipeline `next build` uses — so this
  // pins the matcher as Next.js actually reads it rather than as a hand-rolled
  // RegExp guesses it. It is imported from its own module rather than from the
  // public `next/experimental/testing/server` barrel: that barrel also pulls in
  // the app-render exports, which need an `AsyncLocalStorage` global that
  // Vitest's node environment does not install.
  const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it.each([
    ["/", "the root document"],
    ["/todos", "a document route"],
    ["/api-docs", "a sibling route that merely starts with `api`"],
    ["/_nextdoor", "a sibling route that merely starts with `_next`"],
    ["/api", "the API root"],
    ["/api/todos", "a route handler"],
    // The document matcher excludes anything carrying a file extension, which
    // is what keeps robots.txt and the build assets out. The second matcher
    // entry exists so that carve-out cannot also exempt a route handler: AC4's
    // 401 has to hold for every route under app/api/.
    ["/api/todos.json", "a route handler whose path carries a dot"],
  ])("runs on %s — %s", (url) => {
    expect(runs(url)).toBe(true);
  });

  it.each([
    // Regression, 2026-09-21 code review: the original lookahead spelled this
    // `_next/`, so the extensionless form fell through to the middleware.
    ["/_next", "the extensionless Next.js root"],
    ["/_next/static/chunk.js", "a build asset"],
    ["/robots.txt", "a file with an extension"],
    ["/favicon.ico", "a file with an extension"],
    ["/_next/data/build/todos.json", "a data route"],
  ])("does not run on %s — %s", (url) => {
    expect(runs(url)).toBe(false);
  });

  it("adds no capturing group to the document matcher beyond the outer one", () => {
    // Next.js wraps the matcher and hands it to path-to-regexp, which allows
    // the single outer capture that every Next matcher uses and rejects any
    // other with "Capturing groups are not allowed". Spelling the alternations
    // inside the lookahead as `(/|$)` rather than `(?:/|$)` fails the build,
    // not this suite — so the count is asserted here.
    const capturingGroups = new RegExp(`${config.matcher[0]}|`).exec("")!.length - 1;
    expect(capturingGroups).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Document requests — the one identity-issuing path
// ---------------------------------------------------------------------------

describe("a document request with no identity cookie (AC1, AC2, AC5)", () => {
  it("mints a token, stores only its hash, and sets the cookie", async () => {
    const response = await middleware(request("/"));

    const cookie = setCookie(response);
    const token = cookie?.[IDENTITY_COOKIE_NAME];
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const { id, tokenHash } = createdIdentity();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tokenHash).toBe(await hashIdentityToken(token!));
    // AC5: what is stored is the digest, never the value the browser holds.
    // `client_identity` has no other column to hide it in — Story 1.3's
    // `schema.test.ts` pins the three columns.
    expect(tokenHash).not.toBe(token);
  });

  it("marks the minting response private and keyed on the cookie", async () => {
    // This is the one response in the product whose body-plus-header pair is
    // uniquely per-caller: it carries the `Set-Cookie` that decides whose Todo
    // List every later request reads. A shared cache replaying it hands two
    // visitors one identity.
    const response = await middleware(request("/"));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toMatch(/\bCookie\b/);
  });

  it("sets HttpOnly, Secure and SameSite=Lax (AC1)", async () => {
    const cookie = setCookie(await middleware(request("/")));

    expect(cookie).toHaveProperty("httponly");
    expect(cookie).toHaveProperty("secure");
    expect(cookie?.samesite?.toLowerCase()).toBe("lax");
    expect(cookie?.path).toBe("/");
  });

  it("sets an explicit long Max-Age, so the cookie is not a session cookie (AC2)", async () => {
    const cookie = setCookie(await middleware(request("/")));

    expect(cookie?.["max-age"]).toBe(String(IDENTITY_COOKIE_MAX_AGE_SECONDS));
    expect(Number(cookie?.["max-age"])).toBeGreaterThan(180 * 24 * 60 * 60);

    // A session cookie is one carrying neither `Max-Age` nor `Expires`, and is
    // dropped when the browser closes — which is exactly what AC2 forbids.
    // Next.js's cookie serializer derives `Expires` from the `maxAge` we set,
    // so the response carries both and the two agree: a browser too old to
    // honour `Max-Age` still keeps the Todo List.
    const expires = Date.parse(cookie?.expires ?? "");
    expect(Number.isNaN(expires)).toBe(false);
    expect(expires - Date.now()).toBeGreaterThan(
      (IDENTITY_COOKIE_MAX_AGE_SECONDS - 60) * 1000,
    );
  });

  it("issues a distinct identity to each browser (AC7)", async () => {
    const first = setCookie(await middleware(request("/")))?.[IDENTITY_COOKIE_NAME];
    const second = setCookie(await middleware(request("/")))?.[IDENTITY_COOKIE_NAME];

    expect(first).not.toBe(second);
    expect(repository.createClientIdentity).toHaveBeenCalledTimes(2);
    const [[firstId, firstHash], [secondId, secondHash]] =
      repository.createClientIdentity.mock.calls;
    expect(firstId).not.toBe(secondId);
    expect(firstHash).not.toBe(secondHash);
  });
});

describe("a document request that already carries a valid identity cookie (AC3)", () => {
  it("mints no token and creates no row", async () => {
    const token = "a".repeat(64);
    repository.findClientIdentityByTokenHash.mockResolvedValue(
      identityRow("0199a0b1-0000-7000-8000-00000000000a", await hashIdentityToken(token)),
    );

    const response = await middleware(request("/", { cookie: `${IDENTITY_COOKIE_NAME}=${token}` }));

    expect(repository.createClientIdentity).not.toHaveBeenCalled();
    expect(setCookie(response)).toBeUndefined();
  });
});

describe("a document request carrying a cookie that names no row", () => {
  it("issues a fresh identity rather than locking the browser out", async () => {
    repository.findClientIdentityByTokenHash.mockResolvedValue(undefined);

    const stale = "b".repeat(64);
    const response = await middleware(request("/", { cookie: `${IDENTITY_COOKIE_NAME}=${stale}` }));

    expect(repository.createClientIdentity).toHaveBeenCalledTimes(1);
    expect(setCookie(response)?.[IDENTITY_COOKIE_NAME]).not.toBe(stale);
  });
});

// ---------------------------------------------------------------------------
// app/api/ — resolved, never issued
// ---------------------------------------------------------------------------

describe("a request under app/api/ without a valid identity (AC4, AC6)", () => {
  it.each([
    ["GET", "load"],
    ["POST", "create"],
    ["PATCH", "update"],
    ["DELETE", "delete"],
  ])("answers %s with 401 and the %s error kind", async (method, kind) => {
    const response = await middleware(request("/api/todos", { method }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { kind, message: expect.any(String) },
    });
  });

  it("creates no identity and sets no cookie", async () => {
    const response = await middleware(request("/api/todos"));

    expect(repository.createClientIdentity).not.toHaveBeenCalled();
    expect(setCookie(response)).toBeUndefined();
  });

  it("refuses the API root the same way", async () => {
    expect((await middleware(request("/api"))).status).toBe(401);
    expect(repository.createClientIdentity).not.toHaveBeenCalled();
  });

  it("treats a sibling document route that merely starts with `api` as a document", async () => {
    const response = await middleware(request("/api-docs"));

    expect(response.status).not.toBe(401);
    expect(repository.createClientIdentity).toHaveBeenCalledTimes(1);
  });
});

describe("a request under app/api/ carrying a valid identity (AC4)", () => {
  it("passes through, and still creates nothing", async () => {
    const token = "c".repeat(64);
    repository.findClientIdentityByTokenHash.mockResolvedValue(
      identityRow("0199a0b1-0000-7000-8000-00000000000c", await hashIdentityToken(token)),
    );

    const response = await middleware(
      request("/api/todos", { cookie: `${IDENTITY_COOKIE_NAME}=${token}` }),
    );

    expect(response.status).toBe(200);
    expect(repository.createClientIdentity).not.toHaveBeenCalled();
    expect(setCookie(response)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The identity store is unreachable
// ---------------------------------------------------------------------------

describe("when the identity store is unreachable", () => {
  // Neon auto-suspends and wakes on demand — Story 1.4 measured several seconds
  // on a cold branch — so a rejected query is an ordinary transient here, not a
  // state nobody reaches.
  const unreachable = () => new Error("Failed query: select from client_identity");
  const someCookie = `${IDENTITY_COOKIE_NAME}=${"d".repeat(64)}`;

  it("serves the document anyway, with no cookie, rather than an error page", async () => {
    repository.findClientIdentityByTokenHash.mockRejectedValue(unreachable());
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await middleware(request("/", { cookie: someCookie }));

    expect(response.status).toBe(200);
    expect(setCookie(response)).toBeUndefined();
    expect(repository.createClientIdentity).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("serves the document when the create is what fails, and issues no half-cookie", async () => {
    repository.findClientIdentityByTokenHash.mockResolvedValue(undefined);
    repository.createClientIdentity.mockRejectedValue(unreachable());
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await middleware(request("/"));

    expect(response.status).toBe(200);
    // The token was minted in memory and never reached the browser, so no
    // cookie names a row that does not exist.
    expect(setCookie(response)).toBeUndefined();
    logged.mockRestore();
  });

  it("answers an API request 503, not 401 — the caller's identity is unknown, not absent", async () => {
    repository.findClientIdentityByTokenHash.mockRejectedValue(unreachable());
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await middleware(
      request("/api/todos", { method: "POST", cookie: someCookie }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { kind: "create", message: expect.any(String) },
    });
    // The outage response is decided by the identity cookie like every other
    // response under `app/api/`, so it carries the same two headers. Asserted
    // here because `identityUnavailableResponse` is module-local: no other file
    // can reach it, and re-inlining a bare `Response.json` here would otherwise
    // ship a cacheable, unkeyed 503 with the whole suite green.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toMatch(/\bCookie\b/);
    logged.mockRestore();
  });

  it("logs the failure's message and never the token or the query's values", async () => {
    repository.findClientIdentityByTokenHash.mockRejectedValue(unreachable());
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await middleware(request("/", { cookie: someCookie }));

    const line = logged.mock.calls.flat().join(" ");
    expect(line).toContain("Failed query");
    expect(line).not.toContain("d".repeat(64));
    logged.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AC6 — the minting code exists only here
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// Kept in step with the identical sets in src/server/repository/client-identity.test.ts
// and src/shared/contract/contract.test.ts. This is the third copy: the three
// scans walk the same tree for different reasons, and the shared helper has no
// home that does not widen a module whose contents an earlier story fixed.
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  ".git",
  ".claude",
  ".vercel",
  "coverage",
  "drizzle",
  "docs",
  "public",
  "_bmad",
]);

const repositoryRoot = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(repositoryRoot, directory || "."), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = directory ? path.join(directory, entry.name) : entry.name;
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(relativePath);
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [relativePath];
  });
}

// Any spelling of a test or spec file, not just `.test.ts`: a component test
// arrives as `.test.tsx` once jsdom lands, and the `e2e/` directory takes
// Playwright's `.spec.ts`. A test naming a minting symbol as assertion data is
// not a minting site, whatever its extension.
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Every source file naming `symbol`, test files aside — they name it as assertion data. */
function filesNaming(symbol: string): string[] {
  const named = new RegExp(`\\b${symbol}\\b`);
  return sourceFiles("")
    .filter((file) => !TEST_FILE.test(file))
    .filter((file) => named.test(readFileSync(path.join(repositoryRoot, file), "utf8")))
    .sort();
}

describe("AD-17 — the identity is issued here and nowhere else (AC6)", () => {
  // The four symbols that together bring a Client Identity into existence and
  // hand it to a browser, with the module that defines each. A file naming one
  // of these and not being its definition is minting, or is one step from it.
  //
  // `IDENTITY_COOKIE_ATTRIBUTES` is here for the last of those steps: a route
  // handler that never touched the repository but wrote the identity cookie
  // itself would be an identity-issuing path in AC6's plain sense.
  // `IDENTITY_COOKIE_NAME` cannot join it — reading the cookie is every route
  // handler's business, and `request-identity.ts` does exactly that.
  //
  // The scan is textual, so it enforces a spelling taboo, not a call graph: a
  // file merely naming one of these in prose fails it, and an obfuscated
  // `repo["create" + "ClientIdentity"]` would pass. That is the deliberate
  // trade — the cheap check catches the honest mistake, which is the one that
  // happens, and a reviewer catches the other.
  const MINTING = [
    { symbol: "mintIdentityToken", definedIn: path.join("src", "server", "identity", "identity-token.ts") },
    { symbol: "mintIdentityId", definedIn: path.join("src", "server", "identity", "identity-token.ts") },
    {
      symbol: "IDENTITY_COOKIE_ATTRIBUTES",
      definedIn: path.join("src", "server", "identity", "identity-cookie.ts"),
    },
    {
      symbol: "createClientIdentity",
      definedIn: path.join("src", "server", "repository", "client-identity.ts"),
    },
  ];

  it.each(MINTING)("$symbol is used only by middleware.ts", ({ symbol, definedIn }) => {
    const users = filesNaming(symbol).filter((file) => file !== definedIn);
    expect(users, `identity minting reached ${JSON.stringify(users)}`).toEqual(["middleware.ts"]);
  });

  it.each(MINTING)("finds $symbol's own module, so the scan cannot pass vacuously", ({
    symbol,
    definedIn,
  }) => {
    expect(filesNaming(symbol)).toContain(definedIn);
  });

  it("reads real files — a symbol nothing declares is found nowhere", () => {
    expect(filesNaming("mintIdentityTokenThatDoesNotExist")).toEqual([]);
  });

  it("finds no route handler that is an identity-issuing path", () => {
    // Story 2.1 brought the first one. The rest arrive in Epics 3-5 and inherit
    // the wall above: the scan fails the moment one of them names a minting
    // call. `TEST_FILE` is applied here for the reason it is applied in
    // `filesNaming` — `route.test.ts` starts with `route.` too, and a test
    // asserting that no identity is created names the symbol as assertion data.
    const routeHandlers = sourceFiles(path.join("app", "api")).filter(
      (file) =>
        path.basename(file).startsWith("route.") && !TEST_FILE.test(file),
    );
    expect(
      routeHandlers.length,
      "the scan found no route handler, so it would pass vacuously",
    ).toBeGreaterThan(0);
    for (const handler of routeHandlers) {
      const source = readFileSync(path.join(repositoryRoot, handler), "utf8");
      expect(source, `${handler} mints an identity`).not.toMatch(/createClientIdentity/);
    }
  });
});
