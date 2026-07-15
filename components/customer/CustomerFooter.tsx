import { LAUNCH_ZONES } from "@/lib/shared/catalogue";

export function CustomerFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-navy-50">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-text-muted">
        <p className="mb-2 font-medium text-navy">
          PriyoCare — উন্নত ও মানসম্মত স্বাস্থ্যসেবা
        </p>
        <p className="mb-1">
          House 688 (4th Floor), Road 9, Avenue 6, Mirpur DOHS, Dhaka-1216
        </p>
        <p className="mb-1">
          Serving: <span lang="en">{LAUNCH_ZONES.join(" · ")}</span>
        </p>
        <p>info@priyocarebd.com</p>
      </div>
    </footer>
  );
}
