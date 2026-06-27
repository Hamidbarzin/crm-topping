import { Router } from "express";
import { requireAuth, isAdmin } from "../middlewares/auth";
import { listAutomations, runAutomation } from "../lib/automations";

const router = Router();

// Admin-only: the Automation Engine is an operations control panel.
router.get("/automations", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Only CEO/Admin can view automations" }); return;
  }
  res.json(await listAutomations());
});

router.post("/automations/:key/run", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Only CEO/Admin can run automations" }); return;
  }
  try {
    const run = await runAutomation(String(req.params.key));
    res.json(run);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "UNKNOWN_AUTOMATION") {
      res.status(404).json({ error: "Unknown automation" }); return;
    }
    if (code === "EVENT_TRIGGERED") {
      res.status(400).json({ error: "This automation runs automatically on an event and cannot be run manually" }); return;
    }
    req.log.error({ err }, "Automation run failed");
    res.status(500).json({ error: "Failed to run automation" });
  }
});

export default router;
