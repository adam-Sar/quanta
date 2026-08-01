import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  CircleAlert,
  FileCheck2,
  Play,
  Radar,
  Sparkles,
  TableProperties,
  TriangleAlert,
} from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetRecommendations,
  listDatasetRecommendations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { RecommendationCard } from '../components/recommendations/RecommendationCard'
import { RecommendationsTable } from '../components/recommendations/RecommendationsTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const RECOMMENDATION_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    if (error.status === 409) {
      return {
        title: 'Recommendations not available',
        message: 'The backend has no detection batch for this dataset yet. Run detection from the Findings page first.',
        requestId: error.requestId,
      }
    }
    if (error.status === 422) {
      return {
        title: 'Recommendations not available',
        message: 'The backend reported that the rule engine cannot produce recommendations for this dataset yet.',
        requestId: error.requestId,
      }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetRecommendationsPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId)

  const [page, setPage] = useState(1)
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const recommendationsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'recommendations', page],
    queryFn: () => listDatasetRecommendations(datasetId ?? '', { page, pageSize: RECOMMENDATION_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const runRecommendationsMutation = useMutation({
    mutationFn: () => createDatasetRecommendations(datasetId ?? ''),
    onSuccess: async (rows) => {
      const firstId = rows[0]?.recommendation_id ?? null
      if (firstId) {
        setSelectedRecommendationId(firstId)
      }
      await queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'recommendations'] })
      setPage(1)
    },
  })

  const mutationError = runRecommendationsMutation.error
  const mutationErrorInfo = useMemo(() => {
    if (!mutationError) return null
    if (mutationError instanceof ApiError) {
      return { message: mutationError.message, requestId: mutationError.requestId, code: mutationError.code }
    }
    return { message: 'Recommendations could not be generated.', requestId: null as string | null, code: 'request_failed' as string }
  }, [mutationError])

  const items = recommendationsQuery.data?.items ?? []
  const totalCount = recommendationsQuery.data?.pagination.total_items ?? 0
  const totalPages = recommendationsQuery.data?.pagination.total_pages ?? 1

  const selectedRecommendation = useMemo(() => {
    if (!selectedRecommendationId) return null
    return items.find((row) => row.recommendation_id === selectedRecommendationId) ?? null
  }, [items, selectedRecommendationId])

  // Default the selection to the first row on first load.
  useEffect(() => {
    if (selectedRecommendationId) return
    if (recommendationsQuery.data?.items[0]) {
      setSelectedRecommendationId(recommendationsQuery.data.items[0].recommendation_id)
    }
  }, [recommendationsQuery.data, selectedRecommendationId])

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
  const recommendationsError = recommendationsQuery.isError
    ? describeError(recommendationsQuery.error, 'Recommendations are not available yet')
    : null
  const lastRun = runRecommendationsMutation.data
  const lastRunCount = lastRun ? lastRun.length : null

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
            <Link to={`/datasets/${dataset.id}/findings`}>
              <Button size="sm" variant="secondary"><Radar aria-hidden="true" size={14} />Findings</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/history`}>
              <Button size="sm" variant="secondary"><Brain aria-hidden="true" size={14} />History</Button>
            </Link>
            <Button
              disabled={runRecommendationsMutation.isPending || !currentVersion}
              onClick={() => { runRecommendationsMutation.reset(); runRecommendationsMutation.mutate() }}
              size="sm"
              variant="primary"
            >
              <Play aria-hidden="true" size={14} />
              {runRecommendationsMutation.isPending ? 'Running…' : (totalCount > 0 ? 'Re-run recommendations' : 'Run recommendations')}
            </Button>
          </div>
        }
        description={currentVersion
          ? `Run the deterministic Task 8 rule engine on the latest detection batch of ${dataset.name}. Every recommendation carries preview_only=True and is advisory.`
          : 'The dataset has no immutable version yet, so recommendations cannot be generated.'}
        eyebrow="Dataset recommendations"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Recommendations</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(totalCount)}</p>
          <p className="mt-1 text-xs text-muted">persisted rows</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Last run</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRunCount === null ? '—' : formatNumber(lastRunCount)}</p>
          <p className="mt-1 text-xs text-muted">{runRecommendationsMutation.data ? formatTimestamp(runRecommendationsMutation.data[0]?.created_at) : 'run one above'}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Selected</p>
          <p className="mt-3 text-xl font-semibold text-ink">{selectedRecommendation ? selectedRecommendation.kind.replace(/_/g, ' ') : '—'}</p>
          <p className="mt-1 text-xs text-muted">preview-only operation</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Formula</p>
          <p className="mt-3 text-xl font-semibold text-ink">{selectedRecommendation?.formula_version ?? '—'}</p>
          <p className="mt-1 text-xs text-muted">persisted on every row</p>
        </Panel>
      </div>

      {mutationErrorInfo ? (
        <Panel className="border-l-2 border-l-danger/50">
          <SectionHeading
            description="The backend rejected the recommendations run. The dataset's history is unchanged."
            eyebrow="Recommendations failed"
            title="The last recommendations run did not start"
          />
          <div className="mt-4 flex items-start gap-3 text-sm text-muted">
            <CircleAlert aria-hidden="true" className="mt-0.5 text-danger" size={16} />
            <div>
              <p className="text-ink">{mutationErrorInfo.message}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">Code: {mutationErrorInfo.code}{mutationErrorInfo.requestId ? ` · Request ID: ${mutationErrorInfo.requestId}` : ''}</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {!currentVersion ? (
        <Panel className="border-l-2 border-l-warning/50">
          <SectionHeading
            description="Recommendations need at least one immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Recommendations are blocked"
            action={<Badge dot tone="warning">No version</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {recommendationsError ? (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="Recommendations are the durable output of the Task 8 rule engine. The backend returns 409 until a detection batch exists."
            eyebrow="Recommendations"
            title="Recommendations"
            action={<Badge dot tone="muted">Unavailable</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <FileCheck2 aria-hidden="true" size={18} />
            <span>{recommendationsError.message}</span>
          </div>
        </Panel>
      ) : null}

      {selectedRecommendation ? (
        <section className="space-y-4">
          <SectionHeading
            description="The detail card below shows the deterministic output of the selected recommendation. Click a different row in the table to switch the focus."
            eyebrow="Selected recommendation"
            title={selectedRecommendation.recommendation_id}
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone="muted">{selectedRecommendation.formula_version}</Badge>
                <Badge dot tone="muted">{formatTimestamp(selectedRecommendation.created_at)}</Badge>
              </div>
            }
          />
          <RecommendationCard recommendation={selectedRecommendation} />
        </section>
      ) : (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="The detail card will render here once a recommendation row is selected or a new run completes."
            eyebrow="Selected recommendation"
            title="Pick a recommendation"
            action={<Badge dot tone="muted">No selection</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <FileCheck2 aria-hidden="true" size={18} />
            <span>No recommendation is currently selected. Run the engine above or click a row in the table below.</span>
          </div>
        </Panel>
      )}

      <RecommendationsTable
        onPageChange={setPage}
        onSelectRecommendation={setSelectedRecommendationId}
        page={page}
        pageSize={RECOMMENDATION_PAGE_SIZE}
        runs={items}
        selectedRecommendationId={selectedRecommendationId}
        totalItems={totalCount}
        totalPages={totalPages}
      />

      {runRecommendationsMutation.isSuccess && !runRecommendationsMutation.isPending ? (
        <Panel className="border-l-2 border-l-success/50">
          <SectionHeading
            description="A fresh batch of immutable recommendations is now visible above. The rule engine never executes code on the dataset; the apply step lands in Task 9 (validation)."
            eyebrow="Recommendations completed"
            title="Run succeeded"
            action={<Badge dot tone="success">Succeeded</Badge>}
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <Sparkles aria-hidden="true" className="text-success" size={16} />
            <span>The rule engine produced {lastRun?.length ?? 0} new recommendation row{lastRun?.length === 1 ? '' : 's'}.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
