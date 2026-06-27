import cron from "node-cron";
import { runDailyReminders, runDailySummaries } from "./notifications";
import { AUTOMATIONS, runAutomation } from "./automations";
import { logger } from "./logger";

// Server runs in UTC. Toronto (America/Toronto) is the business timezone, so we
// pin the cron schedules to it explicitly rather than relying on the host clock.
const TZ = "America/Toronto";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Daily reminders at 8:00 AM Toronto time.
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        const sent = await runDailyReminders();
        logger.info({ sent }, "Daily reminders sent");
      } catch (err) {
        logger.error({ err }, "Daily reminder job failed");
      }
    },
    { timezone: TZ },
  );

  // Daily AI summary at 7:30 AM Toronto time.
  cron.schedule(
    "30 7 * * *",
    async () => {
      try {
        const sent = await runDailySummaries();
        logger.info({ sent }, "Daily summaries sent");
      } catch (err) {
        logger.error({ err }, "Daily summary job failed");
      }
    },
    { timezone: TZ },
  );

  // Automation Engine: register a cron for every scheduled automation.
  for (const def of AUTOMATIONS) {
    if (def.trigger !== "schedule" || !def.cron) continue;
    cron.schedule(
      def.cron,
      async () => {
        const run = await runAutomation(def.key);
        logger.info({ key: def.key, status: run.status, itemsAffected: run.itemsAffected }, "Scheduled automation ran");
      },
      { timezone: TZ },
    );
  }

  const scheduled = AUTOMATIONS.filter((a) => a.trigger === "schedule" && a.cron).map((a) => a.key);
  logger.info({ tz: TZ, scheduled }, "Scheduler started (reminders 08:00, summaries 07:30, + automation engine)");
}
