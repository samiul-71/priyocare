import { dedupeEvents } from "../shared/caregiver-events";
import {
  readCaregiverAccessToken,
  readCaregiverRefreshToken,
  storeCaregiverTokens,
} from "../shared/client-tokens";
import { listQueued, removeConfirmed } from "./queue";

/**
 * Flushing the queue (PRD §6 Flow A, §9, module 07).
 *
 * This is the ONLY file in the caregiver app that touches tokens or the
 * network. Everything upstream — check-in, ticks, care log — just calls
 * `enqueue` and returns. That is the whole composition §10.1 demands: auth is
 * checked at sync time and nowhere else, so a 15-minute token expiring during a
 * signal-less shift cannot stop any work.
 *
 * The order here matters and mirrors Flow A exactly:
 *   signal returns → silent refresh FIRST → then sync
 * Refreshing first means the sync never fails on an expired access token and
 * never bounces the caregiver into a login mid-batch.
 */

export type SyncOutcome =
  | { status: "idle" } // nothing queued
  | { status: "offline" } // no network; queue untouched
  | { status: "synced"; applied: number; duplicates: number }
  | { status: "auth_expired" } // refresh dead (~30d) — queue intact, login needed
  | { status: "failed"; error: string }; // transient; queue intact, try later

/**
 * Swap the refresh token for a fresh pair. Returns the new access token, or
 * null when the refresh token itself is dead (~30 days offline — Flow A's
 * "practically never" branch).
 */
async function silentRefresh(): Promise<string | null> {
  const refreshToken = readCaregiverRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;

  const data = await res.json();
  // Refresh tokens rotate on every use (§10.1) — store the new pair or the
  // next flush would present a token we just spent.
  storeCaregiverTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.accessToken as string;
}

/**
 * Send everything queued. Safe to call often — on reconnect, on load, on a
 * timer — because an empty queue is a no-op and the server is idempotent.
 *
 * Nothing is deleted locally except uuids the server explicitly echoed back
 * (AC-4.3: a failure leaves the events "intact, unsent").
 */
export async function flushQueue(): Promise<SyncOutcome> {
  // navigator.onLine is a weak signal (it only really knows about the radio,
  // not whether the internet works), so it is used as a cheap early-out, never
  // as proof — a failed fetch below is handled identically.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline" };
  }

  const queued = dedupeEvents(await listQueued());
  if (queued.length === 0) return { status: "idle" };

  let accessToken = readCaregiverAccessToken();

  try {
    // Refresh BEFORE syncing (Flow A), not after a 401 — a mid-batch retry on a
    // dying signal is exactly the moment we cannot afford a second round trip.
    const refreshed = await silentRefresh();
    if (refreshed) accessToken = refreshed;
    else if (!accessToken) return { status: "auth_expired" };

    const res = await fetch("/api/v1/caregiver/sync", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ events: queued }),
    });

    if (res.status === 401) {
      // Refresh token is gone too. The queue stays; the page guard shows login
      // on the next navigation (§10.1: "queued events remain intact, unsent").
      return { status: "auth_expired" };
    }
    if (!res.ok) {
      return { status: "failed", error: `Sync failed (${res.status})` };
    }

    const data = await res.json();
    await removeConfirmed(data.accepted ?? []);
    return { status: "synced", applied: data.applied ?? 0, duplicates: data.duplicates ?? 0 };
  } catch {
    // Network died mid-flush. Queue untouched — we cannot know what landed, and
    // re-sending is free (idempotent) while losing an event is not.
    return { status: "failed", error: "No connection" };
  }
}
