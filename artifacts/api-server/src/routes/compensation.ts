import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  calculateCompensation,
  COMPENSATION_SYSTEM_PROMPT,
  type CompensationInput,
  type Scenario,
  type LeadGenerator,
  type StrategicType,
} from "../lib/compensation";

const router = Router();

const SCENARIOS: Scenario[] = ["A", "B", "C", "D"];
const LEAD_GENS: LeadGenerator[] = ["Arshia", "Shayan", "none"];
const STRATEGIC_TYPES: StrategicType[] = ["none", "over_10k", "multi_branch", "long_term"];

function asBool(v: unknown): boolean {
  return v === true;
}

router.post("/compensation/calculate", requireAuth, (req, res) => {
  const body = req.body ?? {};

  const monthlyRevenue = Number(body.monthlyRevenue);
  if (!Number.isFinite(monthlyRevenue) || monthlyRevenue < 0) {
    res.status(400).json({ error: "monthlyRevenue must be a non-negative number" });
    return;
  }

  const scenario = body.scenario as Scenario;
  if (!SCENARIOS.includes(scenario)) {
    res.status(400).json({ error: "scenario must be one of A, B, C, D" });
    return;
  }

  const g = body.gates ?? {};
  const input: CompensationInput = {
    customerName: typeof body.customerName === "string" ? body.customerName : undefined,
    monthlyRevenue,
    scenario,
    leadGenerator: LEAD_GENS.includes(body.leadGenerator) ? body.leadGenerator : undefined,
    fieldSalesPerson: typeof body.fieldSalesPerson === "string" ? body.fieldSalesPerson : undefined,
    closerPerson: typeof body.closerPerson === "string" ? body.closerPerson : undefined,
    newCustomersThisMonth: Number.isFinite(Number(body.newCustomersThisMonth))
      ? Number(body.newCustomersThisMonth)
      : undefined,
    strategicType: STRATEGIC_TYPES.includes(body.strategicType) ? body.strategicType : undefined,
    founderApproved: asBool(body.founderApproved),
    gates: {
      firstOrder: asBool(g.firstOrder),
      crmVerified: asBool(g.crmVerified),
      invoicePaid: asBool(g.invoicePaid),
      noDispute: asBool(g.noDispute),
      nodeCompliance: asBool(g.nodeCompliance),
      leadSourceLogged: asBool(g.leadSourceLogged),
    },
  };

  const result = calculateCompensation(input);
  res.json(result);
});

router.post("/compensation/ask", requireAuth, async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ error: "A question is required" });
    return;
  }
  if (question.length > 2000) {
    res.status(400).json({ error: "Question is too long (max 2000 characters)" });
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      // gpt-5-mini is a reasoning model: leave generous room beyond hidden reasoning
      // tokens, otherwise finish_reason is "length" and content comes back empty.
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: COMPENSATION_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
    }
    res.json({ answer });
  } catch (err) {
    req.log.error({ err }, "Compensation AI request failed");
    res.status(502).json({ error: "The Compensation AI is temporarily unavailable. Please try again." });
  }
});

export default router;
