import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  className?: string;
  children: ReactNode;
  padded?: boolean;
  hover?: boolean;
}

export function Card({ className, children, padded = true, hover }: CardProps) {
  return (
    <div
      className={cn(
        "card",
        padded && "p-5",
        hover && "card-hover cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="section-label mb-1.5">{eyebrow}</div>}
        <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
