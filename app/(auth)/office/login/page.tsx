import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffActor } from "@/lib/server/auth/dal";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { safeReturnPath } from "@/lib/shared/return-path";

export const metadata: Metadata = { title: "Office sign in" };

/**
 * Staff login (§5, §10.1). Email + password, no self-registration — accounts
 * are created by an admin, so there is no "sign up" link to offer.
 */
export default async function OfficeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next, "/office") ?? "/office";

  // Already signed in → don't show a login form.
  //
  // This MUST use the same authority as the guard that redirects here, not the
  // cheaper cookie-only `getPageSession`. A cookie can verify (good signature,
  // unexpired) and still be refused by `requireStaffPage`, which also reads the
  // row: the account was suspended, or `iat` predates `password_changed_at`
  // after a reset. Bouncing on the cookie alone meant this page sent her to
  // /office, /office refused the same cookie and sent her back — an infinite
  // 307 loop that shut her out of the very form that would fix it. Whatever
  // says "signed in" here has to be what says it there.
  const staff = await getStaffActor();
  if (staff) redirect(returnTo);

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">Office sign in</h1>
      <p className="mt-1 mb-5 text-sm text-text-muted">Staff accounts only.</p>
      <StaffLoginForm returnTo={returnTo} />
    </>
  );
}
