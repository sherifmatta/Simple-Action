import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required (set it in .env — see .env.example) to run drizzle-kit.",
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
    url: process.env.DATABASE_URL,
  },
});
