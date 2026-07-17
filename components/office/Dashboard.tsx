import type { CountRow, DashboardMetrics, TrendPoint } from "@/lib/server/office/queries";

/**
 * Office dashboard — the landing for everyone who signs in, business status for
 * admins and operational status for ops.
 *
 * `canSeeFinancials` is the whole difference. Ops run the work — caregivers,
 * complaints, bookings, leads, samples — and this shows them all of it; what it
 * withholds from them is money: revenue, per-day takings, customer spend. Those
 * tiles and captions simply are not rendered when the flag is false, so the
 * figure never reaches the HTML (this is a server component — unrendered props
 * are not serialised anywhere the browser can read).
 *
 * Design constraints (design.md, dataviz skill): magnitude → bars; single
 * headline → a stat tile; colour is never the only channel (every bar carries
 * its label and value, status tiles pair colour with an icon + word); one hue
 * for magnitude; one measure per chart. This product has no dark mode (§3.4).
 */

const bdt = new Intl.NumberFormat("en-US");

function taka(n: number): string {
  return `৳${bdt.format(Math.round(n))}`;
}

/** "in_progress" → "In progress". */
function pretty(label: string): string {
  const s = label.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-navy tabular">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Horizontal magnitude bars. Bars are scaled to the largest row so small
 * differences stay visible; the count is always printed, so a bar that rounds to
 * a sliver is still readable.
 */
function BarList({ rows, empty }: { rows: CountRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2">
          <span className="truncate text-sm text-navy">{pretty(r.label)}</span>
          <span className="h-2.5 rounded-full bg-teal-50" aria-hidden="true">
            <span
              className="block h-2.5 rounded-full bg-teal-800"
              style={{ width: `${Math.max((r.count / max) * 100, r.count > 0 ? 4 : 0)}%` }}
            />
          </span>
          <span className="text-right text-sm text-text-muted tabular">{bdt.format(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Orders per day for the last 30 days — one measure, one hue. Completed revenue
 * rides along in the tooltip/caption ONLY for those allowed to see money.
 */
function TrendChart({ points, showRevenue }: { points: TrendPoint[]; showRevenue: boolean }) {
  const max = Math.max(...points.map((p) => p.orders), 1);
  const totalOrders = points.reduce((s, p) => s + p.orders, 0);
  const totalRevenue = points.reduce((s, p) => s + p.revenueBdt, 0);
  const W = 100;
  const H = 34;
  const gap = 0.6;
  const bw = (W - gap * (points.length - 1)) / points.length;

  const first = points[0]?.day ?? "";
  const last = points[points.length - 1]?.day ?? "";
  const revenueSuffix = showRevenue ? ` and ${taka(totalRevenue)} completed revenue` : "";

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Orders per day, ${first} to ${last}: ${totalOrders} orders${revenueSuffix} over 30 days, peak ${max} in a day.`}
      >
        {points.map((p, i) => {
          const h = (p.orders / max) * (H - 2);
          const tip = showRevenue && p.revenueBdt ? `, ${taka(p.revenueBdt)}` : "";
          return (
            <rect
              key={p.day}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={0.4}
              className="fill-teal-800"
            >
              <title>{`${p.day}: ${p.orders} order${p.orders === 1 ? "" : "s"}${tip}`}</title>
            </rect>
          );
        })}
        <line x1="0" y1={H} x2={W} y2={H} className="stroke-border" strokeWidth="0.4" />
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-text-muted">
        <span>{first}</span>
        <span className="tabular">
          {bdt.format(totalOrders)} orders{showRevenue ? ` · ${taka(totalRevenue)} completed` : ""}
        </span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}

/** Status tile — colour is doubled by an icon + word (§5.1). Quiet when zero. */
function AttentionTile({ label, count }: { label: string; count: number }) {
  const active = count > 0;
  return (
    <div
      className={`rounded-lg border p-4 ${
        active ? "border-warning/40 bg-surface" : "border-border bg-surface-alt"
      }`}
    >
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular ${active ? "text-warning" : "text-text-muted"}`}>
        <span aria-hidden="true" className="mr-1 text-lg">
          {active ? "▲" : "✓"}
        </span>
        {bdt.format(count)}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">{active ? "needs attention" : "all clear"}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

export function Dashboard({
  metrics: m,
  canSeeFinancials,
}: {
  metrics: DashboardMetrics;
  canSeeFinancials: boolean;
}) {
  const activeCaregivers = m.caregiversByStatus.find((r) => r.label === "approved")?.count ?? 0;

  const kpis = canSeeFinancials
    ? [
        { label: "Revenue this month", value: taka(m.revenueThisMonthBdt), sub: "completed bookings" },
        { label: "Orders this month", value: bdt.format(m.ordersThisMonth), sub: `${bdt.format(m.ordersTotal)} all time` },
        {
          label: "Customers",
          value: bdt.format(m.customersTotal),
          sub: m.customersNewThisMonth > 0 ? `+${bdt.format(m.customersNewThisMonth)} this month` : "none new this month",
        },
        { label: "Reports delivered", value: bdt.format(m.reportsReady), sub: "report ready" },
      ]
    : [
        { label: "Orders this month", value: bdt.format(m.ordersThisMonth), sub: `${bdt.format(m.ordersTotal)} all time` },
        { label: "Active caregivers", value: bdt.format(activeCaregivers), sub: "approved" },
        { label: "Open complaints", value: bdt.format(m.openComplaints), sub: "to resolve" },
        { label: "Reports delivered", value: bdt.format(m.reportsReady), sub: "report ready" },
      ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatTile key={k.label} label={k.label} value={k.value} sub={k.sub} />
        ))}
      </div>

      <Card title="Orders — last 30 days">
        <TrendChart points={m.trend} showRevenue={canSeeFinancials} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bookings by status">
          <BarList rows={m.bookingsByStatus} empty="No bookings yet." />
        </Card>

        <Card title="Leads by stage">
          <BarList rows={m.leadsByStage} empty="No leads yet." />
          <p className="mt-3 border-t border-border pt-3 text-sm text-text-muted">
            Conversion:{" "}
            <span className="font-semibold text-navy tabular">
              {m.conversionPct === null ? "—" : `${m.conversionPct}%`}
            </span>{" "}
            {m.conversionPct !== null && (
              <span className="text-xs">
                ({bdt.format(m.leadsWon)} won / {bdt.format(m.leadsLost)} lost)
              </span>
            )}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Caregiver roster">
          <BarList rows={m.caregiversByStatus} empty="No caregivers yet." />
        </Card>

        <Card title="Complaints by status">
          <BarList rows={m.complaintsByStatus} empty="No complaints logged." />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AttentionTile label="Open complaints" count={m.openComplaints} />
        <AttentionTile label="Overdue leads" count={m.overdueLeads} />
        <AttentionTile label="Unresolved alerts" count={m.openAlerts} />
      </div>

      <p className="text-xs text-text-muted">
        As of{" "}
        {m.generatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        {canSeeFinancials ? ". Revenue counts completed bookings only." : "."}
      </p>
    </div>
  );
}
