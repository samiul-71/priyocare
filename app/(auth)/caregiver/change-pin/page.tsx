import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCaregiverActor } from "@/lib/server/auth/dal";
import { ChangePinForm } from "@/components/auth/ChangePinForm";

export const metadata: Metadata = { title: "নতুন পিন" };

/**
 * First-login PIN change (§12.2).
 *
 * Lives in the (auth) group, outside the caregiver shell — `requireCaregiverPage`
 * redirects HERE while `pin_must_change` is set, so a page inside that shell
 * would redirect to itself forever. Same reason the login screens sit here.
 *
 * It still requires a caregiver session: this is not a public form, it just
 * cannot be behind the guard that points at it.
 */
export default async function ChangePinPage() {
  const caregiver = await getCaregiverActor();
  if (!caregiver) redirect("/caregiver/login?next=%2Fcaregiver");

  // Arrived deliberately after already changing it — nothing to do here.
  if (!caregiver.mustChangePin) redirect("/caregiver/today");

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">নতুন পিন দিন</h1>
      <p className="mt-1 mb-5 text-sm text-text-muted">
        অফিস থেকে দেওয়া পিনটি অফিসও জানে। নিজের একটি পিন দিন — এটি শুধু আপনিই জানবেন।
        <span className="mt-2 block">
          The PIN the office gave you is one they know too. Choose your own — only you will
          know it.
        </span>
      </p>
      <ChangePinForm />
    </>
  );
}
