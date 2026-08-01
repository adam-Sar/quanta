import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { AlertOctagon, Brain } from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetInterpretation,
  listDatasetInterpretations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { InterpretationCard } from '../components/ai/InterpretationCard'
import { InterpretationsTable } from '../components/ai/InterpretationsTable'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const INTERPRETATION_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'interpretation_not_available' || error.status === 409) {
      return {
        title: 'AI interpretation is not available yet',
        message: 'The backend has no detection batch for this dataset yet. Run detection from the Findings page first.',
        requestId: error.requestId,
      }
    }
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    if (error.status === 502) {
      return {
        title: 'AI provider failed',
        message: 'The configured LLM provider returned an invalid response. The backend reports the sanitized envelope with the request id.',
        requestId: error.requestId,
      }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetAIAnalysisPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId)

  const [page, setPage] = useState(1)
  const [selectedInterpretationId, setSelectedInterpretationId] = useState<string | null>(null)
  const [selectedHypothesisIndex, setSelectedHypothesisIndex] = useState<number | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const interpretationsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'interpretations', page],
    queryFn: () =>
      listDatasetInterpretations(datasetId ?? '', { page, pageSize: INTERPRETATION_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const runInterpretationMutation = useMutation({
    mutationFn: () => createDatasetInterpretation(datasetId ?? ''),
    onSuccess: async (interpretation) => {
      setSelectedInterpretationId(interpretation.interpretation_id)
      setSelectedHypothesisIndex(interpretation.hypotheses[0] ? 0 : null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'interpretations'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'recommendations'] }),
      ])
      setPage(1)
    },
  })

  const mutationError = runInterpretationMutation.error
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
      message: 'AI interpretation could not be started.',
      requestId: null as string | null,
      code: 'request_failed' as string,
    }
  }, [mutationError])

  const items = interpretationsQuery.data?.items ?? []
  const totalCount = interpretationsQuery.data?.pagination.total_items ?? 0
  const totalPages = interpretationsQuery.data?.pagination.total_pages ?? 1

  const selectedInterpretation = useMemo(() => {
    if (!selectedInterpretationId) return null
    return items.find((row) => row.interpretation_id === selectedInterpretationId) ?? null
  }, [items, selectedInterpretationId])

  const selectedHypothesis = useMemo(() => {
    if (!selectedInterpretation) return null
    if (selectedHypothesisIndex === null) return null
    return selectedInterpretation.hypotheses[selectedHypothesisIndex] ?? null
  }, [selectedInterpretation, selectedHypothesisIndex])

  useEffect(() => {
    if (selectedInterpretationId) return
    if (interpretationsQuery.data?.items[0]) {
      setSelectedInterpretationId(interpretationsQuery.data.items[0].interpretation_id)
      setSelectedHypothesisIndex(interpretationsQuery.data.items[0].hypotheses[0] ? 0 : null)
    }
  }, [interpretationsQuery.data, selectedInterpretationId])

  useEffect(() => {
    if (!selectedInterpretation) return
    if (selectedHypothesisIndex === null) return
    if (selectedHypothesisIndex >= selectedInterpretation.hypotheses.length) {
      setSelectedHypothesisIndex(selectedInterpretation.hypotheses[0] ? 0 : null)
    }
  }, [selectedInterpretation, selectedHypothesisIndex])

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
  const interpretationsError = interpretationsQuery.isError
    ? describeError(interpretationsQuery.error, 'Interpretations are not available yet')
    : null
  const lastRun = runInterpretationMutation.data
  const lastRunCount = lastRun ? lastRun.hypotheses.length : null

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Button
            disabled={runInterpretationMutation.isPending || !currentVersion}
            onClick={() => {
              runInterpretationMutation.reset()
              runInterpretationMutation.mutate()
            }}
            variant="primary"
          >
            <Brain aria-hidden="true" size={14} />
            {runInterpretationMutation.isPending
              ? 'Interpreting…'
              : totalCount > 0
                ? 'Re-run interpretation'
                : 'Run interpretation'}
          </Button>
        }
        description={
          currentVersion
            ? `Run the provider-independent AI reasoning layer on the latest detection batch of ${dataset.name}. The output is advisory only; it never mutates upstream rows.`
            : 'The dataset has no immutable version yet, so an interpretation cannot be created.'
        }
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {!currentVersion ? (
        <Panel>
          <SectionHeading
            description="The AI reasoning layer needs at least one immutable version of the dataset. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="AI analysis is blocked"
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
          onRetry={() => runInterpretationMutation.mutate()}
          requestId={mutationErrorInfo.requestId}
          title={
            mutationErrorInfo.code === 'ai_provider_failed'
              ? 'AI provider failed'
              : 'AI interpretation failed'
          }
        />
      ) : null}

      {interpretationsError ? (
        <ErrorState
          message={interpretationsError.message}
          onRetry={() => void interpretationsQuery.refetch()}
          requestId={interpretationsError.requestId}
          title={interpretationsError.title}
        />
      ) : null}

      {selectedInterpretation ? (
        <Panel>
          <SectionHeading
            description="The structured output of the selected interpretation. Hypotheses below are numbered; click one to inspect its affected columns and supporting finding ids."
            eyebrow="Selected interpretation"
            title={selectedInterpretation.provider_name}
            action={
              <span className="text-[11px] text-muted">
                {selectedInterpretation.formula_version} ·{' '}
                {formatTimestamp(selectedInterpretation.created_at)}
              </span>
            }
          />
          <InterpretationCard interpretation={selectedInterpretation} />

          {selectedInterpretation.hypotheses.length > 0 ? (
            <section className="mt-6 space-y-3">
              <SectionHeading
                description="Pick a hypothesis to inspect its category, affected columns, supporting finding ids, and confidence."
                eyebrow="Hypotheses"
                title={`${formatNumber(selectedInterpretation.hypotheses.length)} structured entr${selectedInterpretation.hypotheses.length === 1 ? 'y' : 'ies'}`}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedInterpretation.hypotheses.map((hypothesis, index) => {
                  const isSelected = index === selectedHypothesisIndex
                  return (
                    <button
                      className={`rounded-md border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-line bg-canvas/30 hover:bg-elevated/40'
                      }`}
                      key={`${selectedInterpretation.interpretation_id}-${hypothesis.category}-${index}`}
                      onClick={() => setSelectedHypothesisIndex(index)}
                      type="button"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-muted">#{index + 1}</span>
                        <span className="text-muted">{hypothesis.category.replace('_', ' ')}</span>
                        <span className="ml-auto text-muted">
                          {(hypothesis.confidence * 100).toFixed(0)}%
                        </span>
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm text-ink">{hypothesis.summary}</p>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {selectedHypothesis ? (
            <section className="mt-6 space-y-3">
              <SectionHeading
                description="The full category, affected columns, and supporting finding ids for the selected hypothesis."
                eyebrow="Hypothesis detail"
                title={`#${(selectedHypothesisIndex ?? 0) + 1} · ${selectedHypothesis.category.replace('_', ' ')}`}
              />
              <div className="rounded-md border border-line bg-canvas/30 p-4">
                <p className="text-sm leading-6 text-ink">{selectedHypothesis.summary}</p>
                {selectedHypothesis.affected_columns.length > 0 ? (
                  <p className="mt-3 text-[11px] text-muted">
                    Columns:{' '}
                    {selectedHypothesis.affected_columns.map((column) => (
                      <span className="font-mono text-ink/80" key={column}>{` ${column} `}</span>
                    ))}
                  </p>
                ) : null}
                {selectedHypothesis.supporting_finding_ids.length > 0 ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Supporting findings:{' '}
                    {selectedHypothesis.supporting_finding_ids.map((id) => (
                      <span className="font-mono text-ink/80" key={id}>
                        {` ${id.slice(0, 8)}`}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </Panel>
      ) : (
        <Panel>
          <SectionHeading
            description="The detail card will render here once an interpretation row is selected or a new run completes."
            eyebrow="Selected interpretation"
            title="Pick an interpretation"
            action={<span className="text-[11px] text-muted">No selection</span>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Brain aria-hidden="true" size={18} />
            <span>
              No interpretation is currently selected. Run an interpretation above or click a row in the table below.
            </span>
          </div>
        </Panel>
      )}

      <InterpretationsTable
        onPageChange={setPage}
        onSelectInterpretation={(interpretationId) => {
          setSelectedInterpretationId(interpretationId)
          setSelectedHypothesisIndex(0)
        }}
        page={page}
        pageSize={INTERPRETATION_PAGE_SIZE}
        runs={items}
        selectedInterpretationId={selectedInterpretationId}
        totalItems={totalCount}
        totalPages={totalPages}
      />

      {runInterpretationMutation.isSuccess && !runInterpretationMutation.isPending && lastRunCount !== null ? (
        <p className="text-xs text-muted">
          The most recent interpretation produced {formatNumber(lastRunCount)} hypotheses. The table above
          and the recommendations on the next tab refresh automatically.
        </p>
      ) : null}
    </div>
  )
}