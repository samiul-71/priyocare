"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createZoneAction,
  setZoneActiveAction,
  updateZoneAction,
} from "@/app/(office)/office/catalog/actions";
import type { CatalogueZone } from "@/lib/server/office/catalogue";

/**
 * Zones — the hyper-local delivery areas a visit dispatches into. Admin can add,
 * rename, and activate/deactivate; deactivation is the only "delete" (a zone may
 * back a per-variant price). Everyone sees the list; only admins see controls.
 */
export function ZonesSection({ zones, canEdit }: { zones: CatalogueZone[]; canEdit: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) {
        setEditingId(null);
        setAdding(false);
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">Zones</h2>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy"
          >
            Add zone
          </button>
        )}
      </div>

      {canEdit && adding && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (name) run(() => createZoneAction({ name }));
          }}
        >
          <input
            name="name"
            autoFocus
            placeholder="Zone name"
            className="w-56 rounded-md border border-border px-3 py-1.5 text-sm"
          />
          <button type="submit" disabled={busy} className="min-h-8 rounded-md bg-navy px-3 text-xs font-medium text-white disabled:opacity-50">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-text-muted underline">
            Cancel
          </button>
        </form>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {zones.length === 0 && <li className="py-2 text-sm text-text-muted">No zones.</li>}
        {zones.map((z) => (
          <li key={z.id} className="flex items-center justify-between gap-2 py-2">
            {editingId === z.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                  if (name) run(() => updateZoneAction(z.id, { name }));
                }}
              >
                <input
                  name="name"
                  defaultValue={z.name}
                  autoFocus
                  className="w-56 rounded-md border border-border px-3 py-1.5 text-sm"
                />
                <button type="submit" disabled={busy} className="min-h-8 rounded-md bg-navy px-3 text-xs font-medium text-white disabled:opacity-50">
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-text-muted underline">
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="text-sm text-navy">
                  <span className={z.isActive ? "text-teal-900" : "text-text-muted"} aria-hidden="true">
                    {z.isActive ? "● " : "○ "}
                  </span>
                  {z.name}
                  {!z.isActive && <span className="ml-2 text-xs text-text-muted">(inactive)</span>}
                </span>
                {canEdit && (
                  <span className="flex gap-3 text-xs">
                    <button type="button" onClick={() => setEditingId(z.id)} className="text-navy underline">
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => setZoneActiveAction(z.id, !z.isActive))}
                      className="text-navy underline disabled:opacity-50"
                    >
                      {z.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
