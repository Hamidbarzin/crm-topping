import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const payrollStatusEnum = pgEnum("payroll_status", [
  "draft", "pending_approval", "approved", "paid", "rejected"
]);

export const payrollRecordsTable = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  periodMonth: integer("period_month").notNull(),
  periodYear: integer("period_year").notNull(),
  baseBonus: numeric("base_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  commissionBonus: numeric("commission_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  leadGeneratorBonus: numeric("lead_generator_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  performanceBonus: numeric("performance_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  strategicBonus: numeric("strategic_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  aiScore: integer("ai_score"),
  aiAnalysis: text("ai_analysis"),
  status: payrollStatusEnum("status").notNull().default("draft"),
  managerId: integer("manager_id").references(() => usersTable.id),
  managerNotes: text("manager_notes"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayrollSchema = createInsertSchema(payrollRecordsTable).omit({ id: true, createdAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type PayrollRecord = typeof payrollRecordsTable.$inferSelect;
