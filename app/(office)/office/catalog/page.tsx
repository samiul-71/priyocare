import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/server/auth/dal";
import {
  NURSING_VARIANTS,
  SERVICE_SEED,
  ZONES,
  type ServiceSeed,
} from "@/lib/shared/catalogue-seed";

export const metadata: Metadata = { title: "Catalogue" };

const ARCHETYPE_LABEL = {
  visit: "Visit — slot → dispatch → check-in",
  placement: "Placement — subscription + continuity",
  lead: "Lead — CRM pipeline (no booking)",
} as const;

const ARCHETYPE_ORDER = ["visit", "placement", "lead"] as const;

function ActiveTag({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-teal-50 text-teal-900" : "bg-surface-alt text-text-muted"
      }`}
    >
      <span aria-hidden="true">{active ? "●" : "○"}</span>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ServiceRow({ service }: { service: ServiceSeed }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-navy" lang="bn">
          {service.nameBn}
        </span>
        <span className="text-text-muted" lang="en">
          {service.nameEn}
        </span>
        <ActiveTag active={service.isActive} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>slug: {service.slug}</span>
        {service.requiredSkill && <span>skill: {service.requiredSkill}</span>}
        {service.requiresPrescription && <span>prescription required</span>}
        {service.windowStart && (
          <span>
            window: {service.windowStart}–{service.windowEnd}
          </span>
        )}
      </div>

      {/* Nursing shows its 15 variants — variants, not 15 services (PRD §3.3). */}
      {service.slug === "nursing" && (
        <table className="mt-2 w-full max-w-xl border-collapse text-sm">
          <caption className="sr-only">Nursing procedure variants and prices</caption>
          <thead>
            <tr className="text-left text-text-muted">
              <th scope="col" className="py-1 font-medium">
                Procedure
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Price (BDT)
              </th>
            </tr>
          </thead>
          <tbody>
            {NURSING_VARIANTS.map((v) => (
              <tr key={v.nameEn} className="border-t border-border">
                <td className="py-1">
                  <span lang="bn">{v.nameBn}</span>{" "}
                  <span className="text-text-muted" lang="en">
                    ({v.nameEn})
                  </span>
                </td>
                <td className="tabular py-1 text-right">
                  {v.priceBdt.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

export default async function CatalogPage() {
  await requireStaffPage();

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-navy">Catalogue</h1>
      <p className="mt-1 text-text-muted">
        Read-only preview of the seeded catalogue. CRUD writes land with the API
        (module 09); once live, adding a service, variant, or price is an Ops
        task here — <strong>never a deploy</strong> (PRD §7.1).
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Zones: <span lang="en">{ZONES.join(" · ")}</span>
      </p>

      {ARCHETYPE_ORDER.map((archetype) => {
        const items = SERVICE_SEED.filter((s) => s.archetype === archetype).sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        return (
          <section key={archetype} className="mt-6">
            <h2 className="font-display text-lg font-semibold text-navy">
              {ARCHETYPE_LABEL[archetype]}
            </h2>
            <ul className="mt-1">
              {items.map((s) => (
                <ServiceRow key={s.slug} service={s} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
