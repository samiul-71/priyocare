import type { Metadata } from "next";

export const metadata: Metadata = { title: "Office" };

/**
 * Placeholder home for the Office panel. Module 03 adds the staff auth guard
 * (redirect to /office/login); module 08 builds the queue, dispatch, and the
 * P0 manual phone-booking screen.
 */
export default function OfficeHome() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Office Panel</h1>
      <p className="mt-2 text-text-muted">
        Ops dashboard. Login guard arrives in module 03; booking queue,
        dispatch, and manual phone booking (P0) in module 08.
      </p>
    </div>
  );
}
