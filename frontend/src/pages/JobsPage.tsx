import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ListTodo } from "lucide-react";
import { useMemo, useState } from "react";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { listDatasetJobs } from "@/api/jobs";
import { cn, formatNumber, formatRelativeFromNow, statusToTone } from "@/lib/utils";

export function JobsPage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });
  const datasetId = datasets?.items[0]?.id;
  const { data, isLoading, error } = useQuery({
    queryKey: ["jobs", datasetId],
    queryFn: () => listDatasetJobs(datasetId!, 1, 50),
    enabled: !!datasetId,
  });
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (!search) return items;
    return items.filter((j) =>
      `${j.title} ${j.kind}`.toLowerCase().includes(search.toLowerCase()),
    );
  }, [data, search]);

  return (
    <>
      <Topbar crumbs={[{ label: "Jobs" }]} />
      <PageHeader
        title="Jobs"
        description="Durable, queryable analysis runs. The current backend runs Jobs synchronously; a worker swap will not change the persisted shape."
      />
      <div className="p-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardHeader
              eyebrow="Activity"
              title="Latest jobs"
              description={`${formatNumber(data?.pagination.total_items ?? 0)} total`}
            />
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search jobs…"
              className="max-w-xs"
            />
          </div>
          <div className="mt-4 -mx-5">
            {isLoading ? (
              <LoadingState label="Loading jobs…" />
            ) : error ? (
              <ErrorState error={error} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<ListTodo className="h-5 w-5" />}
                title="No jobs yet"
                description="Run a profile, detection, or scoring on a dataset to create one."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.job_id}>
                      <td className="font-medium text-ink-900">
                        <Link to={`/datasets/${j.dataset_id}`} className="hover:text-brand-600">
                          {j.title}
                        </Link>
                      </td>
                      <td>
                        <Badge variant="muted">{j.kind}</Badge>
                      </td>
                      <td>
                        <span className={cn("text-xs font-medium uppercase tracking-wide", statusToTone(j.status))}>
                          {j.status}
                        </span>
                      </td>
                      <td className="text-ink-500">{formatRelativeFromNow(j.created_at)}</td>
                      <td className="text-ink-500">{formatRelativeFromNow(j.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
