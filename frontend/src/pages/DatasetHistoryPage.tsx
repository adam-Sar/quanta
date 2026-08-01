import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AlertOctagon, Play } from 'lucide-react'

import { getDataset, listDatasetVersions } from '../api/datasets'
import {
  createDatasetComparison,
  getDatasetLineage,
  listDatasetComparisons,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { ComparisonsTable } from '../components/history/ComparisonsTable'
import { DistributionDriftCard } from '../components/history/DistributionDriftCard'
import { LineageChain } from '../components/history/LineageChain'
import { SchemaDiffCard } from '../components/history/SchemaDiffCard'
import { ScoreDriftCard } from '../components/history/ScoreDriftCard'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'
import type { DatasetVersionResponse } from '../types/api'

const COMPARISON_PAGE_SIZE = 50
const VERSION_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    if (error.status === 400) {
      return { title: 'Invalid comparison request', message: error.message, requestId: error.requestId }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

function summarizeVersion(version: DatasetVersionResponse | null | undefined): string {
  if (!version) return '—'
  return `v${version.version_number} · ${version.original_filename}`
}

export function DatasetHistoryPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId)

  const [comparisonsPage, setComparisonsPage] = useState(1)
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(null)
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null)
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const versionsQuery = useQuery({
    queryKey: ['dataset', datasetId, 'versions'],
    queryFn: () => listDatasetVersions(datasetId ?? '', { page: 1, pageSize: VERSION_PAGE_SIZE }),
    enabled,
  })
  const comparisonsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'comparisons', comparisonsPage],
    queryFn: () => listDatasetComparisons(datasetId ?? '', { page: comparisonsPage, pageSize: COMPARISON_PAGE_SIZE }),
    enabled,
    retry: false,
  })
  const lineageQuery = useQuery({
    queryKey: ['analysis', datasetId, 'lineage'],
    queryFn: () => getDatasetLineage(datasetId ?? ''),
    enabled,
    retry: false,
  })

  const versions = useMemo(() => versionsQuery.data?.items ?? [], [versionsQuery.data])
  const versionsById = useMemo(() => {
    const map: Record<string, DatasetVersionResponse> = {}
    for (const version of versions) {
      map[version.id] = version
    }
    return map
  }, [versions])

  useEffect(() => {
    if (versions.length === 0) return
    if (!baseVersionId) setBaseVersionId(versions[Math.max(0, versions.length - 2)]?.id ?? null)
    if (!targetVersionId) setTargetVersionId(versions[versions.length - 1]?.id ?? null)
  }, [versions, baseVersionId, targetVersionId])

  useEffect(() => {
    if (selectedComparisonId) return
    if (comparisonsQuery.data?.items[0]) {
      setSelectedComparisonId(comparisonsQuery.data.items[0].comparison_id)
    }
  }, [comparisonsQuery.data, selectedComparisonId])

  useEffect(() => {
    if (baseVersionId && !versionsById[baseVersionId]) {
      setBaseVersionId(versions[0]?.id ?? null)
    }
    if (targetVersionId && !versionsById[targetVersionId]) {
      setTargetVersionId(versions[versions.length - 1]?.id ?? null)
    }
  }, [versionsById, baseVersionId, targetVersionId, versions])

  const createComparisonMutation = useMutation({
    mutationFn: () =>
      createDatasetComparison(datasetId ?? '', {
        base_version_id: baseVersionId ?? '',
        target_version_id: targetVersionId ?? '',
      }),
    onSuccess: async (comparison) => {
      setSelectedComparisonId(comparison.comparison_id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'comparisons'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'lineage'] }),
      ])
      setComparisonsPage(1)
    },
  })

  const mutationError = createComparisonMutation.error
  const mutationErrorInfo = useMemo(() => {
    if (!mutationError) return null
    if (mutationError instanceof ApiError) {
      return { message: mutationError.message, requestId: mutationError.requestId, code: mutationError.code }
    }
    return { message: 'Comparison run could not be started.', requestId: null as string | null, code: 'request_failed' as string }
  }, [mutationError])

  const items = comparisonsQuery.data?.items ?? []
  const totalCount = comparisonsQuery.data?.pagination.total_items ?? 0
  const totalPages = comparisonsQuery.data?.pagination.total_pages ?? 1

  const selectedComparison = useMemo(() => {
    if (!selectedComparisonId) return null
    return items.find((row) => row.comparison_id === selectedComparisonId) ?? null
  }, [items, selectedComparisonId])

  const versionChoices = useMemo(() => {
    return [...versions].sort((left, right) => left.version_number - right.version_number)
  }, [versions])

  const baseVersion = baseVersionId ? versionsById[baseVersionId] ?? null : null
  const targetVersion = targetVersionId ? versionsById[targetVersionId] ?? null : null
  const canCompare = Boolean(baseVersionId && targetVersionId && baseVersionId !== targetVersionId)

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
  const comparisonsError = comparisonsQuery.isError
    ? describeError(comparisonsQuery.error, 'Comparisons are not available yet')
    : null
  const lineageError = lineageQuery.isError
    ? describeError(lineageQuery.error, 'Lineage is not available yet')
    : null
  const lastRun = createComparisonMutation.data

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Button
            disabled={!canCompare || createComparisonMutation.isPending}
            onClick={() => {
              createComparisonMutation.reset()
              createComparisonMutation.mutate()
            }}
            variant="primary"
          >
            <Play aria-hidden="true" size={14} />
            {createComparisonMutation.isPending
              ? 'Comparing…'
              : totalCount > 0
                ? 'Re-run comparison'
                : 'Run comparison'}
          </Button>
        }
        description={
          currentVersion
            ? `Compare any two immutable versions of ${dataset.name}. The comparison is deterministic, schema-aware, and persisted as a history_comparisons row.`
            : 'The dataset has no immutable version yet, so a comparison cannot be created.'
        }
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {!currentVersion ? (
        <Panel>
          <SectionHeading
            description="History needs at least two immutable dataset versions. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="History is blocked"
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <AlertOctagon aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {mutationErrorInfo ? (
        <ErrorState
          message={mutationErrorInfo.message}
          onRetry={() => createComparisonMutation.mutate()}
          requestId={mutationErrorInfo.requestId}
          title={mutationErrorInfo.code === 'invalid_comparison_request' ? 'Invalid comparison request' : 'Comparison failed'}
        />
      ) : null}

      <Panel>
        <SectionHeading
          description="The backend returns 400 when the same version is supplied twice. Pick a base and a target version, then trigger the comparison."
          eyebrow="Run"
          title="Compare two versions"
          action={
            <span className="text-[11px] text-muted">
              {formatNumber(versions.length)} {versions.length === 1 ? 'version' : 'versions'}
            </span>
          }
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Base version</span>
            <select
              className="h-9 rounded-md border border-line bg-canvas/50 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              disabled={versionChoices.length === 0}
              onChange={(event) => setBaseVersionId(event.target.value)}
              value={baseVersionId ?? ''}
            >
              {versionChoices.length === 0 ? <option value="">No versions available</option> : null}
              {versionChoices.map((version) => (
                <option key={`base-${version.id}`} value={version.id}>
                  {summarizeVersion(version)}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-muted">Older reference version</span>
          </label>

          <div className="flex items-center justify-center text-muted" aria-hidden="true">
            <span className="font-mono text-lg">→</span>
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Target version</span>
            <select
              className="h-9 rounded-md border border-line bg-canvas/50 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              disabled={versionChoices.length === 0}
              onChange={(event) => setTargetVersionId(event.target.value)}
              value={targetVersionId ?? ''}
            >
              {versionChoices.length === 0 ? <option value="">No versions available</option> : null}
              {versionChoices.map((version) => (
                <option key={`target-${version.id}`} value={version.id}>
                  {summarizeVersion(version)}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-muted">Newer reference version</span>
          </label>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {canCompare ? null : (
              <p className="text-[10px] text-muted">Pick two distinct versions to compare.</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>
            Base: <span className="font-mono text-ink/80">{summarizeVersion(baseVersion)}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Target: <span className="font-mono text-ink/80">{summarizeVersion(targetVersion)}</span>
          </span>
        </div>
      </Panel>

      {comparisonsError ? (
        <ErrorState
          message={comparisonsError.message}
          onRetry={() => void comparisonsQuery.refetch()}
          requestId={comparisonsError.requestId}
          title={comparisonsError.title}
        />
      ) : null}

      {selectedComparison ? (
        <section className="space-y-4">
          <SectionHeading
            description="The detail cards below show the deterministic output of the selected comparison. Click a different row in the table to switch the focus."
            eyebrow="Selected comparison"
            title={selectedComparison.comparison_id}
            action={
              <span className="text-[11px] text-muted">
                {selectedComparison.formula_version} · {formatTimestamp(selectedComparison.created_at)}
              </span>
            }
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <SchemaDiffCard schemaDiff={selectedComparison.schema_diff} />
            <ScoreDriftCard scoreDrift={selectedComparison.score_drift} />
          </div>
          <DistributionDriftCard drift={selectedComparison.distribution_drift} />
        </section>
      ) : (
        <Panel>
          <SectionHeading
            description="The detail cards will render here once a comparison row is selected or a new run completes."
            eyebrow="Selected comparison"
            title="Pick a comparison"
            action={<span className="text-[11px] text-muted">No selection</span>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <span>No comparison is currently selected. Run a comparison above or click a row in the table below.</span>
          </div>
        </Panel>
      )}

      <section className="space-y-4">
        <SectionHeading
          description="The backend derives the lineage edges by walking the version chain ordered by version_number."
          eyebrow="Lineage"
          title="Version chain"
        />
        {lineageError ? (
          <ErrorState
            message={lineageError.message}
            onRetry={() => void lineageQuery.refetch()}
            requestId={lineageError.requestId}
            title={lineageError.title}
          />
        ) : null}
        <LineageChain lineage={lineageQuery.data ?? null} versionsById={versionsById} />
      </section>

      <ComparisonsTable
        onPageChange={setComparisonsPage}
        onSelectComparison={setSelectedComparisonId}
        page={comparisonsPage}
        pageSize={COMPARISON_PAGE_SIZE}
        runs={items}
        selectedComparisonId={selectedComparisonId}
        totalItems={totalCount}
        totalPages={totalPages}
        versionsById={versionsById}
      />

      {createComparisonMutation.isSuccess && !createComparisonMutation.isPending && lastRun ? (
        <p className="text-xs text-muted">
          The most recent comparison {formatTimestamp(lastRun.created_at)} was persisted with formula{' '}
          {lastRun.formula_version}.
        </p>
      ) : null}
    </div>
  )
}