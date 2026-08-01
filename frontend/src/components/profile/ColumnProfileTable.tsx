import { useMemo, useState } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'

import type { ColumnProfileResponse } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { cn } from '../../lib/utils'

const HIGH_NULL_THRESHOLD = 0.5
const HIGH_DISTINCT_THRESHOLD = 0.9
const CONSTANT_DISTINCT_MAX = 1
const SPARSE_DISTINCT_MAX = 5

type SortKey = 'name' | 'type' | 'null_rate' | 'distinct_rate' | 'sample_size'

interface ColumnProfileTableProps {
  columns: ColumnProfileResponse[]
  sampleSize: number
  selectedColumn: string | null
  onSelectColumn: (name: string) => void
  searchPlaceholder?: string
}

function classifyNullRate(rate: number): { tone: 'danger' | 'warning' | 'success'; label: string } {
  if (rate >= HIGH_NULL_THRESHOLD) return { tone: 'danger', label: 'High nulls' }
  if (rate >= 0.1) return { tone: 'warning', label: 'Some nulls' }
  return { tone: 'success', label: 'No nulls' }
}

function classifyDistinct(rate: number, distinctCount: number): { tone: 'muted' | 'info' | 'success' | 'warning'; label: string } {
  if (distinctCount <= SPARSE_DISTINCT_MAX) return { tone: 'muted', label: 'Sparse' }
  if (distinctCount <= CONSTANT_DISTINCT_MAX) return { tone: 'muted', label: 'Constant' }
  if (rate >= HIGH_DISTINCT_THRESHOLD) return { tone: 'info', label: 'Near unique' }
  return { tone: 'success', label: 'Normal' }
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

export function ColumnProfileTable({
  columns,
  sampleSize,
  selectedColumn,
  onSelectColumn,
  searchPlaceholder = 'Search columns',
}: ColumnProfileTableProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ordinal_position' as SortKey)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const sortKeys: Record<SortKey, string> = useMemo(() => ({
    name: 'Name',
    type: 'Type',
    null_rate: 'Null rate',
    distinct_rate: 'Distinct rate',
    sample_size: 'Sample',
  }), [])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'name' || key === 'type' ? 'asc' : 'desc')
  }

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const base = columns.filter((column) => {
      if (!normalizedSearch) return true
      return (
        column.name.toLowerCase().includes(normalizedSearch) ||
        column.metrics.physical_type.toLowerCase().includes(normalizedSearch)
      )
    })
    return base.sort((left, right) => {
      let comparison = 0
      if (sortKey === 'name') comparison = left.name.localeCompare(right.name)
      if (sortKey === 'type') comparison = left.metrics.physical_type.localeCompare(right.metrics.physical_type)
      if (sortKey === 'null_rate') comparison = left.metrics.null_rate - right.metrics.null_rate
      if (sortKey === 'distinct_rate') comparison = left.metrics.distinct_rate - right.metrics.distinct_rate
      if (sortKey === 'sample_size') comparison = left.metrics.sample_size - right.metrics.sample_size
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [columns, search, sortKey, sortDirection])

  const searchInputClasses = 'h-8 w-full rounded-md border border-line bg-canvas/50 pl-8 pr-3 text-xs text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2 text-muted" size={13} />
          <label className="sr-only" htmlFor="column-profile-search">{searchPlaceholder}</label>
          <input className={searchInputClasses} id="column-profile-search" onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} value={search} />
        </div>
        <p className="text-[11px] text-muted">{formatNumber(filtered.length)} of {formatNumber(columns.length)} columns · sample {formatNumber(sampleSize)} rows</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="py-8"
          description="No columns match the current filter. Clear the search to see every column."
          icon={Search}
          title="No columns to inspect"
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'name'} direction={sortDirection} label={sortKeys.name} onClick={() => handleSort('name')} /></th>
                <th className="px-3 py-2"><SortButton active={sortKey === 'type'} direction={sortDirection} label={sortKeys.type} onClick={() => handleSort('type')} /></th>
                <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'null_rate'} direction={sortDirection} label={sortKeys.null_rate} onClick={() => handleSort('null_rate')} /></th>
                <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'distinct_rate'} direction={sortDirection} label={sortKeys.distinct_rate} onClick={() => handleSort('distinct_rate')} /></th>
                <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'sample_size'} direction={sortDirection} label={sortKeys.sample_size} onClick={() => handleSort('sample_size')} /></th>
                <th className="px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Note</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((column) => {
                const nullTone = classifyNullRate(column.metrics.null_rate)
                const distinctTone = classifyDistinct(column.metrics.distinct_rate, column.metrics.distinct_count)
                const isSelected = selectedColumn === column.name
                return (
                  <tr
                    className={cn(
                      'cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-elevated/40',
                      isSelected && 'bg-accent/5 hover:bg-accent/10',
                    )}
                    key={column.name}
                    onClick={() => onSelectColumn(column.name)}
                  >
                    <td className="px-3 py-2 font-mono text-muted">{column.ordinal_position}</td>
                    <td className="px-3 py-2 font-mono text-ink">{column.name}</td>
                    <td className="px-3 py-2 font-mono text-muted">{column.metrics.physical_type}</td>
                    <td className="px-3 py-2 text-right">
                      <p className="font-mono text-ink">{(column.metrics.null_rate * 100).toFixed(1)}%</p>
                      <p className="mt-0.5 text-[10px] text-muted">{formatNumber(column.metrics.null_count)} nulls</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="font-mono text-ink">{(column.metrics.distinct_rate * 100).toFixed(1)}%</p>
                      <p className="mt-0.5 text-[10px] text-muted">{formatNumber(column.metrics.distinct_count)} distinct</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{formatNumber(column.metrics.sample_size)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge dot tone={nullTone.tone}>{nullTone.label}</Badge>
                        <Badge dot tone={distinctTone.tone}>{distinctTone.label}</Badge>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
