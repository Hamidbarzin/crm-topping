import { Router } from "express";
import { db, leadsTable } from "@workspace/db";

const router = Router();

router.post("/twilio/incoming-call", async (req, res) => {
  try {
    const from = req.body.From || "";
    const to = req.body.To || "";
    const callSid = req.body.CallSid || "";
    const direction = req.body.Direction || "inbound";

    const [lead] = await db.insert(leadsTable).values({
      name: `Phone Lead ${from}`,
      phone: from,
      stage: "new",
      source: "Twilio Phone Call",
      status: "new_lead",
      activityType: "call",
      notes: `Incoming call from ${from} to ${to}. CallSid: ${callSid}. Direction: ${direction}`,
      emailsSent: 0,
      emailsReceived: 0,
    }).returning();

    console.log("✅ Twilio call lead created:", lead.id, from);

    res.type("text/xml").send(`
<Response>
  <Say voice="alice">Thank you for calling Topping Courier. Please hold while we connect your call.</Say>
</Response>
`);
  } catch (error) {
    console.error("❌ Twilio webhook error:", error);

    res.type("text/xml").send(`
<Response>
  <Say voice="alice">Thank you for calling Topping Courier. Please try again later.</Say>
</Response>
`);
  }
});

export default router;
