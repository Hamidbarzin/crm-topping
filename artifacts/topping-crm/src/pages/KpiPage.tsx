import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListKpiReports, useCreateKpiReport, useGetKpiDashboard, useListUsers, useGetUserKpi, useGetGoalProgress, useSetGoal, useGetMarketingKpi, useGenerateMarketingReport } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getListKpiReportsQueryKey, getGetGoalProgressQueryKey } from "@workspace/api-client-react";
import type { GoalProgressRow } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileSpreadsheet, Loader2, Printer, Share2, Sparkles, Flame, Mail, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const emptyForm = { reportDate: new Date().toISOString().split("T")[0], callsMade: "", emailsSent: "", meetingsBooked: "", meetingsCompleted: "", proposalsSent: "", dealsWon: "", revenue: "", notes: "" };

export default function KpiPage() {
  const { data: reports, isLoading } = useListKpiReports();
  const { data: dashboard } = useGetKpiDashboard();
  const { data: users } = useListUsers();
  const { user } = useAuth();
  const isManager = ["CEO", "Admin", "Marketing_Manager"].includes(user?.role || "");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ userId: "", targetRevenue: "", targetDealsWon: "", targetMeetingsBooked: "", targetCallsMade: "" });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data: goalProgress } = useGetGoalProgress({ month, year });
  const setGoal = useSetGoal({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetGoalProgressQueryKey({ month, year }) }); setGoalOpen(false); toast({ title: "Goal saved" }); } } });

  const openGoalDialog = (row: GoalProgressRow) => {
    setGoalForm({
      userId: String(row.userId),
      targetRevenue: row.goal ? String(row.goal.targetRevenue) : "",
      targetDealsWon: row.goal ? String(row.goal.targetDealsWon) : "",
      targetMeetingsBooked: row.goal ? String(row.goal.targetMeetingsBooked) : "",
      targetCallsMade: row.goal ? String(row.goal.targetCallsMade) : "",
    });
    setGoalOpen(true);
  };

  const pct = (actual: number, target?: number) => {
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.round((actual / target) * 100));
  };

  const shareReport = async () => {
    setSharing(true);
    try {
      const now = new Date();
      const res = await fetch("/api/reports/share", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUser || user?.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Share failed");
      const fullUrl = `${window.location.origin}${import.meta.env.BASE_URL}report/share?token=${data.token}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: "Share link copied!", description: "Link valid for 30 days" });
    } catch (e: unknown) {
      toast({ title: "Share failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const exportToSheets = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/google/sheets/export/kpi", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      toast({
        title: "Exported to Google Sheets",
        description: (
          <a href={data.spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">
            Open spreadsheet
          </a>
        ) as unknown as string,
      });
    } catch (e: unknown) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const { data: userKpi } = useGetUserKpi(selectedUser!, {
    query: { enabled: !!selectedUser, queryKey: ["userKpi", selectedUser] }
  });

  const createReport = useCreateKpiReport({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListKpiReportsQueryKey() }); setOpen(false); setForm(emptyForm); } } });

  // ─── Marketing dashboard ───
  const { data: mkpi, isLoading: mkpiLoading } = useGetMarketingKpi();
  const [reportText, setReportText] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const generateReport = useGenerateMarketingReport({
    mutation: {
      onSuccess: (data) => {
        setReportText(data.report);
        if (data.emailed) toast({ title: "Report emailed", description: `Sent to ${reportEmail}` });
      },
      onError: (e: unknown) => toast({ title: "Report failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
    },
  });

  const n = (v: string) => v ? Number(v) : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold">KPI &amp; Marketing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isManager ? "Team performance tracking" : "Your daily performance tracking"}
          </p>
        </div>

        <Tabs defaultValue="reports" className="space-y-6">
          <TabsList>
            <TabsTrigger value="reports">KPI Reports</TabsTrigger>
            <TabsTrigger value="marketing">Marketing Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-6 mt-0">
        <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />Print
            </Button>
            <Button size="sm" variant="outline" onClick={shareReport} disabled={sharing}>
              {sharing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Share2 className="w-4 h-4 mr-1.5" />}
              Share
            </Button>
            <Button size="sm" variant="outline" onClick={exportToSheets} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
              Sheets
            </Button>
            <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" />Submit Report
            </Button>
        </div>

        {/* Team summary */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Meetings Booked", value: dashboard.totalMeetingsBooked },
              { label: "Deals Won", value: dashboard.totalDealsWon },
              { label: "Close Rate", value: `${dashboard.closeRate}%` },
              { label: "Total Revenue", value: `$${((dashboard.totalRevenue || 0)/1000).toFixed(1)}k` },
            ].map(s => (
              <Card key={s.label} className="border border-card-border">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
                  <div className="text-xl font-bold mt-1">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Monthly goals */}
        {goalProgress && goalProgress.rows.length > 0 && (
          <Card className="border border-card-border">
            <CardHeader className="pb-3 pt-4 px-5 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Monthly Goals — {format(now, "MMMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-4">
              {goalProgress.rows.map(row => {
                const metrics = [
                  { label: "Revenue", actual: row.actual.revenue, target: row.goal?.targetRevenue, money: true },
                  { label: "Deals Won", actual: row.actual.dealsWon, target: row.goal?.targetDealsWon },
                  { label: "Meetings", actual: row.actual.meetingsBooked, target: row.goal?.targetMeetingsBooked },
                  { label: "Calls", actual: row.actual.callsMade, target: row.goal?.targetCallsMade },
                ];
                return (
                  <div key={row.userId} className="border border-border rounded-lg p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{row.userName} <span className="text-xs text-muted-foreground font-normal">· {row.role.replace("_"," ")}</span></div>
                      {isManager && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openGoalDialog(row)}>
                          {row.goal ? "Edit Goal" : "Set Goal"}
                        </Button>
                      )}
                    </div>
                    {!row.goal && <div className="text-xs text-muted-foreground">No goal set for this month.</div>}
                    {row.goal && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {metrics.map(m => {
                          const fmt = (v: number) => m.money ? `$${Number(v).toLocaleString()}` : String(v);
                          return (
                            <div key={m.label} className="space-y-1">
                              <div className="flex items-baseline justify-between">
                                <span className="text-xs text-muted-foreground">{m.label}</span>
                                <span className="text-xs font-medium">{pct(m.actual, m.target)}%</span>
                              </div>
                              <Progress value={pct(m.actual, m.target)} className="h-1.5" />
                              <div className="text-xs text-muted-foreground">{fmt(m.actual)} / {fmt(m.target || 0)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Per-user lookup — managers only */}
        {isManager && users && users.length > 0 && (
          <Card className="border border-card-border">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Individual KPI</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
              <Select value={selectedUser?.toString() || ""} onValueChange={v => setSelectedUser(Number(v))}>
                <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {userKpi && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Meetings Booked", value: userKpi.meetingsBooked },
                    { label: "Deals Won", value: userKpi.dealsWon },
                    { label: "Proposals Sent", value: userKpi.proposalsSent },
                    { label: "Revenue", value: `$${((userKpi.totalRevenue || 0)/1000).toFixed(1)}k` },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                      <div className="text-lg font-bold mt-0.5">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reports table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Member</TableHead>
                <TableHead className="text-xs font-semibold text-right">Calls</TableHead>
                <TableHead className="text-xs font-semibold text-right">Meetings</TableHead>
                <TableHead className="text-xs font-semibold text-right">Proposals</TableHead>
                <TableHead className="text-xs font-semibold text-right">Deals Won</TableHead>
                <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(4)].map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}
              {!isLoading && (reports?.length || 0) === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">No reports yet</TableCell></TableRow>}
              {reports?.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="text-sm">{format(parseISO(r.reportDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-sm font-medium">{r.userName || "—"}</TableCell>
                  <TableCell className="text-sm text-right">{r.callsMade}</TableCell>
                  <TableCell className="text-sm text-right">{r.meetingsCompleted}/{r.meetingsBooked}</TableCell>
                  <TableCell className="text-sm text-right">{r.proposalsSent}</TableCell>
                  <TableCell className="text-sm text-right">{r.dealsWon}</TableCell>
                  <TableCell className="text-sm text-right font-medium text-primary">${Number(r.revenue).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
          </TabsContent>

          <TabsContent value="marketing" className="space-y-6 mt-0">
            {mkpiLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            )}
            {mkpi && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Leads", value: mkpi.totalLeads },
                    { label: "New This Month", value: mkpi.newLeads },
                    { label: "Reply Rate", value: `${mkpi.replyRate}%` },
                    { label: "Conversion Rate", value: `${mkpi.conversionRate}%` },
                    { label: "Pipeline Value", value: `$${(mkpi.pipelineValue / 1000).toFixed(1)}k` },
                    { label: "Closed Won Value", value: `$${(mkpi.closedWonValue / 1000).toFixed(1)}k` },
                    { label: "Avg AI Score", value: mkpi.avgScore },
                    { label: "Emails Sent", value: mkpi.emailsSent },
                  ].map(s => (
                    <Card key={s.label} className="border border-card-border">
                      <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
                        <div className="text-xl font-bold mt-1">{s.value}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Hot Leads", value: mkpi.hotLeads, icon: "🔥", cls: "text-red-400" },
                    { label: "Warm Leads", value: mkpi.warmLeads, icon: "🟡", cls: "text-yellow-400" },
                    { label: "Cold Leads", value: mkpi.coldLeads, icon: "❄️", cls: "text-blue-400" },
                  ].map(s => (
                    <Card key={s.label} className="border border-card-border">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
                          <div className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
                        </div>
                        <span className="text-2xl">{s.icon}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="border border-card-border">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Flame className="w-4 h-4" />Funnel
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { label: "Meetings Scheduled", value: mkpi.meetingsScheduled },
                        { label: "Meetings Done", value: mkpi.meetingsDone },
                        { label: "Proposals Sent", value: mkpi.proposalsSent },
                        { label: "Closed Won", value: mkpi.closedWon },
                        { label: "Closed Lost", value: mkpi.closedLost },
                      ].map(s => (
                        <div key={s.label} className="bg-muted/40 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">{s.label}</div>
                          <div className="text-lg font-bold mt-0.5">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="border border-card-border">
                    <CardHeader className="pb-3 pt-4 px-5 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4" />Lead Sources
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        Target: {mkpi.monthlyClosedWon}/{mkpi.monthlyTarget} deals
                      </Badge>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 space-y-2">
                      {mkpi.sourceBreakdown.length === 0 && <div className="text-xs text-muted-foreground">No source data yet.</div>}
                      {mkpi.sourceBreakdown.map(s => {
                        const max = Math.max(...mkpi.sourceBreakdown.map(x => x.count), 1);
                        return (
                          <div key={s.source} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span>{s.source}</span>
                              <span className="text-muted-foreground">{s.count}</span>
                            </div>
                            <Progress value={Math.round((s.count / max) * 100)} className="h-1.5" />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="border border-card-border">
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />AI Performance Report
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="email"
                          placeholder="Email to send report (optional)"
                          value={reportEmail}
                          onChange={e => setReportEmail(e.target.value)}
                          className="h-9"
                        />
                        <Button
                          size="sm"
                          className="shrink-0"
                          disabled={generateReport.isPending}
                          onClick={() => generateReport.mutate({ data: reportEmail ? { email: reportEmail } : {} })}
                        >
                          {generateReport.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating…</>
                          ) : reportEmail ? (
                            <><Mail className="w-4 h-4 mr-1.5" />Generate &amp; Email</>
                          ) : (
                            <><Sparkles className="w-4 h-4 mr-1.5" />Generate</>
                          )}
                        </Button>
                      </div>
                      {reportText ? (
                        <Textarea readOnly value={reportText} rows={10} className="text-sm leading-relaxed font-normal resize-none" />
                      ) : (
                        <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                          Generate an AI summary of marketing performance with a recommended next action.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Daily KPI Report</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.reportDate} onChange={e => setForm(f => ({ ...f, reportDate: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Calls Made</Label><Input type="number" min="0" value={form.callsMade} onChange={e => setForm(f => ({ ...f, callsMade: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Emails Sent</Label><Input type="number" min="0" value={form.emailsSent} onChange={e => setForm(f => ({ ...f, emailsSent: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Meetings Booked</Label><Input type="number" min="0" value={form.meetingsBooked} onChange={e => setForm(f => ({ ...f, meetingsBooked: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Meetings Completed</Label><Input type="number" min="0" value={form.meetingsCompleted} onChange={e => setForm(f => ({ ...f, meetingsCompleted: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Proposals Sent</Label><Input type="number" min="0" value={form.proposalsSent} onChange={e => setForm(f => ({ ...f, proposalsSent: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Deals Won</Label><Input type="number" min="0" value={form.dealsWon} onChange={e => setForm(f => ({ ...f, dealsWon: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Revenue ($)</Label><Input type="number" min="0" value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createReport.mutate({ data: { reportDate: form.reportDate, callsMade: n(form.callsMade), emailsSent: n(form.emailsSent), meetingsBooked: n(form.meetingsBooked), meetingsCompleted: n(form.meetingsCompleted), proposalsSent: n(form.proposalsSent), dealsWon: n(form.dealsWon), revenue: n(form.revenue), notes: form.notes || undefined } })} disabled={createReport.isPending}>
              {createReport.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Monthly Goal — {format(now, "MMMM yyyy")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Revenue Target ($)</Label><Input type="number" min="0" value={goalForm.targetRevenue} onChange={e => setGoalForm(f => ({ ...f, targetRevenue: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Deals Won</Label><Input type="number" min="0" value={goalForm.targetDealsWon} onChange={e => setGoalForm(f => ({ ...f, targetDealsWon: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Meetings Booked</Label><Input type="number" min="0" value={goalForm.targetMeetingsBooked} onChange={e => setGoalForm(f => ({ ...f, targetMeetingsBooked: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Calls Made</Label><Input type="number" min="0" value={goalForm.targetCallsMade} onChange={e => setGoalForm(f => ({ ...f, targetCallsMade: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => setGoal.mutate({ data: {
                userId: Number(goalForm.userId), month, year,
                targetRevenue: n(goalForm.targetRevenue),
                targetDealsWon: n(goalForm.targetDealsWon),
                targetMeetingsBooked: n(goalForm.targetMeetingsBooked),
                targetCallsMade: n(goalForm.targetCallsMade),
              } })}
              disabled={setGoal.isPending}
            >
              {setGoal.isPending ? "Saving..." : "Save Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
