import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const ALL_ROLES = ["CEO", "Admin", "Marketing_Manager", "IT_Manager", "Sales_Rep", "Closer", "Employee"];
// Roles that grant management/elevated access — only a CEO/Admin may assign these.
const ELEVATED_ROLES = ["CEO", "Admin", "Marketing_Manager", "IT_Manager"];
const isAdmin = (r: string) => r === "CEO" || r === "Admin";

const formatUser = (u: typeof usersTable.$inferSelect) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  slug: u.slug, avatarUrl: u.avatarUrl, isActive: u.isActive,
  createdAt: u.createdAt,
});

router.get("/users", requireAuth, async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.name);
  res.json(users.map(formatUser));
});

router.post("/users", requireAuth, async (req, res) => {
  if (!MANAGER_ROLES.includes(req.user!.role)) {
    res.status(403).json({ error: "Only managers can add team members" }); return;
  }
  const { email, name, role, password, slug } = req.body;
  const chosenRole = role ?? "Employee";
  if (!ALL_ROLES.includes(chosenRole)) {
    res.status(400).json({ error: "Invalid role" }); return;
  }
  if (ELEVATED_ROLES.includes(chosenRole) && !isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Only CEO/Admin can assign elevated roles" }); return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({ email, name, role: chosenRole, passwordHash, slug }).returning();
  res.status(201).json(formatUser(user));
});

router.get("/users/:id", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user));
});

router.patch("/users/:id", requireAuth, async (req, res) => {
  const { userId, role: currentRole } = req.user!;
  const targetId = Number(req.params.id);
  const isManager = MANAGER_ROLES.includes(currentRole);
  const { name, role, slug, avatarUrl, isActive } = req.body;

  // Non-managers may only edit their own profile and never their role/active status
  if (!isManager) {
    if (targetId !== userId) {
      res.status(403).json({ error: "You can only edit your own profile" }); return;
    }
    if (role !== undefined || isActive !== undefined) {
      res.status(403).json({ error: "Only managers can change role or active status" }); return;
    }
  }

  // Elevated roles can only be granted by a CEO/Admin — prevents a non-admin
  // manager (e.g. Marketing_Manager) from self-promoting to Admin/CEO.
  if (role !== undefined) {
    if (!ALL_ROLES.includes(role)) {
      res.status(400).json({ error: "Invalid role" }); return;
    }
    if (ELEVATED_ROLES.includes(role) && !isAdmin(currentRole)) {
      res.status(403).json({ error: "Only CEO/Admin can assign elevated roles" }); return;
    }
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (isManager && role !== undefined) updates.role = role;
  if (slug !== undefined) updates.slug = slug;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (isManager && isActive !== undefined) updates.isActive = isActive;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user));
});

export default router;
