import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { requireCaregiverPage } from "@/lib/server/auth/dal";
import { SyncStatus } from "@/components/caregiver/SyncStatus";
import { ServiceWorkerRegistrar } from "@/components/caregiver/ServiceWorkerRegistrar";

// Caregiver PWA uses its own path-scoped manifest (PRD §4.3, §17.5).
export const metadata: Metadata = {
  manifest: "/caregiver/manifest.webmanifest",
};

/**
 * Caregiver route-group shell (PRD §4.1, §17.7). Field PWA, manifest scope
 * "/caregiver/", its own service worker.
 *
 * This is NOT a smaller customer site. Teal header, 18px base, 56px targets,
 * one decision per screen, sunlight-readable. The sync indicator lives in the
 * shell chrome so it is always visible — and it also owns the flush triggers,
 * which is why it must sit here rather than on one screen: the queue drains
 * wherever she happens to be standing.
 *
 * Guarded like the office shell, and for the same reason each page under it
 * guards itself too (layouts do not re-render across navigations). /caregiver/
 * login sits in the (auth) group, outside this guard — and the guard reads the
 * 30-day cookie, never the 15-minute access token, so an expired token cannot
 * put a login wall in front of a shift (§10.1, Flow A).
 */
export default async function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCaregiverPage();

  return (
    <div className="flex min-h-full flex-col bg-surface text-lg">
      <ServiceWorkerRegistrar />
      <header className="flex items-center justify-between gap-3 bg-teal-800 px-4 py-3 text-white">
        <Logo variant="white" />
        <SyncStatus />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
