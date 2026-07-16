import Link from "next/link";
import type { Metadata } from "next";
import { listBookingQueue } from "@/lib/server/office/queries";
import { requireStaffPage } from "@/lib/server/auth/dal";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic"; // always show live queue data

// Booking queue (PRD §5). Web and phone bookings in one place. Empty-safe: with
// no database configured it renders the empty state instead of crashing.
export default async function BookingQueuePage() {
  await requireStaffPage();
  const rows = await listBookingQueue();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-navy">Bookings</h1>
        <Link
          href="/office/bookings/new"
          className="inline-flex min-h-9 items-center rounded-md bg-navy px-3 text-sm font-medium text-white"
        >
          + New phone booking
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No bookings yet. Take one over the hotline with{" "}
          <Link href="/office/bookings/new" className="text-teal-900 underline">
            New phone booking
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Code</th>
                <th scope="col" className="py-2 pr-4 font-medium">Patient</th>
                <th scope="col" className="py-2 pr-4 font-medium">Service</th>
                <th scope="col" className="py-2 pr-4 font-medium">Zone</th>
                <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Price</th>
                <th scope="col" className="py-2 font-medium">Assign</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-border">
                  <td className="py-2 pr-4 tabular font-medium text-navy">{b.bookingCode}</td>
                  <td className="py-2 pr-4">{b.patientName ?? "—"}</td>
                  <td className="py-2 pr-4">{b.serviceName}</td>
                  <td className="py-2 pr-4">{b.zoneName}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy">
                      {b.source === "phone" ? "☎ phone" : "🌐 web"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs">
                      {b.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 tabular">{Number(b.priceBdt).toLocaleString("en-US")}</td>
                  <td className="py-2">
                    <Link
                      href={`/office/bookings/${b.id}/assign`}
                      className="text-teal-700 underline"
                    >
                      Assign
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
