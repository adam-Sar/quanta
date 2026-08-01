import { useMemo, useState } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'

import type { FindingKind, FindingResponse, FindingSeverity } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { SeverityBadge } from '../ui/SeverityBadge'
import { cn } from '../../lib/utils'

type SortKey = 'severity' | 'kind' | 'column' | 'metric' | 'value' | 'threshold'

export interface FindingsFiltersState {
  search: string
  severities: FindingSeverity[]
  kinds: FindingKind[]
  columns: string[]
}

interface FindingsTableProps {
  items: FindingResponse[]
  selectedFindingId: string | null
  onSelectFinding: (findingId: string) => void
  filters: FindingsFiltersState
  onFiltersChange: (next: FindingsFiltersState) => void
  availableColumns: string[]
}

const severityOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const kindLabels: Record<FindingKind, string> = {
  missingness: 'Missingness',
  duplicates: 'Duplicates',
  invalid_values: 'Invalid values',
  outlier: 'Outliers',
  cardinality: 'Cardinality',
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

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-line bg-elevated text-muted hover:border-accent/30 hover:text-ink',
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

const ALL_SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
const ALL_KINDS: FindingKind[] = ['missingness', 'duplicates', 'invalid_values', 'outlier', 'cardinality']

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

export function FindingsTable({
  items,
  selectedFindingId,
  onSelectFinding,
  filters,
  onFiltersChange,
  availableColumns,
}: FindingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const sortLabels: Record<SortKey, string> = {
    severity: 'Severity',
    kind: 'Detector',
    column: 'Column',
    metric: 'Metric',
    value: 'Value',
    threshold: 'Threshold',
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'value' || key === 'threshold' ? 'desc' : 'asc')
  }

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return items
      .filter((finding) => {
        if (filters.severities.length > 0 && !filters.severities.includes(finding.severity)) {
          return false
        }
        if (filters.kinds.length > 0 && !filters.kinds.includes(finding.kind)) {
          return false
        }
        if (
          filters.columns.length > 0
          && (finding.column_name === null || !filters.columns.includes(finding.column_name))
        ) {
          return false
        }
        if (search) {
          const haystack = `${finding.description} ${finding.metric} ${finding.kind} ${finding.column_name ?? ''}`.toLowerCase()
          if (!haystack.includes(search)) {
            return false
          }
        }
        return true
      })
      .sort((left, right) => {
        let comparison = 0
        if (sortKey === 'severity') {
          comparison = severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity)
        } else if (sortKey === 'kind') {
          comparison = kindLabels[left.kind].localeCompare(kindLabels[right.kind])
        } else if (sortKey === 'column') {
          comparison = (left.column_name ?? '').localeCompare(right.column_name ?? '')
        } else if (sortKey === 'metric') {
          comparison = left.metric.localeCompare(right.metric)
        } else if (sortKey === 'value') {
          comparison = left.value - right.value
        } else if (sortKey === 'threshold') {
          comparison = left.threshold - right.threshold
        }
        return sortDirection === 'asc' ? comparison : -comparison
      })
  }, [items, filters, sortKey, sortDirection])

  const totalActiveFilters =
    filters.severities.length + filters.kinds.length + filters.columns.length + (filters.search.trim() ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2 text-muted" size={13} />
            <label className="sr-only" htmlFor="findings-search">Search findings</label>
            <input
              className="h-8 w-full rounded-md border border-line bg-canvas/50 pl-8 pr-3 text-xs text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-1 focus:ring-accent"
              id="findings-search"
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              placeholder="Search findings"
              value={filters.search}
            />
          </div>
          <p className="text-[11px] text-muted">
            {formatNumber(filtered.length)} of {formatNumber(items.length)} findings{totalActiveFilters > 0 ? ` · ${formatNumber(totalActiveFilters)} filter${totalActiveFilters === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Severity</span>
          {ALL_SEVERITIES.map((severity) => (
            <FilterPill
              active={filters.severities.includes(severity)}
              key={severity}
              label={severity}
              onClick={() => onFiltersChange({ ...filters, severities: toggle(filters.severities, severity) })}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Detector</span>
          {ALL_KINDS.map((kind) => (
            <FilterPill
              active={filters.kinds.includes(kind)}
              key={kind}
              label={kindLabels[kind]}
              onClick={() => onFiltersChange({ ...filters, kinds: toggle(filters.kinds, kind) })}
            />
          ))}
        </div>

        {availableColumns.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Column</span>
            {availableColumns.map((column) => (
              <FilterPill
                active={filters.columns.includes(column)}
                key={column}
                label={column}
                onClick={() => onFiltersChange({ ...filters, columns: toggle(filters.columns, column) })}
              />
            ))}
            {totalActiveFilters > 0 ? (
              <Button
                onClick={() => onFiltersChange({ search: '', severities: [], kinds: [], columns: [] })}
                size="sm"
                variant="ghost"
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="py-8"
          description={items.length === 0
            ? 'The backend has not recorded any findings for this dataset yet. Trigger a detection run to compute the first batch.'
            : 'No findings match the current filter combination. Clear the filters to see every finding.'}
          icon={Search}
          title={items.length === 0 ? 'No findings yet' : 'No matches'}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-[920px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'severity'} direction={sortDirection} label={sortLabels.severity} onClick={() => handleSort('severity')} /></th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'kind'} direction={sortDirection} label={sortLabels.kind} onClick={() => handleSort('kind')} /></th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'column'} direction={sortDirection} label={sortLabels.column} onClick={() => handleSort('column')} /></th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'metric'} direction={sortDirection} label={sortLabels.metric} onClick={() => handleSort('metric')} /></th>
                <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'value'} direction={sortDirection} label={sortLabels.value} onClick={() => handleSort('value')} /></th>
                <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'threshold'} direction={sortDirection} label={sortLabels.threshold} onClick={() => handleSort('threshold')} /></th>
                <th className="px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Description</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((finding) => {
                const isSelected = finding.finding_id === selectedFindingId
                return (
                  <tr
                    className={cn(
                      'cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-elevated/40',
                      isSelected && 'bg-accent/5 hover:bg-accent/10',
                    )}
                    key={finding.finding_id}
                    onClick={() => onSelectFinding(finding.finding_id)}
                  >
                    <td className="px-3 py-2 font-mono text-muted">{severityOrder.indexOf(finding.severity) === 0 ? '★' : ''}</td>
                    <td className="px-3 py-2"><SeverityBadge severity={finding.severity} /></td>
                    <td className="px-3 py-2 font-mono text-ink">{kindLabels[finding.kind]}</td>
                    <td className="px-3 py-2 font-mono text-muted">{finding.column_name ?? <span className="text-muted/60">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-muted">{finding.metric}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{finding.value.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{finding.threshold.toFixed(3)}</td>
                    <td className="px-3 py-2 max-w-[420px]">
                      <p className="truncate text-ink">{finding.description}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted/70">{finding.finding_id.slice(0, 8)}</p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 ? (
        <p className="text-[10px] text-muted/80">
          Filters apply to the loaded findings. Backend pagination is unchanged; the server returns the canonical ordered list and the UI filters the loaded page.
        </p>
      ) : null}
    </div>
  )
}
