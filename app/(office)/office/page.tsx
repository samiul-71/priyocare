import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/server/auth/dal";

export const metadata: Metadata = { title: "Office" };

/**
 * Office home. Staff-only (the guard below); module 08 built the queue,
 * dispatch, and the P0 manual phone-booking screen it links to.
 */
export default async function OfficeHome() {
  const staff = await requireStaffPage();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Office Panel</h1>
      <p className="mt-2 text-text-muted">
        Signed in as {staff.name} ({staff.role}).
      </p>
      <p className="mt-4">
        <Link href="/office/bookings" className="text-teal-900 underline">
          Booking queue
        </Link>
        {" · "}
        <Link href="/office/bookings/new" className="text-teal-900 underline">
          New phone booking
        </Link>
        {" · "}
        <Link href="/office/alerts" className="text-teal-900 underline">
          Ops alerts
        </Link>
      </p>
    </div>
  );
}
