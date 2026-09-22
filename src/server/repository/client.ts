// The Drizzle client — the one instance of it in the codebase.
//
// AD-2: only modules under `src/server/repository/` may import the Drizzle
// client or a raw driver. `eslint.config.mjs`'s repository block (the only
// block omitting the `noDrizzleClientImport` restriction) is what makes that
// a wall rather than a convention, and this file is the reason the block
// exists. Everything outside this directory reaches the database by calling a
// repository function.
//
// Driver: `@neondatabase/serverless` behind `drizzle-orm/neon-http`. Each
// query is one HTTPS request, so there is no pool to exhaust across Vercel
// invocations and no TCP handshake per cold start, and the same client runs on
// Node and Edge. The trade is that interactive `db.transaction()` is
// unavailable; every query this product performs is single-statement, and
// `db.batch()` is the escape hatch if that stops being true. Moving to
// `drizzle-orm/neon-serverless` later is an import change — the npm package is
// the same one.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// `DATABASE_URL` is read here and nowhere else in the application. The two
// other readers are both tooling, not the app: `drizzle.config.ts` (the
// drizzle-kit CLI's config) and `vitest.config.mts`, which forwards the one
// key into the test environment so the live repository rows can reach Neon.
// It is the sole required secret, has no committed default, and an unset value
// fails at module load with a message naming it — not at the first query, where
// the failure would surface as an opaque request error.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (set it in .env — see .env.example) to reach the database.",
  );
}

export const db = drizzle(neon(databaseUrl));
