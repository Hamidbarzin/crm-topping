import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// History of automation executions (cron or manual "run now").
// Used by the Automations admin page to show last-run status per automation.
export const automationRunsTable = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  status: text("status").notNull(), // "success" | "error"
  message: text("message"),
  itemsAffected: integer("items_affected").notNull().default(0),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
});

export type AutomationRun = typeof automationRunsTable.$inferSelect;
