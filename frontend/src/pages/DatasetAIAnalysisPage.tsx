import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  CircleAlert,
  Play,
  Radar,
  Sparkles,
  TableProperties,
  TriangleAlert,
} from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetInterpretation,
  listDatasetInterpretations,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { InterpretationCard } from '../components/ai/InterpretationCard'
import { InterpretationsTable } from '../components/ai/InterpretationsTable'
import { Badge } from '../components/ui/Badge'
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
    queryFn: () => listDatasetInterpretations(datasetId ?? '', { page, pageSize: INTERPRETATION_PAGE_SIZE }),
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
      return { message: mutationError.message, requestId: mutationError.requestId, code: mutationError.code }
    }
    return { message: 'AI interpretation could not be started.', requestId: null as string | null, code: 'request_failed' as string }
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

  // Reset hypothesis index if the selected interpretation no longer contains it (e.g., a refresh changed the row).
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
  const interpretationsError = interpretationsQuery.isError
    ? describeError(interpretationsQuery.error, 'Interpretations are not available yet')
    : null
  const lastRun = runInterpretationMutation.data

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
            <Button
              disabled={runInterpretationMutation.isPending || !currentVersion}
              onClick={() => { runInterpretationMutation.reset(); runInterpretationMutation.mutate() }}
              size="sm"
              variant="primary"
            >
              <Play aria-hidden="true" size={14} />
              {runInterpretationMutation.isPending ? 'Interpreting…' : (totalCount > 0 ? 'Re-run interpretation' : 'Run interpretation')}
            </Button>
          </div>
        }
        description={currentVersion
          ? `Run the provider-independent AI reasoning layer on the latest detection batch of ${dataset.name}. The output is advisory only; it never mutates upstream rows.`
          : 'The dataset has no immutable version yet, so an interpretation cannot be created.'}
        eyebrow="Dataset AI analysis"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Interpretations</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatNumber(totalCount)}</p>
          <p className="mt-1 text-xs text-muted">persisted runs</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Hypotheses (last run)</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun ? formatNumber(lastRun.hypotheses.length) : (items[0] ? formatNumber(items[0].hypotheses.length) : '—')}</p>
          <p className="mt-1 text-xs text-muted">structured JSONB entries</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Last run</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun ? formatTimestamp(lastRun.created_at) : (items[0] ? formatTimestamp(items[0].created_at) : '—')}</p>
          <p className="mt-1 text-xs text-muted">{lastRun ? `provider ${lastRun.provider_name}` : 'run one above'}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Formula</p>
          <p className="mt-3 text-xl font-semibold text-ink">{lastRun ? lastRun.formula_version : (items[0]?.formula_version ?? '—')}</p>
          <p className="mt-1 text-xs text-muted">persisted on every row</p>
        </Panel>
      </div>

      {mutationErrorInfo ? (
        <Panel className="border-l-2 border-l-danger/50">
          <SectionHeading
            description="The backend rejected the AI interpretation run. The dataset's analysis state is unchanged."
            eyebrow="Interpretation failed"
            title="The last interpretation run did not start"
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
            description="The AI reasoning layer needs at least one immutable version of the dataset. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="AI analysis is blocked"
            action={<Badge dot tone="warning">No version</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {interpretationsError ? (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="Interpretations are the durable output of the Task 7 reasoning service. The backend returns 409 until a detection batch exists."
            eyebrow="Interpretations"
            title="Interpretations"
            action={<Badge dot tone="muted">Unavailable</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Sparkles aria-hidden="true" size={18} />
            <span>{interpretationsError.message}</span>
          </div>
        </Panel>
      ) : null}

      {selectedInterpretation ? (
        <section className="space-y-4">
          <SectionHeading
            description="The detail cards below show the structured output of the selected interpretation. Click a different row in the table to switch the focus."
            eyebrow="Selected interpretation"
            title={selectedInterpretation.interpretation_id}
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone="muted">{selectedInterpretation.formula_version}</Badge>
                <Badge dot tone="muted">{formatTimestamp(selectedInterpretation.created_at)}</Badge>
              </div>
            }
          />
          <InterpretationCard interpretation={selectedInterpretation} />

          {selectedInterpretation.hypotheses.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                description="Pick a hypothesis to inspect its category, affected columns, supporting finding ids, and confidence."
                eyebrow="Hypotheses"
                title={`${selectedInterpretation.hypotheses.length} structured entr${selectedInterpretation.hypotheses.length === 1 ? 'y' : 'ies'}`}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedInterpretation.hypotheses.map((hypothesis, index) => {
                  const isSelected = index === selectedHypothesisIndex
                  return (
                    <button
                      className={`rounded-md border px-4 py-3 text-left transition-colors ${isSelected ? 'border-accent/50 bg-accent/5' : 'border-line bg-canvas/30 hover:bg-elevated/40'}`}
                      key={`${selectedInterpretation.interpretation_id}-${hypothesis.category}-${index}`}
                      onClick={() => setSelectedHypothesisIndex(index)}
                      type="button"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge dot tone="muted">{hypothesis.category.replace('_', ' ')}</Badge>
                        <Badge dot tone="muted">{(hypothesis.confidence * 100).toFixed(0)}%</Badge>
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm text-ink">{hypothesis.summary}</p>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {selectedHypothesis ? (
            <section className="space-y-3">
              <SectionHeading
                description="The full category, affected columns, and supporting finding ids for the selected hypothesis."
                eyebrow="Hypothesis detail"
                title="Selected hypothesis"
              />
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <InterpretationCard interpretation={null} />
                <div className="rounded-md border border-line bg-canvas/30 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Hypothesis payload</p>
                  <p className="mt-2 text-sm leading-6 text-ink">{selectedHypothesis.summary}</p>
                  {selectedHypothesis.affected_columns.length > 0 ? (
                    <p className="mt-3 text-[11px] text-muted">
                      Columns: {selectedHypothesis.affected_columns.map((column) => <span className="font-mono text-ink/80" key={column}>{` ${column} `}</span>)}
                    </p>
                  ) : null}
                  {selectedHypothesis.supporting_finding_ids.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted">
                      Supporting findings: {selectedHypothesis.supporting_finding_ids.map((id) => <span className="font-mono text-ink/80" key={id}>{` ${id.slice(0, 8)}`}</span>)}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="The detail cards will render here once an interpretation row is selected or a new run completes."
            eyebrow="Selected interpretation"
            title="Pick an interpretation"
            action={<Badge dot tone="muted">No selection</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <Brain aria-hidden="true" size={18} />
            <span>No interpretation is currently selected. Run an interpretation above or click a row in the table below.</span>
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

      {runInterpretationMutation.isSuccess && !runInterpretationMutation.isPending ? (
        <Panel className="border-l-2 border-l-success/50">
          <SectionHeading
            description="A fresh interpretation row is now visible above. The run history and selected interpretation will update on the next query refresh."
            eyebrow="Interpretation completed"
            title="Run succeeded"
            action={<Badge dot tone="success">Succeeded</Badge>}
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <Brain aria-hidden="true" className="text-success" size={16} />
            <span>The interpretation {lastRun?.interpretation_id.slice(0, 8)} was persisted with formula {lastRun?.formula_version ?? 'task7-1.0'}.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
