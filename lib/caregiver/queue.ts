import type { CaregiverEvent } from "../shared/caregiver-events";

/**
 * The offline event queue (PRD §9, §6 Flow A/B, module 07).
 *
 * THE ONE RULE THIS FILE EXISTS FOR: **a write is queued regardless of auth
 * state or network.** Nothing here checks a token, calls `fetch`, or asks
 * whether we are online. `enqueue` writes to IndexedDB and returns. That is
 * what makes AC-4.1 structural — an expired token cannot block a tick, because
 * the tick never asks about tokens.
 *
 * IndexedDB, not localStorage: localStorage is synchronous (it janks a cheap
 * phone), string-only, ~5MB, and — the reason that actually matters — it can be
 * evicted under storage pressure more readily than IDB. A caregiver's shift
 * must survive a low-storage Android deciding to reclaim space.
 *
 * Deletion is deliberate and narrow: an event leaves the queue only when the
 * server has confirmed that exact uuid (see sync.ts). A failed flush leaves
 * everything queued (AC-4.3: "queued events remain intact, unsent").
 */

const DB_NAME = "priyocare-caregiver";
const DB_VERSION = 1;
const STORE = "events";

/** Broadcast so the sync chrome can re-read the count without polling. */
export const QUEUE_CHANGED_EVENT = "pc:queue-changed";

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // Keyed by the device-minted uuid: re-queuing the same event is a
        // no-op put rather than a duplicate row, even before the server sees it.
        const store = db.createObjectStore(STORE, { keyPath: "eventUuid" });
        store.createIndex("occurredAt", "occurredAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/**
 * Queue an event. Never throws for the caller's benefit: if IndexedDB itself is
 * unavailable (private mode, corrupt profile) we surface it, because silently
 * dropping a caregiver's work is the one outcome this module cannot have.
 */
export async function enqueue(event: CaregiverEvent): Promise<void> {
  await tx("readwrite", (store) => store.put(event));
  notifyChanged();
}

/** Everything still waiting, oldest device-time first. */
export async function listQueued(): Promise<CaregiverEvent[]> {
  const all = await tx<CaregiverEvent[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

export async function queueCount(): Promise<number> {
  return tx<number>("readonly", (store) => store.count());
}

/**
 * Drop events the server has confirmed by uuid. Called ONLY with uuids echoed
 * back by a successful sync — never optimistically.
 */
export async function removeConfirmed(eventUuids: string[]): Promise<void> {
  if (eventUuids.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const uuid of eventUuids) store.delete(uuid);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
  notifyChanged();
}

/** Wipe the queue — sign-out only, and only after a successful flush. */
export async function clearQueue(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
  notifyChanged();
}
