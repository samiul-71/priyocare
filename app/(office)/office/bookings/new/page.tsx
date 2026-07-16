import type { Metadata } from "next";
import { PhoneBookingForm } from "@/components/office/PhoneBookingForm";

export const metadata: Metadata = { title: "New phone booking" };

// ★ Manual phone booking — P0 (PRD §3.1, §5). The hotline is the primary
// channel today, so this is built and tested before the customer booking flow.
export default function NewPhoneBookingPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">New phone booking</h1>
      <p className="mt-1 mb-5 text-text-muted">
        Record a booking taken over the hotline (01335995555) for any service.
      </p>
      <PhoneBookingForm />
    </div>
  );
}
