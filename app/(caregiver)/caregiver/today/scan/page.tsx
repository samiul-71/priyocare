import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCaregiverPage } from "@/lib/server/auth/dal";
import { getTodayJob } from "@/lib/server/caregiver/queries";
import { SampleScan } from "@/components/caregiver/SampleScan";

export const metadata: Metadata = { title: "স্যাম্পল স্ক্যান" };
export const dynamic = "force-dynamic";

/** Sample scan (§5). Manual entry today; camera is a PRD open question (§14). */
export default async function ScanPage() {
  const caregiver = await requireCaregiverPage();
  const job = await getTodayJob(caregiver.caregiverId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Link href="/caregiver/today" className="text-base text-teal-900 underline">
        ‹ আজকের কাজ
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-navy">স্যাম্পল স্ক্যান</h1>
      <p className="mt-1 mb-5 text-base text-text-muted">{job.patientName}</p>

      <SampleScan bookingId={job.bookingId} />
    </div>
  );
}
