import { pgTable, serial, integer, numeric, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const kpiReportsTable = pgTable("kpi_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  reportDate: date("report_date").notNull(),
  callsMade: integer("calls_made").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
  meetingsBooked: integer("meetings_booked").notNull().default(0),
  meetingsCompleted: integer("meetings_completed").notNull().default(0),
  proposalsSent: integer("proposals_sent").notNull().default(0),
  dealsWon: integer("deals_won").notNull().default(0),
  revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKpiReportSchema = createInsertSchema(kpiReportsTable).omit({ id: true, createdAt: true });
export type InsertKpiReport = z.infer<typeof insertKpiReportSchema>;
export type KpiReport = typeof kpiReportsTable.$inferSelect;
