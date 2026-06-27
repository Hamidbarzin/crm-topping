import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Brain, CheckCircle, XCircle, Clock, CreditCard,
  ChevronDown, ChevronUp, Send, Star, FileSpreadsheet, Loader2
} from "lucide-react";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function statusColor(status: string) {
  switch (status) {
    case "approved": return "bg-green-500/15 text-green-400 border-green-500/30";
    case "paid": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "rejected": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "pending_approval": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle className="w-3.5 h-3.5" />;
    case "paid": return <CreditCard className="w-3.5 h-3.5" />;
    case "rejected": return <XCircle className="w-3.5 h-3.5" />;
    case "pending_approval": return <Clock className="w-3.5 h-3.5" />;
    default: return null;
  }
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

export function PayrollContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isManager = ["CEO", "Admin"].includes(user?.role || "");

  const now = new Date();
  const [calcMonth, setCalcMonth] = useState(now.getMonth() + 1);
  const [calcYear, setCalcYear] = useState(now.getFullYear());
  const [calcUserId, setCalcUserId] = useState<string>("");
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [strategicBonus, setStrategicBonus] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["payroll"],
    queryFn: async () => {
      const r = await fetch("/api/payroll", { headers: getAuthHeaders() });
      return r.json();
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const r = await fetch("/api/users", { headers: getAuthHeaders() });
      return r.json();
    },
    enabled: isManager,
  });

  const calcMutation = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/payroll/calculate", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll submitted!", description: "AI has scored your performance and sent it for manager approval." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes, bonus }: { id: number; notes: string; bonus: string }) => {
      const r = await fetch(`/api/payroll/${id}/approve`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          managerNotes: notes,
          ...(bonus ? { strategicBonus: parseFloat(bonus) } : {}),
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setApproveId(null); setApproveNotes(""); setStrategicBonus("");
      toast({ title: "Payroll approved!" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const r = await fetch(`/api/payroll/${id}/reject`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ managerNotes: notes }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setRejectId(null); setRejectNotes("");
      toast({ title: "Payroll rejected.", variant: "destructive" });
    },
  });

  const paidMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/payroll/${id}/mark-paid`, {
        method: "PATCH", headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Marked as paid!" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/payroll/${id}/send`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed to send"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Payroll email sent!", description: "The team member has been notified by email." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCalculate = () => {
    const body: Record<string, unknown> = { periodMonth: calcMonth, periodYear: calcYear };
    if (isManager && calcUserId) body.userId = parseInt(calcUserId);
    calcMutation.mutate(body);
  };

  const [exporting, setExporting] = useState(false);

  const exportToSheets = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/google/sheets/export/payroll", {
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

  const pending = records.filter((r: any) => r.status === "pending_approval");

  return (
    <>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payroll & Bonus</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isManager ? "Review and approve team payroll" : "Submit your monthly bonus for review"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isManager && (
              <Button size="sm" variant="outline" onClick={exportToSheets} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                Export to Sheets
              </Button>
            )}
            {isManager && pending.length > 0 && (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border text-sm px-3 py-1">
                {pending.length} pending approval
              </Badge>
            )}
          </div>
        </div>

        {/* Calculate Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              {isManager ? "Calculate Payroll for Team Member" : "Submit My Monthly Payroll"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <select
                  value={calcMonth}
                  onChange={e => setCalcMonth(parseInt(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <Input
                  type="number" value={calcYear}
                  onChange={e => setCalcYear(parseInt(e.target.value))}
                  className="w-24 h-9"
                />
              </div>
              {isManager && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Team Member</Label>
                  <select
                    value={calcUserId}
                    onChange={e => setCalcUserId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">My own</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                onClick={handleCalculate}
                disabled={calcMutation.isPending}
                className="h-9 gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {calcMutation.isPending ? "Calculating…" : "Calculate & Submit"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              AI will analyze your KPI reports, deals won, and client activations using the Topping Courier compensation model.
            </p>
          </CardContent>
        </Card>

        {/* Records */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading…</div>
        ) : records.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No payroll records yet. Submit your first monthly payroll above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {records.map((rec: any) => (
              <Card key={rec.id} className="border-border overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <div className="font-semibold text-sm text-foreground">
                          {MONTH_NAMES[(rec.periodMonth ?? 1) - 1]} {rec.periodYear}
                          {isManager && rec.userName && (
                            <span className="ml-2 text-muted-foreground font-normal">— {rec.userName}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {isManager && rec.userRole ? `${rec.userRole} · ` : ""}
                          Submitted {rec.submittedAt ? new Date(rec.submittedAt).toLocaleDateString() : "—"}
                        </div>
                      </div>
                      <Badge className={`border text-xs flex items-center gap-1 ${statusColor(rec.status)}`}>
                        {statusIcon(rec.status)}
                        {rec.status.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      {rec.aiScore != null && (
                        <div className="text-right">
                          <div className={`text-xl font-bold ${scoreColor(rec.aiScore)}`}>
                            {rec.aiScore}<span className="text-sm font-normal text-muted-foreground">/100</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Star className="w-3 h-3" />AI Score
                          </div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-xl font-bold text-foreground">${parseFloat(rec.totalAmount || "0").toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">Total Bonus</div>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                      >
                        {expandedId === rec.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {expandedId === rec.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {/* Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Commission", value: rec.commissionBonus },
                          { label: "Lead Gen Bonus", value: rec.leadGeneratorBonus },
                          { label: "Performance Bonus", value: rec.performanceBonus },
                          { label: "Strategic Bonus", value: rec.strategicBonus },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-muted/40 rounded-lg p-3 text-center">
                            <div className="text-base font-semibold text-foreground">${parseFloat(value || "0").toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {rec.aiAnalysis && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                            <Brain className="w-3.5 h-3.5" /> AI Analysis
                          </div>
                          <p className="text-sm text-muted-foreground">{rec.aiAnalysis}</p>
                        </div>
                      )}

                      {rec.managerNotes && (
                        <div className="bg-muted/30 rounded-lg p-3">
                          <div className="text-xs font-semibold text-muted-foreground mb-1">Manager Notes</div>
                          <p className="text-sm text-foreground">{rec.managerNotes}</p>
                        </div>
                      )}

                      {/* Manager actions */}
                      {isManager && rec.status === "pending_approval" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                            onClick={() => { setApproveId(rec.id); setApproveNotes(""); setStrategicBonus(""); }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm" variant="destructive" className="gap-1.5"
                            onClick={() => { setRejectId(rec.id); setRejectNotes(""); }}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                      {isManager && (rec.status === "approved" || rec.status === "paid") && (
                        <div className="flex gap-2 pt-1">
                          {rec.status === "approved" && (
                            <Button
                              size="sm" className="gap-1.5"
                              onClick={() => paidMutation.mutate(rec.id)}
                              disabled={paidMutation.isPending}
                            >
                              <CreditCard className="w-3.5 h-3.5" /> Mark as Paid
                            </Button>
                          )}
                          <Button
                            size="sm" variant="outline" className="gap-1.5"
                            onClick={() => sendMutation.mutate(rec.id)}
                            disabled={sendMutation.isPending}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {sendMutation.isPending ? "Sending…" : "Send Email"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveId !== null} onOpenChange={() => setApproveId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Payroll</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Strategic Bonus (optional, CAD$)</Label>
              <Input
                type="number" placeholder="0"
                value={strategicBonus} onChange={e => setStrategicBonus(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Add a strategic bonus approved by Founder (e.g. $300–$1,000 for key clients)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Manager Notes (optional)</Label>
              <Textarea
                placeholder="Well done this month…"
                value={approveNotes} onChange={e => setApproveNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveId(null)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ id: approveId!, notes: approveNotes, bonus: strategicBonus })}
            >
              {approveMutation.isPending ? "Approving…" : "Approve Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectId !== null} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payroll</DialogTitle></DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea
              placeholder="Please re-submit with corrected KPI data…"
              value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || !rejectNotes.trim()}
              onClick={() => rejectMutation.mutate({ id: rejectId!, notes: rejectNotes })}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
