import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { getLineage } from "@/api/history";
import { formatRelativeFromNow } from "@/lib/utils";

export function HistoryPage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });

  return (
    <>
      <Topbar crumbs={[{ label: "History" }]} />
      <PageHeader
        title="History"
        description="Recent activity across all datasets — the durable, queryable audit trail."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Activity"
            title="Recent lineage + jobs"
            description="Per dataset, the latest version chain and job outcomes."
          />
          <div className="mt-4 -mx-5">
            {!datasets ? (
              <LoadingState label="Loading datasets…" />
            ) : datasets.items.length === 0 ? (
              <EmptyState title="No datasets yet" description="Upload a dataset to populate history." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {datasets.items.map((d) => (
                  <DatasetHistoryRow key={d.id} datasetId={d.id} name={d.name} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function DatasetHistoryRow({ datasetId, name }: { datasetId: string; name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lineage", datasetId],
    queryFn: () => getLineage(datasetId),
  });
  return (
    <li className="px-5 py-3">
      <div className="flex items-center justify-between">
        <Link to={`/datasets/${datasetId}/history`} className="text-sm font-medium text-ink-900 hover:text-brand-600">
          {name}
        </Link>
        <span className="text-xs text-ink-500">
          {isLoading ? "Loading…" : data ? `${data.edges.length} versions` : "No history"}
        </span>
      </div>
      {data && data.edges.length > 0 && (
        <div className="mt-2 text-xs text-ink-500">
          Latest edge: v{data.edges[0].from_version_number} → v{data.edges[0].to_version_number} · {formatRelativeFromNow(new Date().toISOString())}
        </div>
      )}
    </li>
  );
}
