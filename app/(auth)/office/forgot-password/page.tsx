import type { Metadata } from "next";
import Link from "next/link";
import { isEmailConfigured } from "@/lib/server/email/mailer";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic"; // the email-configured check is an environment fact

/**
 * Staff forgot-password (§10.1).
 *
 * Degrades honestly: with no email provider wired (§19) this points at the
 * admin-reset route instead of a form that could never deliver a link. A screen
 * that says "check your inbox" over a mail that was never sent strands the one
 * person it is meant to help. Admin reset is a complete route back in, not a
 * fallback for a broken feature — it is how this works when email is off.
 */
export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">Forgot your password?</h1>

      {isEmailConfigured() ? (
        <>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            Enter your office email and we&rsquo;ll send a link to choose a new password.
          </p>
          <ForgotPasswordForm />
        </>
      ) : (
        <p className="mt-1 text-sm text-text-muted">
          Email isn&rsquo;t switched on yet. Ask an admin to reset your password for you — they can
          do it from the Staff page, and you&rsquo;ll get a temporary password to change at your next
          sign-in.
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
