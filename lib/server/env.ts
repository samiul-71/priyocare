import "server-only";

/**
 * Server environment validation, run once at boot from `instrumentation.ts`.
 *
 * WHY THIS EXISTS: `JWT_SECRET` missing used to be **silent**. `getSecret()`
 * throws, but both verifiers wrapped it in a `catch {}` that treats any failure
 * as "invalid token" — so a misconfigured deploy did not crash. It came up,
 * served pages, and redirected every single user to the login screen, where
 * every login also failed. Nothing in the logs said "the secret is missing";
 * it looked like an auth bug, at 3am, to whoever was on call.
 *
 * A missing signing secret is not an authentication failure. It is a broken
 * deployment, and it should read like one — at boot, before the first request,
 * naming the variable.
 *
 * Everything wrong is reported at once: finding a second missing variable after
 * fixing the first is its own small misery.
 */

const MIN_SECRET_LENGTH = 32;

interface EnvProblem {
  variable: string;
  problem: string;
}

/** Just the vars this reads — not `NodeJS.ProcessEnv`, which drags in NODE_ENV. */
type EnvVars = Record<string, string | undefined>;

/** Pure so it is testable; `assertServerEnv` is the boot wrapper. */
export function findEnvProblems(
  env: EnvVars,
  isProduction: boolean,
): EnvProblem[] {
  const problems: EnvProblem[] = [];

  const secret = env.JWT_SECRET;
  if (!secret) {
    problems.push({
      variable: "JWT_SECRET",
      problem: "missing — access tokens and page sessions cannot be signed or verified",
    });
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push({
      variable: "JWT_SECRET",
      problem: `too short (${secret.length} chars, need ≥${MIN_SECRET_LENGTH})`,
    });
  }

  // Only in production. Locally the app is deliberately no-DB-safe: reads
  // return empty and the pages render their empty states, which is how the
  // whole thing was built before Postgres existed.
  if (isProduction && !env.DATABASE_URL) {
    problems.push({
      variable: "DATABASE_URL",
      problem: "missing — every read returns empty and every write throws",
    });
  }

  // Email is optional and degrades honestly when off. But the moment its flag is
  // ON, a half-configured sender is worse than none: the forgot-password screen
  // shows a form that then drops mail. So EMAIL_PROVIDER_CONFIGURED=1 makes the
  // SMTP credentials mandatory, checked at boot in every environment.
  if (env.EMAIL_PROVIDER_CONFIGURED === "1") {
    for (const v of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const) {
      if (!env[v]) {
        problems.push({
          variable: v,
          problem: "missing — EMAIL_PROVIDER_CONFIGURED=1 promises a working SMTP sender",
        });
      }
    }
    if (env.SMTP_PORT && !/^\d+$/.test(env.SMTP_PORT)) {
      problems.push({ variable: "SMTP_PORT", problem: `not a number ("${env.SMTP_PORT}")` });
    }
  }

  return problems;
}

export function assertServerEnv(
  env: EnvVars = process.env,
  isProduction: boolean = process.env.NODE_ENV === "production",
): void {
  const problems = findEnvProblems(env, isProduction);
  if (problems.length === 0) return;

  const lines = problems.map((p) => `  - ${p.variable}: ${p.problem}`).join("\n");
  throw new Error(
    `Refusing to start — the server environment is not configured:\n${lines}\n\n` +
      `Set these on the VPS (never commit them). Locally they live in .env.local; see the README.`,
  );
}

/**
 * The boot policy: a broken environment must not become a running server.
 *
 * `assertServerEnv` only throws, and THROWING IS NOT ENOUGH — Next catches it,
 * logs an unhandledRejection, and keeps listening, so every route 500s while the
 * process stays up. That is quieter than it sounds: a supervisor sees a live
 * process, so no crash loop and no restart, and a rolling deploy calls the new
 * instance healthy and retires the last good one. Measured, not assumed.
 *
 * Lives here rather than in `instrumentation.ts` because that file is compiled
 * for the edge runtime too, where `process.exit` does not exist — Turbopack
 * rightly warns about it. This module is `server-only` and is imported
 * dynamically, after the runtime check.
 */
export function assertServerEnvOrExit(): void {
  try {
    assertServerEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
