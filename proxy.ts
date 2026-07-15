import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route-group auth gating (PRD §4.4).
 *
 * NOTE: In Next.js 16 "Middleware" is renamed "Proxy" — the file is `proxy.ts`
 * and the export is `proxy` (functionality unchanged). The module PRDs refer to
 * it as `middleware.ts` for continuity with the master PRD; this is the same
 * seam.
 *
 * SKELETON ONLY (module 01): one proxy, keyed by path prefix, that recognises
 * the three actors but performs NO token verification yet. Module 03 attaches
 * the actual verification here:
 *   /office/*    → staff JWT with a `role` claim
 *   /caregiver/* → caregiver JWT; NEVER redirect to login on token expiry
 *                  (offline writes queue regardless of auth state)
 *   /book,/bookings,/enquiry → guest or customer JWT
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

export function proxy(request: NextRequest) {
  const actor = actorForPath(request.nextUrl.pathname);

  // TODO(module 03): verify the actor-specific token here. The caregiver
  // branch must never redirect on expiry — auth is only checked at sync time.
  void actor;

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets; run on everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webmanifest)$).*)"],
};
