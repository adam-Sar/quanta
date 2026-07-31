import { Gauge } from 'lucide-react'
import { useMemo } from 'react'

import type { ScoreComponents, QualityScoreResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { GradeBadge } from '../ui/SeverityBadge'
import { Panel, SectionHeading } from '../ui/Panel'

interface QualityScoreCardProps {
  score: QualityScoreResponse
  components: ScoreComponents
}

function breakdownRows(components: ScoreComponents) {
  return [
    { label: 'Missingness', entry: components.by_kind.missingness },
    { label: 'Duplicates', entry: components.by_kind.duplicates },
    { label: 'Invalid values', entry: components.by_kind.invalid_values },
    { label: 'Outliers', entry: components.by_kind.outlier },
    { label: 'Cardinality', entry: components.by_kind.cardinality },
  ]
}

function severityRows(components: ScoreComponents) {
  return (['critical', 'high', 'medium', 'low', 'info'] as const)
    .map((severity) => ({ label: severity.toUpperCase(), entry: components.by_severity[severity] }))
    .filter((row) => row.entry)
}

function formatPenalty(value: number | undefined) {
  if (value === undefined) return '—'
  return value.toFixed(3)
}

export function QualityScoreCard({ score, components }: QualityScoreCardProps) {
  const maxByKind = useMemo(() => {
    return Math.max(0.0001, ...breakdownRows(components).map(({ entry }) => entry?.penalty_normalized ?? 0))
  }, [components])

  return (
    <Panel>
      <SectionHeading
        description="The backend calculates this score deterministically from the latest finding batch. The frontend never recomputes it."
        eyebrow="Authoritative score"
        title="Quality score"
      />

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="flex w-full flex-col gap-4 rounded-md border border-line bg-canvas/30 p-5 lg:w-72">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GradeBadge grade={score.grade} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Score</p>
                <p className="text-3xl font-semibold tracking-tight text-ink">{score.score.toFixed(1)}<span className="text-base text-muted"> / 100</span></p>
              </div>
            </div>
            <Badge dot tone="accent" className="shrink-0">{score.formula_version}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-muted">Findings aggregated</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{formatNumber(score.finding_count)}</dd>
            </div>
            <div>
              <dt className="text-muted">Penalty total</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{formatPenalty(components.overall_penalty_total)}</dd>
            </div>
            <div>
              <dt className="text-muted">Penalty normalized</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{formatPenalty(components.overall_penalty_normalized)}</dd>
            </div>
            <div>
              <dt className="text-muted">Column count</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{formatNumber(components.column_count)}</dd>
            </div>
          </dl>
          <div className="mt-2 border-t border-line pt-3 text-[11px] text-muted">
            <p>Scored at <span className="font-mono text-ink/80">{formatTimestamp(score.created_at)}</span></p>
          </div>
        </div>

        <div className="flex-1 space-y-6">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By detector</h3>
            <div className="mt-3 space-y-2">
              {breakdownRows(components).map(({ label, entry }) => {
                const share = entry ? entry.penalty_normalized / maxByKind : 0
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">{label}</span>
                      <span className="font-mono text-ink">{entry ? formatPenalty(entry.penalty_normalized) : '—'}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-canvas/40">
                      <div
                        className="h-full rounded bg-accent"
                        style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By severity</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {severityRows(components).map(({ label, entry }) => (
                <Badge dot key={label} tone={label === 'CRITICAL' || label === 'HIGH' ? 'danger' : label === 'MEDIUM' ? 'warning' : label === 'LOW' ? 'info' : 'muted'}>
                  {label} · {entry ? formatNumber(entry.count) : 0}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <Gauge aria-hidden="true" size={14} />
        <span>This score is computed by the backend’s deterministic formula {score.formula_version} over the Task 5 components.</span>
      </div>
    </Panel>
  )
}
