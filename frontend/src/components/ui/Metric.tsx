import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MetricProps {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  trend?: ReactNode;
  className?: string;
}

export function Metric({ label, value, helper, trend, className }: MetricProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="label-eyebrow">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-semibold tracking-tight text-ink-900 tnum">
          {value}
        </div>
        {trend}
      </div>
      {helper && <div className="text-sm text-ink-500">{helper}</div>}
    </div>
  );
}
