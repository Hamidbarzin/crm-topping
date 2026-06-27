import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { dealsTable } from "./deals";
import { leadsTable } from "./leads";
import { clientsTable } from "./clients";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled", "completed", "cancelled", "no_show", "follow_up"
]);

export const meetingOutcomeEnum = pgEnum("meeting_outcome", [
  "won", "lost", "proposal_sent", "follow_up_required"
]);

export const meetingSourceEnum = pgEnum("meeting_source", ["internal", "booking"]);

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  companyName: text("company_name"),
  location: text("location"),
  onlineLink: text("online_link"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: meetingStatusEnum("status").notNull().default("scheduled"),
  outcome: meetingOutcomeEnum("outcome"),
  source: meetingSourceEnum("source").notNull().default("internal"),
  dealId: integer("deal_id").references(() => dealsTable.id),
  leadId: integer("lead_id").references(() => leadsTable.id),
  clientId: integer("client_id").references(() => clientsTable.id),
  ownerId: integer("owner_id").references(() => usersTable.id),
  notes: text("notes"),
  assignedBy: integer("assigned_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const meetingAttendeesTable = pgTable("meeting_attendees", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
