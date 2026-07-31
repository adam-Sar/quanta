import { Search, SlidersHorizontal, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { createDataset, listDatasets } from '../api/datasets'
import { ApiError } from '../api/client'
import { DatasetTable, type DatasetSortKey } from '../components/datasets/DatasetTable'
import { PaginationControls } from '../components/datasets/PaginationControls'
import { UploadDatasetModal } from '../components/datasets/UploadDatasetModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber } from '../lib/utils'

const PAGE_SIZE = 50
const searchInputClasses = 'h-9 w-full rounded-md border border-line bg-canvas/50 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-1 focus:ring-accent'

export function DatasetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<DatasetSortKey>('updated_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [uploadOpen, setUploadOpen] = useState(false)

  const datasetsQuery = useQuery({
    queryKey: ['datasets', { page, pageSize: PAGE_SIZE }],
    queryFn: () => listDatasets({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
  const uploadMutation = useMutation({
    mutationFn: createDataset,
    onSuccess: async (dataset) => {
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      setUploadOpen(false)
      navigate(`/datasets/${dataset.id}`)
    },
  })

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const filtered = (datasetsQuery.data?.items ?? []).filter((dataset) => {
      if (!normalizedSearch) return true
      return dataset.name.toLowerCase().includes(normalizedSearch) || dataset.description?.toLowerCase().includes(normalizedSearch) === true
    })

    return filtered.sort((left, right) => {
      const leftVersion = left.current_version
      const rightVersion = right.current_version
      let comparison = 0
      if (sortKey === 'name') comparison = left.name.localeCompare(right.name)
      if (sortKey === 'updated_at') comparison = left.updated_at.localeCompare(right.updated_at)
      if (sortKey === 'rows') comparison = (leftVersion?.row_count ?? -1) - (rightVersion?.row_count ?? -1)
      if (sortKey === 'columns') comparison = (leftVersion?.column_count ?? -1) - (rightVersion?.column_count ?? -1)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [datasetsQuery.data?.items, search, sortDirection, sortKey])

  const handleSort = (nextKey: DatasetSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'name' ? 'asc' : 'desc')
  }

  const apiError = datasetsQuery.error instanceof ApiError ? datasetsQuery.error : null

  return (
    <div className="space-y-8">
      <PageHeader
        action={<Button onClick={() => { uploadMutation.reset(); setUploadOpen(true) }} variant="primary"><UploadCloud aria-hidden="true" size={16} />Add dataset</Button>}
        description="Manage immutable source versions and keep ingestion state visible before analysis begins."
        eyebrow="Source inventory"
        title="Datasets"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="p-4"><p className="text-xs text-muted">Inventory</p><p className="mt-3 text-xl font-semibold text-ink">{datasetsQuery.data ? formatNumber(datasetsQuery.data.pagination.total_items) : '—'}</p><p className="mt-1 text-xs text-muted">logical datasets</p></Panel>
        <Panel className="p-4"><p className="text-xs text-muted">Current page</p><p className="mt-3 text-xl font-semibold text-ink">{datasetsQuery.data ? `${datasetsQuery.data.pagination.page} / ${Math.max(datasetsQuery.data.pagination.total_pages, 1)}` : '—'}</p><p className="mt-1 text-xs text-muted">server pagination</p></Panel>
        <Panel className="p-4"><p className="text-xs text-muted">Analysis status</p><p className="mt-3 text-xl font-semibold text-muted">Not scored</p><p className="mt-1 text-xs text-muted">shown after analysis runs</p></Panel>
      </div>

      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="The API currently exposes inventory metadata only. Quality and findings arrive from later resources."
            title="Dataset inventory"
            action={<Badge tone="muted">Page size {PAGE_SIZE}</Badge>}
          />
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-muted" size={15} />
              <label className="sr-only" htmlFor="dataset-search">Search loaded datasets</label>
              <input className={searchInputClasses} id="dataset-search" onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search loaded datasets" value={search} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted"><SlidersHorizontal aria-hidden="true" size={14} /><span>Search and sort apply to the loaded page.</span></div>
          </div>
        </div>

        {datasetsQuery.isPending ? <div className="space-y-4 px-5 py-8"><LoadingSkeleton lines={1} /><LoadingSkeleton lines={5} /></div> : null}
        {datasetsQuery.isError ? <div className="p-5"><ErrorState message={apiError?.message ?? 'The dataset inventory could not be loaded.'} onRetry={() => void datasetsQuery.refetch()} requestId={apiError?.requestId} /></div> : null}
        {!datasetsQuery.isPending && !datasetsQuery.isError ? <DatasetTable items={visibleItems} onSort={handleSort} sortDirection={sortDirection} sortKey={sortKey} /> : null}
        {datasetsQuery.data ? <PaginationControls onPageChange={setPage} page={datasetsQuery.data.pagination.page} pageSize={datasetsQuery.data.pagination.page_size} totalItems={datasetsQuery.data.pagination.total_items} totalPages={datasetsQuery.data.pagination.total_pages} /> : null}
      </Panel>

      <UploadDatasetModal error={uploadMutation.error} isSubmitting={uploadMutation.isPending} onClose={() => { uploadMutation.reset(); setUploadOpen(false) }} onSubmit={(input) => uploadMutation.mutate(input)} open={uploadOpen} />
    </div>
  )
}
