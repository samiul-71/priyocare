import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/server/auth/dal";
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

  // Already signed in → don't show a login form. Optimistic (cookie-only) on
  // purpose: this is a redirect for convenience, not an authorisation decision.
  // The destination runs the real check.
  const session = await getPageSession();
  if (session?.st === "staff") redirect(returnTo);

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">Office sign in</h1>
      <p className="mt-1 mb-5 text-sm text-text-muted">Staff accounts only.</p>
      <StaffLoginForm returnTo={returnTo} />
    </>
  );
}
