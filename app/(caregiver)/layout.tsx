import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";

// Caregiver PWA uses its own path-scoped manifest (PRD §4.3, §17.5).
export const metadata: Metadata = {
  manifest: "/caregiver/manifest.webmanifest",
};

/**
 * Caregiver route-group shell (PRD §4.1, §17.7). Field PWA, manifest scope
 * "/caregiver/", its own service worker (added in module 07).
 *
 * This is NOT a smaller customer site. Teal header, 18px base, 56px targets,
 * one decision per screen, sunlight-readable. The sync-status indicator lives
 * in the shell chrome so it is always visible; it is wired to the IndexedDB
 * queue in module 07 — here it is a static placeholder.
 */
export default function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-surface text-lg">
      <header className="flex items-center justify-between gap-3 bg-teal-800 px-4 py-3 text-white">
        <Logo variant="white" />
        {/* Sync status — placeholder until module 07 wires the queue */}
        <span className="rounded-full bg-teal-900 px-3 py-1 text-sm">
          <span aria-hidden="true">↻</span> All synced
        </span>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
