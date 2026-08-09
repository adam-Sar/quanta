import {
  AlertTriangle,
  CircleAlert,
  Flame,
  Info,
} from "lucide-react";
import { ReactNode } from "react";

import type { FindingKind, FindingSeverity } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * Severity-driven icon set. The icon communicates *how bad* a
 * finding is, which is the dominant signal on the overview card
 * (each row already carries a severity stripe). Using the same
 * icon within a severity band keeps the row visually consistent
 * regardless of finding kind.
 *
 *   critical  → flame           (most alarming)
 *   high      → triangle-alert  (filled-in alert)
 *   medium    → circle-alert    (softer outline)
 *   low       → info            (informational)
 *   info      → info            (informational)
 *
 * All icons are outline-style so they sit cleanly at 16-20px on a
 * neutral text colour and don't compete with the coloured stripe.
 */
function iconForSeverity(severity: string): ReactNode {
  switch (severity.toLowerCase()) {
    case "critical":
      return <Flame className="h-4 w-4" />;
    case "high":
      return <AlertTriangle className="h-4 w-4" />;
    case "medium":
      return <CircleAlert className="h-4 w-4" />;
    case "low":
      return <Info className="h-4 w-4" />;
    case "info":
      return <Info className="h-4 w-4" />;
    default:
      return <AlertTriangle className="h-4 w-4" />;
  }
}

/**
 * Severity → glyph colour. Matches the Top Findings stripe exactly
 * (red-500 / orange-500 / brand-500) so a row's icon, stripe, and
 * impact label all carry the same hue.
 */
function severityGlyphColour(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "text-red-500";
    case "high":
      return "text-red-500";
    case "medium":
      return "text-orange-500";
    case "low":
      return "text-brand-500";
    case "info":
      return "text-brand-500";
    default:
      return "text-ink-500";
  }
}

export interface FindingIconProps {
  kind: FindingKind | string;
  severity?: FindingSeverity | string;
  size?: number;
  /**
   * When true, render only the glyph (no background tile, no border).
   * Used by the top-findings card where the row already carries its
   * own severity stripe and a coloured tile would compete with it.
   */
  bare?: boolean;
  className?: string;
}

/**
 * Severity-driven icon used in the top-findings list. When `bare` is
 * true (the default for the overview card), the icon is just a small
 * monochrome glyph tinted by severity. Without `bare`, the icon falls
 * back to a coloured tile for callers that want the legacy look.
 */
export function FindingIcon({
  severity,
  size = 18,
  bare = false,
  className,
}: FindingIconProps) {
  const glyph = severity ? iconForSeverity(severity) : <Info className="h-4 w-4" />;
  if (bare) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          severity ? severityGlyphColour(severity) : "text-ink-500",
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {glyph}
      </span>
    );
  }
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-600",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {glyph}
    </div>
  );
}

/* ---------- Finding kind helpers (label + per-kind subline) ---------- */

export function findingTitle(
  kind: FindingKind | string,
  column: string | null,
): string {
  switch (kind) {
    case "missingness":
      return column ? `Missing values in ${column}` : "Missing values";
    case "duplicates":
      return "Duplicate records";
    case "outlier":
      return column ? `Outliers in ${column}` : "Outliers";
    case "invalid_values":
      return column ? `Invalid ${column} values` : "Invalid values";
    case "cardinality":
      return column ? `High cardinality in ${column}` : "High cardinality";
    default:
      return "Quality issue";
  }
}

export function findingSubline(
  kind: FindingKind | string,
  value: number,
  threshold: number,
): string {
  switch (kind) {
    case "missingness":
      return `Affects ${(value * 100).toFixed(1)}% of rows`;
    case "duplicates": {
      // Backend value is the duplicate fraction. Show as X% + a raw count style.
      return `${(value * 100).toFixed(1)}% duplicate rows detected`;
    }
    case "outlier":
      return `${(value * 100).toFixed(1)}% of values are outliers`;
    case "invalid_values":
      return `${(value * 100).toFixed(1)}% of values do not match pattern`;
    case "cardinality":
      return `${Math.round(value)} unique values`;
    default:
      return `value ${value.toFixed(2)} (threshold ${threshold.toFixed(2)})`;
  }
}
