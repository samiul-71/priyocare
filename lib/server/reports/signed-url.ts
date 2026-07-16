import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed report links (PRD §5, §10.5). Reports are private; access is granted
 * only through a short-lived signed URL with a **15-minute expiry** (AC 1.1).
 * The link is an HMAC over `sampleId.exp` — no lookup table needed, and it
 * stops working after 15 minutes even if forwarded. Each issue is logged with
 * actor + timestamp by the caller.
 */

export const REPORT_LINK_TTL_MS = 15 * 60_000; // 15 minutes

function sign(sampleId: number, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${sampleId}.${exp}`).digest("hex");
}

/** Build a signed, expiring path for a report. */
export function buildSignedReportPath(
  sampleId: number,
  secret: string,
  now: number = Date.now(),
): string {
  const exp = now + REPORT_LINK_TTL_MS;
  const token = sign(sampleId, exp, secret);
  return `/api/v1/reports/${sampleId}?exp=${exp}&token=${token}`;
}

export type ReportAccess =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" };

/** Verify a presented report token against the sample id + expiry. */
export function verifyReportAccess(
  sampleId: number,
  exp: number,
  token: string,
  secret: string,
  now: number = Date.now(),
): ReportAccess {
  if (!Number.isFinite(exp) || now > exp) return { ok: false, reason: "expired" };

  const expected = sign(sampleId, exp, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

/** Signing secret from the VPS environment (never committed). */
export function reportLinkSecret(): string | undefined {
  return process.env.REPORT_URL_SECRET;
}
