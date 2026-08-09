import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { getLineage } from "@/api/history";

export function LineagePage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });

  return (
    <>
      <Topbar crumbs={[{ label: "Lineage" }]} />
      <PageHeader
        title="Lineage"
        description="Deterministic lineage chains across all datasets."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Graph"
            title="Version chains"
            description="Each dataset's most recent version chain."
          />
          <div className="mt-4 -mx-5">
            {!datasets ? (
              <LoadingState label="Loading datasets…" />
            ) : datasets.items.length === 0 ? (
              <EmptyState title="No datasets yet" description="Upload a dataset to populate lineage." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {datasets.items.map((d) => (
                  <DatasetLineageRow key={d.id} datasetId={d.id} name={d.name} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function DatasetLineageRow({ datasetId, name }: { datasetId: string; name: string }) {
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
        <span className="text-xs text-ink-500">{isLoading ? "Loading…" : data ? `${data.edges.length} edges` : "—"}</span>
      </div>
    </li>
  );
}
