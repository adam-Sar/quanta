import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  FileUp,
  Plus,
  Inbox,
} from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { FileIcon } from "@/components/ui/FileIcon";
import { UploadDatasetModal } from "@/components/datasets/UploadDatasetModal";
import {
  createDataset,
  listDatasets,
  type CreateDatasetInput,
} from "@/api/datasets";
import type { Dataset, DatasetListResponse } from "@/types/api";
import { formatBytes, formatNumber, formatRelativeFromNow } from "@/lib/utils";

type SortField = "updated_at" | "name" | "rows" | "size";

export function DatasetsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({
    field: "updated_at",
    dir: "desc",
  });
  const [open, setOpen] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["datasets", { page, page_size: pageSize }],
    queryFn: () => listDatasets({ page, page_size: pageSize }),
  });

  const create = useMutation({
    mutationFn: createDataset,
    onSuccess: (dataset) => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      setOpen(false);
      navigate(`/datasets/${dataset.id}`);
    },
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const filtered = search
      ? items.filter((it) =>
          (it.name + (it.description ?? ""))
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
      : items;
    const sorted = [...filtered].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const get = (x: (typeof items)[number]) => {
        switch (sort.field) {
          case "name":
            return x.name.toLowerCase();
          case "rows":
            return x.current_version?.row_count ?? -1;
          case "size":
            return x.current_version?.size_bytes ?? -1;
          default:
            return Date.parse(x.updated_at);
        }
      };
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [data, search, sort]);

  const toggleSort = (field: SortField) => {
    setSort((s) =>
      s.field === field
        ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "desc" },
    );
  };

  const header = (
    <button
      type="button"
      onClick={() => toggleSort}
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 hover:text-ink-700"
    >
      <span>Name</span>
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return <DatasetsBody
    data={data}
    isLoading={isLoading}
    error={error}
    isRefetching={isRefetching}
    search={search}
    setSearch={setSearch}
    page={page}
    setPage={setPage}
    open={open}
    setOpen={setOpen}
    rows={rows}
    header={header}
    onRefresh={() => refetch()}
    onCreate={(input) => create.mutate(input)}
    createPending={create.isPending}
    createError={create.error}
  />;

interface DatasetsBodyProps {
  data: DatasetListResponse | undefined;
  isLoading: boolean;
  error: unknown;
  isRefetching: boolean;
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  rows: Dataset[];
  header: React.ReactNode;
  onRefresh: () => void;
  onCreate: (input: CreateDatasetInput) => void;
  createPending: boolean;
  createError: unknown;
}

function DatasetsBody(props: DatasetsBodyProps) {
  const {
    data,
    isLoading,
    error,
    isRefetching,
    search,
    setSearch,
    setPage,
    open,
    setOpen,
    rows,
    header,
    onRefresh,
    onCreate,
    createPending,
    createError,
  } = props;

  return (
    <>
      <Topbar
        crumbs={[{ label: "Datasets" }]}
        onRefresh={onRefresh}
        isRefreshing={isRefetching}
        primaryAction={
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            <span>Upload dataset</span>
          </button>
        }
      />
      <PageHeader
        title="Datasets"
        description="Ingestion, versions, and the entry point to every analysis: profiling, scoring, recommendations, history, and lineage."
      />

      <div className="space-y-4 p-6">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardHeader
              eyebrow="Inventory"
              title="All datasets"
              description={`${formatNumber(data?.pagination.total_items ?? 0)} total · ${formatNumber(data?.items.filter((d) => d.current_version).length ?? 0)} active`}
            />
            <div className="w-full max-w-xs">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search datasets…"
              />
            </div>
          </div>

          <div className="-mx-5 mt-2">
            {isLoading ? (
              <LoadingState label="Loading datasets…" />
            ) : error ? (
              <ErrorState error={error} onRetry={onRefresh} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="No datasets yet"
                description="Upload a CSV or Parquet file to create the first version."
                action={
                  <button onClick={() => setOpen(true)} className="btn-primary">
                    <FileUp className="h-4 w-4" />
                    <span>Upload dataset</span>
                  </button>
                }
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{header}</th>
                    <th>Format</th>
                    <th>Rows</th>
                    <th>Columns</th>
                    <th>Size</th>
                    <th>Version</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link
                          to={`/datasets/${d.id}`}
                          className="flex items-center gap-3"
                        >
                          <FileIcon
                            format={d.current_version?.format ?? "csv"}
                            size={36}
                          />
                          <div>
                            <div className="font-medium text-ink-900">{d.name}</div>
                            {d.description && (
                              <div className="line-clamp-1 text-xs text-ink-500">
                                {d.description}
                              </div>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td>
                        <Badge>{(d.current_version?.format ?? "—").toUpperCase()}</Badge>
                      </td>
                      <td className="tnum">
                        {formatNumber(d.current_version?.row_count)}
                      </td>
                      <td className="tnum">
                        {formatNumber(d.current_version?.column_count)}
                      </td>
                      <td className="tnum">
                        {formatBytes(d.current_version?.size_bytes)}
                      </td>
                      <td className="text-ink-500">
                        v{d.current_version?.version_number ?? "—"}
                      </td>
                      <td className="text-ink-500">
                        {formatRelativeFromNow(d.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {data && (
            <PaginationControls
              pagination={data.pagination}
              onPageChange={setPage}
              className="mt-4 px-1"
            />
          )}
        </Card>
      </div>

      <UploadDatasetModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={onCreate}
        isSubmitting={createPending}
        error={createError}
      />
    </>
  );
}

}
