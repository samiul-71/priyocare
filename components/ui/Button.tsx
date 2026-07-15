import type { ButtonHTMLAttributes } from "react";

/**
 * Button — the one design-system control.
 * Fills come only from contrast-safe tokens (design.md §5.1):
 *   primary = navy/white · secondary = teal-800/white · ghost = outline · danger.
 * `teal-brand` is NEVER a button fill (white-on-teal-brand is 3.40:1).
 *
 * Tap targets: 44px customer, 56px caregiver (design.md §5).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "customer" | "caregiver" | "office";

const variantClasses: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-800",
  secondary: "bg-teal-800 text-white hover:bg-teal-900",
  ghost: "bg-transparent text-navy border border-border hover:bg-navy-50",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizeClasses: Record<Size, string> = {
  customer: "min-h-11 px-5 text-base", // 44px
  caregiver: "min-h-14 px-6 text-lg", // 56px
  office: "min-h-8 px-3 text-sm", // 32px (mouse)
};

export function Button({
  variant = "primary",
  size = "customer",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
      {...props}
    />
  );
}
