import { useState } from "react";
import { useListMeetings, useUpdateMeeting, useDeleteMeeting } from "@workspace/api-client-react";
import { getListMeetingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Clock, CalendarCheck, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import GmailComposeDialog from "@/components/GmailComposeDialog";

const statusColors: Record<string,string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  no_show: "bg-red-500/10 text-red-400 border-red-500/20",
  follow_up: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const STATUSES = ["scheduled","completed","cancelled","no_show","follow_up"];
const OUTCOMES = ["won","lost","proposal_sent","follow_up_required"];

export function MeetingsContent() {
  const { data: meetings, isLoading } = useListMeetings();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("all");
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [gmailDefaults, setGmailDefaults] = useState({ to: "", subject: "", body: "" });

  const updateMeeting = useUpdateMeeting({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListMeetingsQueryKey() }) } });
  const deleteMeeting = useDeleteMeeting({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListMeetingsQueryKey() }) } });

  const filtered = meetings?.filter(m => filterStatus === "all" || m.status === filterStatus) || [];

  const syncToCalendar = async (meetingId: number) => {
    setSyncingId(meetingId);
    try {
      const res = await fetch(`/api/google/calendar/sync/${meetingId}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast({
        title: "Synced to Google Calendar",
        description: (
          <a href={data.eventLink} target="_blank" rel="noopener noreferrer" className="underline text-primary">
            View event
          </a>
        ) as unknown as string,
      });
    } catch (e: unknown) {
      toast({ title: "Sync failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  const openEmail = (meeting: { clientEmail?: string | null; title: string; clientName?: string | null }) => {
    setGmailDefaults({
      to: meeting.clientEmail || "",
      subject: `Follow-up: ${meeting.title}`,
      body: `Hi ${meeting.clientName || ""},\n\nThank you for our meeting. I wanted to follow up...\n\nBest regards,\nTopping Courier Inc.`,
    });
    setGmailOpen(true);
  };

  return (
    <>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Meetings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{meetings?.length || 0} total meetings</p>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Meeting</TableHead>
                <TableHead className="text-xs font-semibold">Time</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Outcome</TableHead>
                <TableHead className="text-xs font-semibold w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">No meetings found</TableCell></TableRow>}
              {filtered.map(meeting => (
                <TableRow key={meeting.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium text-sm">{meeting.title}</div>
                    {meeting.clientName && <div className="text-xs text-muted-foreground">{meeting.clientName} {meeting.companyName && `· ${meeting.companyName}`}</div>}
                    {meeting.location && <div className="text-xs text-muted-foreground/60">{meeting.location}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <div>
                        <div>{format(parseISO(meeting.startTime), "MMM d, yyyy")}</div>
                        <div>{format(parseISO(meeting.startTime), "HH:mm")} – {format(parseISO(meeting.endTime), "HH:mm")}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={meeting.status} onValueChange={v => updateMeeting.mutate({ id: meeting.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_"," ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={meeting.outcome || "none"} onValueChange={v => updateMeeting.mutate({ id: meeting.id, data: { outcome: v === "none" ? undefined : v } })}>
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue placeholder="Set outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">No outcome</SelectItem>
                        {OUTCOMES.map(o => <SelectItem key={o} value={o} className="text-xs capitalize">{o.replace("_"," ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-blue-400"
                        title="Sync to Google Calendar"
                        onClick={() => syncToCalendar(meeting.id)}
                        disabled={syncingId === meeting.id}
                      >
                        {syncingId === meeting.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CalendarCheck className="w-3.5 h-3.5" />}
                      </Button>
                      {meeting.clientEmail && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400"
                          title="Send email"
                          onClick={() => openEmail(meeting)}
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMeeting.mutate({ id: meeting.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <GmailComposeDialog
        open={gmailOpen}
        onClose={() => setGmailOpen(false)}
        defaultTo={gmailDefaults.to}
        defaultSubject={gmailDefaults.subject}
        defaultBody={gmailDefaults.body}
      />
    </>
  );
}
