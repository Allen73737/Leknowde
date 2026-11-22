import { Activity, ArrowUpRight, CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const modules = [
  { name: "server/src", files: 34, share: 1 },
  { name: "web/src", files: 21, share: 0.62 },
  { name: "shared", files: 7, share: 0.21 },
];

const signals = [
  { label: "Reuse branch untested", tone: "text-warning", chip: "high" },
  { label: "Session lives past rotation", tone: "text-danger", chip: "critical" },
  { label: "Export never imported", tone: "text-faint", chip: "low" },
];

export function HeroVisual() {
  return (
    <div className="relative min-w-0">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card transition-all duration-300 ease-smooth hover:border-line-strong hover:shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-shell px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-2 w-2 rounded-full border border-line bg-raised" />
              <span className="h-2 w-2 rounded-full border border-line bg-raised" />
              <span className="h-2 w-2 rounded-full border border-line bg-raised" />
            </span>
            <span className="ml-1 truncate font-mono text-[0.75rem] text-muted">
              leknowde/mineral-notes
            </span>
            <Badge tone="accent" className="hidden sm:inline-flex">
              demo
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[0.75rem] text-faint">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> main
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          {[
            ["Files", "19"],
            ["Symbols", "62"],
            ["Edges", "158"],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3.5">
              <p className="text-[0.75rem] text-faint">
                {label}
              </p>
              <p className="tabular mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="border-b border-line p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[0.75rem] text-faint">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              Module weight
            </span>
            <span className="font-mono text-[0.75rem] text-faint">files · fan-in</span>
          </div>
          <div className="mt-4 space-y-3">
            {modules.map((module) => (
              <div key={module.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate font-mono text-[0.75rem] text-muted">
                  {module.name}
                </span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    style={{ width: `${Math.round(module.share * 100)}%` }}
                  />
                </span>
                <span className="tabular w-8 shrink-0 text-right font-mono text-[0.75rem] text-faint">
                  {module.files}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[0.75rem] text-faint">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              Open signals
            </span>
            <Badge tone="warning">review</Badge>
          </div>
          <ul className="mt-3 divide-y divide-line/70">
            {signals.map((signal) => (
              <li key={signal.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[0.875rem] text-ink">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${signal.tone}`} aria-hidden="true" />
                  <span className="truncate">{signal.label}</span>
                </span>
                <span className="shrink-0 text-[0.75rem] text-faint">
                  {signal.chip}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="font-mono text-[0.75rem] text-accent">14 more in Health</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-shell px-4 py-3">
          <span className="flex items-center gap-1.5 font-mono text-[0.75rem] text-faint">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            repository content treated as untrusted data
          </span>
          <span className="font-mono text-[0.75rem] text-faint">illustrative product view</span>
        </div>
      </div>
    </div>
  );
}
