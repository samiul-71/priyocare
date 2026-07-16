/**
 * Browser-side storage for the Bearer half of the hybrid auth model (§10.2).
 *
 * Pages authenticate with the httpOnly `pc_session` cookie, which JS cannot
 * read. But the office forms call Bearer-gated `/api/v1/office/*` handlers from
 * the client, so the access token has to live somewhere reachable — here.
 *
 * KNOWN WEAKNESS (tracked, not solved here): localStorage is readable by any
 * XSS on the origin, whereas the page cookie is not. The tokens are short-lived
 * (15 min) which limits the blast radius, and the CSP in proxy.ts is the primary
 * XSS control. The real fix is to stop shipping Bearer tokens to the browser at
 * all — office mutations become Server Actions authorised by the cookie — which
 * is a module 09 refactor, not a guard-shaped change.
 *
 * This module only centralises the key names so they cannot drift across the
 * forms that read them.
 */

const ACCESS_KEY = "pc_staff_token";
const REFRESH_KEY = "pc_staff_refresh";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function readStaffAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function readStaffRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function storeStaffTokens({ accessToken, refreshToken }: StoredTokens): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearStaffTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

/** Authorization header for a client fetch, or `{}` when signed out. */
export function staffAuthHeader(): Record<string, string> {
  const token = readStaffAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
