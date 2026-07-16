import type { Metadata } from "next";

export const metadata: Metadata = { title: "Samples" };

// Sample / report upload (PRD §5). The chain-of-custody model (samples table,
// statuses) exists in the schema; report upload + lab-rejection + free
// re-collection are built with the pathology flow (module 04/05).
export default function SamplesPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Samples &amp; reports</h1>
      <p className="mt-1 mb-5 text-text-muted">
        Barcode chain-of-custody. A lab rejection triggers a free re-collection —
        never a second charge for our operational failure.
      </p>
      <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
        No samples awaiting a report.
      </p>
    </div>
  );
}
