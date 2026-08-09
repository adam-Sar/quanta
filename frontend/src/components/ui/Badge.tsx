import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------- Severity text-only badge (no background pills) ---------- */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

const sevText: Record<Severity, string> = {
  critical: "text-sev-critical",
  high: "text-sev-high",
  medium: "text-sev-medium",
  low: "text-sev-low",
  info: "text-sev-info",
};

export interface SeverityTextProps {
  severity: string | null | undefined;
  className?: string;
}

export function SeverityText({ severity, className }: SeverityTextProps) {
  const key = (severity ?? "").toLowerCase() as Severity;
  const cls = sevText[key] ?? "text-ink-500";
  return (
    <span className={cn("text-xs font-medium uppercase tracking-wide", cls, className)}>
      {severity ?? "—"}
    </span>
  );
}

/* ---------- Generic inline label, backdrop optional ---------- */

export interface BadgeProps {
  children: ReactNode;
  variant?: "neutral" | "brand" | "muted";
  className?: string;
}

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  const variantCls =
    variant === "brand"
      ? "bg-brand-50 text-brand-700"
      : variant === "muted"
        ? "bg-ink-50 text-ink-700"
        : "bg-ink-100 text-ink-800";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        variantCls,
        className,
      )}
    >
      {children}
    </span>
  );
}
