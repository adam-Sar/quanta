import { cn } from '../../lib/utils'

interface LoadingSkeletonProps {
  className?: string
  lines?: number
}

export function LoadingSkeleton({ className, lines = 1 }: LoadingSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} aria-label="Loading" role="status">
      {Array.from({ length: lines }, (_, index) => (
        <div
          className="h-3 animate-pulse rounded bg-line/70"
          key={index}
          style={{ width: `${Math.max(48, 100 - index * 12)}%` }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  )
}
