import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { getCustomerActivity } from "@/lib/server/office/queries";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

const bdt = new Intl.NumberFormat("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });
const pretty = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-navy">
        {title} <span className="font-normal text-text-muted">({bdt.format(count)})</span>
      </h2>
      {count === 0 ? <p className="text-sm text-text-muted">{empty}</p> : children}
    </section>
  );
}

/**
 * One customer's whole history (§6, admin only). `getCustomerActivity` gates
 * nothing itself, so the `admin` check here is load-bearing — a patient's
 * address lives on these bookings (§10.5).
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("admin");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const a = await getCustomerActivity(id);
  if (!a.customer) notFound();
  const c = a.customer;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/office/customers" className="text-sm text-teal-900 underline">
          ← All customers
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-navy">{c.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          <span className="tabular">{c.phone}</span>
          {c.email && <> · {c.email}</>} · {c.locale === "bn" ? "Bangla" : "English"} · registered{" "}
          {fmtDate(c.createdAt)}
        </p>
      </div>

      <Section title="Bookings" count={a.bookings.length} empty="No bookings.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="py-2 font-medium">Code</th>
                <th className="py-2 font-medium">Service</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 text-right font-medium">Price (৳)</th>
                <th className="py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {a.bookings.map((b) => (
                <tr key={b.id} className="border-b border-border">
                  <td className="py-2 font-medium text-navy tabular">{b.bookingCode}</td>
                  <td className="py-2 text-text-muted">{b.serviceName ?? "—"}</td>
                  <td className="py-2 text-text-muted">{pretty(b.status)}</td>
                  <td className="py-2 text-text-muted">{pretty(b.source)}</td>
                  <td className="py-2 text-right text-navy tabular">{bdt.format(Number(b.priceBdt))}</td>
                  <td className="py-2 text-text-muted tabular">{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Enquiries / leads" count={a.leads.length} empty="No leads.">
        <ul className="flex flex-col gap-2 text-sm">
          {a.leads.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-3 border-b border-border pb-2">
              <span className="font-medium text-navy tabular">{l.leadCode}</span>
              <span className="text-text-muted">{l.serviceName ?? "—"}</span>
              <span className="text-text-muted">· {pretty(l.stage)}</span>
              <span className="text-text-muted tabular">· {fmtDate(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Samples & reports" count={a.samples.length} empty="No samples.">
        <ul className="flex flex-col gap-2 text-sm">
          {a.samples.map((s) => (
            <li key={s.id} className="flex flex-wrap gap-x-3 border-b border-border pb-2">
              <span className="font-medium text-navy tabular">{s.barcode}</span>
              <span className="text-text-muted">{pretty(s.status)}</span>
              <span className="text-text-muted">· booking {s.bookingCode}</span>
              <span className="text-text-muted tabular">· {fmtDate(s.collectedAt)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Complaints" count={a.complaints.length} empty="No complaints.">
        <ul className="flex flex-col gap-2 text-sm">
          {a.complaints.map((x) => (
            <li key={x.id} className="flex flex-wrap gap-x-3 border-b border-border pb-2">
              <span className="font-medium text-navy">{pretty(x.status)}</span>
              {x.severity && <span className="text-text-muted">{pretty(x.severity)}</span>}
              <span className="text-text-muted">· {pretty(x.source)}</span>
              <span className="text-text-muted">· booking {x.bookingCode}</span>
              <span className="text-text-muted tabular">· {fmtDate(x.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Care visits" count={a.careVisits.length} empty="No logged visits.">
        <ul className="flex flex-col gap-2 text-sm">
          {a.careVisits.map((v) => (
            <li key={v.id} className="flex flex-wrap gap-x-3 border-b border-border pb-2">
              <span className="font-medium text-navy tabular">{v.bookingCode}</span>
              <span className="text-text-muted">{v.caregiverName ?? "Caregiver"}</span>
              <span className="text-text-muted tabular">· {fmtDate(v.loggedAt)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
