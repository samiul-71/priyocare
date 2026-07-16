import "server-only";

import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/**
 * Password & PIN hashing (PRD §10.1, §10.4). argon2id, the default algorithm of
 * @node-rs/argon2. Hashes are never logged; only the hash is stored
 * (staff_accounts.password_hash, caregivers.pin_hash).
 *
 * Caregiver PINs are low-entropy (4–6 digits) — argon2id's memory-hard cost is
 * exactly what makes brute-forcing them impractical, so PINs are hashed the
 * same way, never stored or compared in plaintext.
 */

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  return verify(storedHash, plaintext);
}

/** Caregiver PIN — same argon2id treatment as passwords. */
export const hashPin = hashPassword;
export const verifyPin = verifyPassword;

/**
 * Mint a temporary staff password for an admin to hand over (§10.1).
 *
 * Random rather than admin-chosen: a human picking "Welcome123" for a colleague
 * is the predictable failure, and this one is meant to live for minutes — the
 * account is `password_must_change`, so it dies at her next sign-in.
 *
 * Ambiguous characters are left out because this gets read down a phone line;
 * `randomInt` is rejection-sampled, so dropping them costs no uniformity.
 */
const HANDOVER_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no i/l/o/0/1
const HANDOVER_LENGTH = 16;

export function generatePassword(): string {
  let out = "";
  for (let i = 0; i < HANDOVER_LENGTH; i++) {
    out += HANDOVER_ALPHABET[randomInt(0, HANDOVER_ALPHABET.length)];
  }
  return out;
}

const PIN_LENGTH = 6;

/**
 * Mint a caregiver's initial PIN at activation (§12.2).
 *
 * `randomInt` (CSPRNG, rejection-sampled) rather than `Math.random()` — this is
 * a credential, and `Math.random()` is predictable enough that a PIN from it is
 * decoration. 6 digits is the top of the schema's 4–6 range: the entropy is low
 * either way, which is exactly why argon2id hashes it and why login is
 * rate-limited.
 *
 * Returned in plaintext ONCE, to be read to the caregiver and never stored.
 */
export function generatePin(): string {
  let pin = "";
  for (let i = 0; i < PIN_LENGTH; i++) pin += randomInt(0, 10);
  return pin;
}
