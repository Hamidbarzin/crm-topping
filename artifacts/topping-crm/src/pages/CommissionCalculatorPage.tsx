import { useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calculator, DollarSign } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Tiered commission rate based on monthly collected pre-tax revenue.
// Mirrors the Topping compensation formula.
const TIERS = [
  { max: 1000, rate: 0.05, label: "Up to $1,000" },
  { max: 3000, rate: 0.045, label: "$1,000 – $3,000" },
  { max: 5000, rate: 0.04, label: "$3,000 – $5,000" },
  { max: 10000, rate: 0.03, label: "$5,000 – $10,000" },
  { max: Infinity, rate: 0.025, label: "$10,000 and above" },
] as const;

function tierFor(revenue: number) {
  return TIERS.find((t) => revenue <= t.max) ?? TIERS[TIERS.length - 1];
}

// Selectable commission rates (as percentages) covering the formula's ranges.
const RATE_OPTIONS = [2, 2.5, 3, 3.5, 4, 4.5, 5];

type Mode = "split" | "self";

export default function CommissionCalculatorPage() {
  const [revenue, setRevenue] = useState("8000");
  // Empty string = "Auto (by tier)"; otherwise a fixed percentage.
  const [rateChoice, setRateChoice] = useState<string>("auto");
  const [mode, setMode] = useState<Mode>("split");

  const rev = Number(revenue);
  const validRevenue = Number.isFinite(rev) && rev >= 0;

  const tier = useMemo(() => tierFor(validRevenue ? rev : 0), [rev, validRevenue]);
  const rate = rateChoice === "auto" ? tier.rate : Number(rateChoice) / 100;

  const total = validRevenue ? round2(rev * rate) : 0;
  const salesShare = mode === "split" ? round2(total * 0.5) : 0;
  const closerShare = mode === "split" ? round2(total - salesShare) : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Commission Calculator</h1>
            <p className="text-sm text-muted-foreground">
              Commission on collected pre-tax revenue (Sales / Closer / Self-Close). HST, unpaid
              invoices, refunds and claims are excluded.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Inputs */}
          <Card className="p-5 space-y-5 h-fit">
            <div className="space-y-1.5">
              <Label>Collected revenue before HST (USD)</Label>
              <Input
                type="number"
                min={0}
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="8000"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Commission rate</Label>
              <Select value={rateChoice} onValueChange={setRateChoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto by tier ({(tier.rate * 100).toFixed(1)}%)
                  </SelectItem>
                  {RATE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validRevenue && (
                <p className="text-xs text-muted-foreground">
                  Tier: {tier.label} → {(tier.rate * 100).toFixed(1)}%
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="split">Sales + Closer (50% / 50%)</SelectItem>
                  <SelectItem value="self">Self-Close (one person, 100%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Result */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Total commission</p>
                  <p className="text-3xl font-semibold mt-1">{fmt(total)}</p>
                </div>
                <Badge variant="outline">{(rate * 100).toFixed(1)}% rate</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {validRevenue ? `${fmt(rev)} × ${(rate * 100).toFixed(1)}%` : "Enter a valid revenue amount"}
              </p>
            </Card>

            <Card className="p-5 space-y-3">
              <p className="text-sm font-medium">Split</p>
              {mode === "split" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Sales (50%)</span>
                    <span className="text-sm font-semibold">{fmt(salesShare)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Closer (50%)</span>
                    <span className="text-sm font-semibold">{fmt(closerShare)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Self-Close (100%)</span>
                  <span className="text-sm font-semibold">{fmt(total)}</span>
                </div>
              )}
            </Card>

            <Card className="p-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40">
              <DollarSign className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                The 40% Gross Company Share is calculated before overhead, not final net profit.
                Larger customers' commissions should be staged and controlled.
              </span>
            </Card>
          </div>
        </div>

        {/* Tier reference */}
        <Card className="p-5">
          <p className="text-sm font-medium mb-3">Commission rate tiers</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Monthly collected revenue</th>
                  <th className="py-2 pr-4 font-medium">Commission rate</th>
                  <th className="py-2 font-medium">Split</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr
                    key={t.label}
                    className={t.label === tier.label && validRevenue ? "bg-primary/5" : ""}
                  >
                    <td className="py-2 pr-4">{t.label}</td>
                    <td className="py-2 pr-4">{(t.rate * 100).toFixed(1)}%</td>
                    <td className="py-2 text-muted-foreground">Sales 50% / Closer 50% · Self-Close 100%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
