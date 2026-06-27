import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import {
  useListLeads, useListCompanies, useCreateLead, useUpdateLead, useScoreLead,
} from "@workspace/api-client-react";
import { getListLeadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ActivityTimeline from "@/components/ActivityTimeline";


const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
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
const SOURCES = [
  "Instagram",
  "Facebook",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "X (Twitter)",
  "Snapchat",
  "Pinterest",
  "WhatsApp",
  "Telegram",
  "Google Ads",
  "SEO",
  "Email Campaign",
  "Referral",
  "Cold Call",
  "Website",
  "Other",
];
const ACTIVITY_TYPES = ["email", "call", "meeting", "linkedin_message", "follow_up"];
const GTA_NODES = [1, 2, 3, 4, 5];

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

const emptyForm = {
  name: "",
  companyId: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  industry: "",
  source: "",
  status: "new_lead",
  stage: "new",
  gtaNode: "",
  activityType: "",
  nextActionDate: "",
  meetingDate: "",
  emailsSent: "",
  emailsReceived: "",
  value: "",
  notes: "",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr] py-6 border-b border-border last:border-b-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function LeadFormPage() {
  const { user } = useAuth();
  const isObserver = user?.role === "Marketing_Manager";
  const params = useParams();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const idParam = params.id;
  const isNew = idParam === "new";
  const leadId = isNew ? null : Number(idParam);

  const { data: leads, isLoading } = useListLeads();
  const { data: companies } = useListCompanies();
  const currentLead = leadId != null ? leads?.find((l) => l.id === leadId) : undefined;

  const [form, setForm] = useState(emptyForm);
  // Track which route target the form was last hydrated for, so navigating
  // between leads (/leads/1 -> /leads/2) re-fills the form, while a background
  // refetch of the same lead does NOT clobber in-progress edits.
  const [hydratedFor, setHydratedFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (hydratedFor === idParam) return;
    if (isNew) {
      setForm(emptyForm);
      setHydratedFor(idParam);
      return;
    }
    if (!currentLead) return; // wait for the list to load this lead
    setForm({
      name: currentLead.name,
      companyId: currentLead.companyId ? String(currentLead.companyId) : "",
      email: currentLead.email || "",
      phone: currentLead.phone || "",
      linkedinUrl: currentLead.linkedinUrl || "",
      industry: currentLead.industry || "",
      source: currentLead.source || "",
      status: currentLead.status || "new_lead",
      stage: currentLead.stage,
      gtaNode: currentLead.gtaNode != null ? String(currentLead.gtaNode) : "",
      activityType: currentLead.activityType || "",
      nextActionDate: currentLead.nextActionDate || "",
      meetingDate: currentLead.meetingDate || "",
      emailsSent: currentLead.emailsSent != null ? String(currentLead.emailsSent) : "",
      emailsReceived: currentLead.emailsReceived != null ? String(currentLead.emailsReceived) : "",
      value: currentLead.value ? String(currentLead.value) : "",
      notes: currentLead.notes || "",
    });
    setHydratedFor(idParam);
  }, [idParam, isNew, currentLead, hydratedFor]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
  const scoreLead = useScoreLead({ mutation: { onSuccess: () => invalidate() } });
  const createLead = useCreateLead({
    mutation: {
      onSuccess: (created) => {
        invalidate();
        if (created?.id) scoreLead.mutate({ id: created.id });
        setLocation("/leads");
      },
    },
  });
  const updateLead = useUpdateLead({
    mutation: { onSuccess: () => { invalidate(); setLocation("/leads"); } },
  });

  const saving = createLead.isPending || updateLead.isPending;

  const handleSubmit = () => {
    if (isObserver) return;
    const payload = {
      name: form.name,
      companyId: form.companyId === "" ? undefined : Number(form.companyId),
      email: form.email || undefined,
      phone: form.phone || undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      industry: form.industry || undefined,
      source: form.source || undefined,
      status: form.status,
      stage: form.stage,
      gtaNode: form.gtaNode === "" ? undefined : Number(form.gtaNode),
      activityType: form.activityType || undefined,
      nextActionDate: form.nextActionDate || undefined,
      meetingDate: form.meetingDate || undefined,
      emailsSent: form.emailsSent === "" ? undefined : Number(form.emailsSent),
      emailsReceived: form.emailsReceived === "" ? undefined : Number(form.emailsReceived),
      value: form.value === "" ? undefined : Number(form.value),
      notes: form.notes || undefined,
    };
    if (leadId != null) updateLead.mutate({ id: leadId, data: payload });
    else createLead.mutate({ data: payload });
  };

  const title = isNew ? "New Lead" : isObserver ? "Lead Details" : "Edit Lead";

  if (!isNew && !isLoading && !currentLead) {
    return (
      <AppLayout>
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/leads")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />Back to Leads
          </Button>
          <p className="text-sm text-muted-foreground mt-6">Lead not found.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/leads")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isObserver ? "Read-only view" : "Fill in the lead details below"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation("/leads")}>
              {isObserver ? "Close" : "Cancel"}
            </Button>
            {!isObserver && (
              <Button size="sm" onClick={handleSubmit} disabled={!form.name || saving}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : leadId != null ? "Save Changes" : "Create Lead"}
              </Button>
            )}
          </div>
        </div>

        <div className="border border-border rounded-lg px-6 bg-card">
          {/* Contact */}
          <Section title="Contact" description="Who is this lead and how do you reach them?">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input value={form.name} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">{currentLead?.companyName || "—"}</div>
                ) : (
                  <Select value={form.companyId} onValueChange={(v) => setForm((f) => ({ ...f, companyId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {(companies || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>LinkedIn URL</Label>
                <Input value={form.linkedinUrl} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/…" />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Input value={form.industry} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="e.g. Retail, Healthcare" />
              </div>
            </div>
          </Section>

          {/* Classification */}
          <Section title="Classification" description="Source, status and where it sits in the pipeline.">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">{form.source || "—"}</div>
                ) : (
                  <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>GTA Node</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">{form.gtaNode ? `Node ${form.gtaNode}` : "—"}</div>
                ) : (
                  <Select value={form.gtaNode} onValueChange={(v) => setForm((f) => ({ ...f, gtaNode: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select node" /></SelectTrigger>
                    <SelectContent>{GTA_NODES.map((nd) => <SelectItem key={nd} value={String(nd)}>Node {nd}{nd <= 2 ? " (Arshia)" : " (Shayan)"}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">{labelize(form.status)}</div>
                ) : (
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Pipeline Stage</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center">
                    <Badge variant="outline" className={cn("text-xs border capitalize", stageColors[form.stage] || "")}>
                      {form.stage.replace("_", " ")}
                    </Badge>
                  </div>
                ) : (
                  <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </Section>

          {/* Activity & follow-up */}
          <Section title="Activity & Follow-up" description="Last touch type, the follow-up date, and the meeting date.">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Activity Type</Label>
                {isObserver ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">{form.activityType ? labelize(form.activityType) : "—"}</div>
                ) : (
                  <Select value={form.activityType} onValueChange={(v) => setForm((f) => ({ ...f, activityType: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{ACTIVITY_TYPES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Follow-up Date</Label>
                <Input type="date" value={form.nextActionDate} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, nextActionDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Meeting Date</Label>
                <Input type="date" value={form.meetingDate} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Emails Sent</Label>
                <Input type="number" min="0" value={form.emailsSent} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, emailsSent: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Emails Received</Label>
                <Input type="number" min="0" value={form.emailsReceived} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, emailsReceived: e.target.value }))} />
              </div>
            </div>
          </Section>

          {/* Deal */}
          <Section title="Deal & Notes" description="Potential deal value and any context.">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Deal Value ($)</Label>
                <Input type="number" min="0" value={form.value} disabled={isObserver} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              {isObserver ? (
                <div className="text-sm text-muted-foreground border rounded-md p-2 min-h-[60px]">{form.notes || "—"}</div>
              ) : (
                <Textarea value={form.notes} rows={3} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any context about this lead…" />
              )}
            </div>
          </Section>

          {/* AI score (existing lead only) */}
          {currentLead && (
            <Section title="AI Score" description="Auto-calculated lead score and recommended next step.">
              <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">AI Score</span>
                    {currentLead.aiScore != null ? (
                      <Badge variant="outline" className={cn("text-xs border font-semibold", scoreColor(currentLead.aiScore))}>
                        {currentLead.aiScore} / 100
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not scored yet</span>
                    )}
                  </div>
                  {!isObserver && (
                    <Button type="button" variant="outline" size="sm" disabled={scoreLead.isPending}
                      onClick={() => scoreLead.mutate({ id: currentLead.id })}>
                      {scoreLead.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Scoring…</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-1.5" />{currentLead.aiScore != null ? "Re-score" : "Score with AI"}</>
                      )}
                    </Button>
                  )}
                </div>
                {currentLead.priority && (
                  <div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", priorityColors[currentLead.priority] || "")}>
                      {priorityIcon[currentLead.priority]} {currentLead.priority}
                    </span>
                  </div>
                )}
                {currentLead.scoreReason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{currentLead.scoreReason}</p>
                )}
                {currentLead.aiNextAction && (
                  <div className="flex items-start gap-1.5 text-xs text-foreground">
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                    <span><span className="font-medium">Next action:</span> {currentLead.aiNextAction}</span>
                  </div>
                )}
              </div>
              {leadId != null && <ActivityTimeline entityType="lead" entityId={leadId} />}
            </Section>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
