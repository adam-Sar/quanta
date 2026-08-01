import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AlertOctagon, Play } from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetRecommendations,
  listDatasetRecommendations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { RecommendationCard } from '../components/recommendations/RecommendationCard'
import { RecommendationsTable } from '../components/recommendations/RecommendationsTable'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber } from '../lib/utils'

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
    queryFn: () =>
      listDatasetRecommendations(datasetId ?? '', { page, pageSize: RECOMMENDATION_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const runRecommendationsMutation = useMutation({
    mutationFn: () => createDatasetRecommendations(datasetId ?? ''),
    onSuccess: async (rows) => {
      const firstId = rows[0]?.recommendation_id ?? null
      if (firstId) setSelectedRecommendationId(firstId)
      await queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'recommendations'] })
      setPage(1)
    },
  })

  const mutationError = runRecommendationsMutation.error
  const mutationErrorInfo = useMemo(() => {
    if (!mutationError) return null
    if (mutationError instanceof ApiError) {
      return {
        message: mutationError.message,
        requestId: mutationError.requestId,
        code: mutationError.code,
      }
    }
    return {
      message: 'Recommendations could not be generated.',
      requestId: null as string | null,
      code: 'request_failed' as string,
    }
  }, [mutationError])

  const items = recommendationsQuery.data?.items ?? []
  const totalCount = recommendationsQuery.data?.pagination.total_items ?? 0
  const totalPages = recommendationsQuery.data?.pagination.total_pages ?? 1

  const selectedRecommendation = useMemo(() => {
    if (!selectedRecommendationId) return null
    return items.find((row) => row.recommendation_id === selectedRecommendationId) ?? null
  }, [items, selectedRecommendationId])

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
  const recommendationsError = recommendationsQuery.isError
    ? describeError(recommendationsQuery.error, 'Recommendations are not available yet')
    : null
  const lastRun = runRecommendationsMutation.data
  const lastRunCount = lastRun ? lastRun.length : null

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Button
            disabled={runRecommendationsMutation.isPending || !currentVersion}
            onClick={() => {
              runRecommendationsMutation.reset()
              runRecommendationsMutation.mutate()
            }}
            variant="primary"
          >
            <Play aria-hidden="true" size={14} />
            {runRecommendationsMutation.isPending
              ? 'Running…'
              : totalCount > 0
                ? 'Re-run recommendations'
                : 'Run recommendations'}
          </Button>
        }
        description={
          currentVersion
            ? `Run the deterministic Task 8 rule engine on the latest detection batch of ${dataset.name}. Every recommendation carries preview_only=True and is advisory.`
            : 'The dataset has no immutable version yet, so recommendations cannot be generated.'
        }
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {!currentVersion ? (
        <Panel>
          <SectionHeading
            description="Recommendations need at least one immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Recommendations are blocked"
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
          onRetry={() => runRecommendationsMutation.mutate()}
          requestId={mutationErrorInfo.requestId}
          title="Recommendations failed"
        />
      ) : null}

      {recommendationsError ? (
        <ErrorState
          message={recommendationsError.message}
          onRetry={() => void recommendationsQuery.refetch()}
          requestId={recommendationsError.requestId}
          title={recommendationsError.title}
        />
      ) : null}

      {selectedRecommendation ? (
        <Panel>
          <SectionHeading
            description="The detail card below shows the deterministic output of the selected recommendation. Click a different row in the table to switch the focus."
            eyebrow="Selected recommendation"
            title={selectedRecommendation.title}
            action={
              <span className="text-[11px] text-muted">
                {selectedRecommendation.formula_version} ·{' '}
                {formatNumber(selectedRecommendation.priority)} priority
              </span>
            }
          />
          <RecommendationCard recommendation={selectedRecommendation} />
        </Panel>
      ) : (
        <Panel>
          <SectionHeading
            description="The detail card will render here once a recommendation row is selected or a new run completes."
            eyebrow="Selected recommendation"
            title="Pick a recommendation"
            action={<span className="text-[11px] text-muted">No selection</span>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
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

      {runRecommendationsMutation.isSuccess && !runRecommendationsMutation.isPending && lastRunCount !== null ? (
        <p className="text-xs text-muted">
          The rule engine produced {formatNumber(lastRunCount)} new recommendation row
          {lastRunCount === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  )
}