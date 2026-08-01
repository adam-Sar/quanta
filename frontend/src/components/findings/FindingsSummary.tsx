import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'

import type { FindingKind, FindingResponse, FindingSeverity } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface FindingsSummaryProps {
  items: FindingResponse[]
  totalCount: number
}

const severityOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const kindLabels: Record<FindingKind, string> = {
  missingness: 'Missingness',
  duplicates: 'Duplicates',
  invalid_values: 'Invalid values',
  outlier: 'Outliers',
  cardinality: 'Cardinality',
}

function severityTone(severity: FindingSeverity): 'danger' | 'warning' | 'info' | 'muted' {
  if (severity === 'critical' || severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  if (severity === 'low') return 'info'
  return 'muted'
}

export function FindingsSummary({ items, totalCount }: FindingsSummaryProps) {
  const severityCounts = useMemo(() => {
    const counts: Record<FindingSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }
    for (const finding of items) {
      counts[finding.severity] += 1
    }
    return counts
  }, [items])

  const kindCounts = useMemo(() => {
    const counts: Record<FindingKind, number> = {
      missingness: 0,
      duplicates: 0,
      invalid_values: 0,
      outlier: 0,
      cardinality: 0,
    }
    for (const finding of items) {
      counts[finding.kind] += 1
    }
    return counts
  }, [items])

  const totalLoaded = items.length
  const totalSeverity = severityOrder.reduce((sum, severity) => sum + severityCounts[severity], 0)
  const totalKind = (Object.keys(kindCounts) as FindingKind[]).reduce((sum, kind) => sum + kindCounts[kind], 0)
  const totalRepresented = totalSeverity === totalKind ? totalSeverity : totalLoaded

  return (
    <Panel>
      <SectionHeading
        description="The breakdown reflects the findings loaded into this page. Backend pagination is unchanged; severities and detector types are always presented with their text labels."
        eyebrow="Signal"
        title="Findings summary"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{formatNumber(totalRepresented)} loaded</Badge>
            <Badge dot tone="muted">{formatNumber(totalCount)} total</Badge>
          </div>
        }
      />

      <div className="mt-6 space-y-5">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By severity</h3>
          <div className="mt-3 space-y-2">
            {severityOrder.map((severity) => {
              const count = severityCounts[severity]
              const percent = totalRepresented > 0 ? Math.round((count / totalRepresented) * 100) : 0
              return (
                <div className="flex items-center gap-3 text-xs" key={severity}>
                  <div className="flex w-20 items-center gap-2">
                    <Badge dot tone={severityTone(severity)}>{severity}</Badge>
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas/30">
                    <div
                      aria-hidden="true"
                      className="h-full rounded-full bg-accent/60"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="w-20 text-right font-mono text-ink">{formatNumber(count)}</p>
                  <p className="w-12 text-right text-[11px] text-muted">{percent}%</p>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By detector</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {(Object.keys(kindLabels) as FindingKind[]).map((kind) => {
              const count = kindCounts[kind]
              return (
                <div className="rounded-md border border-line bg-canvas/30 px-4 py-3" key={kind}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{kindLabels[kind]}</p>
                  <p className="mt-2 font-mono text-base text-ink">{formatNumber(count)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <BarChart3 aria-hidden="true" size={14} />
        <span>The summary is computed from the loaded findings; switch pages to refresh it.</span>
      </div>
    </Panel>
  )
}
