import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { SignOutButton } from "@/components/office/SignOutButton";
import { requireStaffPage } from "@/lib/server/auth/dal";

/**
 * Office route-group shell (PRD §4.1, §17.7). Admin panel, desktop-first, no
 * PWA. Feeling: dense, neutral, invisible — navy sidebar, white content.
 *
 * The guard here protects the SHELL (this nav is staff-only chrome and it names
 * the signed-in user). It is deliberately NOT the only check: Next 16 layouts
 * do not re-render on client-side navigation, so every page under this group
 * calls `requireStaffPage` itself. Both calls share one verify + one row read
 * per render, because the DAL is React-`cache`d.
 *
 * /office/login is NOT in this group — it lives in (auth), outside this guard,
 * or an anonymous visitor would be redirected into a layout that redirects them
 * again. See app/(auth)/layout.tsx.
 */
const NAV = [
  { href: "/office/bookings", label: "Bookings" },
  { href: "/office/bookings/new", label: "New (phone)" },
  { href: "/office/leads", label: "Leads" },
  { href: "/office/caregivers", label: "Caregivers" },
  { href: "/office/complaints", label: "Complaints" },
  { href: "/office/samples", label: "Samples" },
  { href: "/office/catalog", label: "Catalogue" },
  { href: "/office/alerts", label: "Alerts" },
];

export default async function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaffPage();

  return (
    <div className="flex min-h-full bg-surface text-sm">
      <aside className="flex w-56 shrink-0 flex-col bg-navy px-3 py-4 text-white">
        <div className="mb-6 px-1">
          <Logo variant="white" />
        </div>
        <nav className="flex-1">
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
        <div className="mt-4 border-t border-white/15 pt-3">
          <p className="px-3 pb-1 text-xs text-white/60">
            {staff.name} · {staff.role}
          </p>
          {/* Admin-only; the pages enforce it regardless of these links. */}
          {staff.role === "admin" && (
            <>
              <Link
                href="/office/customers"
                className="block rounded-md px-3 py-2 text-white/70 hover:bg-navy-800 hover:text-white"
              >
                Customers
              </Link>
              <Link
                href="/office/staff"
                className="block rounded-md px-3 py-2 text-white/70 hover:bg-navy-800 hover:text-white"
              >
                Staff
              </Link>
            </>
          )}
          <Link
            href="/office/change-password"
            className="block rounded-md px-3 py-2 text-white/70 hover:bg-navy-800 hover:text-white"
          >
            Change password
          </Link>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
