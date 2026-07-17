import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { getDashboardMetrics } from "@/lib/server/office/queries";
import { Dashboard } from "@/components/office/Dashboard";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Office home — the dashboard, for everyone who signs in.
 *
 * The role difference is FINANCIAL VISIBILITY, not access (decided with you,
 * 2026-07-17, then refined): ops run the work and get a dashboard about it —
 * caregivers, complaints, bookings, leads, samples — while admins additionally
 * see money (revenue, per-day takings, customer spend). `canSeeFinancials`
 * carries that one distinction into the component, which simply does not render
 * the money for ops, so the figures never reach their HTML.
 */
export default async function OfficeHome() {
  const staff = await requireStaffPage();
  const metrics = await getDashboardMetrics();
  const canSeeFinancials = staff.role === "admin";

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-navy">Dashboard</h1>
        <p className="mt-1 text-text-muted">
          Signed in as {staff.name} ({staff.role}).
        </p>
      </div>
      <Dashboard metrics={metrics} canSeeFinancials={canSeeFinancials} />
    </div>
  );
}
