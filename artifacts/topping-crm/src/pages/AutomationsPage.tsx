import AppLayout from "@/components/layout/AppLayout";
import { useListAutomations, useRunAutomation, getListAutomationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Play, Clock, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function AutomationsPage() {
  const { data: automations, isLoading } = useListAutomations();
  const qc = useQueryClient();
  const { toast } = useToast();

  const runAutomation = useRunAutomation({
    mutation: {
      onSuccess: (run) => {
        qc.invalidateQueries({ queryKey: getListAutomationsQueryKey() });
        if (run.status === "success") {
          toast({ title: "Automation finished", description: run.message ?? `${run.itemsAffected} item(s) affected` });
        } else {
          toast({ title: "Automation reported an error", description: run.message ?? "Unknown error", variant: "destructive" });
        }
      },
      onError: () => toast({ title: "Couldn't run automation", variant: "destructive" }),
    },
  });

  const runningKey = runAutomation.isPending ? runAutomation.variables?.key : undefined;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold">Automation Engine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated workflows that grow sales — follow-ups, alerts, scoring and reporting.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {automations?.map((a) => {
              const lastRun = a.lastRun ?? null;
              const isEvent = a.trigger === "event";
              const busy = runningKey === a.key;
              return (
                <Card key={a.key} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{a.name}</CardTitle>
                      <Badge variant="outline" className="gap-1 shrink-0">
                        {isEvent ? <Zap className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {isEvent ? "Event" : "Scheduled"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {a.schedule}
                    </div>

                    {lastRun ? (
                      <div className="flex items-start gap-1.5 text-xs">
                        {lastRun.status === "success"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                          : <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                        <div className="text-muted-foreground">
                          <span className="text-foreground">{lastRun.message ?? lastRun.status}</span>
                          {" · "}
                          {formatDistanceToNow(parseISO(lastRun.ranAt), { addSuffix: true })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Never run yet</div>
                    )}

                    {!isEvent && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() => runAutomation.mutate({ key: a.key })}
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        {busy ? "Running…" : "Run now"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
