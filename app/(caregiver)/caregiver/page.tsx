import type { Metadata } from "next";

export const metadata: Metadata = { title: "Caregiver" };

/**
 * Placeholder landing for the caregiver PWA. In module 03 this redirects to
 * /caregiver/login when unauthenticated; module 07 builds /caregiver/today.
 */
export default function CaregiverHome() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-navy">
        PriyoCare — কাজ
      </h1>
      <p className="mt-2 text-text-muted">
        Caregiver field app. Login and today&apos;s job arrive in modules 03 and 07.
      </p>
    </div>
  );
}
