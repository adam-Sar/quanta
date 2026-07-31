import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from './Button'
import { cn } from '../../lib/utils'

interface ErrorStateProps {
  title?: string
  message: string
  requestId?: string | null
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Unable to load this surface',
  message,
  requestId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('rounded-md border border-danger/25 bg-danger/5 px-5 py-6', className)} role="alert">
      <div className="flex gap-3">
        <span className="mt-0.5 text-danger">
          <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
          {requestId ? (
            <p className="mt-3 font-mono text-[11px] text-muted">Request ID: {requestId}</p>
          ) : null}
          {onRetry ? (
            <Button className="mt-4" onClick={onRetry} size="sm" variant="secondary">
              <RefreshCw aria-hidden="true" size={14} />
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
