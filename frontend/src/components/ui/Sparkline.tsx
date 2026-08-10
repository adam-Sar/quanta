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

  // Compute the Y-domain ourselves instead of using Math.min(...values),
  // which returns Infinity/-Infinity for empty arrays and produces a
  // degenerate / silently-failing chart in recharts.
  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { min: lo, max: hi };
  }, [values]);

  const hasSeries = data.length >= 2;

  // When we don't have at least two data points, recharts renders a
  // degenerate single dot that visibly "slides in from the right" while
  // ResponsiveContainer finishes its first measurement — which looks like
  // the chart is broken (it shows only one dot, then sits under the CSV
  // icon when the hero row reflows). Render a clean flat baseline instead.
  if (!hasSeries) {
    return (
      <div className={className} style={{ height, width: "100%" }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="#5b6cff"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </svg>
        {delta !== undefined && (
          <span className="ml-1 text-xs text-ink-500">Δ {delta.toFixed(1)}</span>
        )}
      </div>
    );
  }

  // Pad so the line never sits flush against the top/bottom edge.
  // When min === max the range is zero — fall back to ±1 so the line is
  // vertically centred instead of collapsing to a flat line at one edge.
  const pad = (max - min) * 0.1 || 1;
  const yDomain: [number, number] = [min - pad, max + pad];

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
          <YAxis hide domain={yDomain} />
          <Area
            type="monotone"
            dataKey="v"
            stroke="#5b6cff"
            strokeWidth={2}
            fill="url(#sparkFill)"
            // Disable both data and size animations so the chart paints in
            // its final form the moment ResponsiveContainer finishes its
            // first measurement — no more "sweep in from the right".
            isAnimationActive={false}
            animationDuration={0}
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
