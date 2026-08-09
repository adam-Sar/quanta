import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface LineSeries {
  name: string;
  colour?: string;
  values: { x: string | number; y: number }[];
}

export interface QualityOverTimeChartProps {
  data: LineSeries[];
  height?: number;
  yDomain?: [number, number];
  yLabel?: string;
}

export function QualityOverTimeChart({
  data,
  height = 220,
  yDomain = [0, 100],
  yLabel = "Score",
}: QualityOverTimeChartProps) {
  const merged = useMemo(() => {
    const xs = new Set<string | number>();
    data.forEach((s) => s.values.forEach((p) => xs.add(p.x)));
    const sorted = Array.from(xs).sort((a, b) =>
      typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)),
    );
    return sorted.map((x) => {
      const row: Record<string, number | string> = { x };
      data.forEach((s) => {
        const match = s.values.find((p) => p.x === x);
        if (match) row[s.name] = match.y;
      });
      return row;
    });
  }, [data]);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#eef0f3" vertical={false} />
          <XAxis
            dataKey="x"
            tick={{ fill: "#9098a4", fontSize: 11 }}
            axisLine={{ stroke: "#e3e5ea" }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: "#9098a4", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: "insideLeft",
                    offset: 18,
                    style: { fill: "#9098a4", fontSize: 11 },
                  }
                : undefined
            }
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #eef0f3",
              boxShadow: "0 4px 14px rgba(13,17,28,0.06)",
              fontSize: 12,
            }}
            cursor={{ stroke: "#c0c5cd", strokeDasharray: 3 }}
          />
          {data.map((s) => (
            <Line
              key={s.name}
              dataKey={s.name}
              type="monotone"
              stroke={s.colour ?? "#5b6cff"}
              strokeWidth={2}
              dot={{ r: 2.5, stroke: "#fff", strokeWidth: 1.5, fill: s.colour ?? "#5b6cff" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
