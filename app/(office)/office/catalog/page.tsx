import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { getCatalogue } from "@/lib/server/office/catalogue";
import { ServicesSection } from "@/components/office/catalog/ServicesSection";
import { VariantsSection } from "@/components/office/catalog/VariantsSection";
import { ZonesSection } from "@/components/office/catalog/ZonesSection";

export const metadata: Metadata = { title: "Catalogue" };
export const dynamic = "force-dynamic";

/**
 * Service catalogue (§7.1). Reads the LIVE tables (not the seed constants), so
 * what it shows is what a booking will price against.
 *
 * Editing is ADMIN ONLY — prices here feed live booking pricing, the
 * highest-trust surface in the panel — while every staffer can view. Each
 * section hides its controls when `canEdit` is false; the actions re-check the
 * role regardless, so the hide is a courtesy on top of the gate.
 */
export default async function CatalogPage() {
  const staff = await requireStaffPage();
  const canEdit = staff.role === "admin";
  const { services, variants, zones, zonePrices } = await getCatalogue();

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Catalogue</h1>
        <p className="mt-1 text-text-muted">
          {canEdit
            ? "Add and edit services, nursing procedures, prices, and zones. Changes are live — a new price applies to the next booking."
            : "The service catalogue — services, nursing procedures, prices, and zones. Read-only; ask an admin to make changes."}
        </p>
      </div>

      <ServicesSection services={services} canEdit={canEdit} />
      <VariantsSection
        services={services}
        variants={variants}
        zones={zones}
        zonePrices={zonePrices}
        canEdit={canEdit}
      />
      <ZonesSection zones={zones} canEdit={canEdit} />
    </div>
  );
}
