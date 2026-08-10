﻿import { useParams, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";

import { Topbar, useDatasetCrumbs } from "@/components/layout/Topbar";
import { TabBar } from "@/components/ui/TabBar";
import { FileIcon } from "@/components/ui/FileIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Card, CardHeader } from "@/components/ui/Card";
import { listFindings } from "@/api/findings";
import { listScores } from "@/api/scores";
import { getDataset } from "@/api/datasets";
import { getDatasetProfile } from "@/api/profiles";
import { getLineage } from "@/api/history";
import {
  cn,
  formatBytes,
  formatNumber,
  formatRelativeFromNow,
} from "@/lib/utils";

export function DatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const crumbs = useDatasetCrumbs();

  const {
    data: dataset,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => getDataset(datasetId!),
    enabled: !!datasetId,
  });

  const { data: scores } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId!, 1, 50),
    enabled: !!datasetId,
    retry: false,
  });
  const { data: findings } = useQuery({
    queryKey: ["findings", datasetId],
    queryFn: () => listFindings(datasetId!, 1, 50),
    enabled: !!datasetId,
    retry: false,
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
    retry: false,
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
  const score = scores?.items?.[0];
  const scoreSeries = (scores?.items ?? [])
    .slice(0, 24)
    .reverse()
    .map((s) => s.score);
  const trend =
    scoreSeries.length >= 2
      ? scoreSeries[scoreSeries.length - 1] - scoreSeries[0]
      : 0;

  const sparklineValues =
    scoreSeries.length >= 2 ? scoreSeries : [];

  const tabs = [
    { label: "Overview", to: `/datasets/${dataset.id}` },
    {
      label: "Profile",
      to: `/datasets/${dataset.id}/profile`,
      pill: profile?.columns.length,
    },
    {
      label: "Findings",
      to: `/datasets/${dataset.id}/findings`,
      pill: findings?.pagination.total_items,
    },
    {
      label: "Quality",
      to: `/datasets/${dataset.id}/quality`,
      pill: score?.score.toFixed(0),
    },
    {
      label: "Recommendations",
      to: `/datasets/${dataset.id}/recommendations`,
    },
    {
      label: "History",
      to: `/datasets/${dataset.id}/history`,
      pill: lineage?.edges.length,
    },
  ];

  return (
    <>
      <Topbar
        crumbs={crumbs}
        showBack
        onRefresh={() => refetch()}
        isRefreshing={isRefetching}
        meta={
          <span className="hidden text-xs text-ink-500 sm:inline-flex">
            Updated {v ? formatRelativeFromNow(v.created_at) : "—"}
          </span>
        }
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
        {/* `items-start` (combined with `self-start` on the right group) so
            that when flex-wrap pushes the score + sparkline onto a second
            line, they stay anchored to the top of that line instead of being
            vertically centered against the tall CSV icon + metadata block —
            which used to make the sparkline slide far below the CSV icon. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <FileIcon
              format={v?.format ?? "csv"}
              size={56}
              className="shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-900">
                  {dataset.name}
                </h1>
                <span className="rounded-md border border-ink-200 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
                  Version {v?.version_number ?? "—"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                <span>
                  {v
                    ? `${formatNumber(v.row_count)} ${v.row_count === 1 ? "row" : "rows"}`
                    : "No version"}
                </span>
                <span className="text-ink-300">·</span>
                <span>
                  {v
                    ? `${formatNumber(v.column_count)} ${v.column_count === 1 ? "column" : "columns"}`
                    : "—"}
                </span>
                <span className="text-ink-300">·</span>
                <span>{v ? formatBytes(v.size_bytes) : "—"}</span>
                <span className="text-ink-300">·</span>
                <span>
                  Ingested{" "}
                  {v ? formatRelativeFromNow(v.created_at) : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* `self-start` ensures that even when the row wraps, this group
              sticks to the top of its own line — keeping the sparkline next
              to (not under) the score column. */}
          <div className="flex items-center gap-5 self-start">
            {/* Thin vertical separator so the score block reads as a
                distinct column of the hero card, mirroring the mockup. */}
            <div aria-hidden className="h-12 w-px bg-ink-200" />
            <div className="text-right">
              <div className="label-eyebrow">Quality score</div>
              <div className="mt-1 text-3xl font-semibold tnum text-ink-900">
                {score ? score.score.toFixed(0) : "—"}
                <span className="text-base font-medium text-ink-400">
                  /100
                </span>
              </div>
              <div className="mt-1 flex items-center justify-end gap-1 text-xs">
                <span
                  className={cn(
                    "font-medium",
                    trend > 0 && "text-sev-low",
                    trend < 0 && "text-sev-critical",
                    trend === 0 && "text-ink-700",
                  )}
                >
                  {trend > 0 ? "+" : ""}
                  {trend.toFixed(0)} pts
                </span>
                <span className="text-ink-500">vs last run</span>
              </div>
            </div>
            <Sparkline
              values={sparklineValues}
              height={56}
              className="w-44"
            />
          </div>
        </div>

        <div className="mt-4">
          <TabBar tabs={tabs} />
        </div>
      </div>

      {/* Outlet area. If the dataset has no version yet, show an
          onboarding card instead of letting the child tabs render empty. */}
      <div className="px-6 pb-6 pt-4">
        {v ? (
          <Outlet
            context={{ dataset, profile, score, findings, scores }}
          />
        ) : (
          <Card>
            <CardHeader
              eyebrow="No version"
              title="This dataset doesn't have a version yet"
              description="Upload a CSV or Parquet file to create the first version of this dataset."
            />
            <div className="mt-4">
              <EmptyState
                title="Nothing to analyse"
                description="Once a version is available, profiling, scoring, and detection will run against it."
              />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export default DatasetDetailPage;
