import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Play, TriangleAlert } from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetProfile,
  getDatasetProfile,
  listDatasetProfiles,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { ColumnProfileTable } from '../components/profile/ColumnProfileTable'
import { ColumnProfileDetailCard } from '../components/profile/ColumnProfileDetailCard'
import { ProfileRunsTable } from '../components/profile/ProfileRunsTable'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const PROFILE_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (
      error.code === 'dataset_not_profileable' ||
      error.code === 'profile_not_available' ||
      error.status === 409
    ) {
      return {
        title: 'Profile is not available yet',
        message: 'The backend has no profile for this dataset yet. Trigger a run from the action button to compute the first one.',
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

export function DatasetProfilingPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const queryClient = useQueryClient()
  const enabled = Boolean(datasetId)

  const [runsPage, setRunsPage] = useState(1)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const latestProfileQuery = useQuery({
    queryKey: ['analysis', datasetId, 'profile'],
    queryFn: () => getDatasetProfile(datasetId ?? ''),
    enabled,
    retry: false,
  })
  const profileRunsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'profiles', runsPage],
    queryFn: () => listDatasetProfiles(datasetId ?? '', { page: runsPage, pageSize: PROFILE_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const runProfileMutation = useMutation({
    mutationFn: () => createDatasetProfile(datasetId ?? ''),
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.profile_id)
      setSelectedColumn(profile.columns[0]?.name ?? null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'profile'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', datasetId, 'profiles'] }),
      ])
      setRunsPage(1)
    },
  })

  const runMutationError = runProfileMutation.error
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
      message: 'Profile run could not be started.',
      requestId: null as string | null,
      code: 'request_failed' as string,
    }
  }, [runMutationError])

  useEffect(() => {
    if (selectedProfileId) return
    if (latestProfileQuery.data) {
      setSelectedProfileId(latestProfileQuery.data.profile_id)
      if (!selectedColumn && latestProfileQuery.data.columns[0]) {
        setSelectedColumn(latestProfileQuery.data.columns[0].name)
      }
      return
    }
    if (profileRunsQuery.data?.items[0]) {
      setSelectedProfileId(profileRunsQuery.data.items[0].profile_id)
      if (!selectedColumn && profileRunsQuery.data.items[0].columns[0]) {
        setSelectedColumn(profileRunsQuery.data.items[0].columns[0].name)
      }
    }
  }, [latestProfileQuery.data, profileRunsQuery.data, selectedColumn, selectedProfileId])

  const selectedRun = useMemo(() => {
    if (!selectedProfileId) return null
    if (latestProfileQuery.data?.profile_id === selectedProfileId) {
      return latestProfileQuery.data
    }
    return profileRunsQuery.data?.items.find((run) => run.profile_id === selectedProfileId) ?? null
  }, [latestProfileQuery.data, profileRunsQuery.data, selectedProfileId])

  const selectedColumnEntry = useMemo(() => {
    if (!selectedRun) return null
    return selectedRun.columns.find((column) => column.name === selectedColumn) ?? null
  }, [selectedRun, selectedColumn])

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
  const totalRuns = profileRunsQuery.data?.pagination.total_items ?? 0
  const totalPages = profileRunsQuery.data?.pagination.total_pages ?? 1
  const latest = latestProfileQuery.data
  const profileError = latestProfileQuery.isError
    ? describeError(latestProfileQuery.error, 'Profile is not available yet')
    : null
  const runsError = profileRunsQuery.isError
    ? describeError(profileRunsQuery.error, 'Profile runs could not be loaded')
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Button
            disabled={runProfileMutation.isPending || !currentVersion}
            onClick={() => {
              runProfileMutation.reset()
              runProfileMutation.mutate()
            }}
            variant="primary"
          >
            <Play aria-hidden="true" size={14} />
            {runProfileMutation.isPending
              ? 'Running…'
              : latest
                ? 'Re-run profile'
                : 'Run profile'}
          </Button>
        }
        description={
          currentVersion
            ? `Profiling the current version v${currentVersion.version_number} (${currentVersion.original_filename}). The metrics shown come from the immutable JSONB rows persisted by the backend.`
            : 'The dataset has no immutable version yet, so a profile cannot be created.'
        }
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {!currentVersion ? (
        <Panel>
          <SectionHeading
            description="Profiling needs an immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Profiling is blocked"
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {runMutationErrorInfo ? (
        <ErrorState
          message={runMutationErrorInfo.message}
          onRetry={() => runProfileMutation.mutate()}
          requestId={runMutationErrorInfo.requestId}
          title="Profile run failed"
        />
      ) : null}

      {latest ? (
        <Panel>
          <SectionHeading
            description="The latest profile is the authoritative source for the per-column metrics below. The frontend never recomputes these values."
            eyebrow="Latest profile"
            title="Profile run"
            action={
              <span className="text-[11px] text-muted">
                {latest.sampled === 'full' ? 'Full sample' : 'Bounded sample'} ·{' '}
                {formatNumber(latest.duration_ms)} ms ·{' '}
                <span className="font-mono">{latest.profile_id.slice(0, 8)}</span>
              </span>
            }
          />
          <p className="mt-4 text-sm text-muted">
            Started <span className="font-mono text-ink/80">{formatTimestamp(latest.started_at)}</span>,
            completed <span className="font-mono text-ink/80">{formatTimestamp(latest.completed_at)}</span>,
            across <span className="font-mono text-ink/80">{formatNumber(latest.sample_size)}</span> rows
            and <span className="font-mono text-ink/80">{formatNumber(latest.columns.length)}</span>{' '}
            columns.
          </p>
        </Panel>
      ) : null}

      {profileError ? (
        <ErrorState
          message={profileError.message}
          onRetry={() => void latestProfileQuery.refetch()}
          requestId={profileError.requestId}
          title={profileError.title}
        />
      ) : null}

      {selectedRun ? (
        <section className="space-y-4">
          <SectionHeading
            description="Select a column to inspect its full metrics: null counts and rates, distinct values, top values, and the typed numeric / temporal / string-length stats."
            eyebrow="Column metrics"
            title={`Run ${selectedRun.profile_id.slice(0, 8)}`}
          />
          <ColumnProfileTable
            columns={selectedRun.columns}
            sampleSize={selectedRun.sample_size}
            selectedColumn={selectedColumn}
            onSelectColumn={setSelectedColumn}
          />
          <ColumnProfileDetailCard column={selectedColumnEntry} />
        </section>
      ) : null}

      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5 md:px-6">
          <SectionHeading
            description="Every profile run the backend has persisted. Inspect a run to load its per-column metrics above without re-fetching."
            eyebrow="Run history"
            title="Profile runs"
            action={
              <span className="text-[11px] text-muted">{formatNumber(totalRuns)} runs</span>
            }
          />
        </div>
        <div className="p-5 md:p-6">
          {profileRunsQuery.isPending ? (
            <div className="space-y-4">
              <LoadingSkeleton lines={1} />
              <LoadingSkeleton lines={6} />
            </div>
          ) : runsError ? (
            <ErrorState
              message={runsError.message}
              onRetry={() => void profileRunsQuery.refetch()}
              requestId={runsError.requestId}
              title={runsError.title}
            />
          ) : profileRunsQuery.data ? (
            <ProfileRunsTable
              currentVersion={currentVersion}
              onPageChange={setRunsPage}
              onSelectProfile={(profileId) => {
                setSelectedProfileId(profileId)
                const target = profileRunsQuery.data.items.find((run) => run.profile_id === profileId)
                if (target && !target.columns.some((column) => column.name === selectedColumn)) {
                  setSelectedColumn(target.columns[0]?.name ?? null)
                }
              }}
              page={runsPage}
              pageSize={PROFILE_PAGE_SIZE}
              runs={profileRunsQuery.data.items}
              selectedProfileId={selectedProfileId}
              totalItems={totalRuns}
              totalPages={totalPages}
            />
          ) : null}
        </div>
      </Panel>

      {runProfileMutation.isSuccess && !runProfileMutation.isPending ? (
        <p className="text-xs text-muted">
          The most recent profile run is visible above. The run history and latest-profile metrics refresh
          automatically.
          {' '}
          <Link className="text-accent hover:underline" to={`/datasets/${dataset.id}/findings`}>
            Run detection →
          </Link>
        </p>
      ) : null}
    </div>
  )
}