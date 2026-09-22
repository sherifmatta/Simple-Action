import { defineConfig } from "drizzle-kit";

// `generate` diffs schema.ts against the committed snapshot in `out` — it
// reads files and reaches no database. `migrate` and `push` do. Guarding the
// credential on the command rather than at module load is what keeps AD-14's
// only committed path to a schema change usable without a live URL, and it is
// what lets the drift check in src/server/db/schema.test.ts run offline.
const needsDatabase = !process.argv.includes("generate");

if (needsDatabase && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required (set it in .env — see .env.example) to run this drizzle-kit command.",
  );
}

// drizzle-kit CLI config. `drizzle-kit generate` is the only committed path
// to a schema change (AD-14); `drizzle-kit push` exists solely as the
// `db:push` script in package.json and must never run in build, start, or
// any deploy path.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Empty only on the `generate` path above, which never opens it.
    url: process.env.DATABASE_URL ?? "",
  },
});
