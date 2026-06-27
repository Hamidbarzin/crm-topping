import { useMemo } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import ChartCanvas from "@/components/dashboard/ChartCanvas";
import { useGetKpiDashboard, useListLeads } from "@workspace/api-client-react";
import type { Lead, LeadStatus, UserKpi } from "@workspace/api-client-react";
import type { ChartConfiguration } from "chart.js/auto";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, CalendarDays, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---- chart styling per design spec ---- */
const C_BLUE = "#378ADD";
const C_GREEN = "#1D9E75";
const C_ORANGE = "#E0922F";
const C_GRAY = "#888780";
const SERIES_COLORS = [C_BLUE, C_GREEN, C_ORANGE, C_GRAY];
const GRID = "rgba(136,135,128,.15)";
const TICK = "#888780";
const TICK_FONT = { size: 11 };

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const baseScales = {
  y: {
    grid: { color: GRID },
    ticks: { color: TICK, font: TICK_FONT },
    border: { display: false },
  },
  x: {
    grid: { display: false },
    ticks: { color: TICK, font: TICK_FONT, autoSkip: false },
    border: { display: false },
  },
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/* ---- status badge mapping (English only) ---- */
const STATUS_BADGE: Record<LeadStatus, { label: string; cls: string }> = {
  new_lead: { label: "New", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  contacted_email: { label: "Contacted", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  contacted_call: { label: "Contacted", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  contacted_linkedin: { label: "Contacted", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  meeting_scheduled: { label: "Meeting", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  meeting_done: { label: "Met", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  proposal_sent: { label: "Proposal", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  negotiating: { label: "Negotiating", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  closed_won: { label: "Won", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  closed_lost: { label: "Lost", cls: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
  not_interested: { label: "Not interested", cls: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
  nurturing: { label: "Nurturing", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
};

/* ---- small UI atoms ---- */
function TrendChip({ dir, value }: { dir: "up" | "down"; value: string }) {
  const up = dir === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
      )}
    >
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {value}
    </span>
  );
}

function MetricCard({
  label,
  value,
  trendDir,
  trendValue,
}: {
  label: string;
  value: string;
  trendDir: "up" | "down";
  trendValue: string;
}) {
  return (
    <div className="bg-secondary rounded-md border border-secondary-border p-4 flex flex-col gap-2">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
      <div className="flex items-center gap-1">
        <TrendChip dir={trendDir} value={trendValue} />
        <span className="text-[11px] text-muted-foreground">vs. last month</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend: { label: string; color: string; shape?: "circle" | "square" | "triangle" }[];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-secondary rounded-md border border-secondary-border p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "inline-block w-2.5 h-2.5",
                  l.shape === "triangle" ? "" : l.shape === "square" ? "rounded-[1px]" : "rounded-full"
                )}
                style={
                  l.shape === "triangle"
                    ? {
                        width: 0,
                        height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderBottom: `9px solid ${l.color}`,
                      }
                    : { backgroundColor: l.color }
                }
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { data: kpi, isLoading } = useGetKpiDashboard();
  const { data: leads, isLoading: leadsLoading } = useListLeads();

  /* ---- revenue: monthly bars + target line ---- */
  const revenueConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "bar",
      data: {
        labels: MONTHS,
        datasets: [
          {
            type: "bar",
            label: "Revenue",
            data: [42000, 51000, 48000, 63000, 58000, 72000],
            backgroundColor: C_BLUE,
            borderRadius: 4,
            maxBarThickness: 38,
            order: 2,
          },
          {
            type: "line",
            label: "Target",
            data: [45000, 50000, 55000, 60000, 65000, 70000],
            borderColor: C_GREEN,
            backgroundColor: C_GREEN,
            pointStyle: "circle",
            pointRadius: 4,
            tension: 0.3,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          ...baseScales,
          y: {
            ...baseScales.y,
            ticks: {
              ...baseScales.y.ticks,
              callback: (v) => "$" + Number(v) / 1000 + "K",
            },
          },
        },
      },
    }),
    []
  );

  /* ---- team performance: normalized radar across top performers ---- */
  const RADAR_AXES = useMemo(
    () =>
      [
        { label: "Meetings", get: (u: UserKpi) => u.meetingsCompleted },
        { label: "Deals", get: (u: UserKpi) => u.dealsWon },
        { label: "Proposals", get: (u: UserKpi) => u.proposalsSent ?? 0 },
        { label: "Follow-ups", get: (u: UserKpi) => u.followUpsCompleted ?? 0 },
        { label: "Close Rate", get: (u: UserKpi) => u.closeRate },
      ] as const,
    []
  );

  const performers = useMemo(() => (kpi?.topPerformers ?? []).slice(0, 4), [kpi]);

  const radarLegend = useMemo(
    () => performers.map((u, i) => ({ label: u.userName, color: SERIES_COLORS[i % SERIES_COLORS.length], shape: "circle" as const })),
    [performers]
  );

  const radarConfig = useMemo<ChartConfiguration>(() => {
    const maxes = RADAR_AXES.map((a) => Math.max(1, ...performers.map((u) => a.get(u))));
    return {
      type: "radar",
      data: {
        labels: RADAR_AXES.map((a) => a.label),
        datasets: performers.map((u, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          return {
            label: u.userName,
            data: RADAR_AXES.map((a, ai) => Math.round((a.get(u) / maxes[ai]) * 100)),
            borderColor: color,
            backgroundColor: withAlpha(color, 0.12),
            pointBackgroundColor: color,
            pointRadius: 2.5,
            borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            grid: { color: GRID },
            angleLines: { color: GRID },
            ticks: { display: false, stepSize: 25 },
            pointLabels: { color: TICK, font: TICK_FONT },
          },
        },
      },
    };
  }, [RADAR_AXES, performers]);

  /* ---- lead distribution by node over the last 6 months ---- */
  const distribution = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ label: d.toLocaleDateString("en-US", { month: "short" }), year: d.getFullYear(), month: d.getMonth() });
    }
    const lower = new Array(6).fill(0); // nodes 1–2
    const upper = new Array(6).fill(0); // nodes 3–5
    for (const lead of leads ?? []) {
      if (lead.gtaNode == null || !lead.createdAt) continue;
      const c = new Date(lead.createdAt);
      const idx = buckets.findIndex((b) => b.year === c.getFullYear() && b.month === c.getMonth());
      if (idx === -1) continue;
      if (lead.gtaNode <= 2) lower[idx] += 1;
      else upper[idx] += 1;
    }
    return { labels: buckets.map((b) => b.label), lower, upper };
  }, [leads]);

  const distributionConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        labels: distribution.labels,
        datasets: [
          {
            label: "Nodes 1–2",
            data: distribution.lower,
            borderColor: C_BLUE,
            backgroundColor: C_BLUE,
            pointStyle: "circle",
            pointRadius: 3,
            tension: 0.4,
          },
          {
            label: "Nodes 3–5",
            data: distribution.upper,
            borderColor: C_GREEN,
            backgroundColor: C_GREEN,
            pointStyle: "circle",
            pointRadius: 3,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          ...baseScales,
          y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, precision: 0 }, beginAtZero: true },
        },
      },
    }),
    [distribution]
  );

  /* ---- recent leads (real data) ---- */
  const recentLeads = useMemo<Lead[]>(() => {
    return [...(leads ?? [])]
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, 5);
  }, [leads]);

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <AppLayout>
      <div className="p-[1.125rem] flex flex-col gap-[10px]">
        {/* Topbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent transition-colors">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span>{monthLabel}</span>
            </button>
            <button
              onClick={() => navigate("/leads")}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              New Lead
            </button>
          </div>
        </div>

        {/* Metric cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[10px]">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[10px]">
            <MetricCard label="Meetings" value={String(kpi?.totalMeetingsCompleted ?? 0)} trendDir="up" trendValue="8%" />
            <MetricCard label="Deals Won" value={String(kpi?.totalDealsWon ?? 0)} trendDir="up" trendValue="12%" />
            <MetricCard label="Conversion Rate" value={`${kpi?.closeRate ?? 0}%`} trendDir={(kpi?.closeRate ?? 0) >= 25 ? "up" : "down"} trendValue="3%" />
            <MetricCard label="Revenue" value={`$${((kpi?.totalRevenue ?? 0) / 1000).toFixed(1)}K`} trendDir="up" trendValue="15%" />
          </div>
        )}

        {/* Revenue chart */}
        <ChartCard
          title="Monthly Revenue"
          legend={[
            { label: "Revenue", color: C_BLUE, shape: "square" },
            { label: "Target", color: C_GREEN, shape: "circle" },
          ]}
        >
          <ChartCanvas config={revenueConfig} height={300} ariaLabel="Monthly revenue versus target chart" />
        </ChartCard>

        {/* Team performance + recent leads */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[10px]">
          <ChartCard title="Team Performance" subtitle="This month" legend={radarLegend}>
            {isLoading ? (
              <Skeleton className="h-[280px] rounded-md" />
            ) : performers.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No performance data yet
              </div>
            ) : (
              <ChartCanvas config={radarConfig} height={280} ariaLabel="Team performance radar chart" />
            )}
          </ChartCard>

          {/* Recent leads */}
          <div className="bg-secondary rounded-md border border-secondary-border p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-foreground">Recent Leads</h2>
              <button
                onClick={() => navigate("/leads")}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
              </button>
            </div>
            {leadsLoading ? (
              <div className="flex flex-col gap-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-md" />
                ))}
              </div>
            ) : recentLeads.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No leads yet
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentLeads.map((lead) => {
                  const badge = lead.status ? STATUS_BADGE[lead.status] : undefined;
                  const meta = [lead.ownerName, lead.gtaNode != null ? `Node ${lead.gtaNode}` : null]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={lead.id}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      className="flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:bg-accent/40 -mx-1 px-1 rounded transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                        {meta && <p className="text-[11px] text-muted-foreground truncate">{meta}</p>}
                      </div>
                      {badge && (
                        <span className={cn("shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
                          {badge.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Lead distribution by node */}
        <ChartCard
          title="Lead Distribution by Node"
          subtitle="Last 6 months"
          legend={[
            { label: "Nodes 1–2", color: C_BLUE, shape: "circle" },
            { label: "Nodes 3–5", color: C_GREEN, shape: "circle" },
          ]}
        >
          {leadsLoading ? (
            <Skeleton className="h-[260px] rounded-md" />
          ) : (
            <ChartCanvas config={distributionConfig} height={260} ariaLabel="Lead distribution by node chart" />
          )}
        </ChartCard>
      </div>
    </AppLayout>
  );
}
