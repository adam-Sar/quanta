import { FileType } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileIconProps {
  format: string;
  size?: number;
  className?: string;
}

export function FileIcon({ format, size = 56, className }: FileIconProps) {
  const isParquet = format === "parquet";
  const label = isParquet ? "PARQUET" : (format || "FILE").toUpperCase();
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={`File format ${label}`}
    >
      <FileType className="h-1/2 w-1/2" strokeWidth={1.75} />
      <span className="absolute inset-x-0 bottom-1.5 text-center text-[9px] font-semibold tracking-[0.18em]">
        {label}
      </span>
    </div>
  );
}
