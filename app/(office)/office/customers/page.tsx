import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listCustomers } from "@/lib/server/office/queries";
import { customerFilterSchema } from "@/lib/shared/office-schemas";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const bdt = new Intl.NumberFormat("en-US");

/**
 * Customer directory (§6). ADMIN ONLY — `requireStaffPage("admin")` sends an
 * `ops` user to /office. Customers' home addresses and full booking history sit
 * one click away on the detail page (§10.5), so the whole directory is an
 * admin's to see, not case-work.
 *
 * The filter form is a plain GET form: it writes the URL and the server
 * re-renders. No client component, no fetch — the URL is the state, which also
 * makes every view bookmarkable and the export a link to the same query.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffPage("admin");

  const raw = await searchParams;
  const f = customerFilterSchema.parse(raw);
  const { rows, total, page, pageSize } = await listCustomers(f);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Preserve the active filters when moving pages or exporting.
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.locale) params.set("locale", f.locale);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.hasBookings) params.set("hasBookings", f.hasBookings);
  const withPage = (p: number) => {
    const q = new URLSearchParams(params);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/office/customers?${s}` : "/office/customers";
  };
  const exportHref = params.toString()
    ? `/office/customers/export?${params.toString()}`
    : "/office/customers/export";

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Customers</h1>
        <a
          href={exportHref}
          className="min-h-9 rounded-md border border-border px-4 py-2 text-sm font-medium text-navy"
        >
          Export{total > 0 ? ` (${bdt.format(total)})` : ""} to Excel
        </a>
      </div>

      {/* GET filter form — the URL is the state. */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-alt p-3">
        <label className="flex flex-col text-xs font-medium text-navy">
          Search name / phone / email
          <input
            type="search"
            name="q"
            defaultValue={f.q ?? ""}
            placeholder="Rahim, 01700…, name@…"
            className="mt-1 w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-navy">
          Language
          <select
            name="locale"
            defaultValue={f.locale ?? ""}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="bn">Bangla</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-navy">
          Registered from
          <input
            type="date"
            name="from"
            defaultValue={f.from ?? ""}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-navy">
          to
          <input
            type="date"
            name="to"
            defaultValue={f.to ?? ""}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-navy">
          Bookings
          <select
            name="hasBookings"
            defaultValue={f.hasBookings ?? ""}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="yes">Has bookings</option>
            <option value="no">No bookings</option>
          </select>
        </label>
        <button type="submit" className="min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white">
          Apply
        </button>
        <Link href="/office/customers" className="text-sm text-teal-900 underline">
          Clear
        </Link>
      </form>

      <p className="mb-2 text-sm text-text-muted">
        {total === 0 ? "No customers match." : `Showing ${from}–${to} of ${bdt.format(total)}`}
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Contact</th>
                <th className="py-2 font-medium">Language</th>
                <th className="py-2 font-medium">Registered</th>
                <th className="py-2 text-right font-medium">Bookings</th>
                <th className="py-2 text-right font-medium">Spent (৳)</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border align-top">
                  <td className="py-3 font-medium text-navy">{c.name}</td>
                  <td className="py-3 text-sm text-text-muted">
                    <span className="tabular">{c.phone}</span>
                    {c.email && <span className="block">{c.email}</span>}
                  </td>
                  <td className="py-3 text-sm text-text-muted">
                    {c.locale === "bn" ? "Bangla" : "English"}
                  </td>
                  <td className="py-3 text-sm text-text-muted tabular">
                    {c.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}
                  </td>
                  <td className="py-3 text-right text-sm text-text-muted tabular">
                    {bdt.format(c.bookingsCount)}
                    {c.completedCount > 0 && (
                      <span className="block text-xs">{bdt.format(c.completedCount)} done</span>
                    )}
                  </td>
                  <td className="py-3 text-right text-sm text-navy tabular">
                    {bdt.format(c.totalSpentBdt)}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/office/customers/${c.id}`}
                      className="text-sm text-teal-900 underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={withPage(page - 1)} className="text-teal-900 underline">
              ← Previous
            </Link>
          ) : (
            <span className="text-text-muted">← Previous</span>
          )}
          <span className="text-text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={withPage(page + 1)} className="text-teal-900 underline">
              Next →
            </Link>
          ) : (
            <span className="text-text-muted">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
