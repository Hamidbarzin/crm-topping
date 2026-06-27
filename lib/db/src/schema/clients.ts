import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const clientStatusEnum = pgEnum("client_status", ["active", "inactive", "prospect"]);

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  companyId: integer("company_id").references(() => companiesTable.id),
  status: clientStatusEnum("status").notNull().default("prospect"),
  monthlyRevenue: numeric("monthly_revenue", { precision: 12, scale: 2 }),
  notes: text("notes"),
  ownerId: integer("owner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
