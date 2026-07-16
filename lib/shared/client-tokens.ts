/**
 * Browser-side token storage — caregiver only.
 *
 * The office half of this file is gone (module 09). Staff pages authenticate
 * with the httpOnly `pc_session` cookie and mutate through Server Actions, so
 * **the office browser holds no API credential at all**. That was the tracked
 * XSS weakness: `localStorage` is readable by any script on the origin, the
 * cookie is not. It is fixed by removal, not by mitigation.
 *
 * The caregiver PWA still needs a Bearer token, and that is not an oversight:
 * `POST /caregiver/sync` is called from a background flush that must work with
 * a whole shift's queue, including from a service-worker-driven retry, and
 * Server Actions are tied to a rendered page. The exposure is bounded — the
 * access token lives 15 minutes, the CSP in proxy.ts is the primary XSS
 * control, and suspension revokes the refresh chain server-side (Flow C).
 *
 * These are read ONLY by lib/caregiver/sync.ts, never on the check-in path, so
 * a missing or expired token can never block field work (§10.1, Flow A).
 */

const CG_ACCESS_KEY = "pc_caregiver_token";
const CG_REFRESH_KEY = "pc_caregiver_refresh";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function readCaregiverAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CG_ACCESS_KEY);
}

export function readCaregiverRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CG_REFRESH_KEY);
}

export function storeCaregiverTokens({ accessToken, refreshToken }: StoredTokens): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CG_ACCESS_KEY, accessToken);
  window.localStorage.setItem(CG_REFRESH_KEY, refreshToken);
}

export function clearCaregiverTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CG_ACCESS_KEY);
  window.localStorage.removeItem(CG_REFRESH_KEY);
}
