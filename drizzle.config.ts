import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. `generate` emits migration SQL from the schema without a
 * live database; `migrate`/`push` need DATABASE_URL.
 *
 * `next dev|build` reads .env.local on its own, but drizzle-kit is a plain Node
 * process and does not — hence the explicit load, so `npm run db:migrate` picks
 * up the same local connection string the app uses. Node's built-in loader, so
 * this costs no dependency. Absent on the VPS (real env vars), hence the catch.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL comes from the real environment.
}
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
