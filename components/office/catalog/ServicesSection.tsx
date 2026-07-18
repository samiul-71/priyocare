"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "@/app/(office)/office/catalog/actions";
import type { CatalogueService } from "@/lib/server/office/catalogue";

const ARCHETYPE_LABEL: Record<string, string> = {
  visit: "Visit — slot → dispatch → check-in",
  placement: "Placement — subscription + continuity",
  lead: "Lead — CRM pipeline (no booking)",
};
const ARCHETYPE_ORDER = ["visit", "placement", "lead"] as const;
const SKILLS = ["phlebotomist", "attendant", "nurse", "physiotherapist", "babysitter"] as const;

type FieldErrors = Record<string, string[]>;

/** The create/edit form. `service` present = edit (slug locked); absent = create. */
function ServiceForm({
  service,
  onClose,
}: {
  service?: CatalogueService;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const editing = !!service;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    const input = {
      archetype: str("archetype"),
      nameBn: str("nameBn"),
      nameEn: str("nameEn"),
      descriptionBn: str("descriptionBn") || undefined,
      descriptionEn: str("descriptionEn") || undefined,
      requiresPrescription: f.get("requiresPrescription") === "on",
      requiredSkill: str("requiredSkill") || null,
      windowStart: str("windowStart") || undefined,
      windowEnd: str("windowEnd") || undefined,
      isActive: f.get("isActive") === "on",
      sortOrder: Number(str("sortOrder") || 0),
    };
    try {
      const res = editing
        ? await updateServiceAction(service.id, input)
        : await createServiceAction({ ...input, slug: str("slug") });
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
            Slug (permanent)
            <input name="slug" placeholder="home-pathology" className={fieldClass} />
            {err("slug")}
          </label>
        )}
        <label className="text-xs font-medium text-navy">
          Archetype
          <select name="archetype" defaultValue={service?.archetype ?? "visit"} className={fieldClass}>
            <option value="visit">Visit</option>
            <option value="placement">Placement</option>
            <option value="lead">Lead</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy" lang="bn">
          Name (Bangla)
          <input name="nameBn" defaultValue={service?.nameBn ?? ""} className={fieldClass} lang="bn" />
          {err("nameBn")}
        </label>
        <label className="text-xs font-medium text-navy">
          Name (English)
          <input name="nameEn" defaultValue={service?.nameEn ?? ""} className={fieldClass} />
          {err("nameEn")}
        </label>
        <label className="text-xs font-medium text-navy">
          Required skill
          <select name="requiredSkill" defaultValue={service?.requiredSkill ?? ""} className={fieldClass}>
            <option value="">None (lead services)</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {err("requiredSkill")}
        </label>
        <label className="text-xs font-medium text-navy">
          Sort order
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={service?.sortOrder ?? 0}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-medium text-navy">
          Visit window start (HH:MM)
          <input name="windowStart" defaultValue={service?.windowStart?.slice(0, 5) ?? ""} placeholder="06:00" className={fieldClass} />
          {err("windowStart")}
        </label>
        <label className="text-xs font-medium text-navy">
          Visit window end (HH:MM)
          <input name="windowEnd" defaultValue={service?.windowEnd?.slice(0, 5) ?? ""} placeholder="11:00" className={fieldClass} />
          {err("windowEnd")}
        </label>
        <label className="text-xs font-medium text-navy sm:col-span-2" lang="bn">
          Description (Bangla, optional)
          <input name="descriptionBn" defaultValue={service?.descriptionBn ?? ""} className={fieldClass} lang="bn" />
          {err("descriptionBn")}
        </label>
        <label className="text-xs font-medium text-navy sm:col-span-2">
          Description (English, optional)
          <input name="descriptionEn" defaultValue={service?.descriptionEn ?? ""} className={fieldClass} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="requiresPrescription" defaultChecked={service?.requiresPrescription ?? false} />
          Requires prescription
        </label>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="isActive" defaultChecked={service?.isActive ?? true} />
          Active
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Saving…" : editing ? "Save service" : "Create service"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="min-h-9 rounded-md border border-border px-4 text-sm font-medium text-navy disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ServicesSection({
  services,
  canEdit,
}: {
  services: CatalogueService[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(s: CatalogueService) {
    setBusyId(s.id);
    try {
      const res = await setServiceActiveAction(s.id, !s.isActive);
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">Services</h2>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy">
            Add service
          </button>
        )}
      </div>

      {canEdit && adding && (
        <div className="mb-4">
          <ServiceForm onClose={() => setAdding(false)} />
        </div>
      )}

      {ARCHETYPE_ORDER.map((archetype) => {
        const items = services.filter((s) => s.archetype === archetype);
        if (items.length === 0) return null;
        return (
          <div key={archetype} className="mt-4 first:mt-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {ARCHETYPE_LABEL[archetype]}
            </h3>
            <ul className="divide-y divide-border">
              {items.map((s) =>
                editingId === s.id ? (
                  <li key={s.id} className="py-3">
                    <ServiceForm service={s} onClose={() => setEditingId(null)} />
                  </li>
                ) : (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div>
                      <span className="font-medium text-navy" lang="bn">
                        {s.nameBn}
                      </span>{" "}
                      <span className="text-text-muted">{s.nameEn}</span>
                      <span className={`ml-2 text-xs ${s.isActive ? "text-teal-900" : "text-text-muted"}`}>
                        <span aria-hidden="true">{s.isActive ? "● " : "○ "}</span>
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {s.slug}
                        {s.requiredSkill && ` · ${s.requiredSkill}`}
                        {s.requiresPrescription && " · prescription"}
                        {s.windowStart && ` · ${s.windowStart.slice(0, 5)}–${s.windowEnd?.slice(0, 5) ?? ""}`}
                      </span>
                    </div>
                    {canEdit && (
                      <span className="flex gap-3 text-xs">
                        <button type="button" onClick={() => setEditingId(s.id)} className="text-navy underline">
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => toggle(s)}
                          className="text-navy underline disabled:opacity-50"
                        >
                          {s.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
