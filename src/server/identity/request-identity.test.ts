import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_COOKIE_NAME } from "./identity-cookie";
import { hashIdentityToken, mintIdentityToken } from "./identity-token";
import {
  errorKindForMethod,
  resolveClientIdentity,
  unauthorizedIdentityResponse,
} from "./request-identity";

// Story 1.6 AC4 (a request under `app/api/` without an identity is refused, and
// no identity is created), AC5 (the raw token never leaves this process for the
// database) and the resolve half of AC1/AC3/AC7.
//
// The repository is mocked rather than reached. Story 1.4's own live tests
// prove that `findClientIdentityByTokenHash` and `createClientIdentity` really
// read and write Neon; what is under test here is which of them gets called and
// with what, and a spy answers "no identity is created" far more directly than
// a row count. It also keeps the repository's exported surface at the two
// functions Story 1.4 fixed: this module has no delete to clean up with, so a
// live test here would leave its rows on the branch.
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

const requestWith = (cookie?: string, method = "GET") =>
  new NextRequest("https://simple-action.test/api/todos", {
    method,
    headers: cookie === undefined ? {} : { cookie },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveClientIdentity", () => {
  it("returns undefined and queries nothing when the request carries no cookie", async () => {
    await expect(resolveClientIdentity(requestWith())).resolves.toBeUndefined();
    expect(repository.findClientIdentityByTokenHash).not.toHaveBeenCalled();
  });

  it("returns undefined and queries nothing when the cookie is present but empty", async () => {
    await expect(resolveClientIdentity(requestWith(`${IDENTITY_COOKIE_NAME}=`))).resolves.toBeUndefined();
    expect(repository.findClientIdentityByTokenHash).not.toHaveBeenCalled();
  });

  it("returns undefined when the token names no row — a forged or stale cookie", async () => {
    repository.findClientIdentityByTokenHash.mockResolvedValue(undefined);

    const request = requestWith(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`);
    await expect(resolveClientIdentity(request)).resolves.toBeUndefined();
    expect(repository.findClientIdentityByTokenHash).toHaveBeenCalledTimes(1);
  });

  it("returns the identity the cookie names (AC3, AC7)", async () => {
    const token = mintIdentityToken();
    const row = identityRow("0199a0b1-c2d3-7e4f-8a9b-0c1d2e3f4a5b", await hashIdentityToken(token));
    repository.findClientIdentityByTokenHash.mockResolvedValue(row);

    await expect(resolveClientIdentity(requestWith(`${IDENTITY_COOKIE_NAME}=${token}`))).resolves.toBe(row);
  });

  it("looks the identity up by the SHA-256 hash, never by the token (AC5)", async () => {
    const token = mintIdentityToken();
    await resolveClientIdentity(requestWith(`${IDENTITY_COOKIE_NAME}=${token}`));

    const [lookedUp] = repository.findClientIdentityByTokenHash.mock.calls[0];
    expect(lookedUp).toBe(await hashIdentityToken(token));
    expect(lookedUp).not.toBe(token);
  });

  it("resolves one browser's cookie to that browser's identity only (AC7)", async () => {
    const [tokenA, tokenB] = [mintIdentityToken(), mintIdentityToken()];
    const rowA = identityRow("0199a0b1-0000-7000-8000-00000000000a", await hashIdentityToken(tokenA));
    const rowB = identityRow("0199a0b1-0000-7000-8000-00000000000b", await hashIdentityToken(tokenB));
    repository.findClientIdentityByTokenHash.mockImplementation(async (hash: string) =>
      [rowA, rowB].find((row) => row.tokenHash === hash),
    );

    await expect(resolveClientIdentity(requestWith(`${IDENTITY_COOKIE_NAME}=${tokenA}`))).resolves.toBe(rowA);
    await expect(resolveClientIdentity(requestWith(`${IDENTITY_COOKIE_NAME}=${tokenB}`))).resolves.toBe(rowB);
  });

  it("never writes, whatever the cookie says (AC4)", async () => {
    for (const cookie of [undefined, `${IDENTITY_COOKIE_NAME}=`, `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`]) {
      await resolveClientIdentity(requestWith(cookie));
    }
    expect(repository.createClientIdentity).not.toHaveBeenCalled();
  });
});

describe("errorKindForMethod (AD-10)", () => {
  it.each([
    ["GET", "load"],
    ["HEAD", "load"],
    ["POST", "create"],
    ["PUT", "update"],
    ["PATCH", "update"],
    ["DELETE", "delete"],
    // Case-insensitive, and an unplanned verb still lands on a kind the single
    // error slot can classify rather than on nothing.
    ["get", "load"],
    ["patch", "update"],
    ["TRACE", "load"],
  ])("classifies %s as %s", (method, kind) => {
    expect(errorKindForMethod(method)).toBe(kind);
  });
});

describe("unauthorizedIdentityResponse (AC4)", () => {
  it("is a 401 carrying the shared error envelope", async () => {
    const response = unauthorizedIdentityResponse("GET");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { kind: "load", message: expect.any(String) },
    });
  });

  it("classifies the failure by the operation attempted", async () => {
    const response = unauthorizedIdentityResponse("POST");
    await expect(response.json()).resolves.toMatchObject({ error: { kind: "create" } });
  });

  it("sets no cookie — refusing a request is not an identity-issuing path (AC4, AC6)", () => {
    expect(unauthorizedIdentityResponse("GET").headers.get("set-cookie")).toBeNull();
  });
});
