import { Brain, ListTree } from 'lucide-react'

import type { HypothesisCategory, HypothesisResponse } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface HypothesisCardProps {
  hypothesis: HypothesisResponse | null
}

const CATEGORY_LABELS: Record<HypothesisCategory, string> = {
  schema_drift: 'Schema drift',
  data_quality: 'Data quality',
  pipeline: 'Pipeline',
  upstream_source: 'Upstream source',
  other: 'Other',
}

const CATEGORY_TONES: Record<HypothesisCategory, 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  schema_drift: 'warning',
  data_quality: 'warning',
  pipeline: 'info',
  upstream_source: 'info',
  other: 'muted',
}

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' | 'muted' {
  if (confidence >= 0.75) return 'success'
  if (confidence >= 0.4) return 'warning'
  if (confidence > 0) return 'danger'
  return 'muted'
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High confidence'
  if (confidence >= 0.4) return 'Medium confidence'
  if (confidence > 0) return 'Low confidence'
  return 'No confidence'
}

export function HypothesisCard({ hypothesis }: HypothesisCardProps) {
  if (!hypothesis) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a hypothesis from the table to inspect its category, affected columns, and supporting finding ids."
          eyebrow="Hypothesis"
          title="Pick a hypothesis"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionHeading
        description="The backend persists the hypothesis category, summary, affected columns, supporting finding ids, and confidence as a JSONB payload. The frontend never recomputes them."
        eyebrow="Hypothesis"
        title={CATEGORY_LABELS[hypothesis.category]}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={CATEGORY_TONES[hypothesis.category]}>{hypothesis.category.replace('_', ' ')}</Badge>
            <Badge dot tone={confidenceTone(hypothesis.confidence)}>
              {confidenceLabel(hypothesis.confidence)} · {(hypothesis.confidence * 100).toFixed(0)}%
            </Badge>
          </div>
        }
      />

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <Brain aria-hidden="true" size={14} />
          Summary
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink">{hypothesis.summary}</p>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <ListTree aria-hidden="true" size={14} />
          Affected columns
        </h3>
        {hypothesis.affected_columns.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No specific columns are tied to this hypothesis.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hypothesis.affected_columns.map((column) => (
              <Badge dot key={`${hypothesis.category}-${column}`} tone="muted">{column}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Supporting findings</h3>
        {hypothesis.supporting_finding_ids.length === 0 ? (
          <p className="mt-2 text-sm text-muted">This hypothesis does not reference any persisted finding.</p>
        ) : (
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted">
            {hypothesis.supporting_finding_ids.map((id) => (
              <li className="rounded border border-line bg-surface-2 px-3 py-1.5" key={`${hypothesis.category}-${id}`}>
                <span className="text-ink">{id.slice(0, 8)}</span>
                <span className="ml-2 text-muted">…{id.slice(-4)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted">
        <span>Confidence <span className="font-mono text-ink-soft">{formatNumber(hypothesis.confidence, 2)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Category <span className="font-mono text-ink-soft">{hypothesis.category}</span></span>
      </div>
    </Panel>
  )
}
