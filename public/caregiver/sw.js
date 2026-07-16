/*
 * Caregiver service worker (PRD §4.3, AC-3, module 07).
 *
 * Scope is "/caregiver/" — this file is served from that path so it can never
 * claim the customer site, which is a separate PWA at "/" (§4.3).
 *
 * What it does NOT do: queue writes. Background Sync is unavailable on iOS and
 * unreliable on the cheap Androids this runs on, so the queue lives in
 * IndexedDB and is flushed by the app itself (lib/caregiver/sync.ts). A worker
 * that "helpfully" retried writes would be a second, invisible code path over
 * the same events — exactly the kind of thing that produces duplicates.
 *
 * Its one job is AC-3: after the first online load, the shell and today's job
 * render from cache so a caregiver in a basement still sees her work.
 */

const CACHE = "priyocare-caregiver-v1";

// The shell. /caregiver/today is included so the app opens offline to the
// screen that matters, not to an error.
const PRECACHE = ["/caregiver/today", "/caregiver/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // addAll fails the whole install if any URL 404s; individual puts keep a
  // first install working even if one asset moved.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle this PWA's own scope. Anything else — the customer site,
  // the office panel, another origin — passes straight through.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/caregiver")) return;

  /*
   * NEVER cache the API. A stale job list is a wrong job; a cached POST is a
   * duplicate write. Writes go through the IndexedDB queue, which is the only
   * thing allowed to retry them.
   */
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  /*
   * Network-first for pages: online, she gets today's real job; offline, the
   * last good copy. §11 says "Couldn't load — showing last cached version",
   * NEVER blank — a blank screen on a doorstep is a failed visit.
   */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigating somewhere never visited while offline (S-5) — expected.
        const shell = await caches.match("/caregiver/today");
        if (shell) return shell;
        return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
      }),
  );
});
