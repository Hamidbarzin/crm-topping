import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPendingSubmissions,
  useListFounderApprovals,
  useReviewDeal,
  useSetFounderApproval,
  getListPendingSubmissionsQueryKey,
  getListFounderApprovalsQueryKey,
  getListDealsQueryKey,
  getGetDealPipelineQueryKey,
} from "@workspace/api-client-react";
import type { Deal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, ShieldCheck, Inbox } from "lucide-react";

function DealRow({ deal, children }: { deal: Deal; children: React.ReactNode }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{deal.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {deal.clientName && <span>{deal.clientName}</span>}
            {deal.salesRepName && <span>Rep: {deal.salesRepName}</span>}
            {deal.value != null && <span className="text-primary font-medium">${Number(deal.value).toLocaleString()}</span>}
            {deal.grossMarginPercent != null && <span>Margin: {Number(deal.grossMarginPercent)}%</span>}
          </div>
          {deal.notes && <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{deal.notes}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = ["CEO", "Admin"].includes(user?.role || "");

  const { data: submissions = [], isLoading: loadingSubs } = useListPendingSubmissions({
    query: { enabled: isAdmin, queryKey: getListPendingSubmissionsQueryKey() },
  });
  const { data: founderQueue = [], isLoading: loadingFounder } = useListFounderApprovals({
    query: { enabled: isAdmin, queryKey: getListFounderApprovalsQueryKey() },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPendingSubmissionsQueryKey() });
    qc.invalidateQueries({ queryKey: getListFounderApprovalsQueryKey() });
    qc.invalidateQueries({ queryKey: getListDealsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDealPipelineQueryKey() });
  };

  const reviewDeal = useReviewDeal({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Deal reviewed" }); },
      onError: () => toast({ title: "Couldn't review deal", variant: "destructive" }),
    },
  });

  const founderApproval = useSetFounderApproval({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Founder approval updated" }); },
      onError: () => toast({ title: "Couldn't update approval", variant: "destructive" }),
    },
  });

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="border-dashed border-2">
            <CardContent className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>Only CEO and Admin can access approvals.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <div>
          <h1 className="text-lg font-bold">Approvals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review submitted deals and founder-approval queue</p>
        </div>

        <Tabs defaultValue="submissions">
          <TabsList>
            <TabsTrigger value="submissions" className="gap-1.5">
              <Inbox className="w-3.5 h-3.5" /> Submitted
              {submissions.length > 0 && <Badge className="ml-1 bg-amber-500/15 text-amber-400 border-amber-500/30 border">{submissions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="founder" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Founder Approval
              {founderQueue.length > 0 && <Badge className="ml-1 bg-purple-500/15 text-purple-400 border-purple-500/30 border">{founderQueue.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submissions" className="space-y-3 mt-4">
            {loadingSubs ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            ) : submissions.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="text-center py-12 text-muted-foreground">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No deals awaiting review.</p>
                </CardContent>
              </Card>
            ) : (
              submissions.map((deal) => (
                <DealRow key={deal.id} deal={deal}>
                  <Button
                    size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                    disabled={reviewDeal.isPending}
                    onClick={() => reviewDeal.mutate({ id: deal.id, data: { approved: true } })}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm" variant="destructive" className="gap-1.5"
                    disabled={reviewDeal.isPending}
                    onClick={() => reviewDeal.mutate({ id: deal.id, data: { approved: false } })}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </DealRow>
              ))
            )}
          </TabsContent>

          <TabsContent value="founder" className="space-y-3 mt-4">
            {loadingFounder ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            ) : founderQueue.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="text-center py-12 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No deals pending founder approval.</p>
                </CardContent>
              </Card>
            ) : (
              founderQueue.map((deal) => (
                <DealRow key={deal.id} deal={deal}>
                  <Button
                    size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                    disabled={founderApproval.isPending}
                    onClick={() => founderApproval.mutate({ id: deal.id, data: { approved: true } })}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm" variant="destructive" className="gap-1.5"
                    disabled={founderApproval.isPending}
                    onClick={() => founderApproval.mutate({ id: deal.id, data: { approved: false } })}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </DealRow>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
