// The Client Identity token: minting, hashing, and the identity's own id (AD-7).
//
// Three pure functions over Web Crypto. Nothing here reaches the database and
// nothing here sets a cookie — `middleware.ts` is the only caller that mints
// (AD-17, Story 1.6 AC6), and it is the only module that puts these three
// together.
//
// Web Crypto (`crypto.getRandomValues`, `crypto.subtle`) rather than
// `node:crypto`: Proxy/Middleware defaults to the Node.js runtime in Next.js 16,
// but these globals are the one spelling that works unchanged if any of this
// ever runs on the Edge runtime instead, and they are standard in Node 24. That
// is why `hashIdentityToken` is async — `crypto.subtle.digest` is.
//
// The raw token exists only in the cookie and in memory for the length of one
// request. Only `hashIdentityToken`'s output is ever stored (AC5).

/** Lowercase hex, two characters per byte — the form both the token and the hash take. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A fresh 256-bit random Client Identity token, as 64 lowercase hex characters.
 *
 * 256 bits is AD-7's figure. Hex rather than base64url because the cookie value
 * then needs no encoding rules of its own: every character is already a valid
 * `cookie-octet`. The token authorizes nothing beyond its own Todo List and
 * must never become authentication (AD-7).
 */
export function mintIdentityToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The SHA-256 of a token, as 64 lowercase hex characters — the only form of the
 * token that is ever written to `client_identity.token_hash` (AD-7, AC5).
 *
 * Hex-encoded like the token itself, and never equal to it: the digest is taken
 * over the token's UTF-8 bytes, not over the bytes the hex spells.
 */
export async function hashIdentityToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/**
 * A fresh UUIDv7 for a `client_identity` row, lowercase canonical form.
 *
 * `schema.ts` gives the primary key no DB-generated default, and the
 * ARCHITECTURE-SPINE "Ids" convention makes `client_identity` ids server-minted
 * UUIDv7. RFC 9562 layout: 48-bit big-endian Unix milliseconds, then version 7
 * in the high nibble of byte 6, then the `10` variant in the high bits of byte
 * 8, everything else random.
 *
 * Monotonicity within a millisecond is deliberately not implemented: it matters
 * for `todo.id`, which AD-5 makes the sort key, and `client_identity.id` is
 * never sorted on. See this story's spec for why the pinned `uuidv7` package is
 * not used here yet.
 */
export function mintIdentityId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Unix milliseconds, big-endian, across bytes 0-5. `Date.now()` exceeds 32
  // bits, so the top two bytes are divided out rather than shifted: `>>>`
  // truncates its operand to 32 bits first.
  const timestamp = Date.now();
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp >>> 24) & 0xff;
  bytes[3] = (timestamp >>> 16) & 0xff;
  bytes[4] = (timestamp >>> 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
