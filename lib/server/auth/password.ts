import "server-only";

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
