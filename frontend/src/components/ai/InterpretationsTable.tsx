import { useMemo, useState } from 'react'
import { ArrowUpDown, Eye, Sparkles } from 'lucide-react'

import type { AIInterpretationResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

type SortKey = 'created_at' | 'confidence' | 'hypotheses' | 'provider' | 'findings'

interface InterpretationsTableProps {
  runs: AIInterpretationResponse[]
  selectedInterpretationId: string | null
  onSelectInterpretation: (interpretationId: string) => void
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
      <ArrowUpDown aria-hidden="true" className={active ? 'text-accent' : 'text-muted/60'} size={13} />
      {active ? <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span> : null}
    </button>
  )
}

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' | 'muted' {
  if (confidence >= 0.75) return 'success'
  if (confidence >= 0.4) return 'warning'
  if (confidence > 0) return 'danger'
  return 'muted'
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High'
  if (confidence >= 0.4) return 'Medium'
  if (confidence > 0) return 'Low'
  return '—'
}

export function InterpretationsTable({
  runs,
  selectedInterpretationId,
  onSelectInterpretation,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: InterpretationsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('desc')
  }

  const sorted = useMemo(() => {
    return [...runs].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'created_at') {
        comparison = left.created_at.localeCompare(right.created_at)
      } else if (sortKey === 'confidence') {
        comparison = left.overall_confidence - right.overall_confidence
      } else if (sortKey === 'hypotheses') {
        comparison = left.hypotheses.length - right.hypotheses.length
      } else if (sortKey === 'findings') {
        comparison = left.input_finding_ids.length - right.input_finding_ids.length
      } else if (sortKey === 'provider') {
        comparison = left.provider_name.localeCompare(right.provider_name)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [runs, sortKey, sortDirection])

  if (runs.length === 0) {
    return (
      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every interpretation run is persisted as an immutable ai_interpretations row bound to the latest detection batch."
            eyebrow="Interpretations"
            title="Interpretation history"
            action={<Badge dot tone="muted">No runs</Badge>}
          />
        </div>
        <div className="p-5">
          <EmptyState
            className="py-8"
            description="No interpretation runs are recorded for this dataset yet. Trigger a run above to compute the first one."
            icon={Sparkles}
            title="No interpretations"
          />
        </div>
      </Panel>
    )
  }

  return (
    <Panel padded={false}>
      <div className="border-b border-line px-5 py-5">
        <SectionHeading
          description="Every interpretation run is persisted as an immutable ai_interpretations row bound to the latest detection batch. Click a row to load its detail above."
          eyebrow="Interpretations"
          title="Interpretation history"
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
            <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2">Interpretation id</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'provider'} direction={sortDirection} label="Provider" onClick={() => handleSort('provider')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'confidence'} direction={sortDirection} label="Confidence" onClick={() => handleSort('confidence')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'hypotheses'} direction={sortDirection} label="Hypotheses" onClick={() => handleSort('hypotheses')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'findings'} direction={sortDirection} label="Findings" onClick={() => handleSort('findings')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'created_at'} direction={sortDirection} label="Created" onClick={() => handleSort('created_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.interpretation_id === selectedInterpretationId
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-elevated/40',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={row.interpretation_id}
                  onClick={() => onSelectInterpretation(row.interpretation_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{row.interpretation_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted/70">{row.formula_version}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{row.provider_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted/70">{row.model_name}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge dot tone={confidenceTone(row.overall_confidence)}>
                      {confidenceLabel(row.overall_confidence)} · {(row.overall_confidence * 100).toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(row.hypotheses.length)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(row.input_finding_ids.length)}</td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{formatTimestamp(row.created_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect interpretation ${row.interpretation_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectInterpretation(row.interpretation_id)
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
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total interpretations · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
          <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
        </div>
      </div>
    </Panel>
  )
}
