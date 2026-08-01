import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
}

export function Panel({ className, padded = true, ...props }: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-line bg-surface shadow-panel',
        padded && 'p-5',
        className,
      )}
      {...props}
    />
  )
}

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}

export function SectionHeading({ eyebrow, title, description, action }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
