import type { Metadata } from "next";
import { PhoneBookingForm } from "@/components/office/PhoneBookingForm";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listCatalogue, listZones } from "@/lib/server/catalogue/queries";

export const metadata: Metadata = { title: "New phone booking" };

// ★ Manual phone booking — P0 (PRD §3.1, §5). The hotline is the primary
// channel today, so this is built and tested before the customer booking flow.
//
// Services and zones are loaded server-side with their REAL ids. They used to
// be guessed from the seed's sort order, which is correct only on a freshly
// seeded database — anywhere else that silently books the wrong service.
export default async function NewPhoneBookingPage() {
  await requireStaffPage();
  const [services, zones] = await Promise.all([listCatalogue(), listZones()]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">New phone booking</h1>
      <p className="mt-1 mb-5 text-text-muted">
        Record a booking taken over the hotline (01335995555) for any service.
      </p>
      <PhoneBookingForm services={services} zones={zones} />
    </div>
  );
}
