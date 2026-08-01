import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AlertOctagon, Play } from 'lucide-react'

import { getDataset } from '../api/datasets'
import { createDatasetDetection, listFindings } from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { FindingDetailCard } from '../components/findings/FindingDetailCard'
import { FindingsSummary } from '../components/findings/FindingsSummary'
import { FindingsTable, type FindingsFiltersState } from '../components/findings/FindingsTable'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber } from '../lib/utils'

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
        message: 'The backend has no profile for this dataset yet. Trigger a profile run from the Profile tab first.',
        requestId: error.requestId,
      }
    }
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
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
      if (firstId) setSelectedFindingId(firstId)
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
    return {
      message: 'Detection run could not be started.',
      requestId: null as string | null,
      code: 'request_failed' as string,
    }
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
        <Panel>
          <LoadingSkeleton lines={6} />
        </Panel>
      </div>
    )
  }
  if (datasetQuery.isError || !datasetQuery.data) {
    const error = describeError(datasetQuery.error, 'Unable to load this dataset')
    return (
      <ErrorState
        message={error.message}
        onRetry={() => void datasetQuery.refetch()}
        requestId={error.requestId}
        title={error.title}
      />
    )
  }

  const dataset = datasetQuery.data
  const currentVersion = dataset.current_version
  const findingsError = findingsQuery.isError
    ? describeError(findingsQuery.error, 'Findings are not available yet')
    : null
  const lastRun = runDetectionMutation.data
  const lastRunCount = lastRun ? lastRun.finding_count : null

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Button
            disabled={runDetectionMutation.isPending || !currentVersion}
            onClick={() => {
              runDetectionMutation.reset()
              runDetectionMutation.mutate()
            }}
            variant="primary"
          >
            <Play aria-hidden="true" size={14} />
            {runDetectionMutation.isPending
              ? 'Running…'
              : totalCount > 0
                ? 'Re-run detection'
                : 'Run detection'}
          </Button>
        }
        description={
          currentVersion
            ? `Detection runs against the current version v${currentVersion.version_number} (${currentVersion.original_filename}). Findings are persisted as immutable rows bound to the latest profile.`
            : 'The dataset has no immutable version yet, so a detection run cannot be created.'
        }
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {!currentVersion ? (
        <Panel>
          <SectionHeading
            description="Detection needs an immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Detection is blocked"
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <AlertOctagon aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {runMutationErrorInfo ? (
        <ErrorState
          message={runMutationErrorInfo.message}
          onRetry={() => runDetectionMutation.mutate()}
          requestId={runMutationErrorInfo.requestId}
          title="Detection run failed"
        />
      ) : null}

      {items.length > 0 ? (
        <FindingsSummary items={items} totalCount={totalCount} />
      ) : null}

      {findingsError ? (
        <ErrorState
          message={findingsError.message}
          onRetry={() => void findingsQuery.refetch()}
          requestId={findingsError.requestId}
          title={findingsError.title}
        />
      ) : null}

      {items.length > 0 ? (
        <Panel padded={false}>
          <div className="border-b border-line px-5 py-5 md:px-6">
            <SectionHeading
              description="Filter, sort, and inspect findings. Click a row to load its full detail card below."
              eyebrow="Findings"
              title="Findings table"
              action={
                <span className="text-[11px] text-muted">
                  {formatNumber(totalCount)} total · {formatNumber(items.length)} loaded
                </span>
              }
            />
          </div>
          <div className="p-5 md:p-6">
            <FindingsTable
              availableColumns={availableColumns}
              filters={filters}
              items={items}
              onFiltersChange={setFilters}
              onSelectFinding={setSelectedFindingId}
              selectedFindingId={selectedFindingId}
            />
          </div>
          <div className="flex flex-col items-start gap-2 border-t border-line px-5 py-3.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between md:px-6">
            <p>
              Showing <span className="font-medium text-ink">{formatNumber((findingsPage - 1) * FINDINGS_PAGE_SIZE + 1)}</span>
              –
              <span className="font-medium text-ink">{formatNumber(Math.min(findingsPage * FINDINGS_PAGE_SIZE, totalCount))}</span>{' '}
              of <span className="font-medium text-ink">{formatNumber(totalCount)}</span> findings
            </p>
            <div className="flex items-center gap-2">
              <Button
                aria-label="Previous findings page"
                disabled={findingsPage <= 1}
                onClick={() => setFindingsPage(findingsPage - 1)}
                size="sm"
                variant="secondary"
              >
                Previous
              </Button>
              <span className="px-2 font-mono text-[11px] text-muted">{findingsPage} / {Math.max(totalPages, 1)}</span>
              <Button
                aria-label="Next findings page"
                disabled={findingsPage >= totalPages}
                onClick={() => setFindingsPage(findingsPage + 1)}
                size="sm"
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <FindingDetailCard finding={selectedFinding} />

      {runDetectionMutation.isSuccess && !runDetectionMutation.isPending && lastRunCount !== null ? (
        <p className="text-xs text-muted">
          The most recent detection run produced {formatNumber(lastRunCount)} findings. The table above
          and the score on the Overview page refresh automatically.
        </p>
      ) : null}
    </div>
  )
}