/**
 * Server boot hook (Next 16). `register()` runs once per server instance and
 * must finish before any request is served — which is the only place a config
 * check is worth doing. Checked at first use instead, a missing secret looks
 * like an auth bug to whoever is on call.
 */
export async function register() {
  // `register` also runs in the edge runtime and during `next build`. Neither
  // signs a token, and failing the build for a runtime secret would be wrong:
  // build and deploy environments are routinely different (a Docker image is
  // built without production secrets, and should be). Only guard the real
  // Node server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertServerEnv } = await import("./lib/server/env");
  assertServerEnv();
}
