import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendProps {
  /** Numeric delta. Sign is interpreted via `direction`. */
  delta: number;
  suffix?: string;
  className?: string;
  /**
   * Whether an upward delta is "good" (green/brand) or "bad" (red).
   *
   * - `"good_when_up"` (default) — for scores, completeness, validity,
   *   uniqueness, timeliness.
   * - `"good_when_down"` — for finding counts, error counts, anything
   *   where up means worse.
   */
  direction?: "good_when_up" | "good_when_down";
}

export function Trend({
  delta,
  suffix = "%",
  className,
  direction = "good_when_up",
}: TrendProps) {
  const isFlat = delta === 0;
  // For "good_when_down", an upward delta is bad, so invert the icon
  // choice and the colour mapping.
  const arrowUp = direction === "good_when_up" ? delta > 0 : delta < 0;
  const Icon = arrowUp ? ArrowUp : ArrowDown;
  const goodColor = direction === "good_when_up" ? "text-sev-low" : "text-sev-critical";
  const badColor = direction === "good_when_up" ? "text-sev-critical" : "text-sev-low";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tnum",
        isFlat && "text-ink-500",
        !isFlat && (arrowUp ? goodColor : badColor),
        className,
      )}
      aria-label={
        isFlat
          ? "No change"
          : `${arrowUp ? "Up" : "Down"} ${Math.abs(delta).toFixed(1)}${suffix}`
      }
    >
      {!isFlat && <Icon className="h-3 w-3" aria-hidden />}
      {Math.abs(delta).toFixed(1)}
      {suffix}
    </span>
  );
}
