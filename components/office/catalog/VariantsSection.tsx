"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createVariantAction,
  deleteVariantZonePriceAction,
  setVariantActiveAction,
  updateVariantAction,
  upsertVariantZonePriceAction,
} from "@/app/(office)/office/catalog/actions";
import type {
  CatalogueService,
  CatalogueVariant,
  CatalogueZone,
  CatalogueZonePrice,
} from "@/lib/server/office/catalogue";

const bdt = new Intl.NumberFormat("en-US");

/** Per-zone price overrides for one variant. A blank zone falls back to the
 * variant's base price; a value overrides it in that zone only. */
function ZonePrices({
  variant,
  zones,
  overrides,
}: {
  variant: CatalogueVariant;
  zones: CatalogueZone[];
  overrides: Map<number, string>;
}) {
  const router = useRouter();
  const [busyZone, setBusyZone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(zoneId: number, raw: string) {
    const price = Number(raw);
    setBusyZone(zoneId);
    setError(null);
    try {
      const res =
        raw.trim() === ""
          ? await deleteVariantZonePriceAction(variant.id, zoneId)
          : await upsertVariantZonePriceAction({ variantId: variant.id, zoneId, priceBdt: price });
      if (res.ok) router.refresh();
      else setError(res.error);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusyZone(null);
    }
  }

  const activeZones = zones.filter((z) => z.isActive);

  return (
    <div className="mt-2 rounded-md border border-border bg-surface-alt p-3">
      <p className="mb-2 text-xs text-text-muted">
        Per-zone prices — blank means the base price ৳{bdt.format(Number(variant.priceBdt))} applies.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {activeZones.map((z) => {
          const current = overrides.get(z.id) ?? "";
          return (
            <li key={z.id} className="flex items-center gap-2">
              <span className="w-28 truncate text-xs text-navy">{z.name}</span>
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(z.id, String(new FormData(e.currentTarget).get("p") ?? ""));
                }}
              >
                <input
                  name="p"
                  type="number"
                  min={1}
                  step="0.01"
                  defaultValue={current ? Number(current) : ""}
                  placeholder="base"
                  className="w-24 rounded-md border border-border px-2 py-1 text-sm tabular"
                />
                <button
                  type="submit"
                  disabled={busyZone === z.id}
                  className="min-h-7 rounded-md border border-border px-2 text-xs font-medium text-navy disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            </li>
          );
        })}
        {activeZones.length === 0 && <li className="text-xs text-text-muted">No active zones.</li>}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldErrors = Record<string, string[]>;

function VariantForm({
  variant,
  serviceId,
  services,
  onClose,
}: {
  variant?: CatalogueVariant;
  serviceId?: number;
  services: CatalogueService[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const editing = !!variant;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    const durationRaw = str("durationMin");
    const base = {
      nameBn: str("nameBn"),
      nameEn: str("nameEn"),
      priceBdt: Number(str("priceBdt")),
      durationMin: durationRaw ? Number(durationRaw) : null,
    };
    try {
      const res = editing
        ? await updateVariantAction(variant.id, base)
        : await createVariantAction({ ...base, serviceId: Number(str("serviceId")), isActive: true });
      if (res.ok) {
        onClose();
        router.refresh();
        return;
      }
      setError(res.error);
      if (res.fields) setErrors(res.fields);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";
  const err = (k: string) =>
    errors[k] ? <p className="mt-1 text-xs text-danger">{errors[k].join(" ")}</p> : null;

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-border bg-surface-alt p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {!editing && (
          <label className="text-xs font-medium text-navy">
            Service
            <select name="serviceId" defaultValue={serviceId ?? ""} className={fieldClass}>
              <option value="" disabled>
                Choose a service
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameEn}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-navy" lang="bn">
          Name (Bangla)
          <input name="nameBn" defaultValue={variant?.nameBn ?? ""} className={fieldClass} lang="bn" />
          {err("nameBn")}
        </label>
        <label className="text-xs font-medium text-navy">
          Name (English)
          <input name="nameEn" defaultValue={variant?.nameEn ?? ""} className={fieldClass} />
          {err("nameEn")}
        </label>
        <label className="text-xs font-medium text-navy">
          Base price (BDT)
          <input
            name="priceBdt"
            type="number"
            min={1}
            step="0.01"
            defaultValue={variant ? Number(variant.priceBdt) : ""}
            className={fieldClass}
          />
          {err("priceBdt")}
        </label>
        <label className="text-xs font-medium text-navy">
          Duration (min, optional)
          <input
            name="durationMin"
            type="number"
            min={1}
            defaultValue={variant?.durationMin ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Saving…" : editing ? "Save procedure" : "Create procedure"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="min-h-9 rounded-md border border-border px-4 text-sm font-medium text-navy disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function VariantsSection({
  services,
  variants,
  zones,
  zonePrices,
  canEdit,
}: {
  services: CatalogueService[];
  variants: CatalogueVariant[];
  zones: CatalogueZone[];
  zonePrices: CatalogueZonePrice[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingTo, setAddingTo] = useState<number | "any" | null>(null);
  const [pricesOpen, setPricesOpen] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // variantId → (zoneId → price)
  const overridesByVariant = new Map<number, Map<number, string>>();
  for (const p of zonePrices) {
    if (!overridesByVariant.has(p.variantId)) overridesByVariant.set(p.variantId, new Map());
    overridesByVariant.get(p.variantId)!.set(p.zoneId, p.priceBdt);
  }

  const serviceName = new Map(services.map((s) => [s.id, s.nameEn]));
  const serviceIdsWithVariants = [...new Set(variants.map((v) => v.serviceId))];

  async function toggle(v: CatalogueVariant) {
    setBusyId(v.id);
    try {
      const res = await setVariantActiveAction(v.id, !v.isActive);
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">Procedures &amp; per-zone prices</h2>
        {canEdit && addingTo === null && (
          <button type="button" onClick={() => setAddingTo("any")} className="min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy">
            Add procedure
          </button>
        )}
      </div>

      {canEdit && addingTo === "any" && (
        <div className="mb-4">
          <VariantForm services={services} onClose={() => setAddingTo(null)} />
        </div>
      )}

      {serviceIdsWithVariants.length === 0 && (
        <p className="text-sm text-text-muted">No procedures yet.</p>
      )}

      {serviceIdsWithVariants.map((sid) => (
        <div key={sid} className="mt-4 first:mt-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {serviceName.get(sid) ?? "Service"}
          </h3>
          <ul className="divide-y divide-border">
            {variants
              .filter((v) => v.serviceId === sid)
              .map((v) =>
                editingId === v.id ? (
                  <li key={v.id} className="py-3">
                    <VariantForm variant={v} services={services} onClose={() => setEditingId(null)} />
                  </li>
                ) : (
                  <li key={v.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="font-medium text-navy" lang="bn">
                          {v.nameBn}
                        </span>{" "}
                        <span className="text-text-muted">{v.nameEn}</span>
                        <span className={`ml-2 text-xs ${v.isActive ? "text-teal-900" : "text-text-muted"}`}>
                          <span aria-hidden="true">{v.isActive ? "● " : "○ "}</span>
                          {v.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="block text-xs text-text-muted tabular">
                          ৳{bdt.format(Number(v.priceBdt))}
                          {v.durationMin ? ` · ${v.durationMin} min` : ""}
                          {overridesByVariant.get(v.id)?.size
                            ? ` · ${overridesByVariant.get(v.id)!.size} zone override(s)`
                            : ""}
                        </span>
                      </div>
                      {canEdit && (
                        <span className="flex gap-3 text-xs">
                          <button type="button" onClick={() => setPricesOpen(pricesOpen === v.id ? null : v.id)} className="text-navy underline">
                            {pricesOpen === v.id ? "Hide prices" : "Zone prices"}
                          </button>
                          <button type="button" onClick={() => setEditingId(v.id)} className="text-navy underline">
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === v.id}
                            onClick={() => toggle(v)}
                            className="text-navy underline disabled:opacity-50"
                          >
                            {v.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </span>
                      )}
                    </div>
                    {canEdit && pricesOpen === v.id && (
                      <ZonePrices variant={v} zones={zones} overrides={overridesByVariant.get(v.id) ?? new Map()} />
                    )}
                  </li>
                ),
              )}
          </ul>
        </div>
      ))}
    </section>
  );
}
