import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listStaff } from "@/lib/server/office/queries";
import { StaffPasswordReset } from "@/components/office/StaffPasswordReset";

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
  const staff = await listStaff();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Staff</h1>
      <p className="mt-1 mb-5 max-w-2xl text-text-muted">
        Everyone who can sign in to the office panel. Accounts are created with{" "}
        <code className="rounded bg-surface-alt px-1 text-xs">npm run db:create-staff</code> — there
        is no self-registration (§10.1).
      </p>

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
