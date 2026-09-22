import { describe, expect, it } from "vitest";

import { hashIdentityToken, mintIdentityId, mintIdentityToken } from "./identity-token";

// Story 1.6 AC1 (a 256-bit random token), AC5 (only the SHA-256 hash is ever
// stored, and the hash is never the token) and the ARCHITECTURE-SPINE "Ids"
// convention (server-minted UUIDv7 for `client_identity`).
//
// No database and no network: these three functions are pure over Web Crypto.

const HEX_64 = /^[0-9a-f]{64}$/;

// Lowercase canonical UUID with version 7 and the RFC 9562 `10` variant.
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("mintIdentityToken (AC1)", () => {
  it("is 256 bits, as 64 lowercase hex characters", () => {
    const token = mintIdentityToken();
    expect(token).toMatch(HEX_64);
    // 64 hex characters is 32 bytes is 256 bits — asserted as arithmetic so a
    // future change to the encoding cannot quietly shrink the entropy.
    expect((token.length / 2) * 8).toBe(256);
  });

  it("is random — a thousand mints collide never", () => {
    const tokens = new Set(Array.from({ length: 1000 }, mintIdentityToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("hashIdentityToken (AC5)", () => {
  it("is SHA-256, hex-encoded", async () => {
    // RFC 6234's published digest of "abc" — a fixed vector, so this pins the
    // algorithm rather than restating the implementation.
    await expect(hashIdentityToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, so the same cookie resolves to the same row", async () => {
    const token = mintIdentityToken();
    await expect(hashIdentityToken(token)).resolves.toBe(await hashIdentityToken(token));
  });

  it("never returns the token it was given", async () => {
    const token = mintIdentityToken();
    const hash = await hashIdentityToken(token);
    expect(hash).toMatch(HEX_64);
    expect(hash).not.toBe(token);
  });

  it("separates two tokens that differ by one character", async () => {
    await expect(hashIdentityToken("a")).resolves.not.toBe(await hashIdentityToken("b"));
  });
});

describe("mintIdentityId", () => {
  it("is a lowercase canonical UUIDv7", () => {
    expect(mintIdentityId()).toMatch(UUID_V7);
  });

  it("carries the current time in its first 48 bits", () => {
    const before = Date.now();
    const id = mintIdentityId();
    const after = Date.now();

    const timestamp = Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("is random below the timestamp — a thousand mints collide never", () => {
    const ids = new Set(Array.from({ length: 1000 }, mintIdentityId));
    expect(ids.size).toBe(1000);
  });
});
