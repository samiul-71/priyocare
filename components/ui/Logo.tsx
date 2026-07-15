/**
 * Code-drawn PriyoCare logo — a temporary placeholder until the official
 * isolated heart-mark SVG is delivered (design.md §1.1, §9; PRD §17.5/§19).
 * The heart is two overlapping strokes, navy resolving into teal: two hands
 * meeting — "someone is there when you can't be."
 *
 * Swap `HeartMark` for the official SVG when it lands; the API stays the same.
 */

export function HeartMark({
  size = 28,
  variant = "color",
  className,
}: {
  size?: number;
  /** "color" = navy→teal on transparent · "white" = solid white (for teal chrome) */
  variant?: "color" | "white";
  className?: string;
}) {
  const gradientId = "pc-heart-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="PriyoCare"
      className={className}
    >
      {variant === "color" && (
        <defs>
          <linearGradient id={gradientId} x1="4" y1="6" x2="28" y2="26">
            <stop offset="0" stopColor="#012967" />
            <stop offset="1" stopColor="#0d9b9a" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M16 27.5C16 27.5 4 20.2 4 12.4 4 8.6 7 6 10.3 6c2.3 0 4.4 1.3 5.7 3.3C17.3 7.3 19.4 6 21.7 6 25 6 28 8.6 28 12.4c0 7.8-12 15.1-12 15.1Z"
        stroke={variant === "white" ? "#ffffff" : `url(#${gradientId})`}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  variant = "color",
}: {
  className?: string;
  variant?: "color" | "white";
}) {
  const careColor = variant === "white" ? "text-white" : "text-teal-700";
  const priyoColor = variant === "white" ? "text-white" : "text-navy";
  return (
    <span
      className={`inline-flex items-center gap-1 font-display text-2xl font-bold ${className ?? ""}`}
    >
      <span className={priyoColor}>Priyo</span>
      <HeartMark size={22} variant={variant} />
      <span className={careColor}>Care</span>
    </span>
  );
}
