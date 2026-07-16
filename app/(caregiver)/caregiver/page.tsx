import type { Metadata } from "next";
import { requireCaregiverPage } from "@/lib/server/auth/dal";

export const metadata: Metadata = { title: "Caregiver" };

/**
 * Landing for the caregiver PWA. Guarded by the 30-day session cookie, which
 * never bounces an expired access token to login (§10.1). Module 07 builds
 * /caregiver/today and the offline queue.
 */
export default async function CaregiverHome() {
  const caregiver = await requireCaregiverPage();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-navy">
        PriyoCare — কাজ
      </h1>
      <p className="mt-2 text-text-muted">
        {caregiver.name} — আজকের কাজ মডিউল ০৭-এ আসছে।
      </p>
    </div>
  );
}
