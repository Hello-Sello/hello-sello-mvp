import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one shared call-to-action pill for the landing. The PRIMARY variant is the
 * single access funnel (D-02): "Request access" → /signup, reused verbatim in the
 * nav, hero, and final band so there is exactly one signup path styled in one
 * place. The GHOST variant is for in-page navigation only (e.g. "See how it
 * works" → #how) and must never point at a second signup route.
 *
 * Uses a plain <a> (not next/link): /signup and the in-page anchors don't benefit
 * from client routing here, and a full navigation keeps the public/app boundary
 * crisp.
 */
export function CTAButton({
  href = "/signup",
  children,
  variant = "primary",
  size = "md",
  withArrow = false,
  className = "",
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  size?: "md" | "lg";
  withArrow?: boolean;
  className?: string;
}) {
  const sizeCls = size === "lg" ? "px-7 py-3.5 text-base" : "px-5 py-2.5 text-sm";
  const variantCls =
    variant === "primary"
      ? "bg-brand text-white shadow-[0_12px_30px_-10px_rgba(227,11,93,0.55)] hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-[0_18px_42px_-12px_rgba(227,11,93,0.6)]"
      : "border border-ink/15 bg-surface/50 text-ink backdrop-blur hover:border-brand hover:text-brand";

  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 ${sizeCls} ${variantCls} ${className}`}
    >
      {children}
      {withArrow && <ArrowRight size={size === "lg" ? 18 : 16} />}
    </a>
  );
}
