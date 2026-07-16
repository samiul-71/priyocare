import type { Metadata } from "next";
import { StatusStepper } from "@/components/customer/StatusStepper";
import { getSampleStatus } from "@/lib/server/booking/tracking";
import {
  SAMPLE_STEPS,
  sampleStepIndex,
  isReportReady,
  isSampleRejected,
} from "@/lib/shared/tracking";
import { buildSignedReportPath, reportLinkSecret } from "@/lib/server/reports/signed-url";

export const metadata: Metadata = { title: "Sample & report status" };
export const dynamic = "force-dynamic";

// /bookings/[id]/status (PRD §5, §11). The sample → report stepper. When the
// report is ready it unlocks a signed link that expires in 15 minutes. A
// delayed feed shows an honest banner — never a fabricated status (AC 3.1).
export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const bookingId = Number((await params).id);
  const sample = await getSampleStatus(bookingId);

  const secret = reportLinkSecret();
  const reportHref =
    sample && isReportReady(sample.status) && sample.hasReport && secret
      ? buildSignedReportPath(sample.sampleId, secret)
      : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">Sample &amp; report</h1>

      {!sample ? (
        <p className="mt-4 rounded-[10px] border border-border bg-surface-alt p-4 text-text-muted">
          Status update pending. We&apos;ll show each step here as your sample moves through the lab.
        </p>
      ) : isSampleRejected(sample.status) ? (
        <p className="mt-4 rounded-[10px] border border-border bg-surface-alt p-4 text-text">
          The lab needed a fresh sample. We&apos;re arranging a{" "}
          <strong>free re-collection</strong> — never a second charge for our operational failure.
        </p>
      ) : (
        <div className="mt-5">
          <StatusStepper steps={SAMPLE_STEPS} currentIndex={sampleStepIndex(sample.status)} />

          {isReportReady(sample.status) ? (
            reportHref ? (
              <a
                href={reportHref}
                className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-navy px-6 font-medium text-white"
              >
                Download report
              </a>
            ) : (
              <p className="mt-6 text-sm text-text-muted">
                Your report is ready. Refresh to generate a secure download link.
              </p>
            )
          ) : (
            <p className="mt-6 rounded-[10px] border border-border bg-surface-alt p-4 text-sm text-text-muted">
              Your report isn&apos;t ready yet. This page updates as the lab progresses — the download unlocks the moment it&apos;s done.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
