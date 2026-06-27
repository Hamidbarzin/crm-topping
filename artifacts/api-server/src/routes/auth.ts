import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, signToken, signResetToken, verifyResetToken } from "../middlewares/auth";
import { sendEmail } from "../lib/mail";

const router = Router();

// Roles a stranger may self-assign via the public /auth/register endpoint.
// Elevated/managerial roles (CEO, Admin, Marketing_Manager, IT_Manager) are
// intentionally excluded — only an existing admin can grant those via PATCH /users.
const SELF_ROLES = ["Sales_Rep", "Closer", "Employee"];

// Trusted, server-configured base URL only — never derived from request headers
// (Origin/Host are attacker-controllable and would allow reset-link poisoning).
function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  return "http://localhost:5000";
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.passwordHash) {
    res.status(401).json({ error: "This account uses Google Sign-In. Please use the Google button to sign in." });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Your account has been deactivated. Contact an administrator." });
    return;
  }
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      slug: user.slug,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

router.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    slug: user.slug,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
  });
});

// Google OAuth — verify Google ID token and sign in / register
router.post("/auth/google", async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: "Google credential required" }); return;
  }
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google login is not configured on this server" }); return;
  }

  const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
  const tokenData = await tokenRes.json() as {
    aud?: string; sub?: string; email?: string; name?: string;
    picture?: string; email_verified?: string; error_description?: string;
  };
  if (!tokenRes.ok || tokenData.error_description) {
    res.status(401).json({ error: "Invalid Google token" }); return;
  }
  if (tokenData.aud !== GOOGLE_CLIENT_ID) {
    res.status(401).json({ error: "Token audience mismatch" }); return;
  }
  if (tokenData.email_verified !== "true") {
    res.status(401).json({ error: "Google email not verified" }); return;
  }
  const { sub: googleId, email, name, picture } = tokenData;
  if (!googleId || !email) {
    res.status(401).json({ error: "Incomplete Google profile" }); return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    [user] = await db.insert(usersTable).values({
      email,
      name: name || email.split("@")[0],
      passwordHash: null,
      googleId,
      avatarUrl: picture || null,
      role: "Employee",
      isActive: true,
    }).returning();
  } else if (!user.googleId) {
    [user] = await db.update(usersTable)
      .set({ googleId, avatarUrl: user.avatarUrl || picture || null })
      .where(eq(usersTable.id, user.id))
      .returning();
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Your account has been deactivated. Contact an administrator." });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: user.role, slug: user.slug, avatarUrl: user.avatarUrl,
      isActive: user.isActive, createdAt: user.createdAt,
    },
  });
});

// Self-service registration — creates an account with a user-selected role.
router.post("/auth/register", async (req, res) => {
  const { email, name, password, role, slug } = req.body as {
    email?: string; name?: string; password?: string; role?: string; slug?: string;
  };
  if (!email || !name || !password) {
    res.status(400).json({ error: "Name, email and password are required" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" }); return;
  }
  const chosenRole = role && SELF_ROLES.includes(role) ? role : "Employee";

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" }); return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email, name, passwordHash, slug: slug || null,
    role: chosenRole as typeof usersTable.$inferInsert.role,
    isActive: true,
  }).returning();

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  res.status(201).json({
    token,
    user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      slug: user.slug, avatarUrl: user.avatarUrl, isActive: user.isActive, createdAt: user.createdAt,
    },
  });
});

// Request a password reset link (emailed via Gmail connector).
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  // Only send when a password-based account exists; always return generic success.
  if (user && user.passwordHash) {
    const token = signResetToken(user.id);
    const link = `${appBaseUrl()}/reset-password?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your Topping CRM password",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 8px">Reset your password</h2>
            <p style="color:#555">Hi ${user.name}, we received a request to reset your Topping CRM password.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#f97316;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Reset password</a>
            </p>
            <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
          </div>`,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to send password reset email");
    }
  }
  res.json({ ok: true });
});

// Complete a password reset using the token from the email link.
router.post("/auth/reset-password", async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) { res.status(400).json({ error: "Token and password are required" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const userId = verifyResetToken(token);
  if (!userId) { res.status(400).json({ error: "This reset link is invalid or has expired" }); return; }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId)).returning();
  if (!user) { res.status(400).json({ error: "Account not found" }); return; }
  res.json({ ok: true });
});

// Returns public config (client ID for Google button)
router.get("/auth/config", (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

export default router;
