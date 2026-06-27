import { pgTable, serial, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userGoalsTable = pgTable(
  "user_goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    targetRevenue: numeric("target_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    targetDealsWon: integer("target_deals_won").notNull().default(0),
    targetMeetingsBooked: integer("target_meetings_booked").notNull().default(0),
    targetCallsMade: integer("target_calls_made").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("user_goals_user_month_year").on(t.userId, t.month, t.year)],
);

export const insertUserGoalSchema = createInsertSchema(userGoalsTable).omit({ id: true, createdAt: true });
export type InsertUserGoal = z.infer<typeof insertUserGoalSchema>;
export type UserGoal = typeof userGoalsTable.$inferSelect;
