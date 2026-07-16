import { jsonError } from "@/lib/server/auth/require-auth";
import { verifyWebhookSignature, webhookSecretFor } from "@/lib/server/payments/webhook";

// POST /api/v1/payments/webhook/[provider] — gateway callback (§8, §9). The
// server is the source of truth, not the browser redirect. The raw body is
// HMAC-verified before anything is trusted; a booking can be reconciled/created
// from here even if the client crashed before the confirmation screen rendered.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const secret = webhookSecretFor(provider);
  if (!secret) {
    return jsonError(503, "provider_unconfigured", "Payment provider is not configured.");
  }

  // Read the RAW body — the signature is computed over exact bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") ?? "";

  if (!verifyWebhookSignature(secret, rawBody, signature)) {
    return jsonError(401, "bad_signature", "Invalid webhook signature.");
  }

  // Signature valid → trust the payload. Reconciling the payment/booking status
  // against the concrete gateway schema lands with the provider integration
  // (§19). Acknowledge so the gateway does not retry.
  return Response.json({ ok: true });
}
