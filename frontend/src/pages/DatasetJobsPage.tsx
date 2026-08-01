import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { getDataset } from '../api/datasets'
import { listDatasetJobs } from '../api/analysis'
import { ApiError } from '../api/client'
import { DatasetTabs } from '../components/datasets/DatasetTabs'
import { JobCard } from '../components/jobs/JobCard'
import { JobsTable } from '../components/jobs/JobsTable'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'

const JOB_PAGE_SIZE = 50

function describeError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { title: 'Resource unavailable', message: error.message, requestId: error.requestId }
    }
    return { title: fallback, message: error.message, requestId: error.requestId }
  }
  return { title: fallback, message: 'The Quanta API did not return a response.', requestId: null as string | null }
}

export function DatasetJobsPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const enabled = Boolean(datasetId)

  const [page, setPage] = useState(1)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const datasetQuery = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId ?? ''),
    enabled,
  })
  const jobsQuery = useQuery({
    queryKey: ['analysis', datasetId, 'jobs', page],
    queryFn: () => listDatasetJobs(datasetId ?? '', { page, pageSize: JOB_PAGE_SIZE }),
    enabled,
    retry: false,
  })

  const items = jobsQuery.data?.items ?? []
  const totalCount = jobsQuery.data?.pagination.total_items ?? 0
  const totalPages = jobsQuery.data?.pagination.total_pages ?? 1

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null
    return items.find((row) => row.job_id === selectedJobId) ?? null
  }, [items, selectedJobId])

  useEffect(() => {
    if (selectedJobId) return
    if (jobsQuery.data?.items[0]) {
      setSelectedJobId(jobsQuery.data.items[0].job_id)
    }
  }, [jobsQuery.data, selectedJobId])

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
  const jobsError = jobsQuery.isError ? describeError(jobsQuery.error, 'Jobs are not available yet') : null

  return (
    <div className="space-y-6">
      <PageHeader
        description="Every durable analysis run on this dataset. Jobs are recorded with a status lifecycle (pending → running → succeeded | failed) for every synchronous run."
        title={dataset.name}
      />

      <DatasetTabs datasetId={dataset.id} />

      {jobsError ? (
        <ErrorState
          message={jobsError.message}
          onRetry={() => void jobsQuery.refetch()}
          requestId={jobsError.requestId}
          title={jobsError.title}
        />
      ) : null}

      {selectedJob ? (
        <Panel>
          <SectionHeading
            description="The detail card below shows the lifecycle, structured result, and any failure envelope of the selected job. Click a different row in the table to switch the focus."
            eyebrow="Selected job"
            title={selectedJob.title}
            action={
              <span className="text-[11px] text-muted">{selectedJob.formula_version}</span>
            }
          />
          <JobCard job={selectedJob} />
        </Panel>
      ) : (
        <Panel>
          <SectionHeading
            description="The detail card will render here once a job row is available."
            eyebrow="Selected job"
            title="Pick a job"
            action={<span className="text-[11px] text-muted">No selection</span>}
          />
          <div className="mt-6 flex items-center gap-3 text-sm text-muted">
            <span>No job is currently selected.</span>
          </div>
        </Panel>
      )}

      <JobsTable
        onPageChange={setPage}
        onSelectJob={setSelectedJobId}
        page={page}
        pageSize={JOB_PAGE_SIZE}
        runs={items}
        selectedJobId={selectedJobId}
        totalItems={totalCount}
        totalPages={totalPages}
      />
    </div>
  )
}