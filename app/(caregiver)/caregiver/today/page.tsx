import type { Metadata } from "next";
import Link from "next/link";
import { requireCaregiverPage } from "@/lib/server/auth/dal";
import { getTodayJob } from "@/lib/server/caregiver/queries";
import { CheckInOut } from "@/components/caregiver/CheckInOut";

export const metadata: Metadata = { title: "আজকের কাজ" };
export const dynamic = "force-dynamic"; // the job changes; never serve a stale one from the CDN

/**
 * Today's job (§5, §9). The PWA's start_url and the screen she lives on.
 *
 * One decision per screen (§2): the address, the patient, and one big button.
 * No geofence, no distance, no map — the app never tells her how far she is
 * from where it thinks she should be (AC-1), and `getTodayJob` does not even
 * select the coordinates.
 */
export default async function TodayPage() {
  const caregiver = await requireCaregiverPage();
  const job = await getTodayJob(caregiver.caregiverId);

  if (!job) {
    // §9: empty is a sentence, not a blank screen.
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold text-navy">আজকের কাজ</h1>
        <p className="mt-4 rounded-xl border border-border bg-white p-5 text-base text-text-muted">
          এখনো কোনো কাজ দেওয়া হয়নি।
          <span className="mt-1 block text-sm">No job assigned yet today.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-navy">আজকের কাজ</h1>

      <section className="mt-4 rounded-xl border border-border bg-white p-5" aria-label="Job details">
        <p className="text-xl font-bold text-navy">{job.patientName}</p>
        <p className="mt-1 text-base text-text-muted">{job.serviceName}</p>

        <dl className="mt-4 text-base">
          <dt className="font-medium text-navy">ঠিকানা</dt>
          <dd className="text-text-muted">{job.addressLine}</dd>
          {/* Dhaka runs on landmarks — this is the field she actually uses (§7.2). */}
          <dt className="mt-3 font-medium text-navy">ল্যান্ডমার্ক</dt>
          <dd className="text-text-muted">{job.landmark}</dd>
        </dl>

        <p className="mt-4 text-sm text-text-muted">{job.bookingCode}</p>
      </section>

      <div className="mt-5">
        <CheckInOut
          bookingId={job.bookingId}
          checkedIn={job.checkedInAt !== null}
          checkedOut={job.checkedOutAt !== null}
        />
      </div>

      {job.checkedInAt && !job.checkedOutAt && (
        <nav className="mt-5 flex flex-col gap-3" aria-label="Job steps">
          <Link
            href="/caregiver/today/tasks"
            className="flex min-h-14 items-center justify-between rounded-xl border border-border bg-white px-5 text-lg font-medium text-navy"
          >
            কাজের তালিকা
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href="/caregiver/today/scan"
            className="flex min-h-14 items-center justify-between rounded-xl border border-border bg-white px-5 text-lg font-medium text-navy"
          >
            স্যাম্পল স্ক্যান
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href="/caregiver/today/care-log"
            className="flex min-h-14 items-center justify-between rounded-xl border border-border bg-white px-5 text-lg font-medium text-navy"
          >
            কেয়ার লগ
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
