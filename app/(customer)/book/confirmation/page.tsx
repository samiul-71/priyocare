import type { Metadata } from "next";
import Link from "next/link";
import { HeartMark } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Booking confirmed" };

// /book/confirmation (PRD §5). Shows the booking code the call centre uses.
export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="mx-auto max-w-xl px-4 py-12 text-center">
      <div className="mb-4 flex justify-center">
        <HeartMark size={48} />
      </div>
      <h1 className="font-display text-2xl font-bold text-navy">
        <span aria-hidden="true">✓ </span>Booking confirmed
      </h1>
      {code ? (
        <p className="mt-3 text-text-muted">
          Your booking code is{" "}
          <span className="tabular font-semibold text-navy">{code}</span>. We&apos;ve
          sent an SMS with the details.
        </p>
      ) : (
        <p className="mt-3 text-text-muted">
          Your booking is confirmed. We&apos;ve sent an SMS with the details.
        </p>
      )}
      <p className="mt-2 text-sm text-text-muted">
        Fasting reminder: for pathology, don&apos;t eat after midnight if your test requires it.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-navy px-6 font-medium text-white"
      >
        Back home
      </Link>
    </div>
  );
}
