import { useState, useRef, useEffect } from "react";
import { useCalculateCompensation, useAskCompensation } from "@workspace/api-client-react";
import type { CompensationInput, CompensationResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calculator, Sparkles, Send, Loader2, User, CheckCircle2, XCircle,
  AlertTriangle, Clock, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const SCENARIOS = [
  { value: "A", label: "A — Standard (marketing lead + field sales + closer)" },
  { value: "B", label: "B — Independent (field sales found the lead)" },
  { value: "C", label: "C — Solo closer (closer sourced & closed)" },
  { value: "D", label: "D — Split (both Arshia & Shayan, 7-day overlap)" },
] as const;

const STRATEGIC = [
  { value: "none", label: "None" },
  { value: "over_10k", label: "Over $10K/month ($300–$500)" },
  { value: "multi_branch", label: "Multi-branch customer ($500)" },
  { value: "long_term", label: "Long-term contract ($500–$1,000)" },
] as const;

const GATE_FIELDS: { key: keyof CompensationInput["gates"]; label: string }[] = [
  { key: "firstOrder", label: "First real order completed" },
  { key: "crmVerified", label: "CRM verified (company, phone, source)" },
  { key: "invoicePaid", label: "Invoice paid" },
  { key: "noDispute", label: "No open dispute / refund" },
  { key: "nodeCompliance", label: "Node compliance (correct territory)" },
  { key: "leadSourceLogged", label: "Lead source logged" },
];

const emptyGates = {
  firstOrder: true,
  crmVerified: true,
  invoicePaid: true,
  noDispute: true,
  nodeCompliance: true,
  leadSourceLogged: true,
};

function statusBadge(status: string) {
  if (status === "confirmed")
    return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Confirmed</Badge>;
  if (status === "pending")
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Pending approval</Badge>;
  return <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Blocked</Badge>;
}

export function CalculatorTab() {
  const calc = useCalculateCompensation();
  const [result, setResult] = useState<CompensationResult | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [scenario, setScenario] = useState<"A" | "B" | "C" | "D">("A");
  const [leadGenerator, setLeadGenerator] = useState<"Arshia" | "Shayan" | "none">("Arshia");
  const [fieldSalesPerson, setFieldSalesPerson] = useState("");
  const [closerPerson, setCloserPerson] = useState("");
  const [newCustomersThisMonth, setNewCustomersThisMonth] = useState("");
  const [strategicType, setStrategicType] = useState<"none" | "over_10k" | "multi_branch" | "long_term">("none");
  const [founderApproved, setFounderApproved] = useState(false);
  const [gates, setGates] = useState({ ...emptyGates });

  const marketingInvolved = scenario === "A" || scenario === "D";

  const submit = () => {
    const rev = Number(monthlyRevenue);
    if (!Number.isFinite(rev) || rev < 0) return;
    const data: CompensationInput = {
      customerName: customerName || undefined,
      monthlyRevenue: rev,
      scenario,
      leadGenerator: scenario === "A" ? leadGenerator : undefined,
      fieldSalesPerson: fieldSalesPerson || undefined,
      closerPerson: closerPerson || undefined,
      newCustomersThisMonth: newCustomersThisMonth ? Number(newCustomersThisMonth) : undefined,
      strategicType,
      founderApproved,
      gates,
    };
    calc.mutate({ data }, { onSuccess: (r) => setResult(r) });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form */}
      <Card className="p-5 space-y-5 h-fit">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Downtown ecommerce" />
          </div>
          <div className="space-y-1.5">
            <Label>Monthly revenue (USD) *</Label>
            <Input
              type="number"
              min={0}
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
              placeholder="8000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>New customers this month</Label>
            <Input
              type="number"
              min={0}
              value={newCustomersThisMonth}
              onChange={(e) => setNewCustomersThisMonth(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Scenario *</Label>
            <Select value={scenario} onValueChange={(v) => setScenario(v as typeof scenario)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scenario === "A" && (
            <div className="space-y-1.5">
              <Label>Lead generator</Label>
              <Select value={leadGenerator} onValueChange={(v) => setLeadGenerator(v as typeof leadGenerator)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arshia">Arshia (Instagram/Facebook)</SelectItem>
                  <SelectItem value="Shayan">Shayan (Google/SEO/LinkedIn)</SelectItem>
                  <SelectItem value="none">None / unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {scenario !== "C" && (
            <div className="space-y-1.5">
              <Label>Field sales person</Label>
              <Input value={fieldSalesPerson} onChange={(e) => setFieldSalesPerson(e.target.value)} placeholder="optional" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Closer</Label>
            <Input value={closerPerson} onChange={(e) => setCloserPerson(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Strategic bonus</Label>
            <Select value={strategicType} onValueChange={(v) => setStrategicType(v as typeof strategicType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIC.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {strategicType !== "none" && (
            <label className="flex items-center gap-2 sm:col-span-2 text-sm cursor-pointer">
              <Checkbox checked={founderApproved} onCheckedChange={(c) => setFounderApproved(c === true)} />
              Written Founder approval received
            </label>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payment gates</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {GATE_FIELDS.map((g) => {
              const disabled = !marketingInvolved && (g.key === "nodeCompliance" || g.key === "leadSourceLogged");
              return (
                <label
                  key={g.key}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer",
                    disabled && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={gates[g.key]}
                    onCheckedChange={(c) => setGates((s) => ({ ...s, [g.key]: c === true }))}
                  />
                  {g.label}
                </label>
              );
            })}
          </div>
        </div>

        <Button onClick={submit} disabled={calc.isPending || !monthlyRevenue} className="w-full">
          {calc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          Calculate
        </Button>
      </Card>

      {/* Result */}
      <div>
        {!result ? (
          <Card className="p-10 flex flex-col items-center justify-center text-center text-muted-foreground h-full min-h-64 gap-3">
            <DollarSign className="h-8 w-8 opacity-40" />
            <p className="text-sm">Fill in the details and press Calculate to see the full payout breakdown.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{result.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmt(result.monthlyRevenue)}/mo · {result.sizeLabel} · scenario {result.scenario}
                  </p>
                </div>
                <Badge variant="outline">{(result.commissionRate * 100).toFixed(1)}% rate</Badge>
              </div>
              {result.blocked && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  <XCircle className="h-4 w-4 shrink-0" /> All variable pay is blocked by a failed gate.
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <p className="text-sm font-medium">Payouts</p>
              <div className="space-y-2">
                {result.payouts.map((p, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {p.person} <span className="text-muted-foreground font-normal">· {p.role}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{p.basis}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmt(p.amount)}</p>
                      {statusBadge(p.status)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <span className="text-muted-foreground">Commission pool</span>
              <span className="text-right font-medium">{fmt(result.commissionPool)}</span>
              <span className="text-muted-foreground">Total acquisition cost</span>
              <span className="text-right font-medium">{fmt(result.totalAcquisitionCost)}</span>
              {result.pendingTotal > 0 && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Pending approval</span>
                  <span className="text-right font-medium text-amber-600">{fmt(result.pendingTotal)}</span>
                </>
              )}
              <span className="text-muted-foreground">Company profit (40%)</span>
              <span className="text-right font-medium">{fmt(result.operationalProfit)}</span>
              <span className="text-muted-foreground">Acquisition % of profit</span>
              <span className="text-right font-medium">{result.acquisitionPctOfProfit}%</span>
              <span className="text-muted-foreground font-medium">Company net profit</span>
              <span className="text-right font-semibold">{fmt(result.companyNetProfit)}</span>
            </Card>

            <Card className="p-5 space-y-2">
              <p className="text-sm font-medium">Gate check</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {result.gateResults.map((g) => (
                  <div key={g.gate} className="flex items-center gap-2 text-sm">
                    {g.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span className={cn(!g.passed && "text-red-600")}>{g.gate}</span>
                  </div>
                ))}
              </div>
            </Card>

            {result.flags.length > 0 && (
              <Card className="p-5 space-y-2 border-amber-500/30 bg-amber-500/5">
                <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Flags</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                  {result.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_SUGGESTIONS = [
  "Calculate pay for a $6,000/mo Downtown customer from Instagram, scenario A.",
  "Shayan and Arshia both touched a $4,000 lead within 7 days — how is the bonus split?",
  "What does the closer get if they sourced and closed a $12,000 customer alone?",
];

export function ChatTab() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const ask = useAskCompensation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    ask.mutate(
      { data: { question: q } },
      {
        onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.answer }]),
        onError: () =>
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Sorry, I couldn't get an answer right now. Please try again." },
          ]),
      },
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.52))] max-w-3xl mx-auto w-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 px-1 pb-4">
        {messages.length === 0 && !ask.isPending && (
          <div className="flex flex-col items-center justify-center text-center py-12 gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">Hi {user?.name?.split(" ")[0] || "there"} — ask me anything about commissions.</p>
              <p className="text-sm text-muted-foreground mt-1">I follow the full Topping compensation rulebook. Reply in Farsi or English.</p>
            </div>
            <div className="grid gap-2 w-full max-w-lg">
              {CHAT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-lg border bg-card px-4 py-3 hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-muted" : "bg-primary/10 text-primary",
              )}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </div>
            <Card
              className={cn(
                "px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-w-[85%]",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {m.content}
            </Card>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <Card className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </Card>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t pt-3 px-1"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask a compensation question…"
          className="min-h-[44px] max-h-32 resize-none"
          disabled={ask.isPending}
        />
        <Button type="submit" size="icon" disabled={ask.isPending || !input.trim()} className="h-11 w-11 shrink-0">
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

export function CompensationHeader() {
  return (
    <div className="flex items-center gap-3 pb-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Calculator className="h-5 w-5" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Compensation</h1>
        <p className="text-sm text-muted-foreground">
          Commission, lead-gen and bonus calculator. Base salary is separate and fixed — this covers variable pay only.
        </p>
      </div>
    </div>
  );
}
