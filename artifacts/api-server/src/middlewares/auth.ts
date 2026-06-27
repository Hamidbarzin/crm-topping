import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "topping-crm-secret-2024";

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  let payload: AuthPayload & { kind?: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload & { kind?: string };
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // Only genuine auth tokens may authorize API access — never password-reset tokens.
  if (payload.kind !== "auth") {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Re-derive role/active status from the DB so that role changes and
  // deactivations take effect immediately (not only when the token expires).
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Your account has been deactivated" });
    return;
  }

  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
}

// Roles with full visibility and approval authority across the CRM.
export const ADMIN_ROLES = ["CEO", "Admin"] as const;

export function isAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

// Roles that can manage and assign work across the team (admins + department leads).
export const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"] as const;

export function isManager(role: string): boolean {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign({ ...payload, kind: "auth" }, JWT_SECRET, { expiresIn: "7d" });
}

export function signResetToken(userId: number): string {
  return jwt.sign({ userId, kind: "pwreset" }, JWT_SECRET, { expiresIn: "1h" });
}

export function verifyResetToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; kind?: string };
    if (payload.kind !== "pwreset") return null;
    return payload.userId;
  } catch {
    return null;
  }
}
