import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCaregiverPage } from "@/lib/server/auth/dal";
import { getTodayJob } from "@/lib/server/caregiver/queries";
import { TaskList } from "@/components/caregiver/TaskList";

export const metadata: Metadata = { title: "কাজের তালিকা" };
export const dynamic = "force-dynamic";

/** Task ticklist (§5). The list comes from the booked items — service-dependent. */
export default async function TasksPage() {
  const caregiver = await requireCaregiverPage();
  const job = await getTodayJob(caregiver.caregiverId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Link href="/caregiver/today" className="text-base text-teal-900 underline">
        ‹ আজকের কাজ
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-navy">কাজের তালিকা</h1>
      <p className="mt-1 mb-5 text-base text-text-muted">{job.patientName}</p>

      <TaskList bookingId={job.bookingId} tasks={job.tasks} initialDone={[]} />
    </div>
  );
}
