import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronLeft, RefreshCw, MoreHorizontal, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";

import { getHealth } from "@/api/health";
import { getDataset } from "@/api/datasets";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  to?: string;
}

function CrumbText({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
      {items.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span className="text-ink-300">/</span>}
          {c.to ? (
            <Link
              to={c.to}
              className="rounded-md px-1.5 py-0.5 hover:bg-ink-50 hover:text-ink-800"
            >
              {c.label}
            </Link>
          ) : (
            <span className="px-1.5 text-ink-800">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export interface TopbarProps {
  crumbs: Crumb[];
  showBack?: boolean;
  primaryAction?: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  meta?: ReactNode;
}

export function Topbar({
  crumbs,
  showBack,
  primaryAction,
  onRefresh,
  isRefreshing,
  meta,
}: TopbarProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-ink-100 bg-white/80 backdrop-blur-md shadow-topbar">
      <div className="flex items-center gap-3 px-6 py-3">
        {showBack && (
          <Link
            to="/datasets"
            className="btn-icon border border-ink-100"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        )}
        <CrumbText items={crumbs} />
        <div className="ml-auto flex items-center gap-2">
          {meta}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="btn-secondary"
              type="button"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  isRefreshing && "animate-spin",
                )}
              />
              <span>Refresh</span>
            </button>
          )}
          {primaryAction ?? (
            <Link to="/datasets/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              <span>New dataset</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Convenience: derive crumbs from URL + dataset name ---------- */

export function useDatasetCrumbs() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const { data } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => getDataset(datasetId!),
    enabled: !!datasetId,
    staleTime: 30_000,
  });
  if (!datasetId) return [] as Crumb[];
  return [
    { label: "Datasets", to: "/datasets" },
    { label: data?.name ?? datasetId.slice(0, 8) },
  ] as Crumb[];
}

export function useLocationPath() {
  return useLocation().pathname;
}

export function useHealthDot() {
  // Lightweight ping for the dataset creation flow — currently unused but
  // could surface a "Backend OK" trailing label in the top bar.
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
  return data?.status ?? "unknown";
}

export function TopbarMore() {
  return (
    <button className="btn-icon border border-ink-100" type="button">
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}
