import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database client (server-only). The connection string lives in an env var on
 * the VPS and is never committed (PRD §10.4). The client is created lazily so
 * importing schema types or building the app does not require a live database.
 *
 * The pool is cached on `globalThis`, not a module-level `let`. In `next dev`,
 * Hot Module Replacement re-evaluates this module on every edit, which resets
 * module scope but NOT `globalThis` — so a module-level singleton would open a
 * FRESH postgres pool on each reload and never close the old one, leaking up to
 * `max` connections per edit until Postgres runs out of slots ("remaining
 * connection slots are reserved for roles with the SUPERUSER attribute"). Anchor
 * it to the global and every reload reuses the one pool. This is the documented
 * pattern for long-lived clients under HMR.
 */
const globalForDb = globalThis as unknown as {
  __pcPgClient?: ReturnType<typeof postgres>;
  __pcDb?: ReturnType<typeof drizzle<typeof schema>>;
};

/** True when a database connection string is configured (i.e. on the VPS). */
export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getDb() {
  if (globalForDb.__pcDb) return globalForDb.__pcDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in the VPS environment (never commit it).",
    );
  }

  const client =
    globalForDb.__pcPgClient ?? postgres(connectionString, { prepare: false, max: 10 });
  globalForDb.__pcPgClient = client;
  const db = drizzle(client, { schema });
  globalForDb.__pcDb = db;
  return db;
}

export { schema };
