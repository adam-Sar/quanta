import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SeverityText } from "@/components/ui/Badge";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { listRecommendations } from "@/api/recommendations";
import { formatPercent, kindLabel } from "@/lib/utils";

export function RecommendationsPage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });

  return (
    <>
      <Topbar crumbs={[{ label: "Recommendations" }]} />
      <PageHeader
        title="Recommendations"
        description="Deterministic, preview-only suggestions across all datasets."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Catalogue"
            title="All recommendations"
            description="Sorted by confidence then priority."
          />
          <div className="mt-4 -mx-5">
            {!datasets ? (
              <LoadingState label="Loading datasets…" />
            ) : datasets.items.length === 0 ? (
              <EmptyState title="No datasets yet" description="Upload a dataset to see recommendations." />
            ) : (
              <div className="space-y-1">
                {datasets.items.map((d) => (
                  <RecommendationsSection key={d.id} datasetId={d.id} name={d.name} />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function RecommendationsSection({ datasetId, name }: { datasetId: string; name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["recs", datasetId],
    queryFn: () => listRecommendations(datasetId, 1, 20),
  });
  const items = data?.items ?? [];
  if (isLoading) return <div className="px-5 py-3 text-sm text-ink-500">Loading {name}…</div>;
  if (items.length === 0) return null;
  return (
    <div className="px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Link to={`/datasets/${datasetId}/recommendations`} className="text-sm font-medium text-ink-900 hover:text-brand-600">
          {name}
        </Link>
        <span className="text-xs text-ink-500">{items.length} suggestions</span>
      </div>
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.recommendation_id} className="flex items-start justify-between gap-3 rounded-xl border border-ink-100 p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{r.title}</span>
                <SeverityText severity={r.severity} />
                <span className="text-[11px] uppercase tracking-wider text-ink-500">{kindLabel(r.kind)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-600">{r.rationale}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span>Columns: {r.affected_columns.join(", ") || "—"}</span>
                <span className="text-ink-300">·</span>
                <span>Confidence {formatPercent(r.confidence)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
