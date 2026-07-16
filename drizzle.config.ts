import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. `generate` emits migration SQL from the schema without a
 * live database; `migrate`/`push` need DATABASE_URL set on the VPS.
 */
export default defineConfig({
  schema: "./lib/server/db/schema.ts",
  out: "./lib/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/priyocare",
  },
  strict: true,
  verbose: true,
});
