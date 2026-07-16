import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeadServiceBySlug } from "@/lib/server/leads/queries";
import { EnquiryForm } from "@/components/customer/EnquiryForm";
import { SERVICE_SEED } from "@/lib/shared/catalogue-seed";

/**
 * Public enquiry page (§5, Flow C) — `lead`-archetype services only.
 *
 * A non-lead slug 404s rather than rendering a form that could never submit:
 * `getLeadServiceBySlug` returns null for anything whose archetype is not
 * `lead`, so /enquiry/nursing is simply not a page (§11). The handler re-checks
 * the archetype regardless — this is UX, not the enforcement.
 *
 * Mental Health is deliberately reachable here (S-3): the enquiry is captured
 * as a lead, but the service stays off-platform until Phase 3 (§10.6), so this
 * page never promises a session — only a call.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service } = await params;
  const seed = SERVICE_SEED.find((s) => s.slug === service && s.archetype === "lead");
  return { title: seed ? `${seed.nameEn} — enquiry` : "Enquiry" };
}

export default async function EnquiryPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = await getLeadServiceBySlug(slug);

  // Without a database this is null for every slug, so fall back to the seed to
  // decide "is this a lead service at all?" — the page still renders and the
  // form's POST returns 503. Better an honest form than a bare 404 when the
  // only thing missing is a connection string.
  const seed = SERVICE_SEED.find((s) => s.slug === slug && s.archetype === "lead");
  if (!service && !seed) notFound();

  const name = service?.nameEn ?? seed!.nameEn;
  const nameBn = service?.nameBn ?? seed!.nameBn;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-navy">{name}</h1>
      <p className="mt-1 text-lg text-text-muted">{nameBn}</p>
      <p className="mt-4 mb-8 text-text-muted">
        Tell us what you need and we&apos;ll call you back to talk it through. Nothing is booked or
        charged from this form.
      </p>

      {service ? (
        <EnquiryForm
          serviceId={service.id}
          serviceName={name}
          showDestination={slug === "medical-tourism"}
        />
      ) : (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          Enquiries are temporarily unavailable. Please call{" "}
          <a href="tel:01335995555" className="text-teal-900 underline">
            01335995555
          </a>
          .
        </p>
      )}
    </div>
  );
}
