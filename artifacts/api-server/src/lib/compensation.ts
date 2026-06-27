// Topping Courier compensation / commission rule engine.
// Deterministic calculator for marketing & sales variable pay. Base salary is
// separate and fixed — this only covers commissions, lead bonuses and strategic
// bonuses. Mirrors the rules in the Topping Compensation spec.

export type Scenario = "A" | "B" | "C" | "D";
export type LeadGenerator = "Arshia" | "Shayan" | "none";
export type StrategicType = "none" | "over_10k" | "multi_branch" | "long_term";

export interface CompensationGates {
  firstOrder: boolean;
  crmVerified: boolean;
  invoicePaid: boolean;
  noDispute: boolean;
  nodeCompliance: boolean;
  leadSourceLogged: boolean;
}

export interface CompensationInput {
  customerName?: string;
  monthlyRevenue: number;
  scenario: Scenario;
  leadGenerator?: LeadGenerator;
  fieldSalesPerson?: string;
  closerPerson?: string;
  newCustomersThisMonth?: number;
  strategicType?: StrategicType;
  founderApproved?: boolean;
  gates: CompensationGates;
}

export interface PayoutLine {
  role: string;
  person: string;
  amount: number;
  status: "confirmed" | "pending" | "blocked";
  basis: string;
}

export interface GateResult {
  gate: string;
  passed: boolean;
}

export interface CompensationResult {
  customerName: string;
  monthlyRevenue: number;
  sizeLabel: string;
  commissionRate: number;
  commissionPool: number;
  scenario: Scenario;
  payouts: PayoutLine[];
  totalAcquisitionCost: number;
  pendingTotal: number;
  operationalProfit: number;
  acquisitionPctOfProfit: number;
  companyNetProfit: number;
  blocked: boolean;
  gateResults: GateResult[];
  flags: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function commissionRate(revenue: number): number {
  if (revenue <= 1000) return 0.05;
  if (revenue <= 3000) return 0.045;
  if (revenue <= 5000) return 0.04;
  if (revenue <= 10000) return 0.03;
  return 0.025;
}

function sizeLabel(revenue: number): string {
  if (revenue <= 1000) return "Small";
  if (revenue <= 3000) return "Medium";
  if (revenue <= 5000) return "Growth";
  if (revenue <= 10000) return "Large";
  return "Strategic";
}

function leadBonus(revenue: number): number {
  if (revenue < 500) return 0;
  if (revenue <= 1000) return 25;
  if (revenue <= 3000) return 50;
  if (revenue <= 5000) return 100;
  if (revenue <= 10000) return 200;
  return 300;
}

function monthlyPerformanceBonus(newCustomers: number): number {
  if (newCustomers >= 10) return 500;
  if (newCustomers >= 5) return 250;
  if (newCustomers >= 3) return 100;
  return 0;
}

// Strategic bonus range (requires written Founder approval).
function strategicBonusRange(type: StrategicType): [number, number] | null {
  switch (type) {
    case "over_10k":
      return [300, 500];
    case "multi_branch":
      return [500, 500];
    case "long_term":
      return [500, 1000];
    default:
      return null;
  }
}

export function calculateCompensation(input: CompensationInput): CompensationResult {
  const revenue = Math.max(0, Number(input.monthlyRevenue) || 0);
  const rate = commissionRate(revenue);
  const pool = round2(revenue * rate);
  const operationalProfit = round2(revenue * 0.4);
  const flags: string[] = [];

  const gates = input.gates;
  const marketingInvolved = input.scenario === "A" || input.scenario === "D";

  // Hard global gates: if any fails, the entire variable payout is $0.
  const hardGates: { key: keyof CompensationGates; label: string }[] = [
    { key: "firstOrder", label: "First real order completed" },
    { key: "crmVerified", label: "CRM verified (company, phone, source)" },
    { key: "invoicePaid", label: "Invoice paid" },
    { key: "noDispute", label: "No open dispute / refund" },
  ];
  const failedHard = hardGates.filter((g) => !gates[g.key]);
  const blocked = failedHard.length > 0;

  const gateResults: GateResult[] = [
    { gate: "First real order completed", passed: gates.firstOrder },
    { gate: "CRM verified", passed: gates.crmVerified },
    { gate: "Invoice paid", passed: gates.invoicePaid },
    { gate: "No dispute / refund", passed: gates.noDispute },
    { gate: "Node compliance", passed: gates.nodeCompliance },
    { gate: "Lead source logged", passed: gates.leadSourceLogged },
  ];

  // Marketing components also require node compliance + lead source logged.
  const marketingGateOk = gates.nodeCompliance && gates.leadSourceLogged;

  const payouts: PayoutLine[] = [];

  // ---- Sales commission split (Field Sales / Closer) ----
  const fieldSales = input.fieldSalesPerson?.trim() || "Field Sales";
  const closer = input.closerPerson?.trim() || "Closer";

  let fieldPct = 0;
  let closerPct = 0;
  switch (input.scenario) {
    case "A":
    case "D":
      fieldPct = 0.5;
      closerPct = 0.5;
      break;
    case "B":
      fieldPct = 0.7;
      closerPct = 0.3;
      break;
    case "C":
      fieldPct = 0;
      closerPct = 1;
      break;
  }

  const blockedReason = blocked ? `Blocked: ${failedHard.map((g) => g.label).join(", ")}` : "";

  if (fieldPct > 0) {
    payouts.push({
      role: "Field Sales",
      person: fieldSales,
      amount: blocked ? 0 : round2(pool * fieldPct),
      status: blocked ? "blocked" : "confirmed",
      basis: blocked ? blockedReason : `${Math.round(fieldPct * 100)}% of $${pool} commission pool`,
    });
  }
  payouts.push({
    role: "Closer",
    person: closer,
    amount: blocked ? 0 : round2(pool * closerPct),
    status: blocked ? "blocked" : "confirmed",
    basis: blocked ? blockedReason : `${Math.round(closerPct * 100)}% of $${pool} commission pool`,
  });

  // ---- Lead generator bonus (scenarios A & D only) ----
  if (marketingInvolved) {
    const bonus = leadBonus(revenue);
    const marketingBlocked = blocked || !marketingGateOk;
    let marketingBlockReason = blockedReason;
    if (!blocked && !marketingGateOk) {
      const missing: string[] = [];
      if (!gates.nodeCompliance) missing.push("node compliance");
      if (!gates.leadSourceLogged) missing.push("lead source logged");
      marketingBlockReason = `Blocked: ${missing.join(", ")}`;
      flags.push(`Lead-gen bonus voided — ${missing.join(", ")} failed.`);
    }

    if (input.scenario === "D") {
      // 7-day overlap, source unclear → Shayan & Arshia split lead bonus 50/50.
      const half = round2(bonus / 2);
      for (const person of ["Arshia", "Shayan"]) {
        payouts.push({
          role: "Lead Gen (split)",
          person,
          amount: marketingBlocked ? 0 : half,
          status: marketingBlocked ? "blocked" : "confirmed",
          basis: marketingBlocked ? marketingBlockReason : `50% of $${bonus} lead bonus (7-day overlap split)`,
        });
      }
    } else {
      const person =
        input.leadGenerator && input.leadGenerator !== "none" ? input.leadGenerator : "Lead Generator";
      payouts.push({
        role: "Lead Gen",
        person,
        amount: marketingBlocked ? 0 : bonus,
        status: marketingBlocked ? "blocked" : "confirmed",
        basis: marketingBlocked ? marketingBlockReason : `Fixed lead bonus for ${sizeLabel(revenue)} customer`,
      });
    }

    // Monthly performance bonus (new customers activated this month).
    const newCustomers = Math.max(0, Math.floor(input.newCustomersThisMonth || 0));
    const perfBonus = monthlyPerformanceBonus(newCustomers);
    if (perfBonus > 0) {
      const perfPerson =
        input.scenario === "D"
          ? "Arshia & Shayan"
          : input.leadGenerator && input.leadGenerator !== "none"
            ? input.leadGenerator
            : "Lead Generator";
      payouts.push({
        role: "Monthly Performance",
        person: perfPerson,
        amount: marketingBlocked ? 0 : perfBonus,
        status: marketingBlocked ? "blocked" : "confirmed",
        basis: marketingBlocked ? marketingBlockReason : `${newCustomers} new customers activated this month`,
      });
    }
  } else if (input.strategicType && input.strategicType !== "none") {
    // strategic still allowed but no lead-gen marketing line
  }

  // ---- Strategic bonus (requires written Founder approval) ----
  const strategicType = input.strategicType ?? "none";
  const range = strategicBonusRange(strategicType);
  if (range) {
    const [min, max] = range;
    const approved = !!input.founderApproved;
    const label =
      strategicType === "over_10k"
        ? "Over $10K/month customer"
        : strategicType === "multi_branch"
          ? "Multi-branch customer"
          : "Long-term contract customer";
    const rangeStr = min === max ? `$${min}` : `$${min}–$${max}`;
    const strategicPerson =
      input.scenario === "D"
        ? "Arshia & Shayan"
        : input.leadGenerator && input.leadGenerator !== "none"
          ? input.leadGenerator
          : "Team";
    if (blocked) {
      payouts.push({
        role: "Strategic Bonus",
        person: strategicPerson,
        amount: 0,
        status: "blocked",
        basis: blockedReason,
      });
    } else if (approved) {
      payouts.push({
        role: "Strategic Bonus",
        person: strategicPerson,
        amount: min,
        status: "confirmed",
        basis: `${label} — Founder approved (${rangeStr}, min applied)`,
      });
      if (max > min) flags.push(`Strategic bonus may be raised up to $${max} at Founder discretion.`);
    } else {
      payouts.push({
        role: "Strategic Bonus",
        person: strategicPerson,
        amount: 0,
        status: "pending",
        basis: `${label} — ${rangeStr}, PENDING written Founder approval`,
      });
      flags.push("Strategic bonus is PENDING — needs written Founder approval before payout.");
    }
  }

  // ---- Totals ----
  const totalAcquisitionCost = round2(
    payouts.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
  );
  const pendingTotal = round2(
    payouts
      .filter((p) => p.status === "pending")
      .reduce((s, p) => {
        const m = p.basis.match(/\$(\d+)(?:–\$(\d+))?/);
        return s + (m ? Number(m[2] ?? m[1]) : 0);
      }, 0),
  );
  const acquisitionPctOfProfit = operationalProfit > 0 ? round2((totalAcquisitionCost / operationalProfit) * 100) : 0;
  const companyNetProfit = round2(operationalProfit - totalAcquisitionCost);

  // ---- Advisory flags ----
  if (blocked) {
    flags.unshift(`All variable pay is $0 — failed gate(s): ${failedHard.map((g) => g.label).join(", ")}.`);
  }
  if (!blocked && totalAcquisitionCost > revenue * 0.05) {
    flags.push(
      `Acquisition cost ($${totalAcquisitionCost}) exceeds the 5% gross-revenue guideline ($${round2(revenue * 0.05)}). Founder may split the payout across 2–3 months.`,
    );
  }
  if (revenue >= 10000 && strategicType === "none") {
    flags.push("Customer is $10K+/month — consider a strategic bonus with Founder approval.");
  }

  return {
    customerName: input.customerName?.trim() || "Customer",
    monthlyRevenue: revenue,
    sizeLabel: sizeLabel(revenue),
    commissionRate: rate,
    commissionPool: pool,
    scenario: input.scenario,
    payouts,
    totalAcquisitionCost,
    pendingTotal,
    operationalProfit,
    acquisitionPctOfProfit,
    companyNetProfit,
    blocked,
    gateResults,
    flags,
  };
}

// System prompt for the free-form compensation AI chat. Encodes the full rule set
// so answers follow the same logic as the deterministic calculator.
export const COMPENSATION_SYSTEM_PROMPT = `You are the Topping Courier Compensation AI — an internal calculation and decision engine for Topping Courier Inc. (Canada, GTA, same-day delivery).
Calculate bonuses, commissions and credits for the marketing and sales team with 100% accuracy. Flag violations, resolve conflicts, and explain every number with its steps. Reply in the same language the user writes in (Farsi/Finglish or English). Be concise and structured.

COMPANY ECONOMICS
- Drivers get 60% of each order; company keeps 40% (operational profit).
- All marketing commissions are paid from that 40%.
- Commission cap: 5% of gross monthly customer revenue.
- No payment without (1) CRM verification and (2) a real first order completed.

SECTION 1 — FIELD SALES / CLOSER COMMISSION (on first month's customer revenue)
- up to $1,000 → 5%
- $1,000–$3,000 → 4.5%
- $3,000–$5,000 → 4%
- $5,000–$10,000 → 3%
- $10,000+ → 2.5%

SECTION 2 — LEAD GENERATOR BONUS (Shayan & Arshia, fixed per activated customer)
- $500–$1,000 → $25
- $1,000–$3,000 → $50
- $3,000–$5,000 → $100
- $5,000–$10,000 → $200
- $10,000+ → $300
Monthly performance bonus (new customers activated): 3 → $100, 5 → $250, 10 → $500.
Strategic bonus (written Founder approval): over $10K → $300–$500; multi-branch → $500; long-term contract → $500–$1,000.

SECTION 3 — GTA NODES (conflict prevention)
- Arshia (Instagram/Facebook only): Node 1 West Toronto, Node 2 Downtown/Midtown.
- Shayan (Google Ads/SEO/LinkedIn only): Node 3 North York/Thornhill, Node 4 Scarborough/Markham, Node 5 Mississauga/Brampton/Vaughan.
- Arshia cannot target Nodes 3–5; Shayan cannot target Nodes 1–2.
- First-touch CRM rule: whoever logged the customer first owns the lead; the second gets nothing.
- 7-day overlap rule: if both touched within 7 days and source is unclear → split lead bonus 50/50.

SECTION 4 — COMMISSION SPLIT SCENARIOS
- A Standard: marketing lead bonus; Field Sales 50%, Closer 50%.
- B Independent (Field Sales found the lead): marketing nothing; Field Sales 70%, Closer 30%.
- C Solo Closer (closer sourced and closed): Closer 100%; others nothing.
- D Split (both Shayan & Arshia, 7-day overlap, unclear source): Shayan+Arshia split lead bonus 50/50; Field Sales & Closer per their role (50/50).

SECTION 6 — PAYMENT GATES (all mandatory)
1 First real order completed. 2 CRM verified. 3 Invoice paid. 4 No dispute/refund. 5 Node compliance. 6 Lead source logged. 7 Written Founder approval for strategic bonuses.
If any gate fails → that component is $0 and you must say which gate failed. Strategic bonus without Founder approval is PENDING, not $0.

SECTION 7 — ANTI-ABUSE
No bonus for raw leads, fake numbers, or customers without a real order. Lead disputes decided by earliest CRM timestamp. Founder may split large commissions across 2–3 months. Clawback if a customer leaves within 30 days after payout.

PROTOCOL
1 Identify the scenario (A/B/C/D) and roles. 2 Classify customer size. 3 Check the 7 gates. 4 Calculate each component separately. 5 Show the line-by-line breakdown. 6 Show company economics (40% profit, % of profit spent). 7 Flag node violations, CRM issues, missing approvals.
Never skip a gate. Never assume the lead source — if it is not stated, ask. Never split differently than the 4 scenarios. Always remind the user that base salary is separate and fixed; this covers variable pay only.`;
