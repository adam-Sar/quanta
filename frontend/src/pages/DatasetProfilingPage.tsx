import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CircleAlert,
  History,
  Play,
  ScrollText,
  Sparkles,
  Timer,
  TriangleAlert,
} from 'lucide-react'

import { getDataset } from '../api/datasets'
import {
  createDatasetProfile,
  getDatasetProfile,
  listDatasetProfiles,
} from '../api/analysis'
import { ApiError } from '../api/client'
import { ColumnProfileTable } from '../components/profile/ColumnProfileTable'
import { ColumnProfileDetailCard } from '../components/profile/ColumnProfileDetailCard'
import { ProfileRunsTable } from '../components/profile/ProfileRunsTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

const PROFILE_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'dataset_not_profileable' || error.code === 'profile_not_available' || error.status === 409) {
      return {
        title: 'Profile is not available yet',
        message: 'The backend has no profile for this dataset yet. Trigger a run from the action button to compute the first one.',
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
      return { message: runMutationError.message, requestId: runMutationError.requestId, code: runMutationError.code }
    }
    return { message: 'Profile run could not be started.', requestId: null as string | null, code: 'request_failed' as string }
  }, [runMutationError])

  // Default the selection to the latest run on first load and when runs change.
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
  const totalRuns = profileRunsQuery.data?.pagination.total_items ?? 0
  const totalPages = profileRunsQuery.data?.pagination.total_pages ?? 1
  const latest = latestProfileQuery.data
  const profileError = latestProfileQuery.isError ? describeError(latestProfileQuery.error, 'Profile is not available yet') : null
  const runsError = profileRunsQuery.isError ? describeError(profileRunsQuery.error, 'Profile runs could not be loaded') : null

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Link to={`/datasets/${dataset.id}`}>
              <Button size="sm" variant="ghost"><ArrowLeft aria-hidden="true" size={14} />Back to overview</Button>
            </Link>
            <Button
              disabled={runProfileMutation.isPending || !currentVersion}
              onClick={() => { runProfileMutation.reset(); runProfileMutation.mutate() }}
              size="sm"
              variant="primary"
            >
              <Play aria-hidden="true" size={14} />
              {runProfileMutation.isPending ? 'Running…' : (latest ? 'Re-run profile' : 'Run profile')}
            </Button>
          </div>
        }
        description={currentVersion ? `Profiling the current version v${currentVersion.version_number} (${currentVersion.original_filename}). The metrics shown come from the immutable JSONB rows persisted by the backend.` : 'The dataset has no immutable version yet, so a profile cannot be created.'}
        eyebrow="Dataset profiling"
        title={dataset.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="text-xs text-muted">Sample size</p>
          <p className="mt-3 text-xl font-semibold text-ink">{latest ? formatNumber(latest.sample_size) : '—'}</p>
          <p className="mt-1 text-xs text-muted">
            {latest ? (latest.sampled === 'full' ? 'Full sample considered' : 'Bounded sample considered') : 'shown after a profile run'}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Profile duration</p>
          <p className="mt-3 text-xl font-semibold text-ink">{latest ? `${formatNumber(latest.duration_ms)} ms` : '—'}</p>
          <p className="mt-1 text-xs text-muted">wall-clock for the latest run</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Columns profiled</p>
          <p className="mt-3 text-xl font-semibold text-ink">{latest ? formatNumber(latest.columns.length) : '—'}</p>
          <p className="mt-1 text-xs text-muted">per-column metrics captured</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Profile runs</p>
          <p className="mt-3 text-xl font-semibold text-ink">{profileRunsQuery.data ? formatNumber(totalRuns) : '—'}</p>
          <p className="mt-1 text-xs text-muted">{profileRunsQuery.data ? `Page ${runsPage} of ${Math.max(totalPages, 1)}` : 'loaded from backend'}</p>
        </Panel>
      </div>

      {runMutationErrorInfo ? (
        <Panel className="border-l-2 border-l-danger/50">
          <SectionHeading
            description="The backend rejected the profile run. The dataset's analysis state is unchanged."
            eyebrow="Profile run failed"
            title="The last profile run did not start"
          />
          <div className="mt-4 flex items-start gap-3 text-sm text-muted">
            <CircleAlert aria-hidden="true" className="mt-0.5 text-danger" size={16} />
            <div>
              <p className="text-ink">{runMutationErrorInfo.message}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">Code: {runMutationErrorInfo.code}{runMutationErrorInfo.requestId ? ` · Request ID: ${runMutationErrorInfo.requestId}` : ''}</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {!currentVersion ? (
        <Panel className="border-l-2 border-l-warning/50">
          <SectionHeading
            description="Profiling needs an immutable dataset version. Upload a file in the dataset explorer to create the first version."
            eyebrow="No version"
            title="Profiling is blocked"
            action={<Badge dot tone="warning">No version</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <TriangleAlert aria-hidden="true" className="text-warning" size={18} />
            <span>No immutable version is associated with this dataset yet.</span>
          </div>
        </Panel>
      ) : null}

      {profileError ? (
        <Panel className="border-l-2 border-l-line">
          <SectionHeading
            description="Profiling produces the JSONB metrics every detector and the quality score rely on."
            eyebrow="Latest profile"
            title="Profile"
            action={<Badge dot tone="muted">Not profiled</Badge>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <ScrollText aria-hidden="true" size={18} />
            <span>{profileError.message}</span>
          </div>
        </Panel>
      ) : null}

      {latest ? (
        <Panel>
          <SectionHeading
            description="The latest profile is the authoritative source for the per-column metrics below. The frontend never recomputes these values."
            eyebrow="Latest profile"
            title={latest.profile_id}
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone={latest.sampled === 'full' ? 'success' : 'info'}>{latest.sampled === 'full' ? 'Full sample' : 'Bounded sample'}</Badge>
                <Badge dot tone="muted">{formatTimestamp(latest.completed_at)}</Badge>
              </div>
            }
          />
          <div className="mt-4 grid gap-3 text-xs text-muted sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Started</p>
              <p className="mt-1 font-mono text-ink">{formatTimestamp(latest.started_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Completed</p>
              <p className="mt-1 font-mono text-ink">{formatTimestamp(latest.completed_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Duration</p>
              <p className="mt-1 inline-flex items-center gap-1 font-mono text-ink"><Timer aria-hidden="true" size={12} />{formatNumber(latest.duration_ms)} ms</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {selectedRun ? (
        <section className="space-y-4">
          <SectionHeading
            description="Select a column to inspect its full metrics: null counts and rates, distinct values, top values, and the typed numeric / temporal / string-length stats. The selection also feeds the run history."
            eyebrow="Column metrics"
            title={`Run ${selectedRun.profile_id.slice(0, 8)}`}
            action={<Badge dot tone="accent">{formatNumber(selectedRun.columns.length)} columns</Badge>}
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
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every profile run the backend has persisted. Inspect a run to load its per-column metrics above without re-fetching."
            eyebrow="Profile runs"
            title="Run history"
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Badge dot tone="muted"><History aria-hidden="true" size={11} className="mr-1" />{formatNumber(totalRuns)} runs</Badge>
              </div>
            }
          />
        </div>
        <div className="p-5">
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
        <Panel className="border-l-2 border-l-success/50">
          <SectionHeading
            description="A fresh profile is now visible above. The run history and latest-profile metrics will update on the next query refresh."
            eyebrow="Profile run completed"
            title="Run successful"
            action={<Badge dot tone="success">Succeeded</Badge>}
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <Sparkles aria-hidden="true" className="text-success" size={16} />
            <span>The new profile is in the run history; the column table now shows its metrics.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
