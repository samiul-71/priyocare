import { jsonError } from "@/lib/server/auth/require-auth";
import { getSampleReportUrl } from "@/lib/server/booking/tracking";
import { reportLinkSecret, verifyReportAccess } from "@/lib/server/reports/signed-url";

// GET /api/v1/reports/[sample_id]?exp&token — report view (§8, §10.5). Access is
// only via a signed URL with a 15-minute expiry. The signature is verified
// BEFORE any lookup, so an expired or forged link is rejected regardless of DB
// state (AC 1.1). Private storage — never a public path.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sample_id: string }> },
) {
  const secret = reportLinkSecret();
  if (!secret) {
    return jsonError(503, "reports_unconfigured", "Report storage is not configured.");
  }

  const sampleId = Number((await params).sample_id);
  const { searchParams } = new URL(req.url);
  const exp = Number(searchParams.get("exp"));
  const token = searchParams.get("token") ?? "";

  const access = verifyReportAccess(sampleId, exp, token, secret);
  if (!access.ok) {
    return access.reason === "expired"
      ? jsonError(410, "link_expired", "This report link has expired. Please request a new one.")
      : jsonError(401, "invalid_link", "Invalid report link.");
  }

  const reportUrl = await getSampleReportUrl(sampleId);
  if (!reportUrl) {
    return jsonError(404, "report_not_ready", "No report is available for this sample yet.");
  }

  // Redirect to the private-storage location (itself a short-lived signed URL).
  return Response.redirect(reportUrl, 302);
}
