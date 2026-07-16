import type { Metadata } from "next";
import { listOpsAlerts } from "@/lib/server/office/queries";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic"; // always show live alerts

// Ops alerts feed (PRD §5, §9, §11). Geofence mismatches and missed check-outs
// are visible ONLY here — never to the customer or caregiver (AC 4.2). Framed
// neutrally, never as an accusation.
export default async function AlertsPage() {
  const alerts = await listOpsAlerts();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Ops alerts</h1>
      <p className="mt-1 mb-5 text-text-muted">
        Internal only. These flags never appear in the customer or caregiver apps.
      </p>

      {alerts.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No open alerts.
        </p>
      ) : (
        <ul className="max-w-2xl">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between border-b border-border py-3">
              <div>
                <span className="font-medium text-navy">{a.type.replace(/_/g, " ")}</span>
                {a.bookingId != null && (
                  <span className="ml-2 text-sm text-text-muted">booking #{a.bookingId}</span>
                )}
                {a.distanceM != null && (
                  <span className="ml-2 text-sm text-text-muted tabular">
                    {Number(a.distanceM).toFixed(0)} m
                  </span>
                )}
              </div>
              <time className="text-xs text-text-muted" dateTime={new Date(a.createdAt).toISOString()}>
                {new Date(a.createdAt).toLocaleString("en-GB")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
