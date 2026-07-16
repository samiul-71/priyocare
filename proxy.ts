import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy — security headers + route-group classification (PRD §4.4, §10.2).
 *
 * NOTE on naming: in Next.js 16 "Middleware" is renamed "Proxy" (same seam).
 *
 * NOTE on responsibility: the master PRD frames per-path token checks as a
 * middleware job, but Next 16's guidance is explicit that Proxy is for
 * OPTIMISTIC checks and headers, not full authorization — and because access
 * tokens are Bearer tokens in the Authorization header (not cookies, §10.2), a
 * page navigation carries no token for the proxy to verify anyway. So real
 * authorization lives in the route handlers (`requireAuth`/`requireStaff`), and
 * this proxy does two things every request needs:
 *   1. attach security headers (HSTS, nosniff, frame-deny, scoped CSP)
 *   2. classify the actor by path prefix, ready for optimistic cookie checks
 *      once a page-session cookie is introduced.
 *
 * The caregiver rule (§10.1 — never redirect to login on token expiry) holds
 * by construction: the proxy performs no auth redirect.
 */

type Actor = "staff" | "caregiver" | "customer";

function actorForPath(pathname: string): Actor | null {
  if (pathname.startsWith("/office")) return "staff";
  if (pathname.startsWith("/caregiver")) return "caregiver";
  if (
    pathname.startsWith("/book") ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/enquiry")
  ) {
    return "customer";
  }
  return null;
}

// Scoped CSP. `frame-ancestors 'none'` complements X-Frame-Options: DENY.
// 'unsafe-inline' remains for now because Next's inline bootstrap is not yet
// nonce-plumbed — tighten to nonces in a later hardening pass (§10.7).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

export function proxy(request: NextRequest) {
  const actor = actorForPath(request.nextUrl.pathname);

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  // Expose the classified actor to downstream logging/optimistic checks.
  if (actor) response.headers.set("x-pc-actor", actor);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webmanifest)$).*)"],
};
