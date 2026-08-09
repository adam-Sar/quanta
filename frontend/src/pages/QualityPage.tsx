import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { listScores } from "@/api/scores";
import { formatNumber, formatRelativeFromNow } from "@/lib/utils";

export function QualityPage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });

  return (
    <>
      <Topbar crumbs={[{ label: "Quality" }]} />
      <PageHeader
        title="Quality"
        description="A cross-dataset view of the latest quality scores on the most recent version of each dataset."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Latest scores"
            title="By dataset"
            description="Sorted by score ascending so the worst tables surface first."
          />
          <div className="mt-4 -mx-5">
            {!datasets ? (
              <LoadingState label="Loading datasets…" />
            ) : datasets.items.length === 0 ? (
              <EmptyState
                title="No datasets yet"
                description="Upload a dataset to see its quality score."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {datasets.items.map((d) => (
                  <DatasetScoreRow key={d.id} datasetId={d.id} name={d.name} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function DatasetScoreRow({ datasetId, name }: { datasetId: string; name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId, 1, 1),
  });
  const score = data?.items[0];
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <ScoreRing score={score?.score ?? 0} size={48} stroke={6} />
      <div className="flex-1">
        <Link to={`/datasets/${datasetId}/quality`} className="text-sm font-medium text-ink-900 hover:text-brand-600">
          {name}
        </Link>
        <div className="text-xs text-ink-500">
          {isLoading ? "Loading…" : score ? `Grade ${score.grade} · ${formatNumber(score.finding_count)} findings` : "Not yet scored"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold tnum text-ink-900">{score?.score.toFixed(0) ?? "—"}</div>
        <div className="text-[11px] text-ink-500">{formatRelativeFromNow(score?.created_at)}</div>
      </div>
    </li>
  );
}
