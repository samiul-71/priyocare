import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listCaregivers } from "@/lib/server/office/queries";
import { NewCaregiverForm } from "@/components/office/NewCaregiverForm";

export const metadata: Metadata = { title: "Caregivers" };
export const dynamic = "force-dynamic";

/**
 * Caregiver onboarding board (§5 row 5, §12.2).
 *
 * The status shown is what the CHECKLIST says, not a label someone typed. A
 * caregiver reads as ready only when every mandatory step, the payout number,
 * and BNMC-for-nurses are on file — the same `evaluateActivation` the API
 * enforces, so the board can never flatter a file that would be refused.
 */
function StatusTag({ row }: { row: { verificationStatus: string; hasPin: boolean; canActivate: boolean } }) {
  // Icon + word, never colour alone (design.md §5.1).
  const [icon, label, tone] =
    row.verificationStatus === "suspended"
      ? ["⊘", "Suspended", "bg-surface-alt text-danger"]
      : row.verificationStatus === "rejected"
        ? ["✕", "Rejected", "bg-surface-alt text-text-muted"]
        : row.verificationStatus === "approved" && row.hasPin
          ? ["●", "Working", "bg-teal-50 text-teal-900"]
          : row.verificationStatus === "approved"
            ? ["◑", "Approved — PIN not issued", "bg-navy-50 text-navy"]
            : row.canActivate
              ? ["◔", "Ready to activate", "bg-navy-50 text-navy"]
              : ["○", "In verification", "bg-surface-alt text-text-muted"];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export default async function CaregiversPage() {
  await requireStaffPage();
  const caregivers = await listCaregivers();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Caregivers</h1>
      <p className="mt-1 mb-5 max-w-2xl text-text-muted">
        Five mandatory steps and a bKash payout number before activation — seven for a babysitter
        (§12.2). A caregiver missing even one never appears in dispatch and cannot be given a login.
      </p>

      <section className="mb-8" aria-label="New application">
        <NewCaregiverForm />
      </section>

      {caregivers.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No caregivers yet. Start an application above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl text-left">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Skill</th>
                <th className="py-2 font-medium">Checklist</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {caregivers.map((cg) => (
                <tr key={cg.id} className="border-b border-border">
                  <td className="py-3">
                    <span className="font-medium text-navy">{cg.fullName}</span>
                    <span className="block text-xs text-text-muted">{cg.phone}</span>
                  </td>
                  <td className="py-3 text-sm text-text-muted">{cg.skill}</td>
                  <td className="py-3 text-sm text-text-muted">
                    {cg.stepsDone}/{cg.stepsRequired}
                  </td>
                  <td className="py-3">
                    <StatusTag row={cg} />
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/office/caregivers/${cg.id}/verify`}
                      className="text-sm text-teal-900 underline"
                    >
                      Verify
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
