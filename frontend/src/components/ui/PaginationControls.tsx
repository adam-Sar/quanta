import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pagination } from "@/types/api";
import { cn } from "@/lib/utils";

export interface PaginationControlsProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function PaginationControls({
  pagination,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  className,
}: PaginationControlsProps) {
  const { page, page_size, total_items, total_pages } = pagination;
  const canPrev = page > 1;
  const canNext = page < total_pages;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-sm text-ink-500",
        className,
      )}
    >
      <div>
        Page <span className="font-medium text-ink-800 tnum">{page}</span> of{" "}
        <span className="tnum">{total_pages}</span> ·{" "}
        <span className="tnum">{total_items}</span> total
      </div>
      <div className="flex items-center gap-1">
        {onPageSizeChange && (
          <select
            className="h-8 rounded-md border border-ink-100 bg-white px-2 text-xs text-ink-700"
            value={page_size}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
        )}
        <button
          className="btn-icon border border-ink-100 disabled:opacity-30"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="btn-icon border border-ink-100 disabled:opacity-30"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
