import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

/**
 * Set a new password from an emailed link (§10.1). Public — the token in the URL
 * is the authority, not a session (someone who has forgotten their password
 * cannot have one). Validity is checked when the form is submitted, not here, so
 * an expired or tampered link still renders the form and fails honestly on save
 * with one opaque message.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">Choose a new password</h1>

      {token ? (
        <>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            This link works once and expires 30 minutes after it was sent.
          </p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-1 text-sm text-text-muted">
          This link is missing its token — it may have been broken by your email app. Request a
          fresh one from the{" "}
          <Link href="/office/forgot-password" className="text-teal-900 underline">
            forgot-password page
          </Link>
          .
        </p>
      )}

      <p className="mt-6 text-sm">
        <Link href="/office/login" className="text-teal-900 underline">
          ‹ Back to sign in
        </Link>
      </p>
    </>
  );
}
