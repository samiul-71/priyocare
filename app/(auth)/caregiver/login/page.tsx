import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/server/auth/dal";
import { CaregiverLoginForm } from "@/components/auth/CaregiverLoginForm";
import { safeReturnPath } from "@/lib/shared/return-path";

export const metadata: Metadata = { title: "কাজ — সাইন ইন" };

/**
 * Caregiver login (§5, §10.1). Phone + PIN is the primary credential; OTP is
 * the fallback when a PIN is forgotten.
 *
 * Reaching this screen at all should be rare — the 30-day session cookie means
 * it appears only after a month away or a suspension, never on token expiry
 * (§10.1, Flow A). Caregiver sizing throughout: 18px base, 56px targets.
 */
export default async function CaregiverLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next, "/caregiver") ?? "/caregiver";

  const session = await getPageSession();
  if (session?.st === "caregiver") redirect(returnTo);

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">সাইন ইন</h1>
      <p className="mt-1 mb-5 text-sm text-text-muted">
        মোবাইল নম্বর ও পিন দিন
      </p>
      <CaregiverLoginForm returnTo={returnTo} />
    </>
  );
}
