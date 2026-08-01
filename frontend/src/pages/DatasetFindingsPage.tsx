import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  AlertOctagon,
  ArrowLeft,
  CircleAlert,
  History,
  Play,
  Radar,
  Search,
  TableProperties,
  TriangleAlert,
} from 'lucide-react'

import { getDataset } from '../api/datasets'
import { createDatasetDetection, listFindings } from '../api/analysis'
import { ApiError } from '../api/client'
import { FindingDetailCard } from '../components/findings/FindingDetailCard'
import { FindingsSummary } from '../components/findings/FindingsSummary'
import { FindingsTable, type FindingsFiltersState } from '../components/findings/FindingsTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const FINDINGS_PAGE_SIZE = 50

const EMPTY_FILTERS: FindingsFiltersState = {
  search: '',
  severities: [],
  kinds: [],
  columns: [],
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'detection_not_profileable' || error.status === 409) {
      return {
        title: 'Detection is not available yet',
        message: 'The backend has no profile for this dataset yet. Trigger a profile run from the Profiling page first.',
        requestId: error.requestId,
      }
    }
    if (error.status === 404) {
      return {
        title: 'Resource unavailable',
        message: error.message,
        requestId: error.requestId,
      }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetFindingsPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId)

  const [findingsPage, setFindingsPage] = useState(1)
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FindingsFiltersState>(EMPTY_FILTERS)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const findingsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'findings', findingsPage],
    queryFn: () => listFindings(datasetId ?? '', { page: findingsPage, pageSize: FINDINGS_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const runDetectionMutation = useMutation({
    mutationFn: () => createDatasetDetection(datasetId ?? ''),
    onSuccess: async (run) => {
      const firstId = run.findings[0]?.finding_id ?? null
      if (firstId) {
        setSelectedFindingId(firstId)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'findings'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'score'] }),
      ])
      setFindingsPage(1)
    },
  })

  const runMutationError = runDetectionMutation.error
  const runMutationErrorInfo = useMemo(() => {
    if (!runMutationError) return null
    if (runMutationError instanceof ApiError) {
      return {
        message: runMutationError.message,
        requestId: runMutationError.requestId,
        code: runMutationError.code,
      }
    }
    return { message: 'Detection run could not be started.', requestId: null as string | null, code: 'request_failed' as string }
  }, [runMutationError])

  const items = findingsQuery.data?.items ?? []
  const totalCount = findingsQuery.data?.pagination.total_items ?? 0
  const totalPages = findingsQuery.data?.pagination.total_pages ?? 1

  const availableColumns = useMemo(() => {
    const set = new Set<string>()
    for (const finding of items) {
      if (finding.column_name) set.add(finding.column_name)
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right))
  }, [items])

  const selectedFinding = useMemo(() => {
    if (!selectedFindingId) return null
    return items.find((finding) => finding.finding_id === selectedFindingId) ?? null
  }, [items, selectedFindingId])

  // Reset column filter pills that no longer apply to the current page.
  useEffect(() => {
    if (filters.columns.length === 0) return
    const availableSet = new Set(availableColumns)
    const next = filters.columns.filter((column) => availableSet.has(column))
    if (next.length !== filters.columns.length) {
      setFilters({ ...filters, columns: next })
    }
  }, [availableColumns, filters])

  if (datasetQuery.isPending) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton className="max-w-2xl" lines={3} />
        <Panel><LoadingSkeleton lines={6} /></Panel>
      </div>
    )
  }
  if (datasetQuery.isError || !datasetQuery.data) {
    const error = describeError(datasetQuery.error, 'Unable to load this dataset')
    return <ErrorState message={error.message} onRetry={() => void datasetQuery.refetch()} requestId={error.requestId} title={error.title} />
  }

  const dataset = datasetQuery.data
  const currentVersion = dataset.current_version
  const findingsError = findingsQuery.isError ? describeError(findingsQuery.error, 'Findings are not available yet') : null
  const lastRun = runDetectionMutation.data
  const lastRunTimestamp = lastRun ? formatTimestamp(new Date().toISOString()) : null

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Link to={`/datasets/${dataset.id}`}>
              <Button size="sm" variant="ghost"><ArrowLeft aria-hidden="true" size={14} />Back to overview</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/profile`}>
              <Button size="sm" variant="secondary"><TableProperties aria-hidden="true" size={14} />Profiling</Button>
            </Link>
            <Button
              disabled={runDetectionMutation.isPending || !currentVersion}
              onClick={() => { runDetectionMutation.reset(); runDetectionMutation.mutate() }}
              size="sm"
              variant="primary"
            >
              <Play aria-hidden="true" size={14} />
              {runDetectionMutation.isPending ? 'Running…' : (totalCount > 0 ? 'Re-run detection' : 'Run detection')}
            </Button>
          </div>
        }
        description={currentVersion
          ? `Detection runs against the current version v${currentVersion.version_number} (${currentVersion.original_filename}). Findings are persisted as immutable rows bound to the latest profile.`
          : 'The dataset has no immutable version yet, so a detection run cannot be created.'}
        eyebrow="Dataset findings"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Findings (loaded)</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(items.length)}</p>
          <p className="mt-1 text-xs text-muted">on page {findingsPage} of {Math.max(totalPages, 1)}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Findings (total)</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(totalCount)}</p>
          <p className="mt-1 text-xs text-muted">across every detection batch</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Last detection run</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun ? formatNumber(lastRun.finding_count) : '—'}</p>
          <p className="mt-1 text-xs text-muted">
            {lastRun && lastRunTimestamp ? `finished ${lastRunTimestamp}` : 'shown after the next run'}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Page size</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(FINDINGS_PAGE_SIZE)}</p>
          <p className="mt-1 text-xs text-muted">findings per request</p>
        </Panel>
      </div>

      {runMutationErrorInfo ? (
        <Panel className="border-l-2 border-l-danger/50">
          <SectionHeading
            description="The backend rejected the detection run. The dataset's analysis state is unchanged."
            eyebrow="Detection run failed"
            title="The last detection run did not start"
          />
          <div className="mt-4 flex items-start gap-3 text-sm text-muted">
            <CircleAlert aria-hidden="true" className="mt-0.5 text-danger" size={16} />
            <div>
              <p className="text-ink">{runMutationErrorInfo.message}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">Code: {runMutationErrorInfo.code}{runMutationErrorInfo.requestId ? ` · Request ID: ${runMutationErrorInfo.requestId}` : ''}</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {!currentVersion ? (
        <Panel className="border-l-2 border-l-warning/50">
          <SectionHeading
            description="Detection needs an immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Detection is blocked"
            action={<Badge dot tone="warning">No version</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {findingsError ? (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="Findings are the durable output of the Task 4 detection engine. The backend returns 409 until a profile exists."
            eyebrow="Findings"
            title="Findings"
            action={<Badge dot tone="muted">Not profiled</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Radar aria-hidden="true" size={18} />
            <span>{findingsError.message}</span>
          </div>
        </Panel>
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            description="A breakdown of the loaded findings by severity and detector type. The summary always reflects what is currently loaded into the page."
            eyebrow="Signal"
            title="Findings summary"
          />
          <FindingsSummary items={items} totalCount={totalCount} />
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            description="Filter, sort, and inspect findings. Click a row to load its full detail card below."
            eyebrow="Findings"
            title="Findings table"
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone="muted"><History aria-hidden="true" size={11} className="mr-1" />{formatNumber(totalCount)} total</Badge>
                <Badge dot tone="muted"><Search aria-hidden="true" size={11} className="mr-1" />{formatNumber(items.length)} loaded</Badge>
              </div>
            }
          />
          <FindingsTable
            availableColumns={availableColumns}
            filters={filters}
            items={items}
            onFiltersChange={setFilters}
            onSelectFinding={setSelectedFindingId}
            selectedFindingId={selectedFindingId}
          />
          <PaginationFooter
            onPageChange={setFindingsPage}
            page={findingsPage}
            pageSize={FINDINGS_PAGE_SIZE}
            totalItems={totalCount}
            totalPages={totalPages}
          />
        </section>
      ) : null}

      <FindingDetailCard finding={selectedFinding} />

      {runDetectionMutation.isSuccess && !runDetectionMutation.isPending ? (
        <Panel className="border-l-2 border-l-success/50">
          <SectionHeading
            description="A fresh detection batch is now visible above. The findings table and summary will update on the next query refresh."
            eyebrow="Detection run completed"
            title="Run successful"
            action={<Badge dot tone="success">Succeeded</Badge>}
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <AlertOctagon aria-hidden="true" className="text-success" size={16} />
            <span>The backend persisted {formatNumber(runDetectionMutation.data?.finding_count ?? 0)} new finding{runDetectionMutation.data?.finding_count === 1 ? '' : 's'}; the score resource will refresh on the overview page.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

interface PaginationFooterProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

function PaginationFooter({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationFooterProps) {
  if (totalItems === 0) return null
  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, totalItems)
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted">Showing <span className="font-medium text-ink">{firstItem}–{lastItem}</span> of <span className="font-medium text-ink">{totalItems}</span> findings</p>
      <div className="flex items-center gap-2">
        <Button aria-label="Previous findings page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
        <span className="px-2 font-mono text-[11px] text-muted">{page} / {Math.max(totalPages, 1)}</span>
        <Button aria-label="Next findings page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
      </div>
    </div>
  )
}
