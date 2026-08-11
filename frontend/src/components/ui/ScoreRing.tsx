import { ReactNode, useId } from "react";

export interface ScoreRingProps {
  /** 0..100 */
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: ReactNode;
}

/**
 * Circular determinate progress ring. Uses a unique gradient id per
 * instance so multiple rings on the same page don't share a single
 * <linearGradient> defs entry.
 */
export function ScoreRing({
  score,
  size = 84,
  stroke = 8,
  className,
  label,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const gradId = `score-ring-grad-${useId()}`;
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${Math.round(clamped)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6970ff" />
            <stop offset="100%" stopColor="#8e96ff" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#eef0f3"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.22,0.61,0.36,1)",
          }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-lg font-semibold tnum text-ink-900">
        {label ?? Math.round(clamped)}
      </div>
    </div>
  );
}
