import type { FindingSeverity } from '../../types/api'
import { cn } from '../../lib/utils'

const severityTone: Record<FindingSeverity, { label: string; classes: string }> = {
  critical: { label: 'Critical', classes: 'border-danger/40 bg-danger/15 text-danger' },
  high: { label: 'High', classes: 'border-danger/30 bg-danger/10 text-danger' },
  medium: { label: 'Medium', classes: 'border-warning/30 bg-warning/10 text-warning' },
  low: { label: 'Low', classes: 'border-info/30 bg-info/10 text-info' },
  info: { label: 'Info', classes: 'border-line bg-elevated text-muted' },
}

const gradeTone: Record<string, string> = {
  A: 'border-success/30 bg-success/10 text-success',
  B: 'border-success/30 bg-success/10 text-success',
  C: 'border-warning/30 bg-warning/10 text-warning',
  D: 'border-warning/30 bg-warning/10 text-warning',
  F: 'border-danger/30 bg-danger/10 text-danger',
}

interface SeverityBadgeProps {
  severity: FindingSeverity
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const tone = severityTone[severity]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
        tone.classes,
        className,
      )}
    >
      {tone.label}
    </span>
  )
}

interface GradeBadgeProps {
  grade: string
  className?: string
}

export function GradeBadge({ grade, className }: GradeBadgeProps) {
  const tone = gradeTone[grade] ?? 'border-line bg-elevated text-muted'
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded border text-base font-semibold tracking-tight',
        tone,
        className,
      )}
    >
      {grade}
    </span>
  )
}
