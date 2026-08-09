import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number; // 0..1
  variant?: "brand" | "severity";
  className?: string;
  height?: number;
  showTarget?: boolean;
}

function colourFor(value: number): string {
  if (value >= 0.95) return "bg-sev-low";
  if (value >= 0.85) return "bg-brand-500";
  if (value >= 0.7) return "bg-sev-medium";
  if (value >= 0.5) return "bg-sev-high";
  return "bg-sev-critical";
}

export function ProgressBar({
  value,
  variant = "brand",
  className,
  height = 4,
  showTarget,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const fill =
    variant === "severity" ? colourFor(clamped) : "bg-brand-500";
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-ink-100", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all", fill)}
        style={{ width: `${clamped * 100}%` }}
      />
      {showTarget && (
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-300"
          style={{ left: `${Math.round((showTarget as unknown as number) * 100)}%` }}
        />
      )}
    </div>
  );
}
