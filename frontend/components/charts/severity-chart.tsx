"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const colors: Record<string, string> = {
  critical: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--warning)",
  low: "var(--faint)",
  info: "var(--line)",
};

export function SeverityChart({ data }: { data: { severity: string; count: number }[] }) {
  const rows = data.filter((row) => row.count > 0);
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-[0.875rem] text-faint">No findings by severity.</p>;
  }

  // A single severity does not need a 240px bar chart: one tall bar communicates
  // less than a labelled count. Show the composition instead.
  const single = rows.length < 2 ? rows[0] : undefined;
  if (single) {
    return (
      <div className="space-y-2 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[0.8125rem] uppercase tracking-[0.1em] text-ink">{single.severity}</span>
          <span className="tabular font-mono text-[0.8125rem] text-faint">{single.count} findings</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full" style={{ width: "100%", background: colors[single.severity] ?? "var(--accent)" }} />
        </div>
        <p className="text-[0.75rem] leading-relaxed text-faint">
          Every recorded finding in this dataset carries the same severity, so there is no distribution to plot.
        </p>
      </div>
    );
  }

  return (
    <div className="h-52 w-full px-3 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="severity"
            tick={{ fill: "var(--faint)", fontSize: 12, fontFamily: "var(--font-jetbrains)" }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--faint)", fontSize: 12, fontFamily: "var(--font-jetbrains)" }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip
            cursor={{ fill: "var(--raised)", opacity: 0.5 }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 13,
              padding: "8px 10px",
              color: "var(--ink)",
              boxShadow: "var(--shadow-card)",
            }}
            labelStyle={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.severity} fill={colors[row.severity] ?? "var(--accent)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
