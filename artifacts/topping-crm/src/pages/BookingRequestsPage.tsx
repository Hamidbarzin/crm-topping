import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, User, Mail, UserCheck, ExternalLink } from "lucide-react";

export default function BookingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isManager = ["CEO", "Manager", "Admin"].includes(user?.role || "");

  const [assignId, setAssignId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["booking-requests"],
    queryFn: async () => {
      const r = await fetch("/api/booking/requests", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: isManager,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const r = await fetch("/api/users", { headers: getAuthHeaders() });
      return r.json();
    },
    enabled: isManager,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: number; userId: number }) => {
      const r = await fetch(`/api/booking/requests/${id}/assign`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assignedUserId: userId }),
      });
      if (!r.ok) throw new Error("Failed to assign");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-requests"] });
      setAssignId(null);
      setAssignUserId("");
      toast({ title: "Booking assigned successfully!" });
    },
    onError: () => toast({ title: "Failed to assign", variant: "destructive" }),
  });

  const unassigned = requests.filter((r: any) => !r.ownerId);
  const assigned = requests.filter((r: any) => r.ownerId);

  if (!isManager) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">Access restricted to managers.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Booking Requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Incoming public bookings — review, save, and assign to your team
            </p>
          </div>
          {unassigned.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border text-sm px-3 py-1">
              {unassigned.length} unassigned
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading…</div>
        ) : requests.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="text-center py-12 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No booking requests yet</p>
              <p className="text-sm mt-1">When someone books via your public booking link, it will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {unassigned.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">
                  ⏳ Unassigned ({unassigned.length})
                </h2>
                <div className="space-y-3">
                  {unassigned.map((req: any) => (
                    <BookingCard
                      key={req.id}
                      req={req}
                      onAssign={() => { setAssignId(req.id); setAssignUserId(""); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {assigned.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3">
                  ✓ Assigned ({assigned.length})
                </h2>
                <div className="space-y-3">
                  {assigned.map((req: any) => (
                    <BookingCard
                      key={req.id}
                      req={req}
                      onAssign={() => { setAssignId(req.id); setAssignUserId(req.ownerId?.toString() || ""); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignId !== null} onOpenChange={() => setAssignId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Booking</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label>Assign to Team Member</Label>
            <select
              value={assignUserId}
              onChange={e => setAssignUserId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a team member…</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignId(null)}>Cancel</Button>
            <Button
              disabled={!assignUserId || assignMutation.isPending}
              onClick={() => assignMutation.mutate({ id: assignId!, userId: parseInt(assignUserId) })}
            >
              {assignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function BookingCard({ req, onAssign }: { req: any; onAssign: () => void }) {
  const start = new Date(req.startTime);
  const end = new Date(req.endTime);

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{req.clientName || "Unknown Client"}</span>
              {req.ownerName && (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border text-xs flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> {req.ownerName}
                </Badge>
              )}
              <Badge className="border text-xs" variant="outline">
                {req.status}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {req.clientEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {req.clientEmail}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {start.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {start.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })} –{" "}
                {end.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>

            {req.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                {req.notes}
              </p>
            )}
          </div>

          <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={onAssign}>
            <User className="w-3.5 h-3.5" />
            {req.ownerId ? "Reassign" : "Assign"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
