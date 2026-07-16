import { Logo } from "@/components/ui/Logo";

/**
 * Login shell — a route group of its own, and that is the whole point.
 *
 * /office/login CANNOT live under the (office) group: that group's layout now
 * guards itself and would redirect an anonymous visitor to /office/login, which
 * would render inside the same guarded layout, and redirect again. Route groups
 * do not nest, so `(auth)/office/login` gets a bare shell with no guard while
 * `(office)/office/*` stays sealed. Same for the caregiver.
 *
 * No sidebar, no nav, nothing to click but the form — a signed-out visitor
 * should not be shown the shape of the panel they cannot enter.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-surface-alt px-4 py-12">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
