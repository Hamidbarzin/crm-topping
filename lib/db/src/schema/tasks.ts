import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { dealsTable } from "./deals";
import { meetingsTable } from "./meetings";
import { leadsTable } from "./leads";

export const taskStatusEnum = pgEnum("task_status", [
  "pending", "in_progress", "completed", "cancelled"
]);

export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  dueDate: timestamp("due_date"),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  dealId: integer("deal_id").references(() => dealsTable.id),
  meetingId: integer("meeting_id").references(() => meetingsTable.id),
  leadId: integer("lead_id").references(() => leadsTable.id),
  // Assignee's reply back to the manager: progress update or the reason a task isn't done.
  responseNote: text("response_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
