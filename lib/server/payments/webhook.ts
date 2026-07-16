import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment webhook verification (PRD §9, §10.2). The gateway callback — not the
 * browser redirect — is the source of truth. Every webhook is HMAC-verified
 * against the raw request body with the per-provider secret before it is
 * trusted, using a constant-time comparison.
 */

export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signPayload(secret, rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Per-provider signing secret from the VPS environment (never committed). */
export function webhookSecretFor(provider: string): string | undefined {
  return process.env[`PAYMENT_WEBHOOK_SECRET_${provider.toUpperCase()}`];
}
