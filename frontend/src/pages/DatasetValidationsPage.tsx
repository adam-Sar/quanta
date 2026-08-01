import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  CircleAlert,
  Eye,
  FileSearch2,
  Play,
  Radar,
  ShieldCheck,
  TableProperties,
  TriangleAlert,
} from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetValidation,
  getDatasetRecommendation,
  listDatasetValidations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { ValidationCard } from '../components/validations/ValidationCard'
import { ValidationsTable } from '../components/validations/ValidationsTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const VALIDATION_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    if (error.status === 409) {
      return {
        title: 'Validation not available',
        message: 'The backend has no recommendation row for this validation yet.',
        requestId: error.requestId,
      }
    }
    if (error.status === 422) {
      return {
        title: 'Validation not available',
        message: 'The backend reported that the preview engine cannot produce a validation for this recommendation yet.',
        requestId: error.requestId,
      }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetValidationsPage() {
  const { datasetId, recommendationId } = useParams<{ datasetId: string; recommendationId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId && recommendationId)

  const [page, setPage] = useState(1)
  const [selectedValidationId, setSelectedValidationId] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled: enabled,
  })
  const recommendationQuery = useQuery({
    queryKey: ['analysis', datasetId, 'recommendation', recommendationId],
    queryFn: () => getDatasetRecommendation(datasetId ?? '', recommendationId ?? ''),
    enabled: enabled,
    retry: false,
  })
  const validationsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'recommendation', recommendationId, 'validations', page],
    queryFn: () => listDatasetValidations(datasetId ?? '', recommendationId ?? '', { page, pageSize: VALIDATION_PAGE_SIZE }),
    enabled: enabled,
    retry: false,
  })

  const runValidationMutation = useMutation({
    mutationFn: () => createDatasetValidation(datasetId ?? '', recommendationId ?? ''),
    onSuccess: async (validation) => {
      setSelectedValidationId(validation.validation_id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'recommendation', recommendationId, 'validations'] }),
      ])
      setPage(1)
    },
  })

  const mutationError = runValidationMutation.error
  const mutationErrorInfo = useMemo(() => {
    if (!mutationError) return null
    if (mutationError instanceof ApiError) {
      return { message: mutationError.message, requestId: mutationError.requestId, code: mutationError.code }
    }
    return { message: 'Validation could not be started.', requestId: null as string | null, code: 'request_failed' as string }
  }, [mutationError])

  const items = validationsQuery.data?.items ?? []
  const totalCount = validationsQuery.data?.pagination.total_items ?? 0
  const totalPages = validationsQuery.data?.pagination.total_pages ?? 1

  const selectedValidation = useMemo(() => {
    if (!selectedValidationId) return null
    return items.find((row) => row.validation_id === selectedValidationId) ?? null
  }, [items, selectedValidationId])

  // Default the selection to the first row on first load.
  useEffect(() => {
    if (selectedValidationId) return
    if (validationsQuery.data?.items[0]) {
      setSelectedValidationId(validationsQuery.data.items[0].validation_id)
    }
  }, [validationsQuery.data, selectedValidationId])

  if (datasetQuery.isPending || recommendationQuery.isPending) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton className="max-w-2xl" lines={3} />
        <Panel><LoadingSkeleton lines={6} /></Panel>
      </div>
    )
  }
  if (datasetQuery.isError || !datasetQuery.data || recommendationQuery.isError || !recommendationQuery.data) {
    const error = recommendationQuery.isError || !recommendationQuery.data
      ? describeError(recommendationQuery.error, 'Unable to load this recommendation')
      : describeError(datasetQuery.error, 'Unable to load this dataset')
    return <ErrorState message={error.message} onRetry={() => void datasetQuery.refetch()} requestId={error.requestId} title={error.title} />
  }

  const dataset = datasetQuery.data
  const recommendation = recommendationQuery.data
  const currentVersion = dataset.current_version
  const validationsError = validationsQuery.isError
    ? describeError(validationsQuery.error, 'Validations are not available yet')
    : null
  const lastRun = runValidationMutation.data

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
            <Link to={`/datasets/${dataset.id}/recommendations`}>
              <Button size="sm" variant="secondary"><FileSearch2 aria-hidden="true" size={14} />Recs</Button>
            </Link>
            <Button
              disabled={runValidationMutation.isPending || !currentVersion}
              onClick={() => { runValidationMutation.reset(); runValidationMutation.mutate() }}
              size="sm"
              variant="primary"
            >
              <Play aria-hidden="true" size={14} />
              {runValidationMutation.isPending ? 'Validating…' : (totalCount > 0 ? 'Re-run validation' : 'Run validation')}
            </Button>
          </div>
        }
        description={`Run the deterministic Task 9 preview engine against the source file for the matching Task 8 recommendation. Every validation row is preview-only; the apply step lands in a later task.`}
        eyebrow="Dataset validation"
        title={`${dataset.name} · ${recommendation.title}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Validations</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(totalCount)}</p>
          <p className="mt-1 text-xs text-muted">preview-only rows</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Last run</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun ? formatTimestamp(lastRun.created_at) : '—'}</p>
          <p className="mt-1 text-xs text-muted">{lastRun ? `${lastRun.status} · ${lastRun.operation_kind}` : 'run one above'}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Recommendation id</p>
          <p className="mt-3 text-base font-semibold text-ink font-mono">{recommendation.recommendation_id.slice(0, 8)}</p>
          <p className="mt-1 text-xs text-muted">preview-only</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Formula</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun?.formula_version ?? 'task9-1.0'}</p>
          <p className="mt-1 text-xs text-muted">persisted on every row</p>
        </Panel>
      </div>

      {mutationErrorInfo ? (
        <Panel className="border-l-2 border-l-danger/50">
          <SectionHeading
            description="The backend rejected the validation run. The recommendation row is unchanged."
            eyebrow="Validation failed"
            title="The last validation run did not start"
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
            description="Validations need at least one immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Validations are blocked"
            action={<Badge dot tone="warning">No version</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {validationsError ? (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="Validations are the durable output of the Task 9 preview engine. The backend returns 404 / 409 / 422 until the source is ready."
            eyebrow="Validations"
            title="Validations"
            action={<Badge dot tone="muted">Unavailable</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>{validationsError.message}</span>
          </div>
        </Panel>
      ) : null}

      {selectedValidation ? (
        <section className="space-y-4">
          <SectionHeading
            description="The detail card below shows the deterministic preview output of the selected validation. Click a different row in the table to switch the focus."
            eyebrow="Selected validation"
            title={selectedValidation.validation_id}
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone="muted">{selectedValidation.formula_version}</Badge>
                <Badge dot tone="muted">{formatTimestamp(selectedValidation.created_at)}</Badge>
              </div>
            }
          />
          <ValidationCard validation={selectedValidation} />
        </section>
      ) : (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="The detail card will render here once a validation row is selected or a new run completes."
            eyebrow="Selected validation"
            title="Pick a validation"
            action={<Badge dot tone="muted">No selection</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Eye aria-hidden="true" size={18} />
            <span>No validation is currently selected. Run the preview engine above or click a row in the table below.</span>
          </div>
        </Panel>
      )}

      <ValidationsTable
        onPageChange={setPage}
        onSelectValidation={setSelectedValidationId}
        page={page}
        pageSize={VALIDATION_PAGE_SIZE}
        runs={items}
        selectedValidationId={selectedValidationId}
        totalItems={totalCount}
        totalPages={totalPages}
      />

      {runValidationMutation.isSuccess && !runValidationMutation.isPending ? (
        <Panel className="border-l-2 border-l-success/50">
          <SectionHeading
            description="A fresh validation row is now visible above. The preview engine never writes to the source file; the apply step that creates a new immutable dataset version lands in a later task."
            eyebrow="Validation completed"
            title="Run succeeded"
            action={<Badge dot tone="success">Succeeded</Badge>}
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <ShieldCheck aria-hidden="true" className="text-success" size={16} />
            <span>The validation {lastRun?.validation_id.slice(0, 8)} was persisted with status {lastRun?.status}.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
