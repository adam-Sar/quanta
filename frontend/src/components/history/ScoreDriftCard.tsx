import { Gauge, TrendingDown, TrendingUp } from 'lucide-react'

import type { ScoreDriftResponse } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface ScoreDriftCardProps {
  scoreDrift: ScoreDriftResponse | null
}

const SCORE_MEDIUM = 10
const SCORE_HIGH = 20

function deltaTone(delta: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  if (delta === null) return 'muted'
  const abs = Math.abs(delta)
  if (abs >= SCORE_HIGH) return 'danger'
  if (abs >= SCORE_MEDIUM) return 'warning'
  return 'success'
}

function deltaLabel(delta: number | null): string {
  if (delta === null) return 'Missing'
  const abs = Math.abs(delta)
  if (abs >= SCORE_HIGH) return 'Hard score drift'
  if (abs >= SCORE_MEDIUM) return 'Soft score drift'
  return 'Within band'
}

function formatNullableScore(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(1)
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}`
}

export function ScoreDriftCard({ scoreDrift }: ScoreDriftCardProps) {
  if (!scoreDrift) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Pick a comparison to inspect its deterministic quality-score drift."
          eyebrow="Score drift"
          title="No comparison selected"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const { base_score, target_score, delta, absolute_delta, base_grade, target_grade, grade_changed } = scoreDrift
  const directionIcon = delta === null ? null : delta > 0 ? <TrendingUp aria-hidden="true" className="text-success" size={16} /> : delta < 0 ? <TrendingDown aria-hidden="true" className="text-danger" size={16} /> : null

  return (
    <Panel>
      <SectionHeading
        description="The backend reads the immutable Task 5 score row for each version and reports the absolute delta, the absolute change, and the grade change. The frontend never recomputes the score."
        eyebrow="Score drift"
        title="Quality score"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={deltaTone(delta)}>{deltaLabel(delta)}</Badge>
            {grade_changed ? <Badge dot tone="warning">Grade changed</Badge> : null}
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Base score</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{formatNullableScore(base_score)}</span>
            {base_grade ? <span className="ml-2 font-mono text-xs text-muted">grade {base_grade}</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">quality score on the base version</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Target score</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{formatNullableScore(target_score)}</span>
            {target_grade ? <span className="ml-2 font-mono text-xs text-muted">grade {target_grade}</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">quality score on the target version</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Delta</p>
          <p className="mt-2 flex items-center gap-2 text-base font-semibold text-ink">
            {directionIcon}
            <span className="font-mono">{formatDelta(delta)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{formatNumber(absolute_delta ?? null, 1)} absolute</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Grade</p>
          <p className="mt-2 text-base font-semibold text-ink">
            {base_grade && target_grade ? (
              <span className="flex items-center gap-2 font-mono">
                <span>{base_grade}</span>
                <span aria-hidden="true">→</span>
                <span className={grade_changed ? 'text-warning' : ''}>{target_grade}</span>
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">{grade_changed ? 'letter grade changed' : 'letter grade unchanged'}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Gauge aria-hidden="true" size={14} />
        <span>Thresholds: low ±5, medium ±10, high ±20 — see HISTORY_SCORE_DELTA_* settings.</span>
      </div>
    </Panel>
  )
}
