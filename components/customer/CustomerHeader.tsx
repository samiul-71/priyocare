import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { HOTLINE, HOTLINE_TEL } from "@/lib/shared/catalogue";

/**
 * Customer chrome: white, navy text, teal accents (design.md §6). The hotline
 * is a first-class call-to-action, not a fallback — the leaflet trains people
 * to call, and that is a P0 fact of the business (PRD §3.1).
 */
export function CustomerHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="PriyoCare home">
          <Logo />
        </Link>
        <a
          href={`tel:${HOTLINE_TEL}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-navy px-4 font-medium text-white"
        >
          <span aria-hidden="true">📞</span>
          <span className="tabular">{HOTLINE}</span>
        </a>
      </div>
    </header>
  );
}
