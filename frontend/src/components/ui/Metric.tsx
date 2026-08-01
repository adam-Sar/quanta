import type { LucideIcon } from 'lucide-react'

import { cn } from '../../lib/utils'

interface MetricProps {
  label: string
  value: string
  detail?: string
  icon?: LucideIcon
  tone?: 'accent' | 'success' | 'warning' | 'muted'
}

const iconToneClasses = {
  accent: 'bg-accent-tint text-accent',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  muted: 'bg-canvas text-muted',
}

export function Metric({ label, value, detail, icon: Icon, tone = 'muted' }: MetricProps) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        {Icon ? (
          <span className={cn('rounded p-1.5', iconToneClasses[tone])}>
            <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  )
}
