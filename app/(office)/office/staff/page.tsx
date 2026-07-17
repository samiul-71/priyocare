import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listLeadServices, listStaff, listStaffServices } from "@/lib/server/office/queries";
import { StaffPasswordReset } from "@/components/office/StaffPasswordReset";
import { StaffLeadServices } from "@/components/office/StaffLeadServices";
import { StaffActiveToggle } from "@/components/office/StaffActiveToggle";
import { StaffCreateForm } from "@/components/office/StaffCreateForm";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

/**
 * Who has access to the office panel (§10.1). **Admin only** — `requireStaffPage`
 * sends an `ops` user to /office rather than the login screen: they are signed
 * in, just not allowed here.
 *
 * This page did not exist before. An admin panel that cannot answer "who can
 * read every patient's address and every caregiver's file?" is missing
 * something more basic than a feature, and until now the answer lived only in
 * a database nobody was going to query.
 *
 * No password hash is ever selected into this page; the only credential-adjacent
 * fact shown is whether the handover password is still in place.
 */
export default async function StaffPage() {
  const actor = await requireStaffPage("admin");
  const [staff, leadServices, staffServiceRows] = await Promise.all([
    listStaff(),
    listLeadServices(),
    listStaffServices(),
  ]);

  const servicesByStaff = new Map<number, number[]>();
  for (const row of staffServiceRows) {
    servicesByStaff.set(row.staffId, [
      ...(servicesByStaff.get(row.staffId) ?? []),
      row.serviceId,
    ]);
  }

  // An empty rota is not a neutral state: every new enquiry lands "Unassigned"
  // and waits for someone to notice it. Say so, rather than letting a grid of
  // empty checkboxes read as "configured".
  const nobodyOnRota = staff.length > 0 && staffServiceRows.length === 0;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Staff</h1>
      <p className="mt-1 mb-5 max-w-2xl text-text-muted">
        Everyone who can sign in to the office panel. Add an account below, or use{" "}
        <code className="rounded bg-surface-alt px-1 text-xs">npm run db:create-staff</code> on the
        server for the first admin. There is no self-registration (§10.1).
      </p>

      <StaffCreateForm />

      {nobodyOnRota && (
        <p
          role="status"
          className="mb-5 max-w-2xl rounded-md border border-border bg-surface-alt p-3 text-sm text-navy"
        >
          <span aria-hidden="true">◑ </span>
          Nobody is on a lead rota, so every new enquiry lands{" "}
          <strong>Unassigned</strong> and waits to be picked up. Tick a lead service below to put
          someone in the rotation.
        </p>
      )}

      {staff.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No staff accounts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-left">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Password</th>
                <th className="py-2 font-medium">Lead rota</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-border align-top">
                  <td className="py-3">
                    <span className="font-medium text-navy">{s.name}</span>
                    {s.id === actor.staffId && (
                      <span className="ml-2 text-xs text-text-muted">(you)</span>
                    )}
                    <span className="block text-xs text-text-muted">{s.email}</span>
                  </td>
                  <td className="py-3 text-sm text-text-muted">{s.role}</td>
                  <td className="py-3 text-sm">
                    {/* Icon + word, never colour alone (design.md §5.1). */}
                    <span className={s.isActive ? "text-teal-900" : "text-text-muted"}>
                      <span aria-hidden="true">{s.isActive ? "● " : "○ "}</span>
                      {s.isActive ? "Active" : "Deactivated"}
                    </span>
                    {/* No self-toggle: an admin cannot switch off their own
                        account (the action refuses it too). */}
                    {s.id !== actor.staffId && (
                      <StaffActiveToggle staffId={s.id} name={s.name} isActive={s.isActive} />
                    )}
                  </td>
                  <td className="py-3 text-sm">
                    {s.mustChangePassword ? (
                      <span className="text-navy">
                        <span aria-hidden="true">◑ </span>
                        Handover — not yet changed
                      </span>
                    ) : (
                      <span className="text-text-muted">
                        <span aria-hidden="true">✓ </span>
                        Theirs alone
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    {s.isActive ? (
                      <StaffLeadServices
                        staffId={s.id}
                        name={s.name}
                        leadServices={leadServices}
                        selected={servicesByStaff.get(s.id) ?? []}
                        canEdit
                      />
                    ) : (
                      // A deactivated account is already excluded from the
                      // rotation by the query; offering the checkboxes would
                      // imply otherwise.
                      <span className="text-xs text-text-muted">Not in rotation</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <StaffPasswordReset
                      staffId={s.id}
                      name={s.name}
                      isSelf={s.id === actor.staffId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-sm">
        <Link href="/office/change-password" className="text-teal-900 underline">
          Change your own password
        </Link>
      </p>
    </div>
  );
}
