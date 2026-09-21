// Drizzle schema for the Simple Action database.
//
// This module is the sole owner of camelCase (TypeScript) <-> snake_case
// (Postgres) name mapping (AD-Consistency: "JSON and SQL casing"; epics.md
// Story 1.3 AC7). No other module may translate between the two.
//
// Only `drizzle-orm/pg-core` is imported here — never the Drizzle client or a
// driver. `eslint.config.mjs`'s AD-2 boundary rule permits this exception for
// `src/server/db/` and enforces it everywhere else.
//
// Neither primary key uses `.defaultRandom()` or any other DB-generated
// default: ids are minted application-side (client for `todo` per AD-4,
// server for `client_identity` in Story 1.6).
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const clientIdentity = pgTable("client_identity", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const todo = pgTable(
  "todo",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => clientIdentity.id),
    text: text("text").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("todo_owner_id_id_idx").on(table.ownerId, table.id.desc())],
);
