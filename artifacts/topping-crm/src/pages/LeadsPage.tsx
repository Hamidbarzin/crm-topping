import { useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import {
  useListLeads, useDeleteLead,
  useLogLeadActivity, useScheduleLeadMeeting,
} from "@workspace/api-client-react";
import { getListLeadsQueryKey } from "@workspace/api-client-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Trash2, Eye, Loader2, MoreHorizontal, ClipboardList, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";


const stageColors: Record<string, string> = {
  new: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  contacted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  qualified: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  proposal: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  negotiation: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  closed_won: "bg-green-500/10 text-green-400 border-green-500/20",
  closed_lost: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUSES = [
  "new_lead", "contacted_email", "contacted_call", "contacted_linkedin",
  "meeting_scheduled", "meeting_done", "proposal_sent", "negotiating",
  "closed_won", "closed_lost", "not_interested", "nurturing",
];
const ACTIVITY_TYPES = ["email", "call", "meeting", "linkedin_message", "follow_up"];

const labelize = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function scoreColor(score: number) {
  if (score >= 70) return "bg-green-500/10 text-green-400 border-green-500/20";
  if (score >= 40) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

const priorityColors: Record<string, string> = {
  HOT: "bg-red-500/10 text-red-400 border-red-500/20",
  WARM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  COLD: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};
const priorityIcon: Record<string, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };

export default function LeadsPage() {
  const { user } = useAuth();
  const isObserver = user?.role === "Marketing_Manager";

  const { data: leads, isLoading } = useListLeads();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });

  const deleteLead = useDeleteLead({ mutation: { onSuccess: () => invalidate() } });

  // ─── Log Activity dialog ───
  const [activityLeadId, setActivityLeadId] = useState<number | null>(null);
  const emptyActivity = { activityType: "email", notes: "", status: "", nextActionDate: "" };
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const logActivity = useLogLeadActivity({
    mutation: { onSuccess: () => { invalidate(); setActivityLeadId(null); setActivityForm(emptyActivity); } },
  });

  // ─── Schedule Meeting dialog ───
  const [meetingLeadId, setMeetingLeadId] = useState<number | null>(null);
  const emptyMeeting = { title: "", startTime: "", endTime: "", location: "", onlineLink: "", notes: "" };
  const [meetingForm, setMeetingForm] = useState(emptyMeeting);
  const scheduleMeeting = useScheduleLeadMeeting({
    mutation: { onSuccess: () => { invalidate(); setMeetingLeadId(null); setMeetingForm(emptyMeeting); } },
  });

  const openActivity = (id: number) => { setActivityForm(emptyActivity); setActivityLeadId(id); };
  const openMeeting = (id: number) => { setMeetingForm(emptyMeeting); setMeetingLeadId(id); };

  const filtered = leads?.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase()) ||
    l.companyName?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const openEdit = (lead: typeof filtered[number]) => setLocation(`/leads/${lead.id}`);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} {isObserver ? "total leads (read-only)" : "your leads"}
            </p>
          </div>
          {!isObserver && (
            <Button size="sm" onClick={() => setLocation("/leads/new")}>
              <Plus className="w-4 h-4 mr-1.5" />New Lead
            </Button>
          )}
          {isObserver && (
            <Badge variant="outline" className="text-xs text-muted-foreground border-border px-3 py-1">
              Observer — read only
            </Badge>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Company</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Stage</TableHead>
                <TableHead className="text-xs font-semibold text-center">AI Score</TableHead>
                {isObserver && <TableHead className="text-xs font-semibold">Owner</TableHead>}
                <TableHead className="text-xs font-semibold text-right">Value</TableHead>
                <TableHead className="text-xs font-semibold w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(5)].map((_, i) => (
                <TableRow key={i}><TableCell colSpan={isObserver ? 8 : 7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={isObserver ? 8 : 7} className="text-center text-muted-foreground py-10 text-sm">
                  {isObserver ? "No leads found" : "You have no leads yet. Create your first one!"}
                </TableCell></TableRow>
              )}
              {filtered.map(lead => (
                <TableRow
                  key={lead.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => openEdit(lead)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{lead.name}</div>
                    {lead.email && <div className="text-xs text-muted-foreground">{lead.email}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.companyName || "—"}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{labelize(lead.status || "new_lead")}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs border capitalize", stageColors[lead.stage] || "")}>
                      {lead.stage.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {lead.aiScore != null ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className={cn("text-xs border font-semibold", scoreColor(lead.aiScore))}>
                          {lead.aiScore}
                        </Badge>
                        {lead.priority && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", priorityColors[lead.priority] || "")}>
                            {priorityIcon[lead.priority]} {lead.priority}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {isObserver && (
                    <TableCell className="text-sm text-muted-foreground">{lead.ownerName || "—"}</TableCell>
                  )}
                  <TableCell className="text-sm text-right font-medium">
                    {lead.value ? `$${Number(lead.value).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    {isObserver ? (
                      <Eye className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                            onClick={e => e.stopPropagation()}>
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => openActivity(lead.id)}>
                            <ClipboardList className="w-3.5 h-3.5 mr-2" />Log Activity
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMeeting(lead.id)}>
                            <CalendarPlus className="w-3.5 h-3.5 mr-2" />Schedule Meeting
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={() => deleteLead.mutate({ id: lead.id })}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Log Activity dialog */}
      <Dialog open={activityLeadId != null} onOpenChange={o => { if (!o) setActivityLeadId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Activity Type</Label>
              <Select value={activityForm.activityType} onValueChange={v => setActivityForm(f => ({ ...f, activityType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVITY_TYPES.map(s => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Update Status (optional)</Label>
              <Select value={activityForm.status} onValueChange={v => setActivityForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue placeholder="Keep current status" /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next Action Date (optional)</Label>
              <Input type="date" value={activityForm.nextActionDate} onChange={e => setActivityForm(f => ({ ...f, nextActionDate: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Defaults to 3 days from now if left blank.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={activityForm.notes} onChange={e => setActivityForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityLeadId(null)}>Cancel</Button>
            <Button
              disabled={logActivity.isPending}
              onClick={() => activityLeadId != null && logActivity.mutate({ id: activityLeadId, data: {
                activityType: activityForm.activityType as "email" | "call" | "meeting" | "linkedin_message" | "follow_up",
                status: activityForm.status || undefined,
                nextActionDate: activityForm.nextActionDate || undefined,
                notes: activityForm.notes || undefined,
              } })}
            >
              {logActivity.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Log Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Meeting dialog */}
      <Dialog open={meetingLeadId != null} onOpenChange={o => { if (!o) setMeetingLeadId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} placeholder="Defaults to “Meeting with <lead>”" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="datetime-local" value={meetingForm.startTime} onChange={e => setMeetingForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="datetime-local" value={meetingForm.endTime} onChange={e => setMeetingForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={meetingForm.location} onChange={e => setMeetingForm(f => ({ ...f, location: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Online Link</Label>
                <Input value={meetingForm.onlineLink} onChange={e => setMeetingForm(f => ({ ...f, onlineLink: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingLeadId(null)}>Cancel</Button>
            <Button
              disabled={scheduleMeeting.isPending || !meetingForm.startTime || !meetingForm.endTime}
              onClick={() => meetingLeadId != null && scheduleMeeting.mutate({ id: meetingLeadId, data: {
                title: meetingForm.title || undefined,
                startTime: new Date(meetingForm.startTime).toISOString(),
                endTime: new Date(meetingForm.endTime).toISOString(),
                location: meetingForm.location || undefined,
                onlineLink: meetingForm.onlineLink || undefined,
                notes: meetingForm.notes || undefined,
              } })}
            >
              {scheduleMeeting.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Scheduling…</> : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
