import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Printer, TrendingUp, Phone, Mail, Calendar, Briefcase, DollarSign } from "lucide-react";

interface ReportData {
  user: { id: number; name: string; email: string; role: string };
  reports: {
    id: number;
    reportDate: string;
    callsMade: number;
    emailsSent: number;
    meetingsBooked: number;
    meetingsCompleted: number;
    proposalsSent: number;
    dealsWon: number;
    revenue: string;
    notes?: string | null;
  }[];
  totals: {
    callsMade: number;
    emailsSent: number;
    meetingsBooked: number;
    meetingsCompleted: number;
    proposalsSent: number;
    dealsWon: number;
    revenue: number;
  };
  period: { month: number; year: number } | null;
  generatedAt: string;
}

const MONTH_NAMES = ["", "January","February","March","April","May","June","July","August","September","October","November","December"];

export default function ShareReportPage() {
  const [location] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token");
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("No token provided"); setLoading(false); return; }
    fetch(`/api/reports/share/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load report"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
      Loading report...
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <div className="text-destructive font-medium">{error || "Report not found"}</div>
        <div className="text-xs text-muted-foreground">This link may have expired or is invalid.</div>
      </div>
    </div>
  );

  const { user, reports, totals, period, generatedAt } = data;
  const periodLabel = period ? `${MONTH_NAMES[period.month]} ${period.year}` : "All Time";

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                <span className="text-white font-black text-sm">T</span>
              </div>
              <div>
                <div className="font-bold text-sm">Topping Courier Inc.</div>
                <div className="text-xs text-gray-500">KPI Performance Report</div>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <div className="text-sm text-gray-500 mt-0.5">{user.email} · {user.role.replace("_"," ")}</div>
            <div className="text-sm font-semibold text-orange-600 mt-1">{periodLabel}</div>
          </div>
          <div className="text-right print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Report
            </button>
            <div className="text-xs text-gray-400 mt-2">
              Generated {new Date(generatedAt).toLocaleDateString()}
            </div>
          </div>
          <div className="hidden print:block text-right">
            <div className="text-xs text-gray-400">
              Generated {new Date(generatedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-8 print:mb-6">
          {[
            { icon: Phone, label: "Calls Made", value: totals.callsMade, color: "text-blue-600" },
            { icon: Mail, label: "Emails Sent", value: totals.emailsSent, color: "text-purple-600" },
            { icon: Calendar, label: "Meetings", value: `${totals.meetingsCompleted}/${totals.meetingsBooked}`, color: "text-cyan-600" },
            { icon: Briefcase, label: "Proposals", value: totals.proposalsSent, color: "text-amber-600" },
            { icon: TrendingUp, label: "Deals Won", value: totals.dealsWon, color: "text-green-600" },
            { icon: DollarSign, label: "Revenue", value: `$${(totals.revenue/1000).toFixed(1)}k`, color: "text-orange-600" },
            { icon: TrendingUp, label: "Close Rate", value: totals.meetingsBooked > 0 ? `${Math.round(totals.dealsWon/totals.meetingsBooked*100)}%` : "—", color: "text-indigo-600" },
            { icon: Calendar, label: "Report Days", value: reports.length, color: "text-gray-600" },
          ].map(s => (
            <div key={s.label} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Daily breakdown */}
        {reports.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Daily Breakdown</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Date</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Calls</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Emails</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Meetings</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Proposals</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Deals</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2.5 text-gray-700">{new Date(r.reportDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{r.callsMade}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{r.emailsSent}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{r.meetingsCompleted}/{r.meetingsBooked}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{r.proposalsSent}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-700">{r.dealsWon}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-orange-700">${Number(r.revenue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t border-gray-300 font-semibold">
                    <td className="px-4 py-2.5 text-gray-700">Total</td>
                    <td className="px-4 py-2.5 text-right">{totals.callsMade}</td>
                    <td className="px-4 py-2.5 text-right">{totals.emailsSent}</td>
                    <td className="px-4 py-2.5 text-right">{totals.meetingsCompleted}/{totals.meetingsBooked}</td>
                    <td className="px-4 py-2.5 text-right">{totals.proposalsSent}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{totals.dealsWon}</td>
                    <td className="px-4 py-2.5 text-right text-orange-700">${totals.revenue.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {reports.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No reports found for this period.</div>
        )}

        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 print:mt-6 print:pt-4">
          Topping Courier Inc. — Confidential KPI Report · {new Date(generatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
