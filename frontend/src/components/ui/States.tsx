import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { ReactNode } from "react";
import { ApiError } from "@/api/client";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  label?: string;
  className?: string;
  inline?: boolean;
}

export function LoadingState({ label = "Loading…", className, inline }: LoadingStateProps) {
  if (inline) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm text-ink-500", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </span>
    );
  }
  return (
    <div className={cn("flex flex-col items-center gap-2 py-10 text-ink-500", className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-ink-50 text-ink-500">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title = "Something went wrong", onRetry }: ErrorStateProps) {
  const isApi = error instanceof ApiError;
  const code = isApi ? error.code : "unknown_error";
  const message = isApi ? error.message : (error as Error)?.message ?? "Unknown error";
  const requestId = isApi ? error.requestId : null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-red-50 text-sev-critical">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="max-w-md text-sm text-ink-500">{message}</p>
      <div className="text-[11px] uppercase tracking-wider text-ink-400">
        code: {code}
      </div>
      {requestId && (
        <div className="text-[11px] text-ink-400">request id: {requestId}</div>
      )}
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-2">
          Try again
        </button>
      )}
    </div>
  );
}
