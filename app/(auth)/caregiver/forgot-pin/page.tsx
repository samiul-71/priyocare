import type { Metadata } from "next";
import Link from "next/link";
import { isSmsConfigured } from "@/lib/server/auth/otp";
import { ForgotPinForm } from "@/components/auth/ForgotPinForm";

export const metadata: Metadata = { title: "পিন ভুলে গেছেন?" };
export const dynamic = "force-dynamic"; // the SMS check is an environment fact

/**
 * Forgotten PIN (§10.1's OTP fallback).
 *
 * Degrades honestly: with no SMS provider wired (§19) this shows the hotline
 * instead of a form that could never deliver a code. A screen that says "we
 * sent you a code" when nothing was sent is worse than no screen — she would
 * stand there waiting instead of picking up the phone, and nobody would find
 * out until she missed a shift.
 *
 * The Ops-mediated reset behind that hotline is a complete route back in, not a
 * fallback for a broken feature — it is how this works today.
 */
export default function ForgotPinPage() {
  return (
    <>
      <h1 className="font-display text-xl font-bold text-navy">পিন ভুলে গেছেন?</h1>

      {isSmsConfigured() ? (
        <>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            আপনার নম্বরে একটি কোড পাঠাব। কোড দিয়ে নতুন পিন দিন।
          </p>
          <ForgotPinForm />
        </>
      ) : (
        <p className="mt-1 text-base text-text-muted">
          অফিসে ফোন করুন —{" "}
          <a href="tel:01335995555" className="font-medium text-teal-900 underline">
            ০১৩৩৫৯৯৫৫৫৫
          </a>
          । আপনাকে চিনে নিয়ে নতুন পিন দেওয়া হবে।
          <span className="mt-3 block text-sm">
            Call the office and we will check who you are and give you a new PIN. (SMS codes are
            not switched on yet.)
          </span>
        </p>
      )}

      <p className="mt-6 text-sm">
        <Link href="/caregiver/login" className="text-teal-900 underline">
          ‹ সাইন ইন-এ ফিরুন
        </Link>
      </p>
    </>
  );
}
