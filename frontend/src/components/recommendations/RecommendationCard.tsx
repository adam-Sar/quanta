import { FileSearch2, KeyRound, ListTree, Sparkles } from 'lucide-react'

import type { OperationKind, RecommendationKind, RecommendationResponse, RecommendationSeverity } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface RecommendationCardProps {
  recommendation: RecommendationResponse | null
}

const KIND_LABELS: Record<RecommendationKind, string> = {
  data_quality_fix: 'Data quality fix',
  duplicate_removal: 'Duplicate removal',
  outlier_treatment: 'Outlier treatment',
  schema_normalization: 'Schema normalization',
  cardinality_reduction: 'Cardinality reduction',
  missingness_treatment: 'Missingness treatment',
  pipeline_review: 'Pipeline review',
}

const OPERATION_LABELS: Record<OperationKind, string> = {
  impute_missing: 'Impute missing',
  drop_column: 'Drop column',
  drop_duplicates: 'Drop duplicates',
  cap_outliers: 'Cap outliers',
  cast_type: 'Cast type',
  group_rare_categorical: 'Group rare categorical',
  review: 'Review',
}

function severityTone(severity: RecommendationSeverity): 'success' | 'warning' | 'danger' | 'muted' {
  if (severity === 'critical' || severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  if (severity === 'low') return 'muted'
  return 'success'
}

function priorityTone(priority: number): 'success' | 'warning' | 'danger' | 'muted' {
  if (priority >= 70) return 'danger'
  if (priority >= 30) return 'warning'
  if (priority > 0) return 'muted'
  return 'success'
}

function formatOperationParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
  if (entries.length === 0) return 'no parameters'
  return entries
    .slice(0, 4)
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}=${value}`
      return `${key}=${JSON.stringify(value)}`
    })
    .join(', ')
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  if (!recommendation) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a recommendation to inspect its kind, severity, affected columns, supporting finding ids, and preview-only operation."
          eyebrow="Recommendation"
          title="Pick a recommendation"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionHeading
        description="The backend persists the deterministic rule-engine output on every recommendation row. The frontend never recomputes priority, confidence, or severity."
        eyebrow="Recommendation"
        title={recommendation.title}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={severityTone(recommendation.severity)}>{recommendation.severity}</Badge>
            <Badge dot tone={priorityTone(recommendation.priority)}>priority {recommendation.priority}</Badge>
            <Badge dot tone="muted">{KIND_LABELS[recommendation.kind]}</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Kind</p>
          <p className="mt-2 text-base font-semibold text-ink">{KIND_LABELS[recommendation.kind]}</p>
          <p className="mt-1 text-xs text-muted font-mono">{recommendation.kind}</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Confidence</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{(recommendation.confidence * 100).toFixed(0)}%</span>
          </p>
          <p className="mt-1 text-xs text-muted">deterministic from the rule engine</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Priority</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{formatNumber(recommendation.priority)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">severity weight × confidence</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Affected columns</p>
          <p className="mt-2 text-base font-semibold text-ink">{formatNumber(recommendation.affected_columns.length)}</p>
          <p className="mt-1 text-xs text-muted">referenced by this row</p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <Sparkles aria-hidden="true" size={14} />
          Rationale
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink">{recommendation.rationale}</p>
      </div>

      {recommendation.operation ? (
        <div className="mt-6 rounded-md border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-ink">
            <FileSearch2 aria-hidden="true" size={14} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Preview-only operation</h3>
            <Badge dot tone="warning">preview_only</Badge>
          </div>
          <p className="mt-2 text-sm">
            <span className="font-mono text-ink">{OPERATION_LABELS[recommendation.operation.kind]}</span>{' '}
            <span className="text-muted">({formatOperationParams(recommendation.operation.params)})</span>
          </p>
        </div>
      ) : null}

      {recommendation.affected_columns.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <ListTree aria-hidden="true" size={14} />
            Affected columns
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recommendation.affected_columns.map((column) => (
              <Badge dot key={`${recommendation.recommendation_id}-${column}`} tone="muted">{column}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <KeyRound aria-hidden="true" size={14} />
        <span>Recommendation id <span className="font-mono text-ink-soft">{recommendation.recommendation_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Created {formatTimestamp(recommendation.created_at)}</span>
      </div>
    </Panel>
  )
}
