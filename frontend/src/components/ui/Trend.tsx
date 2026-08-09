import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendProps {
  delta: number; // positive = up, negative = down
  suffix?: string;
  className?: string;
}

export function Trend({ delta, suffix = "%", className }: TrendProps) {
  const isUp = delta > 0;
  const isFlat = delta === 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tnum",
        isFlat && "text-ink-500",
        isUp && "text-sev-low",
        !isUp && !isFlat && "text-sev-critical",
        className,
      )}
    >
      {!isFlat && <Icon className="h-3 w-3" />}
      {Math.abs(delta).toFixed(1)}
      {suffix}
    </span>
  );
}
