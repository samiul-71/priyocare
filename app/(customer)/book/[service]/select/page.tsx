import type { Metadata } from "next";
import Link from "next/link";
import { ItemSelector, type SelectableItem } from "@/components/customer/ItemSelector";
import { NURSING_VARIANTS, SERVICE_SEED } from "@/lib/shared/catalogue-seed";

export const metadata: Metadata = { title: "Choose items" };

// /book/[service]/select (PRD §5). Item selection for a visit service. Nursing
// shows its 15 procedure variants; other services list their online items when
// available. Provisional ids match a freshly seeded DB until GET /services ships.
export default async function SelectPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = SERVICE_SEED.find((s) => s.slug === slug);

  if (!service) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold text-navy">Service not found</h1>
        <Link href="/" className="mt-3 inline-block text-teal-700 underline">← Back home</Link>
      </div>
    );
  }

  const items: SelectableItem[] =
    slug === "nursing"
      ? NURSING_VARIANTS.map((v, i) => ({
          variantId: i + 1,
          nameBn: v.nameBn,
          nameEn: v.nameEn,
          priceBdt: v.priceBdt,
        }))
      : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">
        <span lang="bn">{service.nameBn}</span>{" "}
        <span className="text-lg text-text-muted" lang="en">— {service.nameEn}</span>
      </h1>
      <p className="mt-1 mb-5 text-text-muted">Choose your items, then continue to checkout.</p>

      {items.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-surface-alt p-4 text-text-muted">
          This service is booked over the hotline for now. Call{" "}
          <a href="tel:+8801335995555" className="text-teal-900 underline">01335995555</a>.
        </p>
      ) : (
        <ItemSelector
          serviceSlug={service.slug}
          serviceId={service.sortOrder}
          serviceName={service.nameEn}
          items={items}
        />
      )}
    </div>
  );
}
