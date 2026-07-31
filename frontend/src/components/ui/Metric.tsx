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
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'bg-elevated text-muted',
}

export function Metric({ label, value, detail, icon: Icon, tone = 'muted' }: MetricProps) {
  return (
    <div className="rounded-md border border-line bg-canvas/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon ? (
          <span className={cn('rounded p-1.5', iconToneClasses[tone])}>
            <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-xl font-semibold tracking-tight text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  )
}
