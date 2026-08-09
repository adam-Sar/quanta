import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface TabItem {
  label: string;
  to: string;
  pill?: string | number;
}

export interface TabBarProps {
  tabs: TabItem[];
  className?: string;
}

export function TabBar({ tabs, className }: TabBarProps) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-ink-100", className)}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            cn(
              "relative px-3.5 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "text-brand-600 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500"
                : "text-ink-500 hover:text-ink-800",
            )
          }
        >
          <span>{t.label}</span>
          {t.pill !== undefined && (
            <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">
              {t.pill}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}
