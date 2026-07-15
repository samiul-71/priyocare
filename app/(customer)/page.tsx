import { ServiceTiles } from "@/components/customer/ServiceTiles";
import { HeartMark } from "@/components/ui/Logo";
import { LAUNCH_ZONES, HOTLINE, HOTLINE_TEL } from "@/lib/shared/catalogue";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Hero — the promise: someone is there when you can't be. */}
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <HeartMark size={56} />
        <h1 className="font-display text-3xl font-bold text-navy" lang="bn">
          বাড়িতে বিশ্বস্ত স্বাস্থ্যসেবা
        </h1>
        <p className="max-w-xl text-text-muted">
          হোম প্যাথলজি, নার্সিং ও কেয়ারগিভার সার্ভিস — আপনার প্রিয়জনের পাশে,
          যখন আপনি থাকতে পারেন না।
        </p>
        <a
          href={`tel:${HOTLINE_TEL}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-navy px-6 font-medium text-white"
        >
          <span aria-hidden="true">📞</span>
          <span>
            Emergency Help Line <span className="tabular">{HOTLINE}</span>
          </span>
        </a>
      </section>

      {/* Zone banner — launch zones follow the office (PRD §3.1). */}
      <section
        className="mb-8 rounded-[10px] border border-border bg-teal-50 px-4 py-3 text-center text-sm text-teal-900"
        lang="en"
      >
        Now serving {LAUNCH_ZONES.slice(0, -1).join(", ")} &amp;{" "}
        {LAUNCH_ZONES.at(-1)}
      </section>

      {/* Services */}
      <section className="pb-8">
        <h2 className="mb-4 font-display text-xl font-semibold text-navy" lang="bn">
          আমাদের সেবাসমূহ
        </h2>
        <ServiceTiles />
      </section>
    </div>
  );
}
