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

export const consoleSms: SmsSender = {
  async send(phone, message) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[SMS →${phone}] ${message}`);
    }
  },
};

/** Active SMS sender. Replace with the chosen provider on the VPS. */
export const sms: SmsSender = consoleSms;
