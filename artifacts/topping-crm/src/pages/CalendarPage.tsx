import { useState } from "react";
import { useGetTeamCalendar, useCreateMeeting, useCheckConflict, useListUsers } from "@workspace/api-client-react";
import { getListMeetingsQueryKey, getGetTeamCalendarQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays, isSameDay, parseISO, addWeeks, subWeeks } from "date-fns";

const statusColors: Record<string,string> = {
  scheduled: "bg-blue-500/15 text-blue-400 border-l-2 border-l-blue-400",
  completed: "bg-green-500/15 text-green-400 border-l-2 border-l-green-400",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-l-2 border-l-zinc-400",
  no_show: "bg-red-500/15 text-red-400 border-l-2 border-l-red-400",
  follow_up: "bg-yellow-500/15 text-yellow-400 border-l-2 border-l-yellow-400",
};

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8);

const emptyForm = { title: "", clientName: "", startTime: "", endTime: "", location: "", onlineLink: "", attendeeIds: [] as number[], notes: "" };

export function CalendarContent() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { data: meetings, isLoading } = useGetTeamCalendar({ start: weekStart.toISOString() });
  const { data: users } = useListUsers();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [conflicts, setConflicts] = useState<any[]>([]);

  const [createError, setCreateError] = useState<string | null>(null);

  const checkConflict = useCheckConflict();
  const createMeeting = useCreateMeeting({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTeamCalendarQueryKey() });
        setOpen(false);
        setForm(emptyForm);
        setConflicts([]);
        setCreateError(null);
      },
      onError: (err: any) => {
        setCreateError(err?.response?.data?.error || err?.message || "Could not create meeting.");
      },
    },
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getMeetingsForDayHour = (day: Date, hour: number) => {
    return (meetings || []).filter(m => {
      const start = parseISO(m.startTime);
      return isSameDay(start, day) && start.getHours() === hour;
    });
  };

  const handleCheckConflict = async () => {
    if (!form.startTime || !form.endTime || form.attendeeIds.length === 0) return;
    const result = await checkConflict.mutateAsync({ data: { startTime: form.startTime, endTime: form.endTime, attendeeIds: form.attendeeIds } });
    setConflicts((result as any).conflicts || []);
  };

  const handleCreate = () => {
    createMeeting.mutate({ data: { title: form.title, clientName: form.clientName || undefined, startTime: form.startTime, endTime: form.endTime, location: form.location || undefined, onlineLink: form.onlineLink || undefined, attendeeIds: form.attendeeIds, notes: form.notes || undefined } });
  };

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Team Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week of {format(weekStart, "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />Meeting
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b border-border bg-muted/30">
            <div className="p-3 text-xs text-muted-foreground border-r border-border" />
            {weekDays.map(day => (
              <div key={day.toISOString()} className={cn("p-3 text-center border-r border-border last:border-r-0", isSameDay(day, new Date()) && "bg-primary/5")}>
                <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
                <div className={cn("text-sm font-semibold mt-0.5", isSameDay(day, new Date()) && "text-primary")}>{format(day, "d")}</div>
              </div>
            ))}
          </div>
          {/* Hour rows */}
          <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-8 border-b border-border last:border-b-0 min-h-[52px]">
                <div className="p-2 text-xs text-muted-foreground/60 border-r border-border flex items-start justify-end pt-2 pr-3">
                  {hour === 12 ? "12pm" : hour > 12 ? `${hour-12}pm` : `${hour}am`}
                </div>
                {weekDays.map(day => {
                  const dayMeetings = getMeetingsForDayHour(day, hour);
                  return (
                    <div key={day.toISOString()} className={cn("p-1 border-r border-border last:border-r-0 min-h-[52px]", isSameDay(day, new Date()) && "bg-primary/[0.02]")}>
                      {dayMeetings.map(m => (
                        <div key={m.id} className={cn("rounded px-2 py-1 mb-1 text-xs leading-tight", statusColors[m.status] || statusColors.scheduled)}>
                          <div className="font-medium truncate">{m.title}</div>
                          {m.clientName && <div className="opacity-75 truncate">{m.clientName}</div>}
                          <div className="flex items-center gap-1 opacity-60 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {format(parseISO(m.startTime), "HH:mm")}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setForm(emptyForm); setConflicts([]); setCreateError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Meeting</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Client Name</Label><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start *</Label><Input type="datetime-local" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>End *</Label><Input type="datetime-local" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Online Link</Label><Input value={form.onlineLink} onChange={e => setForm(f => ({ ...f, onlineLink: e.target.value }))} /></div>
            </div>
            {users && users.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attendees</Label>
                  {form.attendeeIds.length > 0 && form.startTime && form.endTime && (
                    <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={handleCheckConflict}>
                      Check conflicts
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-md p-2">
                  {users.map(user => (
                    <div key={user.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`u-${user.id}`}
                        checked={form.attendeeIds.includes(user.id)}
                        onCheckedChange={checked => setForm(f => ({ ...f, attendeeIds: checked ? [...f.attendeeIds, user.id] : f.attendeeIds.filter(id => id !== user.id) }))}
                      />
                      <label htmlFor={`u-${user.id}`} className="text-sm cursor-pointer">{user.name}
                        <span className="text-xs text-muted-foreground ml-1">({user.role.replace("_"," ")})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {conflicts.length > 0 && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-xs">
                  <strong>Conflict detected:</strong>
                  {conflicts.map((c, i) => (
                    <div key={i} className="mt-1">{c.userName} is busy: {format(parseISO(c.start), "HH:mm")} – {format(parseISO(c.end), "HH:mm")}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {createError && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-xs">{createError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.title || !form.startTime || !form.endTime || createMeeting.isPending}>
              {createMeeting.isPending ? "Creating..." : "Create Meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
