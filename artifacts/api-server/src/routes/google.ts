import { Router } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { meetingsTable, kpiReportsTable, payrollRecordsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const connectors = new ReplitConnectors();

// POST /api/google/gmail/send
router.post("/google/gmail/send", requireAuth, async (req, res) => {
  const { to, subject, body } = req.body as { to: string; subject: string; body: string };
  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing to, subject, or body" }); return;
  }
  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`
  ).toString("base64url");

  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    const err = await response.text();
    req.log.error({ err }, "Gmail send failed");
    res.status(502).json({ error: "Gmail send failed", detail: err }); return;
  }
  const data = await response.json() as { id: string };
  res.json({ success: true, messageId: data.id });
});

// POST /api/google/calendar/sync/:meetingId
router.post("/google/calendar/sync/:meetingId", requireAuth, async (req, res) => {
  const meetingId = Number(req.params.meetingId);
  const [meeting] = await db
    .select({
      id: meetingsTable.id,
      title: meetingsTable.title,
      startTime: meetingsTable.startTime,
      endTime: meetingsTable.endTime,
      location: meetingsTable.location,
      onlineLink: meetingsTable.onlineLink,
      notes: meetingsTable.notes,
      clientName: meetingsTable.clientName,
      clientEmail: meetingsTable.clientEmail,
    })
    .from(meetingsTable)
    .where(eq(meetingsTable.id, meetingId));

  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const event = {
    summary: meeting.title,
    location: meeting.location ?? "",
    description: [
      meeting.clientName ? `Client: ${meeting.clientName}` : "",
      meeting.onlineLink ? `Link: ${meeting.onlineLink}` : "",
      meeting.notes ?? "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: meeting.startTime.toISOString(), timeZone: "UTC" },
    end: { dateTime: meeting.endTime.toISOString(), timeZone: "UTC" },
    attendees: meeting.clientEmail ? [{ email: meeting.clientEmail }] : [],
  };

  const response = await connectors.proxy(
    "google-calendar",
    "/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    req.log.error({ err }, "Calendar sync failed");
    res.status(502).json({ error: "Calendar sync failed", detail: err }); return;
  }
  const data = await response.json() as { id: string; htmlLink: string };
  res.json({ success: true, eventId: data.id, eventLink: data.htmlLink });
});

// POST /api/google/sheets/export/kpi
router.post("/google/sheets/export/kpi", requireAuth, async (req, res) => {
  const { userId: targetId, month, year } = req.body as {
    userId?: number; month?: number; year?: number;
  };
  const reports = await db
    .select({
      date: kpiReportsTable.reportDate,
      name: usersTable.name,
      calls: kpiReportsTable.callsMade,
      emails: kpiReportsTable.emailsSent,
      meetingsBooked: kpiReportsTable.meetingsBooked,
      meetingsCompleted: kpiReportsTable.meetingsCompleted,
      proposals: kpiReportsTable.proposalsSent,
      dealsWon: kpiReportsTable.dealsWon,
      revenue: kpiReportsTable.revenue,
      notes: kpiReportsTable.notes,
    })
    .from(kpiReportsTable)
    .leftJoin(usersTable, eq(kpiReportsTable.userId, usersTable.id))
    .orderBy(kpiReportsTable.reportDate);

  const title = `KPI Report${month && year ? ` — ${month}/${year}` : ""} (Topping Courier)`;
  const headers = ["Date", "Rep", "Calls", "Emails", "Meetings Booked", "Meetings Done", "Proposals", "Deals Won", "Revenue", "Notes"];
  const rows = reports.map(r => [
    r.date, r.name ?? "", r.calls, r.emails,
    r.meetingsBooked, r.meetingsCompleted, r.proposals,
    r.dealsWon, r.revenue ?? "0", r.notes ?? "",
  ]);

  const createResp = await connectors.proxy("google-sheet", "/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "KPI Data" } }],
    }),
  });
  if (!createResp.ok) {
    const err = await createResp.text();
    res.status(502).json({ error: "Sheets create failed", detail: err }); return;
  }
  const sheet = await createResp.json() as { spreadsheetId: string; spreadsheetUrl: string };
  const sid = sheet.spreadsheetId;

  const appendResp = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${sid}/values/KPI%20Data!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers, ...rows] }),
    }
  );
  if (!appendResp.ok) {
    const err = await appendResp.text();
    res.status(502).json({ error: "Sheets write failed", detail: err }); return;
  }
  res.json({ success: true, spreadsheetUrl: sheet.spreadsheetUrl, spreadsheetId: sid });
});

// POST /api/google/sheets/export/payroll
router.post("/google/sheets/export/payroll", requireAuth, async (req, res) => {
  const { month, year } = req.body as { month?: number; year?: number };
  const records = await db
    .select({
      name: usersTable.name,
      email: usersTable.email,
      month: payrollRecordsTable.periodMonth,
      year: payrollRecordsTable.periodYear,
      base: payrollRecordsTable.baseBonus,
      commission: payrollRecordsTable.commissionBonus,
      leadGen: payrollRecordsTable.leadGeneratorBonus,
      performance: payrollRecordsTable.performanceBonus,
      strategic: payrollRecordsTable.strategicBonus,
      total: payrollRecordsTable.totalAmount,
      aiScore: payrollRecordsTable.aiScore,
      status: payrollRecordsTable.status,
    })
    .from(payrollRecordsTable)
    .leftJoin(usersTable, eq(payrollRecordsTable.userId, usersTable.id))
    .orderBy(payrollRecordsTable.periodYear, payrollRecordsTable.periodMonth);

  const title = `Payroll Export${month && year ? ` — ${month}/${year}` : ""} (Topping Courier)`;
  const headers = ["Name", "Email", "Month", "Year", "Base Bonus", "Commission", "Lead Gen", "Performance", "Strategic", "Total", "AI Score", "Status"];
  const rows = records.map(r => [
    r.name ?? "", r.email ?? "", r.month, r.year,
    r.base, r.commission, r.leadGen, r.performance, r.strategic,
    r.total, r.aiScore ?? "", r.status,
  ]);

  const createResp = await connectors.proxy("google-sheet", "/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Payroll" } }],
    }),
  });
  if (!createResp.ok) {
    const err = await createResp.text();
    res.status(502).json({ error: "Sheets create failed", detail: err }); return;
  }
  const sheet = await createResp.json() as { spreadsheetId: string; spreadsheetUrl: string };
  const sid = sheet.spreadsheetId;

  const appendResp = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${sid}/values/Payroll!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers, ...rows] }),
    }
  );
  if (!appendResp.ok) {
    const err = await appendResp.text();
    res.status(502).json({ error: "Sheets write failed", detail: err }); return;
  }
  res.json({ success: true, spreadsheetUrl: sheet.spreadsheetUrl, spreadsheetId: sid });
});

export default router;
