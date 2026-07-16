"use client";

import { useCallback, useEffect, useState } from "react";
import { QUEUE_CHANGED_EVENT, queueCount } from "@/lib/caregiver/queue";
import { flushQueue } from "@/lib/caregiver/sync";

/**
 * The persistent sync indicator (§5, §9 UI states, module 07).
 *
 * **Informational, never blocking** (§9). "3 events queued" is a statement that
 * the work is safe, not a warning that something is wrong — because nothing is.
 * The caregiver did her job; the radio is the one having a bad day. Nothing
 * here ever asks her to fix, retry, or worry about it.
 *
 * It also owns the flush triggers: on mount, when the queue changes, and when
 * the browser reports the network is back. Sync is idempotent, so an extra
 * flush costs nothing and a missed one costs a shift.
 */
type State = { count: number; label: string; tone: "ok" | "queued" | "signin" };

export function SyncStatus() {
  const [state, setState] = useState<State>({ count: 0, label: "All synced", tone: "ok" });

  const refresh = useCallback(async () => {
    try {
      const count = await queueCount();
      setState((prev) =>
        prev.tone === "signin"
          ? { ...prev, count }
          : {
              count,
              tone: count > 0 ? "queued" : "ok",
              label:
                count > 0
                  ? `${count} saved — will sync when connected`
                  : "All synced",
            },
      );
    } catch {
      // IndexedDB unavailable (private mode). The chrome stays quiet rather
      // than alarming her about something she cannot act on.
    }
  }, []);

  const flush = useCallback(async () => {
    const outcome = await flushQueue();
    if (outcome.status === "auth_expired") {
      // The 30-day refresh window lapsed (Flow A's rare branch). Say it plainly
      // and promise the work is safe — because it is: nothing was deleted.
      setState({ count: await queueCount().catch(() => 0), tone: "signin", label: "Sign in to send saved work" });
      return;
    }
    if (outcome.status === "synced") {
      setState({ count: 0, tone: "ok", label: "Synced just now" });
      return;
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    // Kicked off from a closure rather than called straight from the effect
    // body: both reach setState, and doing that synchronously during an effect
    // is what react-hooks/set-state-in-effect (rightly) rejects.
    const sync = async () => {
      await refresh();
      await flush();
    };
    void sync();

    const onQueueChanged = () => void sync();
    // The moment the radio returns — the trigger that drains a whole offline
    // shift (§13: median time-to-sync after reconnect < 30s).
    const onOnline = () => void sync();

    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, flush]);

  const icon = state.tone === "ok" ? "✓" : state.tone === "queued" ? "↻" : "!";

  return (
    <span
      role="status"
      aria-live="polite"
      className="rounded-full bg-teal-900 px-3 py-1 text-sm text-white"
    >
      <span aria-hidden="true">{icon} </span>
      {state.label}
    </span>
  );
}
