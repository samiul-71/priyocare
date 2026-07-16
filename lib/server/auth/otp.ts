import "server-only";

import { createHash, randomInt } from "node:crypto";

/**
 * OTP issue/verify + SMS delivery (PRD §10.1). Customer login is mobile + SMS
 * OTP; caregiver OTP is a fallback only (PIN is primary).
 *
 * In-memory store, correct for a single instance — swap for Redis on the VPS so
 * codes survive across processes. SMS delivery is behind `SmsSender`; the
 * console sender is a placeholder until the provider is chosen (§19).
 */

const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

const store = new Map<string, OtpRecord>();

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generate + store a 6-digit code for a phone, returning the plaintext to send. */
export function issueOtp(phone: string): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  store.set(phone, { codeHash: hashCode(code), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

/** Verify a code. Consumes it on success; locks out after MAX_ATTEMPTS. */
export function verifyOtp(phone: string, code: string): boolean {
  const record = store.get(phone);
  if (!record || record.expiresAt < Date.now()) {
    store.delete(phone);
    return false;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    store.delete(phone);
    return false;
  }
  record.attempts += 1;
  if (record.codeHash !== hashCode(code)) return false;
  store.delete(phone);
  return true;
}

export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

/**
 * Dev sender: prints the code so the OTP flows are testable end to end without
 * a provider. In production it THROWS rather than quietly doing nothing —
 * silently not sending is the worst failure available here, because every
 * screen still says "we sent you a code" and nobody finds out until a caregiver
 * is locked out at 6am. Fail at the send, loudly, in the logs.
 */
export const consoleSms: SmsSender = {
  async send(phone, message) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No SMS provider configured — refusing to pretend a code was sent. " +
          "Wire a real SmsSender before enabling OTP in production (§19).",
      );
    }
    console.log(`[SMS →${phone}] ${message}`);
  },
};

/**
 * True when SMS can actually be delivered. The self-service reset screen asks
 * this and, when false, says "call the office" instead of showing a form that
 * cannot work (§19). An honest dead end beats a broken flow.
 */
export function isSmsConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SMS_PROVIDER_CONFIGURED === "1";
}

/** Active SMS sender. Replace with the chosen provider on the VPS (§19). */
export const sms: SmsSender = consoleSms;
