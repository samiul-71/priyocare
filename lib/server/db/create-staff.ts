// Staff-account CLI (`npm run db:create-staff -- --email … --password … --role admin`).
//
// PRD §8/§10.1: staff accounts have NO self-registration — an admin creates
// them. That left no way to create the FIRST admin, on the VPS or locally.
// This is that bootstrap path.
//
// Runs under `--conditions=react-server` so it can import the app's own
// `hashPassword`: the whole point is that a provisioned password is hashed with
// the identical argon2id settings login verifies against, with no second
// implementation to drift.
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashPassword } from "../auth/password";
import { staffAccounts } from "./schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL comes from the real environment (the VPS).
}

const USAGE = `
Usage: npm run db:create-staff -- --email <email> --password <pw> [--name <name>] [--role ops|admin]

  --email     required, unique
  --password  required, min 8 chars (matches staffLoginSchema)
  --name      defaults to the email's local part
  --role      "ops" (default) or "admin"
`;

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "ops" },
    },
    allowPositionals: false,
  });

  const { email, password, name, role } = values;
  if (!email || !password) throw new Error(`Missing --email or --password.\n${USAGE}`);
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (role !== "ops" && role !== "admin") throw new Error(`--role must be "ops" or "admin".`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema: { staffAccounts } });

  try {
    const normalisedEmail = email.trim().toLowerCase(); // staffLoginSchema lowercases too
    const [existing] = await db
      .select({ id: staffAccounts.id })
      .from(staffAccounts)
      .where(eq(staffAccounts.email, normalisedEmail))
      .limit(1);
    if (existing) throw new Error(`A staff account already exists for ${normalisedEmail}.`);

    const [created] = await db
      .insert(staffAccounts)
      .values({
        name: name?.trim() || normalisedEmail.split("@")[0],
        email: normalisedEmail,
        passwordHash: await hashPassword(password),
        role,
      })
      .returning({ id: staffAccounts.id, email: staffAccounts.email, role: staffAccounts.role });

    // The password is never echoed back — it is not logged anywhere (§10.4).
    console.log(`Created staff #${created.id}: ${created.email} (${created.role})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
