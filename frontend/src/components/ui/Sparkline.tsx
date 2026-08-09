import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export interface SparklineProps {
  values: number[];
  height?: number;
  className?: string;
  /** "up" green arrow on the right edge, "down" red */
  delta?: number;
}

export function Sparkline({ values, height = 56, className, delta }: SparklineProps) {
  const data = useMemo(
    () => values.map((v, i) => ({ i, v })),
    [values],
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.1 || 1;
  return (
    <div className={className} style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b6cff" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#5b6cff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            hide
            domain={[min - pad, max + pad]}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke="#5b6cff"
            strokeWidth={2}
            fill="url(#sparkFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {delta !== undefined && (
        <span className="ml-1 text-xs text-ink-500">Δ {delta.toFixed(1)}</span>
      )}
    </div>
  );
}
