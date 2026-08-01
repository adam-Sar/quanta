import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Brain, Gauge, GitCompare, Radar, ScrollText, Sparkles, TableProperties } from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  getDatasetLineage,
  getDatasetProfile,
  getDatasetScore,
  listFindings,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { FindingsPreview } from '../components/overview/FindingsPreview'
import { LineageCard } from '../components/overview/LineageCard'
import { ProfileSummaryCard } from '../components/overview/ProfileSummaryCard'
import { QualityScoreCard } from '../components/overview/QualityScoreCard'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatTimestamp } from '../lib/utils'

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'scoring_not_scoreable' || error.code === 'dataset_not_profileable') {
      return {
        title: fallback,
        message: 'The backend has no record for this artifact yet. Run the corresponding analysis job first.',
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

export function DatasetOverviewPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const enabled = Boolean(datasetId)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const profileQuery = useQuery({
    queryKey: ['analysis', datasetId, 'profile'],
    queryFn: () => getDatasetProfile(datasetId ?? ''),
    enabled,
    retry: false,
  })
  const findingsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'findings'],
    queryFn: () => listFindings(datasetId ?? '', { pageSize: 50 }),
    enabled,
    retry: false,
  })
  const scoreQuery = useQuery({
    queryKey: ['analysis', datasetId, 'score'],
    queryFn: () => getDatasetScore(datasetId ?? ''),
    enabled,
    retry: false,
  })
  const lineageQuery = useQuery({
    queryKey: ['analysis', datasetId, 'lineage'],
    queryFn: () => getDatasetLineage(datasetId ?? ''),
    enabled,
    retry: false,
  })

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
  const version = dataset.current_version
  const erroredResources: { title: string; message: string; requestId: string | null }[] = []

  if (profileQuery.isError) erroredResources.push(describeError(profileQuery.error, 'Profile is not available yet'))
  if (findingsQuery.isError) erroredResources.push(describeError(findingsQuery.error, 'Findings are not available yet'))
  if (scoreQuery.isError) erroredResources.push(describeError(scoreQuery.error, 'Score is not available yet'))
  if (lineageQuery.isError) erroredResources.push(describeError(lineageQuery.error, 'Lineage is not available yet'))

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Link to="/datasets">
              <Button size="sm" variant="ghost"><ArrowLeft aria-hidden="true" size={14} />Back to datasets</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/profile`}>
              <Button size="sm" variant="secondary"><TableProperties aria-hidden="true" size={14} />Profiling</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/findings`}>
              <Button size="sm" variant="secondary"><Radar aria-hidden="true" size={14} />Findings</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/history`}>
              <Button size="sm" variant="secondary"><GitCompare aria-hidden="true" size={14} />History</Button>
            </Link>
            <Link to={`/datasets/${dataset.id}/ai`}>
              <Button size="sm" variant="secondary"><Brain aria-hidden="true" size={14} />AI</Button>
            </Link>
          </div>
        }
        description={dataset.description ?? 'No description provided for this dataset.'}
        eyebrow="Dataset overview"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Current version</p>
          <p className="mt-3 text-xl font-semibold text-ink">{version ? `v${version.version_number}` : '—'}</p>
          <p className="mt-1 text-xs text-muted">immutable source</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Status</p>
          <p className="mt-3 text-xl font-semibold">
            {version ? <Badge tone="success" dot>{version.status}</Badge> : <Badge tone="muted" dot>No version</Badge>}
          </p>
          <p className="mt-1 text-xs text-muted">storage state</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Quality score</p>
          <p className="mt-3 text-xl font-semibold text-ink">
            {scoreQuery.data ? `${scoreQuery.data.score.toFixed(1)} / 100` : '—'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {scoreQuery.data ? `Grade ${scoreQuery.data.grade} · ${formatTimestamp(scoreQuery.data.created_at)}` : 'shown after scoring'}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Findings</p>
          <p className="mt-3 text-xl font-semibold text-ink">
            {findingsQuery.data ? findingsQuery.data.pagination.total_items : '—'}
          </p>
          <p className="mt-1 text-xs text-muted">aggregated in latest batch</p>
        </Panel>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {scoreQuery.data ? (
          <QualityScoreCard components={scoreQuery.data.components} score={scoreQuery.data} />
        ) : (
          <Panel className="border-l-2 border-l-line">
            <SectionHeading
              description="The quality score requires a fresh profile and detection batch. The backend returns 409 until those exist."
              eyebrow="Authoritative score"
              title="Quality score"
              action={<Badge dot tone="muted">Not scored</Badge>}
            />
            <div className="mt-6 flex items-center gap-3 text-sm text-muted">
              <Gauge aria-hidden="true" size={18} />
              <span>Run the analysis jobs to compute the deterministic score.</span>
            </div>
          </Panel>
        )}

        {profileQuery.data ? (
          <ProfileSummaryCard datasetId={dataset.id} profile={profileQuery.data} />
        ) : (
          <Panel className="border-l-2 border-l-line">
            <SectionHeading
              description="The profile is the input to every detector and the quality score."
              eyebrow="Profile summary"
              title="Profile"
              action={<Badge dot tone="muted">Not profiled</Badge>}
            />
            <div className="mt-6 flex items-center gap-3 text-sm text-muted">
              <ScrollText aria-hidden="true" size={18} />
              <span>The dataset has not been profiled yet.</span>
            </div>
          </Panel>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <FindingsPreview
          datasetId={dataset.id}
          items={findingsQuery.data?.items ?? []}
          total={findingsQuery.data?.pagination.total_items ?? 0}
        />
        <LineageCard datasetId={dataset.id} lineage={lineageQuery.data ?? { dataset_id: dataset.id, edges: [] }} />
      </section>

      {erroredResources.length > 0 ? (
        <Panel className="border-l-2 border-l-warning/50">
          <SectionHeading
            description="These resources need an analysis run before they are available."
            eyebrow="Pending resources"
            title="Analysis status"
          />
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {erroredResources.map((entry) => (
              <li className="flex items-start gap-2" key={entry.title}>
                <Sparkles aria-hidden="true" className="mt-0.5 text-warning" size={14} />
                <div>
                  <p className="font-medium text-ink">{entry.title}</p>
                  <p className="text-xs text-muted">{entry.message}</p>
                  {entry.requestId ? <p className="mt-1 font-mono text-[11px] text-muted">Request ID: {entry.requestId}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
