import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy — security headers + route-group classification (PRD §4.4, §10.2).
 *
 * NOTE on naming: in Next.js 16 "Middleware" is renamed "Proxy" (same seam).
 *
 * NOTE on responsibility: the master PRD frames per-path token checks as a
 * middleware job, but Next 16's guidance is explicit that Proxy is for
 * OPTIMISTIC checks and headers, not full authorization. So real authorization
 * lives next to the data — `requireAuth`/`requireStaff` for API handlers,
 * `requireStaffPage`/`requireCaregiverPage` (lib/server/auth/dal.ts) for pages.
 * This proxy deliberately performs NO auth redirect, and does three things
 * every request needs:
 *   1. attach security headers (HSTS, nosniff, frame-deny, scoped CSP)
 *   2. classify the actor by path prefix, for downstream logging
 *   3. forward the pathname so the page guards can build a `?next=` return link
 *      (a Server Component cannot otherwise see its own URL)
 *
 * Why no optimistic redirect here even though a page-session cookie now exists:
 * the proxy runs on prefetches too, the DAL already blocks unauthenticated
 * renders, and a redirect in this seam is the classic way to break the
 * caregiver rule (§10.1 — never bounce to login on token expiry). One guard, in
 * one place, that reads the right token.
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
//
// 'unsafe-eval' is DEV-ONLY and must stay that way. React's development build
// calls eval() to rebuild server-side error stacks in the browser; without it
// the dev overlay dies and takes the error it was reporting with it. A
// production build never evals — Next's own CSP guide is explicit that the
// widening is not needed there — and shipping it would hand any injected string
// a way to become code, which is most of what a CSP is for. `NODE_ENV` is
// inlined at build time, so the production bundle cannot carry this branch.
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
].join("; ");

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const actor = actorForPath(pathname);

  // `set` (not `append`) overwrites any client-supplied value, so a caller
  // cannot spoof the pathname the guards read back.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pc-pathname", pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
