import { Router } from "express";
import { db } from "@workspace/db";
import { companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, isManager } from "../middlewares/auth";

const router = Router();

router.get("/companies", requireAuth, async (_req, res) => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  res.json(companies);
});

router.post("/companies", requireAuth, async (req, res) => {
  const { name, industry, website, phone, address, notes } = req.body;
  const [company] = await db.insert(companiesTable).values({ name, industry, website, phone, address, notes }).returning();
  res.status(201).json(company);
});

router.get("/companies/:id", requireAuth, async (req, res) => {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, Number(req.params.id)));
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

router.patch("/companies/:id", requireAuth, async (req, res) => {
  const { name, industry, website, phone, address, notes } = req.body;
  const updates: Partial<typeof companiesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (industry !== undefined) updates.industry = industry;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  if (notes !== undefined) updates.notes = notes;
  const [company] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, Number(req.params.id))).returning();
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

router.delete("/companies/:id", requireAuth, async (req, res) => {
  if (!isManager(req.user!.role)) {
    res.status(403).json({ error: "Only managers can delete companies" }); return;
  }
  await db.delete(companiesTable).where(eq(companiesTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
