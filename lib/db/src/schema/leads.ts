import { pgTable, serial, text, integer, numeric, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const leadStageEnum = pgEnum("lead_stage", [
  "new", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new_lead", "contacted_email", "contacted_call", "contacted_linkedin",
  "meeting_scheduled", "meeting_done", "proposal_sent", "negotiating",
  "closed_won", "closed_lost", "not_interested", "nurturing"
]);

export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "email", "call", "meeting", "linkedin_message", "follow_up"
]);

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  companyId: integer("company_id").references(() => companiesTable.id),
  stage: leadStageEnum("stage").notNull().default("new"),
  source: text("source"),
  ownerId: integer("owner_id").references(() => usersTable.id),
  value: numeric("value", { precision: 12, scale: 2 }),
  notes: text("notes"),
  // Marketing-sheet fields
  linkedinUrl: text("linkedin_url"),
  industry: text("industry"),
  status: leadStatusEnum("status").notNull().default("new_lead"),
  aiScore: integer("ai_score"),
  scoreReason: text("score_reason"),
  priority: text("priority"),
  aiNextAction: text("ai_next_action"),
  gtaNode: integer("gta_node"),
  activityType: leadActivityTypeEnum("activity_type"),
  nextActionDate: date("next_action_date"),
  meetingDate: date("meeting_date"),
  emailsSent: integer("emails_sent").notNull().default(0),
  emailsReceived: integer("emails_received").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
