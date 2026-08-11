import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- Formatting helpers ---------- */

const compact = new Intl.NumberFormat("en", { notation: "compact" });
const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const decimal4 = new Intl.NumberFormat("en", { maximumFractionDigits: 4 });
const percent = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return compact.format(n);
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${decimal.format(v)} ${units[i]}`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return "—";
  if (rate <= 1) return percent.format(rate);
  return percent.format(rate / 100);
}

export function formatDecimal4(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return decimal4.format(n);
}

/**
 * Null-safe fixed-precision formatter used for finding/measurement
 * values that the backend may report as null (e.g. when a metric
 * wasn't computable for a column type). Falls back to "—" instead
 * of throwing on null/undefined.
 */
export function formatMetric(
  n: number | null | undefined,
  digits = 2,
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** SeverityDot palette mirroring `tailwind.config.js` `sev.*` tokens. */
export const severityColor: Record<string, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  info: "bg-sev-info",
};

export function formatRelativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function truncateHash(h: string | null | undefined, n = 12): string {
  if (!h) return "—";
  return h.length > n ? `${h.slice(0, n)}…` : h;
}

export function severityClass(sev: string | null | undefined): string {
  switch ((sev ?? "").toLowerCase()) {
    case "critical":
      return "sev-critical";
    case "high":
      return "sev-high";
    case "medium":
      return "sev-medium";
    case "low":
      return "sev-low";
    case "info":
      return "sev-info";
    default:
      return "text-ink-500";
  }
}

export function severityRank(sev: string | null | undefined): number {
  switch ((sev ?? "").toLowerCase()) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

export function kindLabel(kind: string | null | undefined): string {
  switch ((kind ?? "").toLowerCase()) {
    case "missingness":
      return "Missingness";
    case "duplicates":
      return "Duplicates";
    case "invalid_values":
      return "Invalid values";
    case "outlier":
      return "Outliers";
    case "cardinality":
      return "Cardinality";
    case "data_quality_fix":
      return "Data quality fix";
    case "duplicate_removal":
      return "Duplicate removal";
    case "outlier_treatment":
      return "Outlier treatment";
    case "schema_normalization":
      return "Schema normalization";
    case "cardinality_reduction":
      return "Cardinality reduction";
    case "missingness_treatment":
      return "Missingness treatment";
    case "pipeline_review":
      return "Pipeline review";
    default:
      return kind ?? "—";
  }
}

export function statusToTone(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "succeeded":
      return "sev-low";
    case "failed":
      return "sev-critical";
    case "running":
      return "sev-info";
    case "pending":
      return "text-ink-500";
    case "stored":
      return "sev-low";
    case "validated":
      return "sev-low";
    default:
      return "text-ink-500";
  }
}
