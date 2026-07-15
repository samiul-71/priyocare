/**
 * StatusBadge — conveys status by ICON + TEXT LABEL, never colour alone
 * (design.md §5.2; PRD §11). ~8% of Bangladeshi men are colour-blind and the
 * status timeline is the trust product, so every badge stays legible in
 * greyscale: the glyph and the words carry the meaning; colour only reinforces.
 */
export type Status =
  | "confirmed"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "overdue";

const config: Record<Status, { label: string; glyph: string; className: string }> = {
  confirmed: { label: "Confirmed", glyph: "✓", className: "text-navy bg-navy-50" },
  en_route: { label: "On the way", glyph: "→", className: "text-teal-700 bg-teal-50" },
  arrived: { label: "Arrived", glyph: "⌖", className: "text-teal-900 bg-teal-50" },
  in_progress: { label: "In progress", glyph: "●", className: "text-teal-800 bg-teal-50" },
  completed: { label: "Completed", glyph: "✓✓", className: "text-success bg-navy-50" },
  cancelled: { label: "Cancelled", glyph: "✕", className: "text-text-muted bg-surface-alt" },
  overdue: { label: "Overdue", glyph: "!", className: "text-danger bg-surface-alt" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${c.className}`}
    >
      <span aria-hidden="true" className="font-bold">
        {c.glyph}
      </span>
      <span>{label ?? c.label}</span>
    </span>
  );
}
