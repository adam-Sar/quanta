import type { FindingSeverity } from '../../types/api'
import { cn } from '../../lib/utils'

const severityTone: Record<FindingSeverity, { label: string; classes: string }> = {
  critical: { label: 'Critical', classes: 'border-rose-300 bg-rose-100 text-rose-800' },
  high: { label: 'High', classes: 'border-rose-200 bg-rose-50 text-rose-700' },
  medium: { label: 'Medium', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  low: { label: 'Low', classes: 'border-sky-200 bg-sky-50 text-sky-700' },
  info: { label: 'Info', classes: 'border-line bg-canvas text-muted' },
}

const gradeTone: Record<string, string> = {
  A: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  B: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  C: 'border-amber-200 bg-amber-50 text-amber-800',
  D: 'border-amber-200 bg-amber-50 text-amber-800',
  F: 'border-rose-200 bg-rose-50 text-rose-700',
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
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
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
  const tone = gradeTone[grade] ?? 'border-line bg-canvas text-muted'
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded border text-base font-semibold',
        tone,
        className,
      )}
    >
      {grade}
    </span>
  )
}
