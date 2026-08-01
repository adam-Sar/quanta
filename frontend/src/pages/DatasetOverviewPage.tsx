import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

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
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatTimestamp } from '../lib/utils'

const DATASET_TABS = [
  { label: 'Overview', to: '' },
  { label: 'Profile', to: 'profile' },
  { label: 'Findings', to: 'findings' },
  { label: 'History', to: 'history' },
  { label: 'AI', to: 'ai' },
  { label: 'Recommendations', to: 'recommendations' },
  { label: 'Jobs', to: 'jobs' },
] as const

function DatasetTabs({ datasetId }: { datasetId: string }) {
  return (
    <nav
      aria-label="Dataset sections"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-line"
    >
      {DATASET_TABS.map(({ label, to }) => (
        <NavLink
          className={({ isActive }) =>
            `relative -mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`
          }
          end={to === ''}
          key={to || 'overview'}
          to={`/datasets/${datasetId}/${to}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

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
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
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
  const erroredResources: { title: string; message: string; requestId: string | null }[] = []
  if (profileQuery.isError) erroredResources.push(describeError(profileQuery.error, 'Profile is not available yet'))
  if (findingsQuery.isError) erroredResources.push(describeError(findingsQuery.error, 'Findings are not available yet'))
  if (scoreQuery.isError) erroredResources.push(describeError(scoreQuery.error, 'Score is not available yet'))
  if (lineageQuery.isError) erroredResources.push(describeError(lineageQuery.error, 'Lineage is not available yet'))

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Link to="/datasets">
            <Button size="sm" variant="ghost">
              <ArrowLeft aria-hidden="true" size={14} />
              Back to datasets
            </Button>
          </Link>
        }
        description={dataset.description ?? 'No description provided for this dataset.'}
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      <div className="grid gap-4 xl:grid-cols-2">
        {scoreQuery.data ? (
          <QualityScoreCard components={scoreQuery.data.components} score={scoreQuery.data} />
        ) : (
          <Panel>
            <SectionHeading
              description="The quality score requires a fresh profile and detection batch. The backend returns 409 until those exist."
              eyebrow="Authoritative score"
              title="Quality score"
              action={<span className="text-[11px] text-muted">Not scored</span>}
            />
            <p className="mt-6 text-sm text-muted">
              Run the analysis jobs to compute the deterministic score. The value will appear here once the backend
              persists it.
            </p>
          </Panel>
        )}

        {profileQuery.data ? (
          <ProfileSummaryCard datasetId={dataset.id} profile={profileQuery.data} />
        ) : (
          <Panel>
            <SectionHeading
              description="The profile is the input to every detector and the quality score."
              eyebrow="Profile summary"
              title="Profile"
              action={<span className="text-[11px] text-muted">Not profiled</span>}
            />
            <p className="mt-6 text-sm text-muted">
              The dataset has not been profiled yet. Trigger a run from the Profile tab.
            </p>
          </Panel>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <FindingsPreview
          datasetId={dataset.id}
          items={findingsQuery.data?.items ?? []}
          total={findingsQuery.data?.pagination.total_items ?? 0}
        />
        <LineageCard datasetId={dataset.id} lineage={lineageQuery.data ?? { dataset_id: dataset.id, edges: [] }} />
      </div>

      {erroredResources.length > 0 ? (
        <Panel>
          <SectionHeading
            description="These resources need an analysis run before they are available. The backend returns the standard error envelope."
            eyebrow="Pending resources"
            title="Analysis status"
          />
          <ul className="mt-4 space-y-3">
            {erroredResources.map((entry) => (
              <li className="flex items-start gap-3 text-sm" key={entry.title}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <div>
                  <p className="font-medium text-ink">{entry.title}</p>
                  <p className="text-xs text-muted">{entry.message}</p>
                  {entry.requestId ? (
                    <p className="mt-1 font-mono text-[11px] text-muted">Request ID: {entry.requestId}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[11px] text-muted">
            Last checked {formatTimestamp(new Date().toISOString())}.
          </p>
        </Panel>
      ) : null}
    </div>
  )
}