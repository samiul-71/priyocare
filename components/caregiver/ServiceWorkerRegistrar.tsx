"use client";

import { useEffect } from "react";

/**
 * Registers the caregiver service worker (§4.3, AC-3).
 *
 * Scope is pinned to "/caregiver/" so this PWA can never claim the customer
 * site at "/" — two path-scoped PWAs on one origin is the arrangement §4.3
 * describes, and a worker registered at the wrong scope would silently take
 * over both.
 *
 * Registration failure is swallowed on purpose: no service worker means no
 * offline cache, which is a degraded app, not a broken one. She can still work
 * — every write goes to IndexedDB either way.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/caregiver/sw.js", { scope: "/caregiver/" })
      .catch(() => undefined);
  }, []);

  return null;
}
