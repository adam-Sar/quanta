import { ArrowUpDown, Database, ExternalLink, FileArchive, FileSpreadsheet } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DatasetResponse } from '../../types/api'
import { formatBytes, formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'

export type DatasetSortKey = 'name' | 'updated_at' | 'rows' | 'columns'

interface DatasetTableProps {
  items: DatasetResponse[]
  sortKey: DatasetSortKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: DatasetSortKey) => void
}

const sortLabels: Record<DatasetSortKey, string> = {
  name: 'Name',
  updated_at: 'Updated',
  rows: 'Rows',
  columns: 'Columns',
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

export function DatasetTable({ items, sortKey, sortDirection, onSort }: DatasetTableProps) {
  if (!items.length) {
    return <EmptyState className="m-5" icon={Database} title="No datasets match this view" description="Adjust the local search or upload a new source to add it to the inventory." />
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[880px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-canvas/25">
            <th className="px-5 py-3"><SortButton active={sortKey === 'name'} direction={sortDirection} label={sortLabels.name} onClick={() => onSort('name')} /></th>
            <th className="px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Version</span></th>
            <th className="px-4 py-3"><SortButton active={sortKey === 'rows'} direction={sortDirection} label={sortLabels.rows} onClick={() => onSort('rows')} /></th>
            <th className="px-4 py-3"><SortButton active={sortKey === 'columns'} direction={sortDirection} label={sortLabels.columns} onClick={() => onSort('columns')} /></th>
            <th className="px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Format</span></th>
            <th className="px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Status</span></th>
            <th className="px-4 py-3"><SortButton active={sortKey === 'updated_at'} direction={sortDirection} label={sortLabels.updated_at} onClick={() => onSort('updated_at')} /></th>
            <th className="px-4 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((dataset) => {
            const version = dataset.current_version
            const FormatIcon = version?.format === 'parquet' ? FileArchive : FileSpreadsheet

            return (
              <tr className="group border-b border-line/40 last:border-b-0 hover:bg-canvas" key={dataset.id}>
                <td className="px-5 py-4">
                  <Link className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" title={dataset.description ?? undefined} to={`/datasets/${dataset.id}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-elevated text-accent"><Database aria-hidden="true" size={15} strokeWidth={1.7} /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink group-hover:text-accent">{dataset.name}</span><span className="mt-0.5 block max-w-[220px] truncate text-[11px] text-muted">{dataset.description ?? 'No description'}</span></span>
                  </Link>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-muted">{version ? `v${version.version_number}` : '—'}</td>
                <td className="px-4 py-4 font-mono text-xs text-ink">{formatNumber(version?.row_count)}</td>
                <td className="px-4 py-4 font-mono text-xs text-ink">{formatNumber(version?.column_count)}</td>
                <td className="px-4 py-4"><span className="inline-flex items-center gap-2 text-xs text-muted"><FormatIcon aria-hidden="true" size={15} />{version?.format?.toUpperCase() ?? '—'}<span className="sr-only"> file</span></span></td>
                <td className="px-4 py-4"><Badge tone={version?.status === 'stored' ? 'success' : 'muted'}>{version?.status ?? 'No version'}</Badge></td>
                <td className="px-4 py-4"><span className="block whitespace-nowrap text-xs text-muted">{formatTimestamp(dataset.updated_at)}</span><span className="mt-1 block text-[10px] text-muted">{formatBytes(version?.size_bytes)}</span></td>
                <td className="px-4 py-4"><Link aria-label={`Open ${dataset.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" to={`/datasets/${dataset.id}`}><ExternalLink aria-hidden="true" size={15} /></Link></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
