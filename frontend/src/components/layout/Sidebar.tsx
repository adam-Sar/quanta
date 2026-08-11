import { NavLink } from "react-router-dom";
import {
  Activity,
  Brain,
  Database,
  GitBranch,
  Hexagon,
  History,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY: NavItem[] = [
  { label: "Overview", to: "/", icon: Activity },
  { label: "Datasets", to: "/datasets", icon: Database },
  { label: "Quality", to: "/quality", icon: ShieldCheck },
  { label: "Findings", to: "/findings", icon: Search },
  { label: "Recommendations", to: "/recommendations", icon: Lightbulb },
  { label: "AI", to: "/ai", icon: Brain },
];

const SECONDARY: NavItem[] = [
  { label: "Jobs", to: "/jobs", icon: Tag },
  { label: "History", to: "/history", icon: History },
  { label: "Lineage", to: "/lineage", icon: GitBranch },
  { label: "Limits", to: "/limits", icon: Sparkles },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-[244px] shrink-0 flex-col bg-sidebar text-ink-300">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-soft">
          <Hexagon className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[0.18em] text-white">QUANTA</div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-ink-500">Data quality</div>
        </div>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-6">
        <SectionLabel>Workspace</SectionLabel>
        <ul className="mt-2 space-y-0.5">
          {PRIMARY.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <SectionLabel>Operate</SectionLabel>
          <ul className="mt-2 space-y-0.5">
            {SECONDARY.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-ink-700/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-ink-300 text-xs font-semibold">
            QS
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium text-white">Quanta Studio</div>
            <div className="text-[11px] text-ink-500">workspace</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 text-[10px] uppercase tracking-[0.18em] text-ink-500">{children}</div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-ink-700/40 text-white"
            : "text-ink-300 hover:bg-ink-700/30 hover:text-white",
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}
