import { describe, expect, it } from "vitest";

import {
  IDENTITY_COOKIE_ATTRIBUTES,
  IDENTITY_COOKIE_MAX_AGE_SECONDS,
  IDENTITY_COOKIE_NAME,
} from "./identity-cookie";

// Story 1.6 AC1 (HttpOnly, Secure, SameSite=Lax) and AC2 (an explicit long
// Max-Age, and therefore not a session cookie) at the declaration. The same two
// criteria are asserted again in `middleware.test.ts` against a real
// `Set-Cookie` header, which is what the browser actually receives.

describe("the Client Identity cookie declaration (AC1, AC2)", () => {
  it("is named for the table it resolves to", () => {
    expect(IDENTITY_COOKIE_NAME).toBe("client_identity");
  });

  it("is HttpOnly, Secure and SameSite=Lax, across the whole application (AC1)", () => {
    expect(IDENTITY_COOKIE_ATTRIBUTES).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("is Secure unconditionally — no environment relaxes it", () => {
    // `http://localhost` is a trustworthy origin in every current browser, so a
    // Secure cookie is stored there too. A flag that is off in development is a
    // flag nobody tests, so the value is a constant rather than a branch.
    expect(IDENTITY_COOKIE_ATTRIBUTES.secure).toBe(true);
  });

  it("carries an explicit long Max-Age, so it is not a session cookie (AC2)", () => {
    expect(IDENTITY_COOKIE_ATTRIBUTES.maxAge).toBe(IDENTITY_COOKIE_MAX_AGE_SECONDS);
    expect(Number.isInteger(IDENTITY_COOKIE_MAX_AGE_SECONDS)).toBe(true);
    // 400 days: the longest lifetime Chromium honours, and far past "still
    // there tomorrow, on this browser".
    expect(IDENTITY_COOKIE_MAX_AGE_SECONDS).toBe(34_560_000);
  });

  it("declares no `expires`, so `maxAge` is the single source of the lifetime", () => {
    // Next.js's cookie serializer derives an `Expires` attribute from `maxAge`,
    // so the wire carries both and they cannot disagree. Declaring `expires`
    // here as well is the only way to make them.
    expect(IDENTITY_COOKIE_ATTRIBUTES).not.toHaveProperty("expires");
  });
});
