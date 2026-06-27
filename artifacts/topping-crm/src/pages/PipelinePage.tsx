import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListDeals, useGetDealPipeline, useCreateDeal, useUpdateDeal, useSubmitDeal, useReviewDeal } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListDealsQueryKey, getGetDealPipelineQueryKey } from "@workspace/api-client-react";
import type { Deal } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, DollarSign, Send, CheckCircle, XCircle, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBMISSION_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  submitted: { label: "In Review", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved: { label: "Approved", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected: { label: "Rejected", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const STAGES = [
  { key: "prospecting", label: "Prospecting", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  { key: "qualification", label: "Qualification", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { key: "proposal", label: "Proposal", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { key: "closed_won", label: "Won", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { key: "closed_lost", label: "Lost", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];

export default function PipelinePage() {
  const { data: deals, isLoading } = useListDeals();
  const { data: pipeline } = useGetDealPipeline();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = ["CEO", "Admin"].includes(user?.role || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", stage: "prospecting", value: "" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListDealsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDealPipelineQueryKey() });
  };

  const createDeal = useCreateDeal({
    mutation: {
      onSuccess: () => {
        invalidate();
        setCreateOpen(false);
        setForm({ title: "", stage: "prospecting", value: "" });
      },
    },
  });

  const updateDeal = useUpdateDeal({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Can't update deal", description: "This deal is locked while in review or approved.", variant: "destructive" }),
    },
  });

  const submitDeal = useSubmitDeal({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Deal submitted for review" }); },
      onError: () => toast({ title: "Couldn't submit deal", variant: "destructive" }),
    },
  });

  const reviewDeal = useReviewDeal({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Deal reviewed" }); },
      onError: () => toast({ title: "Couldn't review deal", variant: "destructive" }),
    },
  });

  const isOwner = (deal: Deal) =>
    user?.id === deal.salesRepId || user?.id === deal.closerId || user?.id === deal.createdById;

  const dealsByStage = (stage: string) => deals?.filter(d => d.stage === stage) || [];

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Sales Pipeline</h1>
            {pipeline && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {pipeline.totalDeals} deals · ${((pipeline.totalValue || 0) / 1000).toFixed(1)}k total value
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />New Deal
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 overflow-x-auto">
            {STAGES.map(({ key, label, color }) => {
              const stagePipeline = pipeline?.stages?.find(s => s.stage === key);
              const stageDeals = dealsByStage(key);
              return (
                <div key={key} className="min-w-[180px]">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={cn("text-xs font-medium border", color)}>{label}</Badge>
                    <span className="text-xs text-muted-foreground font-medium">{stageDeals.length}</span>
                  </div>
                  {stagePipeline && stagePipeline.value > 0 && (
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      {(stagePipeline.value / 1000).toFixed(1)}k
                    </div>
                  )}
                  <div className="space-y-2">
                    {stageDeals.map(deal => {
                      const sub = deal.submissionStatus || "draft";
                      const subBadge = SUBMISSION_BADGE[sub];
                      const locked = sub === "submitted" || sub === "approved";
                      const owner = isOwner(deal);
                      const canSubmit = owner && (sub === "draft" || sub === "rejected");
                      const canReview = isAdmin && sub === "submitted";
                      const founderPending = deal.founderApprovalStatus === "pending";
                      return (
                      <Card key={deal.id} className="border border-card-border hover:border-primary/40 transition-colors">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-1.5 mb-1">
                            <div className="font-medium text-xs leading-tight">{deal.title}</div>
                            {locked && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />}
                          </div>
                          {deal.clientName && <div className="text-xs text-muted-foreground truncate">{deal.clientName}</div>}
                          {deal.value && (
                            <div className="text-xs font-semibold text-primary mt-1.5">
                              ${Number(deal.value).toLocaleString()}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {subBadge && (
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border font-medium", subBadge.cls)}>
                                {subBadge.label}
                              </Badge>
                            )}
                            {founderPending && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border font-medium bg-purple-500/10 text-purple-400 border-purple-500/20 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> Founder
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={deal.stage}
                            disabled={locked}
                            onValueChange={(v) => updateDeal.mutate({ id: deal.id, data: { stage: v } })}
                          >
                            <SelectTrigger className="h-6 text-xs mt-2 border-0 bg-muted px-2 py-0 rounded disabled:opacity-50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map(s => (
                                <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {canSubmit && (
                            <Button
                              size="sm" variant="outline"
                              className="h-6 w-full text-[11px] mt-2 gap-1"
                              disabled={submitDeal.isPending}
                              onClick={() => submitDeal.mutate({ id: deal.id })}
                            >
                              <Send className="w-3 h-3" /> Submit for review
                            </Button>
                          )}
                          {canReview && (
                            <div className="flex gap-1 mt-2">
                              <Button
                                size="sm"
                                className="h-6 flex-1 text-[11px] gap-1 bg-green-600 hover:bg-green-700"
                                disabled={reviewDeal.isPending}
                                onClick={() => reviewDeal.mutate({ id: deal.id, data: { approved: true } })}
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </Button>
                              <Button
                                size="sm" variant="destructive"
                                className="h-6 flex-1 text-[11px] gap-1"
                                disabled={reviewDeal.isPending}
                                onClick={() => reviewDeal.mutate({ id: deal.id, data: { approved: false } })}
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      );
                    })}
                    {stageDeals.length === 0 && (
                      <div className="border-2 border-dashed border-border rounded-lg h-12 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground/50">Empty</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Deal title" />
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Value ($)</Label>
              <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createDeal.mutate({ data: { title: form.title, stage: form.stage, value: form.value ? Number(form.value) : undefined } })}
              disabled={!form.title || createDeal.isPending}
            >
              {createDeal.isPending ? "Creating..." : "Create Deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
