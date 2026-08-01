import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { getDataset } from '../api/datasets'
import {
  listDatasetValidations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { ValidationCard } from '../components/validations/ValidationCard'
import { ValidationsTable } from '../components/validations/ValidationsTable'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'

const VALIDATION_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    if (error.status === 409) {
      return {
        title: 'Validations are not available yet',
        message: 'The backend has no recommendation row bound to this dataset yet. Run recommendations first.',
        requestId: error.requestId,
      }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetValidationsPage() {
  const { datasetId, recommendationId } = useParams<{
    datasetId: string
    recommendationId: string
  }>()
  const enabled = Boolean(datasetId)

  const [page, setPage] = useState(1)
  const [selectedValidationId, setSelectedValidationId] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const validationsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'recommendations', recommendationId, 'validations', page],
    queryFn: () =>
      listDatasetValidations(datasetId ?? '', recommendationId ?? '', {
        page,
        pageSize: VALIDATION_PAGE_SIZE,
      }),
    enabled: enabled && Boolean(recommendationId),
    retry: false,
  })

  const items = validationsQuery.data?.items ?? []
  const totalCount = validationsQuery.data?.pagination.total_items ?? 0
  const totalPages = validationsQuery.data?.pagination.total_pages ?? 1

  const selectedValidation = useMemo(() => {
    if (!selectedValidationId) return null
    return items.find((row) => row.validation_id === selectedValidationId) ?? null
  }, [items, selectedValidationId])

  useEffect(() => {
    if (selectedValidationId) return
    if (validationsQuery.data?.items[0]) {
      setSelectedValidationId(validationsQuery.data.items[0].validation_id)
    }
  }, [validationsQuery.data, selectedValidationId])

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
  const validationsError = validationsQuery.isError
    ? describeError(validationsQuery.error, 'Validations are not available yet')
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        description="Validations are the deterministic preview engine's output for the selected recommendation. Every row is preview-only; nothing is applied to the dataset."
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {validationsError ? (
        <ErrorState
          message={validationsError.message}
          onRetry={() => void validationsQuery.refetch()}
          requestId={validationsError.requestId}
          title={validationsError.title}
        />
      ) : null}

      {selectedValidation ? (
        <Panel>
          <SectionHeading
            description="The detail card below shows the deterministic output of the selected validation. Click a different row in the table to switch the focus."
            eyebrow="Selected validation"
            title={selectedValidation.title}
            action={
              <span className="text-[11px] text-muted">{selectedValidation.formula_version}</span>
            }
          />
          <ValidationCard validation={selectedValidation} />
        </Panel>
      ) : (
        <Panel>
          <SectionHeading
            description="The detail card will render here once a validation row is available."
            eyebrow="Selected validation"
            title="Pick a validation"
            action={<span className="text-[11px] text-muted">No selection</span>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <span>No validation is currently selected.</span>
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
    </div>
  )
}