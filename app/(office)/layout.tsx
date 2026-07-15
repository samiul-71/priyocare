import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

/**
 * Office route-group shell (PRD §4.1, §17.7). Admin panel, desktop-first, no
 * PWA. Feeling: dense, neutral, invisible — navy sidebar, white content.
 * Staff auth guard + role-scoped nav are added in module 03; here the nav is a
 * static placeholder so the surface exists.
 */
const NAV = [
  { href: "/office/bookings", label: "Bookings" },
  { href: "/office/bookings/new", label: "New (phone)" },
  { href: "/office/leads", label: "Leads" },
  { href: "/office/complaints", label: "Complaints" },
  { href: "/office/samples", label: "Samples" },
  { href: "/office/catalog", label: "Catalogue" },
  { href: "/office/alerts", label: "Alerts" },
];

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full bg-surface text-sm">
      <aside className="w-56 shrink-0 bg-navy px-3 py-4 text-white">
        <div className="mb-6 px-1">
          <Logo variant="white" />
        </div>
        <nav>
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 hover:bg-navy-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
