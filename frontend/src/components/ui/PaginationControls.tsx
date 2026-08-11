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

function rangeFor(pagination: Pagination): { from: number; to: number } {
  const { page, page_size, total_items } = pagination;
  if (total_items === 0) return { from: 0, to: 0 };
  const from = (page - 1) * page_size + 1;
  const to = Math.min(page * page_size, total_items);
  return { from, to };
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
  const { from, to } = rangeFor(pagination);
  const hasResults = total_items > 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-ink-500",
        className,
      )}
    >
      <div className="tnum">
        {hasResults ? (
          <>
            Showing <span className="font-medium text-ink-800">{from}</span>–
            <span className="font-medium text-ink-800">{to}</span> of{" "}
            <span>{total_items}</span>
          </>
        ) : (
          <>No results</>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {onPageSizeChange && (
          <select
            aria-label="Page size"
            className="h-9 rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
          type="button"
          className="btn-icon border border-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-icon border border-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
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
