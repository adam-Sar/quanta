import { ArrowLeft, Columns3, Database, FileText, HardDrive } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getDataset } from '../api/datasets'
import { ApiError } from '../api/client'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatBytes, formatNumber, formatTimestamp } from '../lib/utils'

export function DatasetResourcePage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled: Boolean(datasetId),
  })
  const apiError = datasetQuery.error instanceof ApiError ? datasetQuery.error : null

  if (datasetQuery.isPending) {
    return <div className="space-y-8"><LoadingSkeleton className="max-w-2xl" lines={3} /><Panel><LoadingSkeleton lines={6} /></Panel></div>
  }
  if (datasetQuery.isError || !datasetQuery.data) {
    return <ErrorState message={apiError?.message ?? 'This dataset could not be loaded.'} onRetry={() => void datasetQuery.refetch()} requestId={apiError?.requestId} />
  }

  const dataset = datasetQuery.data
  const version = dataset.current_version

  return (
    <div className="space-y-8">
      <PageHeader
        action={<Link to="/datasets"><Button size="sm" variant="ghost"><ArrowLeft aria-hidden="true" size={14} />Back to datasets</Button></Link>}
        description={dataset.description ?? 'No description provided for this dataset.'}
        eyebrow="Dataset resource"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4"><p className="text-xs text-muted">Current version</p><p className="mt-3 text-xl font-semibold text-ink">{version ? `v${version.version_number}` : '—'}</p><p className="mt-1 text-xs text-muted">immutable source</p></Panel>
        <Panel className="p-4"><p className="text-xs text-muted">Rows</p><p className="mt-3 text-xl font-semibold text-ink">{formatNumber(version?.row_count)}</p><p className="mt-1 text-xs text-muted">source metadata</p></Panel>
        <Panel className="p-4"><p className="text-xs text-muted">Columns</p><p className="mt-3 text-xl font-semibold text-ink">{formatNumber(version?.column_count)}</p><p className="mt-1 text-xs text-muted">source metadata</p></Panel>
        <Panel className="p-4"><p className="text-xs text-muted">Quality</p><p className="mt-3 text-xl font-semibold text-muted">Not scored</p><p className="mt-1 text-xs text-muted">analysis is a later task</p></Panel>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <SectionHeading description="Metadata returned by the immutable ingestion resource." title="Source version" />
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Original file</p><p className="mt-2 flex items-center gap-2 text-sm text-ink"><FileText aria-hidden="true" className="text-accent" size={15} />{version?.original_filename ?? '—'}</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Storage status</p><p className="mt-2"><Badge tone={version?.status === 'stored' ? 'success' : 'muted'}>{version?.status ?? 'No version'}</Badge></p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Format</p><p className="mt-2 flex items-center gap-2 text-sm text-ink"><HardDrive aria-hidden="true" className="text-muted" size={15} />{version?.format?.toUpperCase() ?? '—'} · {formatBytes(version?.size_bytes)}</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Ingested</p><p className="mt-2 text-sm text-ink">{formatTimestamp(version?.created_at)}</p></div>
          </div>
          <div className="mt-7 rounded-md border border-line bg-canvas/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Content SHA-256</p><p className="mt-2 break-all font-mono text-[11px] text-muted">{version?.content_sha256 ?? '—'}</p></div>
        </Panel>

        <Panel>
          <SectionHeading description="Columns are the first schema surface available after ingestion." title="Schema snapshot" />
          {version?.columns.length ? (
            <div className="mt-5 overflow-hidden rounded-md border border-line">
              <div className="divide-y divide-line">
                {version.columns.map((column) => <div className="flex items-center justify-between gap-3 px-3 py-2.5" key={column.name}><span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink"><Columns3 aria-hidden="true" className="shrink-0 text-accent" size={14} /> <span className="truncate">{column.name}</span></span><span className="shrink-0 font-mono text-[10px] text-muted">{column.logical_type}</span></div>)}
              </div>
            </div>
          ) : <p className="mt-5 text-sm text-muted">No columns were returned for this version.</p>}
          <div className="mt-5 border-t border-line pt-4"><p className="text-xs leading-5 text-muted">Profiling, findings, quality score, and historical analysis will attach to this resource in their dedicated views.</p></div>
        </Panel>
      </section>

      <Panel className="border-l-2 border-l-line">
        <div className="flex items-start gap-3"><Database aria-hidden="true" className="mt-0.5 text-muted" size={18} /><div><h2 className="text-sm font-semibold text-ink">Analysis surfaces are not enabled yet</h2><p className="mt-1 text-sm leading-6 text-muted">This resource view intentionally stops at backend ingestion metadata. The next milestone will add the official profile, score, and finding-backed dataset overview.</p></div></div>
      </Panel>
    </div>
  )
}
