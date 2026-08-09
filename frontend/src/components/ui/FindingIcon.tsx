import {
  AlertTriangle,
  Hash,
  Layers,
  Mail,
  Phone,
  TrendingUp,
} from "lucide-react";
import { ReactNode } from "react";

import type { FindingKind, FindingSeverity } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * Matching icon + colour for a finding kind. Returned by `iconForFinding`.
 * The colour drives the small left-tile on each top-findings card.
 */
function iconForFinding(kind: FindingKind | string): {
  icon: ReactNode;
  tile: string;
} {
  switch (kind) {
    case "missingness":
      return {
        icon: <Mail className="h-4 w-4" />,
        tile: "bg-red-50 text-sev-critical",
      };
    case "duplicates":
      return {
        icon: <Layers className="h-4 w-4" />,
        tile: "bg-red-50 text-sev-critical",
      };
    case "outlier":
      return {
        icon: <TrendingUp className="h-4 w-4" />,
        tile: "bg-orange-50 text-sev-high",
      };
    case "invalid_values":
      return {
        icon: <Phone className="h-4 w-4" />,
        tile: "bg-violet-50 text-violet-600",
      };
    case "cardinality":
      return {
        icon: <Hash className="h-4 w-4" />,
        tile: "bg-brand-50 text-brand-600",
      };
    default:
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        tile: "bg-ink-50 text-ink-600",
      };
  }
}

export interface FindingIconProps {
  kind: FindingKind | string;
  severity?: FindingSeverity | string;
  size?: number;
  className?: string;
}

/**
 * Small coloured icon tile used in the top-findings list.
 * Severity overrides the default kind colour when supplied.
 */
export function FindingIcon({
  kind,
  severity,
  size = 40,
  className,
}: FindingIconProps) {
  const fallback = iconForFinding(kind);
  const tile = severity
    ? severityTile(severity)
    : fallback.tile;
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        tile,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {fallback.icon}
    </div>
  );
}

function severityTile(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-red-50 text-sev-critical";
    case "high":
      return "bg-red-50 text-sev-high";
    case "medium":
      return "bg-orange-50 text-sev-medium";
    case "low":
      return "bg-brand-50 text-brand-600";
    case "info":
      return "bg-violet-50 text-violet-600";
    default:
      return "bg-ink-50 text-ink-600";
  }
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
