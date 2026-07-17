"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffLeadServicesAction } from "@/app/(office)/actions";

/**
 * Which lead services a staff member is on the rota for (§9, Flow C's "+ owner").
 *
 * A new lead goes to whoever on the service's rota has waited longest, so this
 * grid is the whole configuration for lead assignment. With nobody ticked,
 * every lead lands "Unassigned" — which is honest, and is how the board worked
 * before there was a rota, but it means an empty grid is a rota nobody is on.
 * The page says so rather than letting it look configured.
 */
export function StaffLeadServices({
  staffId,
  name,
  leadServices,
  selected,
  canEdit,
}: {
  staffId: number;
  name: string;
  leadServices: { id: number; nameEn: string; isActive: boolean }[];
  selected: number[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<number[]>(selected);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (leadServices.length === 0) {
    return <span className="text-xs text-text-muted">No lead services</span>;
  }

  if (!canEdit) {
    const names = leadServices
      .filter((s) => selected.includes(s.id))
      .map((s) => s.nameEn);
    return (
      <span className="text-sm text-text-muted">
        {names.length > 0 ? names.join(", ") : "None"}
      </span>
    );
  }

  async function toggle(serviceId: number) {
    const next = checked.includes(serviceId)
      ? checked.filter((id) => id !== serviceId)
      : [...checked, serviceId];

    // Optimistic, then reconciled: the box must respond to the tap. On failure
    // it snaps back rather than lying about a rota that was never saved.
    const previous = checked;
    setChecked(next);
    setError(null);
    setBusy(true);

    const result = await setStaffLeadServicesAction(staffId, next);
    setBusy(false);

    if (!result.ok) {
      setChecked(previous);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <fieldset disabled={busy}>
        <legend className="sr-only">Lead services handled by {name}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {leadServices.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={checked.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="h-4 w-4 rounded border-border accent-teal-900"
              />
              <span className={s.isActive ? "text-navy" : "text-text-muted"}>
                {s.nameEn}
                {/* A service switched off in the catalogue can still have staff
                    mapped to it; hiding that would make the rota look emptier
                    than it is. */}
                {!s.isActive && <span className="ml-1 text-xs">(off)</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
