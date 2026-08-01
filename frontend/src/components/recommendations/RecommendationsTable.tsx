import { useMemo, useState } from 'react'
import { ArrowUpDown, Eye, FileCheck2 } from 'lucide-react'

import type { RecommendationResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

type SortKey = 'created_at' | 'severity' | 'priority' | 'confidence' | 'kind'

interface RecommendationsTableProps {
  runs: RecommendationResponse[]
  selectedRecommendationId: string | null
  onSelectRecommendation: (recommendationId: string) => void
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (next: number) => void
}

function SortButton({ active, direction, label, onClick }: { active: boolean; direction: 'asc' | 'desc'; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={onClick} type="button">
      {label}
      <ArrowUpDown aria-hidden="true" className={active ? 'text-accent' : 'text-muted'} size={13} />
      {active ? <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span> : null}
    </button>
  )
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

function severityTone(severity: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (severity === 'critical' || severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  if (severity === 'low') return 'muted'
  return 'success'
}

const KIND_LABELS: Record<string, string> = {
  data_quality_fix: 'Data quality fix',
  duplicate_removal: 'Duplicate removal',
  outlier_treatment: 'Outlier treatment',
  schema_normalization: 'Schema normalization',
  cardinality_reduction: 'Cardinality reduction',
  missingness_treatment: 'Missingness',
  pipeline_review: 'Pipeline review',
}

export function RecommendationsTable({
  runs,
  selectedRecommendationId,
  onSelectRecommendation,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: RecommendationsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'kind' ? 'asc' : 'desc')
  }

  const sorted = useMemo(() => {
    return [...runs].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'created_at') {
        comparison = left.created_at.localeCompare(right.created_at)
      } else if (sortKey === 'severity') {
        comparison = (SEVERITY_ORDER[left.severity] ?? 0) - (SEVERITY_ORDER[right.severity] ?? 0)
      } else if (sortKey === 'priority') {
        comparison = left.priority - right.priority
      } else if (sortKey === 'confidence') {
        comparison = left.confidence - right.confidence
      } else if (sortKey === 'kind') {
        comparison = left.kind.localeCompare(right.kind)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [runs, sortKey, sortDirection])

  if (runs.length === 0) {
    return (
      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every recommendation run is persisted as an immutable recommendations row bound to the latest detection batch. Run the rule engine from above to compute the first batch."
            eyebrow="Recommendations"
            title="Recommendation history"
            action={<Badge dot tone="muted">No runs</Badge>}
          />
        </div>
        <div className="p-5">
          <EmptyState
            className="py-8"
            description="The deterministic rule engine has not been run for this dataset yet. Trigger a run above to compute the first batch."
            icon={FileCheck2}
            title="No recommendations"
          />
        </div>
      </Panel>
    )
  }

  return (
    <Panel padded={false}>
      <div className="border-b border-line px-5 py-5">
        <SectionHeading
          description="Every recommendation run is persisted as an immutable recommendations row bound to the latest detection batch. Click a row to load its detail above."
          eyebrow="Recommendations"
          title="Recommendation history"
          action={
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Badge dot tone="muted">{formatNumber(totalItems)} total</Badge>
            </div>
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2">Recommendation id</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'kind'} direction={sortDirection} label="Kind" onClick={() => handleSort('kind')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'severity'} direction={sortDirection} label="Severity" onClick={() => handleSort('severity')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'priority'} direction={sortDirection} label="Priority" onClick={() => handleSort('priority')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'confidence'} direction={sortDirection} label="Confidence" onClick={() => handleSort('confidence')} /></th>
              <th className="px-3 py-2">Columns</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'created_at'} direction={sortDirection} label="Created" onClick={() => handleSort('created_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.recommendation_id === selectedRecommendationId
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/40 last:border-b-0 hover:bg-canvas',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={row.recommendation_id}
                  onClick={() => onSelectRecommendation(row.recommendation_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{row.recommendation_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{row.formula_version}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">
                    {KIND_LABELS[row.kind] ?? row.kind}
                  </td>
                  <td className="px-3 py-2">
                    <Badge dot tone={severityTone(row.severity)}>{row.severity}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(row.priority)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {(row.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {row.affected_columns.length > 0 ? row.affected_columns.join(', ') : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{formatTimestamp(row.created_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect recommendation ${row.recommendation_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectRecommendation(row.recommendation_id)
                      }}
                      size="sm"
                      variant={isSelected ? 'primary' : 'secondary'}
                    >
                      <Eye aria-hidden="true" size={12} />
                      {isSelected ? 'Selected' : 'Inspect'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-start gap-2 border-t border-line px-5 py-3.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total recommendations · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
          <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
        </div>
      </div>
    </Panel>
  )
}
