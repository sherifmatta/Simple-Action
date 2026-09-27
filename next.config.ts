import type { NextConfig } from "next";

// The security headers this application sends on every response.
//
// None of these are Next.js defaults in 16.3.5 — verified against
// `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`,
// which presents all of them as things you add here, and against
// `node_modules/next/dist/server/`, which contains no default emitter for them.
// Before this block the only response header the product set anywhere was
// `Cache-Control: private, no-store` in `request-identity.ts`.
//
// There is no XSS sink in the tree today — no `dangerouslySetInnerHTML`, and
// the client layer has no `href`, `src`, `action` or `formAction` at all. These
// are the second line for the day that changes, whether through a component bug
// or a compromised front-end dependency.
const SECURITY_HEADERS = [
  {
    // Deliberately no `default-src`.
    //
    // `script-src` falls back to `default-src`, so `default-src 'self'` would
    // silently block Next's inline hydration bootstrap and `next/font`'s
    // injected `<style>` — the whole page would render and then fail to become
    // interactive. Restricting scripts needs the nonce-based middleware pattern
    // from the Next CSP guide, which is its own piece of work; these four
    // directives each stand alone and none of them touches script loading.
    key: "Content-Security-Policy",
    value: [
      // Clickjacking. Worth little on its own here — the identity cookie is
      // `SameSite=Lax`, so a framed instance carries no identity and acts on an
      // empty list — but it costs nothing and does not depend on that staying
      // true.
      "frame-ancestors 'none'",
      // Stops an injected `<base>` from re-pointing every relative URL on the
      // page, which is how a single injected tag turns into a full-page rewrite.
      "base-uri 'none'",
      // No `<object>`, `<embed>` or `<applet>`; the product uses none.
      "object-src 'none'",
      // A form may only submit to this origin. The client layer contains no
      // `<form>` today, so this is purely a future guard.
      "form-action 'self'",
    ].join("; "),
  },
  {
    // Stops a browser from re-interpreting a response as a type it was not sent
    // as. Every API response is `application/json`, and a sniffed
    // `application/json` is how a JSON body becomes a rendered document.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // A Todo id is a path segment on the API routes, so a full `Referer` to a
    // third party would leak one. Cross-origin requests get the origin only.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Two years, the usual floor for the header to be worth setting.
    //
    // Deliberately without `includeSubDomains` and without `preload`. Both are
    // commitments on behalf of hosts this repository does not own — a sibling
    // subdomain of a custom apex domain would be forced onto HTTPS by the
    // first, and the second is effectively irreversible. Adding either is a
    // deployment decision, not a code one.
    key: "Strict-Transport-Security",
    value: "max-age=63072000",
  },
];

const nextConfig: NextConfig = {
  // Next.js sends `x-powered-by: Next.js` unless told not to
  // (`.../01-next-config-js/poweredByHeader.md`). It hands a scanner the
  // framework and its major version without a probe, and buys nothing.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
