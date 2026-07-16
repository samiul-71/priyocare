import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffActor } from "@/lib/server/auth/dal";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { safeReturnPath } from "@/lib/shared/return-path";

export const metadata: Metadata = { title: "Change password" };

/**
 * Staff password change (§10.1) — both the forced first-login one and a
 * voluntary change later.
 *
 * Lives in (auth), outside the office shell: `requireStaffPage` redirects HERE
 * while `password_must_change` is set, so a page inside that shell would
 * redirect to itself forever. Same reason the login screens sit here.
 *
 * Still requires a staff session — not public, just not behind the guard that
 * points at it.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const staff = await getStaffActor();
  if (!staff) redirect("/office/login?next=%2Foffice");

  const { next } = await searchParams;
  const returnTo = safeReturnPath(next, "/office") ?? "/office";

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">
        {staff.mustChangePassword ? "Choose your password" : "Change password"}
      </h1>
      <p className="mt-1 mb-5 text-sm text-text-muted">
        {staff.mustChangePassword
          ? "The password you were given is one someone else knows. Choose your own — then only you will."
          : `Signed in as ${staff.email}.`}
      </p>
      <ChangePasswordForm returnTo={returnTo} />
    </>
  );
}
