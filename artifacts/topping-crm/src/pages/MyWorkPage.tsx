import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { useListTasks, useUpdateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ListChecks, DollarSign, Calendar, MessageSquare, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { PayrollContent } from "./PayrollPage";

const priorityColors: Record<string, string> = {
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  high: "bg-red-500/10 text-red-400 border-red-500/20",
};
const statusColors: Record<string, string> = {
  pending: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

type Task = {
  id: number;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  assigneeId?: number | null;
  responseNote?: string | null;
};

function MyTasks() {
  const { user } = useAuth();
  const { data: tasks, isLoading } = useListTasks();
  const qc = useQueryClient();
  const updateTask = useUpdateTask({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }) },
  });

  const [replyFor, setReplyFor] = useState<Task | null>(null);
  const [replyText, setReplyText] = useState("");

  const openReply = (t: Task) => { setReplyFor(t); setReplyText(t.responseNote ?? ""); };
  const submitReply = (markDone: boolean) => {
    if (!replyFor) return;
    updateTask.mutate(
      { id: replyFor.id, data: { responseNote: replyText.trim() || null, ...(markDone ? { status: "completed" } : {}) } },
      { onSuccess: () => { setReplyFor(null); setReplyText(""); } }
    );
  };

  const mine = (tasks ?? []).filter((t) => t.assigneeId === user?.id);
  const open = mine.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const done = mine.filter((t) => t.status === "completed");

  const toggle = (id: number, completed: boolean) =>
    updateTask.mutate({ id, data: { status: completed ? "completed" : "pending" } });

  const TaskRow = ({ t }: { t: Task }) => {
    const isDone = t.status === "completed";
    return (
      <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
        <Checkbox
          checked={isDone}
          onCheckedChange={(v) => toggle(t.id, v === true)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => openReply(t)}
            className="block w-full text-left group"
          >
            <div className={cn("text-sm font-medium group-hover:underline", isDone && "line-through text-muted-foreground")}>
              {t.title}
            </div>
            {t.description && (
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>
            )}
          </button>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] capitalize", priorityColors[t.priority ?? "medium"])}>
              {t.priority ?? "medium"}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px] capitalize", statusColors[t.status ?? "pending"])}>
              {(t.status ?? "pending").replace("_", " ")}
            </Badge>
            {t.dueDate && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {format(parseISO(t.dueDate), "MMM d")}
              </span>
            )}
          </div>

          {/* Assignee's reply back to the manager */}
          {t.responseNote && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
              <MessageSquare className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-foreground/80">{t.responseNote}</p>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 mt-1.5 -ml-2 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => openReply(t)}
          >
            <MessageSquare className="w-3 h-3 mr-1.5" />
            {t.responseNote ? "Edit reply" : "Reply to manager"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-bold">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tasks assigned to you — {open.length} open · {done.length} completed
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : mine.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="text-center py-12 text-muted-foreground">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No tasks assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <Card>
              <CardContent className="p-0">
                {open.map((t) => <TaskRow key={t.id} t={t} />)}
              </CardContent>
            </Card>
          )}
          {done.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Completed
              </div>
              <Card>
                <CardContent className="p-0">
                  {done.map((t) => <TaskRow key={t.id} t={t} />)}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Reply dialog */}
      <Dialog open={!!replyFor} onOpenChange={(o) => { if (!o) { setReplyFor(null); setReplyText(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{replyFor?.title ?? "Task"}</DialogTitle></DialogHeader>
          {replyFor && (
            <div className="space-y-3 py-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-[10px] capitalize", priorityColors[replyFor.priority ?? "medium"])}>
                  {replyFor.priority ?? "medium"}
                </Badge>
                <Badge variant="outline" className={cn("text-[10px] capitalize", statusColors[replyFor.status ?? "pending"])}>
                  {(replyFor.status ?? "pending").replace("_", " ")}
                </Badge>
                {replyFor.dueDate && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    Due {format(parseISO(replyFor.dueDate), "MMM d")}
                  </span>
                )}
              </div>
              {replyFor.description ? (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap text-foreground/90">
                  {replyFor.description}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No description provided.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Is this done? If not, let your manager know what's the status or why it isn't finished yet.
              </p>
              <Textarea
                rows={4}
                autoFocus
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="e.g. Done and sent to the client / Still waiting on design assets / Blocked: no access to the ad account..."
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => submitReply(false)} disabled={updateTask.isPending}>
              <MessageSquare className="w-4 h-4 mr-1.5" /> Send update
            </Button>
            <Button onClick={() => submitReply(true)} disabled={updateTask.isPending}>
              <Check className="w-4 h-4 mr-1.5" /> Mark done & send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MyWorkPage() {
  return (
    <AppLayout>
      <Tabs defaultValue="tasks" className="w-full">
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="tasks"><ListChecks className="h-4 w-4 mr-1.5" /> My Tasks</TabsTrigger>
            <TabsTrigger value="payroll"><DollarSign className="h-4 w-4 mr-1.5" /> My Payroll</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tasks"><MyTasks /></TabsContent>
        <TabsContent value="payroll"><PayrollContent /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
