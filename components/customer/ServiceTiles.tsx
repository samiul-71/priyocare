import Link from "next/link";
import { SERVICES, serviceHref, HOTLINE_TEL } from "@/lib/shared/catalogue";

/**
 * The eight service lines from the leaflet (PRD §3.3). Active services link
 * into their flow (`visit`/`placement` → booking, `lead` → enquiry); services
 * not yet digitised route to the hotline, honestly labelled — we never fake a
 * flow that isn't built.
 */
export function ServiceTiles() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {SERVICES.map((service) => {
        const tileBody = (
          <>
            <span className="text-base font-semibold text-navy" lang="bn">
              {service.nameBn}
            </span>
            <span className="text-sm text-text-muted" lang="en">
              {service.nameEn}
            </span>
            {!service.active && (
              <span className="mt-1 text-xs text-teal-700" lang="en">
                Call to book
              </span>
            )}
          </>
        );

        const tileClasses =
          "flex h-full min-h-24 flex-col justify-center gap-0.5 rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-teal-700 hover:bg-navy-50";

        return (
          <li key={service.slug}>
            {service.active ? (
              <Link href={serviceHref(service)} className={tileClasses}>
                {tileBody}
              </Link>
            ) : (
              <a href={`tel:${HOTLINE_TEL}`} className={tileClasses}>
                {tileBody}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
