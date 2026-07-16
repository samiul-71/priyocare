import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCaregiverPage } from "@/lib/server/auth/dal";
import { getTodayJob } from "@/lib/server/caregiver/queries";
import { CareLogForm } from "@/components/caregiver/CareLogForm";

export const metadata: Metadata = { title: "কেয়ার লগ" };
export const dynamic = "force-dynamic";

/** Daily care log (§5). Device time is authoritative for `logged_at` (§7). */
export default async function CareLogPage() {
  const caregiver = await requireCaregiverPage();
  const job = await getTodayJob(caregiver.caregiverId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Link href="/caregiver/today" className="text-base text-teal-900 underline">
        ‹ আজকের কাজ
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-navy">কেয়ার লগ</h1>
      <p className="mt-1 mb-5 text-base text-text-muted">{job.patientName}</p>

      <CareLogForm bookingId={job.bookingId} tasks={job.tasks} />
    </div>
  );
}
