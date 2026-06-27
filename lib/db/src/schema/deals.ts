import { pgTable, serial, text, integer, numeric, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const dealStageEnum = pgEnum("deal_stage", [
  "prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "pending", "approved", "paid", "clawback"
]);

export const dealSubmissionStatusEnum = pgEnum("deal_submission_status", [
  "draft", "submitted", "approved", "rejected"
]);

export const founderApprovalStatusEnum = pgEnum("founder_approval_status", [
  "not_required", "pending", "approved", "rejected"
]);

export const dealsTable = pgTable("deals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  stage: dealStageEnum("stage").notNull().default("prospecting"),
  value: numeric("value", { precision: 12, scale: 2 }),
  clientId: integer("client_id").references(() => clientsTable.id),
  companyId: integer("company_id").references(() => companiesTable.id),
  salesRepId: integer("sales_rep_id").references(() => usersTable.id),
  closerId: integer("closer_id").references(() => usersTable.id),
  createdById: integer("created_by_id").references(() => usersTable.id),
  commissionStatus: commissionStatusEnum("commission_status").notNull().default("pending"),
  clawbackStatus: text("clawback_status"),
  grossMarginPercent: numeric("gross_margin_percent", { precision: 5, scale: 2 }),
  // ── Submit → review workflow ──
  submissionStatus: dealSubmissionStatusEnum("submission_status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  submittedById: integer("submitted_by_id").references(() => usersTable.id),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  // ── Founder approval queue ──
  founderApprovalStatus: founderApprovalStatusEnum("founder_approval_status").notNull().default("not_required"),
  founderApproval: boolean("founder_approval").notNull().default(false),
  founderApprovedById: integer("founder_approved_by_id").references(() => usersTable.id),
  founderApprovedAt: timestamp("founder_approved_at"),
  expectedCloseDate: timestamp("expected_close_date"),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDealSchema = createInsertSchema(dealsTable).omit({ id: true, createdAt: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
