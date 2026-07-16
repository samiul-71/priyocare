import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database client (server-only). The connection string lives in an env var on
 * the VPS and is never committed (PRD §10.4). The client is created lazily so
 * importing schema types or building the app does not require a live database.
 */
let client: ReturnType<typeof postgres> | undefined;
let dbSingleton: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (dbSingleton) return dbSingleton;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in the VPS environment (never commit it).",
    );
  }

  client = postgres(connectionString, { prepare: false });
  dbSingleton = drizzle(client, { schema });
  return dbSingleton;
}

export { schema };
