/**
 * Skeleton — loading placeholder that matches final layout to avoid layout
 * shift (PRD §11). Respects prefers-reduced-motion via globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-navy-100 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
