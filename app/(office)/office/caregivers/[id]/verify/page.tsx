import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { getCaregiverDetail } from "@/lib/server/office/queries";
import { VerificationChecklist } from "@/components/office/VerificationChecklist";
import { PayoutNumberForm } from "@/components/office/PayoutNumberForm";

export const metadata: Metadata = { title: "Verify caregiver" };
export const dynamic = "force-dynamic";

/**
 * Caregiver verification (§5 row 5, §12.2, AC 2.1/2.2).
 *
 * The screen where a person becomes someone we send into a stranger's home, so
 * it shows the checklist honestly and never lets the UI imply more readiness
 * than the file supports. Every action re-checks the gate server-side.
 */
export default async function VerifyCaregiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPage();

  const caregiverId = Number((await params).id);
  if (!Number.isInteger(caregiverId) || caregiverId <= 0) notFound();

  const cg = await getCaregiverDetail(caregiverId);
  if (!cg) notFound();

  return (
    <div>
      <Link href="/office/caregivers" className="text-sm text-teal-900 underline">
        ‹ Caregivers
      </Link>

      <h1 className="mt-2 font-display text-2xl font-bold text-navy">{cg.fullName}</h1>
      <p className="mt-1 mb-5 text-text-muted">
        {cg.skill} · {cg.phone} · {cg.stepsDone}/{cg.stepsRequired} steps
        {cg.skill === "babysitter" && " (babysitter: 7 required)"}
      </p>

      {cg.verificationStatus === "suspended" && (
        <p role="status" className="mb-5 max-w-xl rounded-md border border-danger bg-surface-alt p-3 text-sm text-danger">
          <span aria-hidden="true">⊘ </span>
          Suspended. Their tokens were revoked at suspension; they cannot be dispatched.
        </p>
      )}

      <section className="mb-6 max-w-xl" aria-label="Payout">
        <h2 className="mb-2 text-sm font-semibold text-navy">bKash payout number</h2>
        <p className="mb-2 text-xs text-text-muted">
          Required before activation — nobody works before we can pay them (§12.2).
        </p>
        <PayoutNumberForm caregiverId={cg.id} current={cg.bkashPayoutNumber} />
      </section>

      <h2 className="mb-2 text-sm font-semibold text-navy">Verification checklist</h2>
      <VerificationChecklist
        caregiverId={cg.id}
        requiredSteps={cg.requiredSteps}
        completedSteps={cg.completedSteps}
        canActivate={cg.canActivate}
        verificationStatus={cg.verificationStatus}
        hasPin={cg.hasPin}
        missing={cg.missing}
      />
    </div>
  );
}
