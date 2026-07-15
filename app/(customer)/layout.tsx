import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { CustomerFooter } from "@/components/customer/CustomerFooter";

/**
 * Customer route-group shell (PRD §4.1). Public site, PWA scope "/".
 * Feeling: warm, calm, trustworthy (design.md §6).
 */
export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-surface">
      <CustomerHeader />
      <main className="flex-1">{children}</main>
      <CustomerFooter />
    </div>
  );
}
