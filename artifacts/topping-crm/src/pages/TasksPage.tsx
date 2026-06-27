import { useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListUsers, useGetMarketingKpi, useListMeetings,
  getListTasksQueryKey, getGetMarketingKpiQueryKey, getListMeetingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Trash2, Calendar as CalendarIcon, AlertTriangle, ArrowRight, ArrowLeft,
  Check, RotateCcw, TrendingUp, Mail, CheckCircle2, Megaphone, Sun, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, isToday } from "date-fns";

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];

const priorityDot: Record<string, string> = {
  low: "bg-zinc-400",
  medium: "bg-amber-500",
  high: "bg-red-500",
};
const priorityBadge: Record<string, string> = {
  low: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

const DONE = ["completed", "cancelled"];
const emptyForm = { title: "", description: "", priority: "medium", dueDate: "", assigneeId: "" };

type FilterKey = "all" | "mine" | "high" | "overdue" | "completed";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My Tasks" },
  { key: "high", label: "High Priority" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

type AnyTask = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  responseNote?: string | null;
};

function isOverdue(t: AnyTask): boolean {
  return !!t.dueDate && !DONE.includes(t.status) && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate));
}

function progressOf(status: string): number {
  if (status === "completed") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

const BOARD_COLUMNS: { status: string; label: string; dot: string }[] = [
  { status: "pending", label: "To Do", dot: "bg-zinc-400" },
  { status: "in_progress", label: "In Progress", dot: "bg-blue-500" },
  { status: "completed", label: "Completed", dot: "bg-emerald-500" },
];

export default function TasksPage() {
  const { user } = useAuth();
  const canManage = !!user && MANAGER_ROLES.includes(user.role);

  const { data: tasks, isLoading } = useListTasks();
  const { data: users } = useListUsers();
  const { data: kpi } = useGetMarketingKpi({ query: { queryKey: getGetMarketingKpiQueryKey() } });
  const { data: meetings } = useListMeetings({ query: { queryKey: getListMeetingsQueryKey() } });

  const teamMembers = users?.filter(u => u.isActive) ?? [];
  const memberById = useMemo(() => {
    const m = new Map<number, { name: string; role: string }>();
    teamMembers.forEach(u => m.set(u.id, { name: u.name, role: u.role }));
    return m;
  }, [teamMembers]);

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<FilterKey>("all");

  const createTask = useCreateTask({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); setOpen(false); setForm(emptyForm); } } });
  const updateTask = useUpdateTask({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }) } });
  const deleteTask = useDeleteTask({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }) } });

  const allTasks = (tasks ?? []) as AnyTask[];

  const assigneeLabel = (t: AnyTask) =>
    (t.assigneeId && memberById.get(t.assigneeId)?.name) || t.assigneeName || "Unassigned";

  // TODAY'S PRIORITIES — due today or overdue, still open.
  const priorities = useMemo(() => {
    return allTasks
      .filter(t => !DONE.includes(t.status) && t.dueDate && (isToday(parseISO(t.dueDate)) || isOverdue(t)))
      .sort((a, b) => {
        const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime();
      });
  }, [allTasks]);

  // QUICK FILTERS applied to the board.
  const filteredForBoard = useMemo(() => {
    return allTasks.filter(t => {
      switch (filter) {
        case "mine": return t.assigneeId === user?.id;
        case "high": return t.priority === "high";
        case "overdue": return isOverdue(t);
        case "completed": return t.status === "completed";
        default: return t.status !== "cancelled";
      }
    });
  }, [allTasks, filter, user?.id]);

  const setStatus = (id: number, status: string) => updateTask.mutate({ id, data: { status } });

  // TEAM PERFORMANCE — real metrics only.
  const completedCount = allTasks.filter(t => t.status === "completed").length;
  const perf = [
    { label: "New Leads", value: kpi?.newLeads ?? 0, icon: TrendingUp, tint: "text-emerald-500" },
    { label: "Meetings Booked", value: kpi?.meetingsScheduled ?? 0, icon: CalendarIcon, tint: "text-blue-500" },
    { label: "Tasks Completed", value: completedCount, icon: CheckCircle2, tint: "text-violet-500" },
    { label: "Emails Sent", value: kpi?.emailsSent ?? 0, icon: Mail, tint: "text-amber-500" },
  ];

  // MARKETING CALENDAR — real upcoming meetings + task deadlines.
  const now = Date.now();
  const upcomingMeetings = useMemo(() => {
    return (meetings ?? [])
      .filter(m => m.status !== "cancelled" && parseISO(m.startTime).getTime() >= now - 12 * 3600 * 1000)
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
      .slice(0, 5);
  }, [meetings, now]);
  const upcomingDeadlines = useMemo(() => {
    return allTasks
      .filter(t => !DONE.includes(t.status) && t.dueDate && parseISO(t.dueDate).getTime() >= now - 24 * 3600 * 1000)
      .sort((a, b) => parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime())
      .slice(0, 5);
  }, [allTasks, now]);

  const Avatar = ({ name }: { name: string }) => (
    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </span>
  );

  const BoardCard = ({ task }: { task: AnyTask }) => {
    const pct = progressOf(task.status);
    return (
      <div className="group rounded-lg border border-border bg-card p-3 hover:shadow-sm hover:border-foreground/20 transition-all">
        <div className="flex items-start gap-2">
          <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", priorityDot[task.priority])} />
          <p className={cn("text-sm font-medium leading-snug flex-1", task.status === "completed" && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {canManage && (
            <button
              onClick={() => deleteTask.mutate({ id: task.id })}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
              aria-label="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar name={assigneeLabel(task)} />
            {assigneeLabel(task)}
          </span>
          {task.dueDate && (
            <span className={cn("flex items-center gap-1 text-xs", isOverdue(task) ? "text-red-500 font-medium" : "text-muted-foreground")}>
              {isOverdue(task) ? <AlertTriangle className="w-3 h-3" /> : <CalendarIcon className="w-3 h-3" />}
              {format(parseISO(task.dueDate), "MMM d")}
            </span>
          )}
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border capitalize ml-auto", priorityBadge[task.priority])}>
            {task.priority}
          </Badge>
        </div>

        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Progress</span><span>{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct === 50 ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {task.responseNote && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
            <MessageSquare className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
            <p className="text-xs text-foreground/80">
              <span className="text-muted-foreground">{assigneeLabel(task).split(" ")[0]}:</span> {task.responseNote}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-3">
          {task.status === "pending" && (
            <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => setStatus(task.id, "in_progress")}>
              Start <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
          {task.status === "in_progress" && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setStatus(task.id, "pending")}>
                <ArrowLeft className="w-3 h-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => setStatus(task.id, "completed")}>
                <Check className="w-3 h-3 mr-1" /> Mark Done
              </Button>
            </>
          )}
          {task.status === "completed" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs w-full text-muted-foreground" onClick={() => setStatus(task.id, "in_progress")}>
              <RotateCcw className="w-3 h-3 mr-1.5" /> Reopen
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Marketing Operations</h1>
              <p className="text-sm text-muted-foreground">Plan, assign, and track the marketing team's work</p>
            </div>
          </div>
          {canManage && (
            <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Assign Task
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : (
          <>
            {/* 1. TODAY'S PRIORITIES (sticky) */}
            <div className="sticky top-0 z-10 -mx-6 px-6 pt-1 pb-3 bg-background/95 backdrop-blur">
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold">Today's Priorities</h2>
                  <Badge variant="outline" className="text-[10px] ml-1">{priorities.length}</Badge>
                </div>
                {priorities.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted-foreground text-center">All clear — nothing due today.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {priorities.map(t => (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Checkbox checked={false} onCheckedChange={() => setStatus(t.id, "completed")} />
                        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityDot[t.priority])} />
                        <span className="text-sm font-medium flex-1 truncate">{t.title}</span>
                        <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Avatar name={assigneeLabel(t)} />{assigneeLabel(t)}
                        </span>
                        <span className={cn("text-xs flex items-center gap-1 flex-shrink-0", isOverdue(t) ? "text-red-500 font-medium" : "text-muted-foreground")}>
                          {isOverdue(t) && <AlertTriangle className="w-3 h-3" />}
                          {isToday(parseISO(t.dueDate!)) ? "Today" : format(parseISO(t.dueDate!), "MMM d")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 5. QUICK FILTERS */}
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    filter === f.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 2. MARKETING TASK BOARD */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Marketing Task Board</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {BOARD_COLUMNS.map(col => {
                  const items = filteredForBoard.filter(t => t.status === col.status);
                  return (
                    <div key={col.status} className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span className={cn("w-2 h-2 rounded-full", col.dot)} />
                        <span className="text-sm font-medium">{col.label}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5 min-h-[60px]">
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                        ) : (
                          items.map(t => <BoardCard key={t.id} task={t} />)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. TEAM PERFORMANCE */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Team Performance</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {perf.map(p => (
                  <div key={p.label} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-bold tracking-tight">{p.value}</span>
                      <p.icon className={cn("w-5 h-5", p.tint)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{p.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Live metrics from leads, meetings, and tasks.</p>
            </div>

            {/* 4. MARKETING CALENDAR */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Marketing Calendar</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <CalendarIcon className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Upcoming Meetings</span>
                  </div>
                  {upcomingMeetings.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-muted-foreground text-center">No meetings scheduled.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {upcomingMeetings.map(m => (
                        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex flex-col items-center justify-center w-10 flex-shrink-0">
                            <span className="text-[10px] uppercase text-muted-foreground">{format(parseISO(m.startTime), "MMM")}</span>
                            <span className="text-base font-bold leading-none">{format(parseISO(m.startTime), "d")}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {format(parseISO(m.startTime), "p")}{m.clientName ? ` · ${m.clientName}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <CheckCircle2 className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium">Upcoming Deadlines</span>
                  </div>
                  {upcomingDeadlines.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-muted-foreground text-center">No upcoming deadlines.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {upcomingDeadlines.map(t => (
                        <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityDot[t.priority])} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{assigneeLabel(t)}</p>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(t.dueDate!), "MMM d")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assign Task dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Add details, context, or instructions..." /></div>
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select value={form.assigneeId} onValueChange={v => setForm(f => ({ ...f, assigneeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a team member" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.role.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createTask.mutate({ data: { title: form.title, description: form.description || undefined, priority: form.priority, dueDate: form.dueDate || undefined, assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined } })} disabled={!form.title || createTask.isPending}>
              {createTask.isPending ? "Assigning..." : "Assign Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
