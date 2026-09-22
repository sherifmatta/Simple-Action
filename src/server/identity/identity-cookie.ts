// The Client Identity cookie: its name and the attributes it is always set
// with (AD-7, Story 1.6 AC1 and AC2).
//
// Declared once, here, so the reader and the writer cannot disagree:
// `middleware.ts` sets the cookie with these attributes, and
// `request-identity.ts` reads it by this name.

/** The cookie the Client Identity token travels in, named for the table it resolves to. */
export const IDENTITY_COOKIE_NAME = "client_identity";

/**
 * 400 days, in seconds.
 *
 * AC2 requires an explicit long `Max-Age` — the attribute is what makes the
 * Todo List survive closing and reopening the browser, because a cookie with no
 * `Max-Age` and no `Expires` is a session cookie and is dropped on exit. 400
 * days is the longest value worth writing: Chrome (and the other Chromium
 * browsers) clamp any cookie lifetime above 400 days down to 400 days, so a
 * larger number would be a promise the browser does not keep.
 */
export const IDENTITY_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * The attributes every write of the identity cookie carries.
 *
 * - `httpOnly` — the token is never readable from client script (AD-7).
 * - `secure` — HTTPS only. Browsers treat `http://localhost` as a trustworthy
 *   origin and still store `Secure` cookies there, so this needs no
 *   environment-dependent relaxation and never gets one: a flag that is off in
 *   development is a flag nobody tests.
 * - `sameSite: "lax"` — the cookie rides top-level navigations to the app and
 *   no cross-site subrequest.
 * - `path: "/"` — one identity for the whole application, API routes included.
 * - `maxAge` — see above. Its presence is what makes this not a session cookie.
 */
export const IDENTITY_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: IDENTITY_COOKIE_MAX_AGE_SECONDS,
} as const;
