import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { computeAlerts, buildAndMaybeSendSummary, runDailyReminders, runDailySummaries } from "../lib/notifications";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const isManager = (role: string) => MANAGER_ROLES.includes(role);

// In-app smart alerts for the current user.
router.get("/notifications/alerts", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const alerts = await computeAlerts(userId, role);
  res.json({ alerts });
});

// Generate the current user's daily summary now. ?send=true also emails it.
router.post("/notifications/summary/me", requireAuth, async (req, res) => {
  const { userId } = req.user!;
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const send = req.body?.send === true || req.query.send === "true";
  const result = await buildAndMaybeSendSummary(user, send);
  res.json({ ...result, emailed: send });
});

// Manager-only: trigger the reminder/summary batches immediately (testing + on-demand).
router.post("/notifications/reminders/run", requireAuth, async (req, res) => {
  if (!isManager(req.user!.role)) {
    res.status(403).json({ error: "Only managers can trigger reminders" });
    return;
  }
  const sent = await runDailyReminders();
  res.json({ sent });
});

router.post("/notifications/summaries/run", requireAuth, async (req, res) => {
  if (!isManager(req.user!.role)) {
    res.status(403).json({ error: "Only managers can trigger summaries" });
    return;
  }
  const sent = await runDailySummaries();
  res.json({ sent });
});

export default router;
