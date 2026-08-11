import { cn } from "@/lib/utils";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export interface SeverityFilterProps {
  /** Currently-selected severity, or null for "all". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Override the visible order (defaults to critical → info). */
  options?: readonly string[];
  className?: string;
}

/**
 * Chip group used to filter a findings list by severity. Single-select
 * with a null "show all" state. Kept tiny on purpose — it's used in
 * two places that must look and behave identically.
 */
export function SeverityFilter({
  value,
  onChange,
  options = SEVERITIES,
  className,
}: SeverityFilterProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter by severity"
      className={cn("flex items-center gap-1", className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        className={cn(
          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
          value === null
            ? "bg-ink-900 text-white"
            : "bg-ink-50 text-ink-700 hover:bg-ink-100",
        )}
      >
        All
      </button>
      {options.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(value === s ? null : s)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
            value === s
              ? "bg-ink-900 text-white"
              : "bg-ink-50 text-ink-700 hover:bg-ink-100",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}