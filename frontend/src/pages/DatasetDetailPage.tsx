import { useParams, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { MoreHorizontal } from "lucide-react";

import { Topbar, useDatasetCrumbs } from "@/components/layout/Topbar";
import { TabBar } from "@/components/ui/TabBar";
import { Trend } from "@/components/ui/Trend";
import { FileIcon } from "@/components/ui/FileIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { listFindings } from "@/api/findings";
import { listScores } from "@/api/scores";
import { getDataset } from "@/api/datasets";
import { getDatasetProfile } from "@/api/profiles";
import { getLineage } from "@/api/history";
import {
  formatBytes,
  formatNumber,
  formatRelativeFromNow,
} from "@/lib/utils";

export function DatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const crumbs = useDatasetCrumbs();
  const { data: dataset, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => getDataset(datasetId!),
    enabled: !!datasetId,
  });

  useEffect(() => {
    if (!datasetId) return;
  }, [datasetId]);

  const { data: scores } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId!, 1, 50),
    enabled: !!datasetId,
  });
  const { data: findings } = useQuery({
    queryKey: ["findings", datasetId],
    queryFn: () => listFindings(datasetId!, 1, 50),
    enabled: !!datasetId,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile", datasetId],
    queryFn: () => getDatasetProfile(datasetId!),
    enabled: !!datasetId,
    retry: false,
  });
  const { data: lineage } = useQuery({
    queryKey: ["lineage", datasetId],
    queryFn: () => getLineage(datasetId!),
    enabled: !!datasetId,
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center p-20">
        <LoadingState label="Loading dataset…" />
      </div>
    );
  }
  if (error || !dataset) {
    return (
      <div className="p-6">
        <ErrorState
          error={error ?? new Error("Dataset not found")}
          title="Dataset not available"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const v = dataset.current_version;
  const score = scores?.items[0];
  const spark = (scores?.items ?? [])
    .slice(0, 24)
    .reverse()
    .map((s) => s.score);
  const trend = spark.length >= 2 ? spark[spark.length - 1] - spark[0] : 0;

  const tabs = [
    { label: "Overview", to: `/datasets/${dataset.id}` },
    { label: "Profile", to: `/datasets/${dataset.id}/profile`, pill: profile?.columns.length },
    { label: "Findings", to: `/datasets/${dataset.id}/findings`, pill: findings?.pagination.total_items },
    { label: "Quality", to: `/datasets/${dataset.id}/quality`, pill: score?.score },
    { label: "Recommendations", to: `/datasets/${dataset.id}/recommendations` },
    { label: "History", to: `/datasets/${dataset.id}/history`, pill: lineage?.edges.length },
  ];

  return (
    <>
      <Topbar
        crumbs={crumbs}
        showBack
        onRefresh={() => refetch()}
        isRefreshing={isRefetching}
        primaryAction={
          <button
            className="btn-icon border border-ink-100"
            type="button"
            aria-label="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
      />

      {/* Hero / breadcrumb-band */}
      <div className="px-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <FileIcon format={v?.format ?? "csv"} size={56} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
                  {dataset.name}
                </h1>
                <span className="rounded-md border border-ink-200 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
                  Version {v?.version_number ?? "—"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                <span>{formatNumber(v?.row_count)} rows</span>
                <span className="text-ink-300">·</span>
                <span>{formatNumber(v?.column_count)} columns</span>
                <span className="text-ink-300">·</span>
                <span>{formatBytes(v?.size_bytes)}</span>
                <span className="text-ink-300">·</span>
                <span>Ingested {formatRelativeFromNow(v?.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="label-eyebrow">Quality score</div>
              <div className="mt-1 text-3xl font-semibold tnum text-ink-900">
                {score ? score.score.toFixed(0) : "—"}
                <span className="text-base font-medium text-ink-400">/100</span>
              </div>
              <div className="mt-1 text-xs">
                <Trend delta={trend} suffix=" pts" />
                <span className="ml-1 text-ink-500">vs last run</span>
              </div>
            </div>
            <Sparkline
              values={spark.length ? spark : [70, 72, 75, 78, 80, 82, 85, 87]}
              height={56}
              className="w-44"
            />
          </div>
        </div>

        <div className="mt-4">
          <TabBar tabs={tabs} />
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <Outlet context={{ dataset, profile, score, findings, scores }} />
      </div>
    </>
  );
}

export default DatasetDetailPage;
