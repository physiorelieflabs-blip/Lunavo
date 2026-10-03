import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { auditLog } from "../lib/middleware";
import {
  clearSessionCookie,
  completePasswordReset,
  createLocalSession,
  localAuthUserForId,
  requestPasswordReset,
  registerLocalUser,
  revokeCurrentSession,
  setSessionCookie,
  verifyLocalCredentials,
  verifyPasswordResetCode,
  verifyEmailVerificationCode,
  resendEmailVerification,
  updateLocalProfile,
  changeLocalPassword,
  listLocalSessions,
  revokeLocalSession,
  revokeOtherLocalSessions,
} from "../lib/local-auth";
import { createMasterAdminMfaChallenge, masterAdminMfaEnabled, requireMasterAdmin, beginMasterAdminMfaSetup, confirmMasterAdminMfa, verifyMasterAdminMfaChallenge } from "../lib/master-admin";

const router = Router();

type LocalUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
};

function userResponse(user: LocalUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    primaryEmailAddress: {
      emailAddress: user.email,
      verification: { status: user.emailVerified ? "verified" : "unverified" },
    },
  };
}

function currentUser(req: Request): LocalUser | null {
  const user = (req as Request & { localUser?: LocalUser }).localUser;
  return user ?? null;
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function validPassword(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 12
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /[0-9]/.test(value)
    && /[!@#$%^&*(),.?":{}|<>]/.test(value);
}

function namesFromDisplayName(value: unknown) {
  const parts = typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName };
}

async function createAccount(req: Request, res: any) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const display = req.body?.displayName ?? req.body?.name;
  const names = namesFromDisplayName(display);
  const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : names.firstName;
  const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : names.lastName;
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (!/^[a-z0-9_.-]{3,64}$/.test(username)) return res.status(400).json({ error: "Username must be 3–64 letters, numbers, dots, dashes, or underscores" });
  if (!firstName || firstName.length > 64 || !lastName || lastName.length > 64) return res.status(400).json({ error: "First and last name are required" });
  if (!validPassword(password)) return res.status(400).json({ error: "Password must be at least 12 characters and include uppercase, lowercase, number, and special character" });

  const existing = await db.execute(
    sql`SELECT 1 FROM local_auth_users WHERE lower(email)=lower(${email}) OR lower(username)=lower(${username}) LIMIT 1`,
  );
  if (existing.rows.length) return res.status(409).json({ error: "Email or username is already registered" });

  const user = await registerLocalUser({ email, username, firstName, lastName, password });
  setSessionCookie(res, await createLocalSession(user.id, { ipAddress: req.ip, userAgent: req.get("user-agent") }));
  await auditLog(user.id, undefined, "local_sign_up", "user", user.id, { emailVerificationRequired: !user.emailVerified }, req.ip, req.get("user-agent"));
  return res.status(201).json({ success: true, signedIn: true, verificationRequired: !user.emailVerified, user: userResponse(user) });
}

async function signIn(req: Request, res: any) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validEmail(email) || !password) return res.status(400).json({ error: "Email and password are required" });

  try {
    const user = await verifyLocalCredentials(email, password);
    if (user.role === "master_admin" && await masterAdminMfaEnabled(user.id)) {
      const challenge = await createMasterAdminMfaChallenge(user.id);
      await auditLog(user.id, undefined, "master_admin_mfa_challenge_created", "authentication", user.id, {}, req.ip, req.get("user-agent"));
      return res.status(200).json({ success: true, signedIn: false, mfaRequired: true, challengeToken: challenge.token, expiresAt: challenge.expiresAt, user: userResponse(user) });
    }
    setSessionCookie(res, await createLocalSession(user.id, { ipAddress: req.ip, userAgent: req.get("user-agent") }));
    await auditLog(user.id, undefined, "local_sign_in", "user", user.id, { emailVerified: user.emailVerified }, req.ip, req.get("user-agent"));
    return res.json({ success: true, signedIn: true, verificationRequired: !user.emailVerified, user: userResponse(user) });
  } catch (error) {
    await auditLog(undefined, undefined, "local_sign_in_failed", "authentication", email, {}, req.ip, req.get("user-agent"), "failure", error instanceof Error ? error.message : "invalid credentials");
    return res.status(401).json({ error: "Invalid email or password" });
  }
}

router.get("/auth/session", async (req, res): Promise<void> => {
  const user = currentUser(req);
  if (!user) {
    res.json({ signedIn: false, user: null, merchant: null });
    return;
  }

  const merchantResult = await db.execute(sql`SELECT id,name,email,store_name,status FROM merchants WHERE clerk_user_id=${user.id} LIMIT 1`);
  const merchant = merchantResult.rows[0] as Record<string, unknown> | undefined;
  res.json({
    signedIn: true,
    user: userResponse(user),
    merchant: merchant ? {
      id: String(merchant.id),
      name: String(merchant.name ?? ""),
      email: String(merchant.email ?? user.email),
      storeName: String(merchant.store_name ?? ""),
      status: String(merchant.status ?? "active"),
    } : null,
  });
});

router.post("/auth/sign-up", async (req, res) => {
  try { await createAccount(req, res); } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create your Lunavo account";
    res.status(/duplicate|already exists|unique/i.test(message) ? 409 : 400).json({ error: message });
  }
});

router.post("/auth/register", async (req, res) => {
  try { await createAccount(req, res); } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create your Lunavo account";
    res.status(/duplicate|already exists|unique/i.test(message) ? 409 : 400).json({ error: message });
  }
});

router.post("/auth/sign-in", signIn);
router.post("/auth/login", signIn);

async function signOut(req: Request, res: any) {
  await revokeCurrentSession(req);
  clearSessionCookie(res);
  const user = currentUser(req);
  if (user) await auditLog(user.id, undefined, "local_sign_out", "user", user.id, {}, req.ip, req.get("user-agent"));
  res.json({ success: true, signedIn: false, message: "Logged out successfully" });
}


router.post("/auth/mfa/verify", async (req, res) => {
  const token = typeof req.body?.challengeToken === "string" ? req.body.challengeToken : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const userId = await verifyMasterAdminMfaChallenge(token, code);
  if (!userId) return res.status(401).json({ error: "Invalid or expired authenticator code" });
  setSessionCookie(res, await createLocalSession(userId, { ipAddress: req.ip, userAgent: req.get("user-agent") }));
  const user = await localAuthUserForId(userId);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Admin account no longer exists" });
  }
  await auditLog(user.id, undefined, "master_admin_mfa_sign_in", "authentication", user.id, {}, req.ip, req.get("user-agent"));
  return res.json({ success: true, signedIn: true, user: userResponse(user) });
});

router.get("/auth/mfa/status", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try { const { isMasterAdmin } = await import("../lib/master-admin"); if (!(await isMasterAdmin(user.id))) return res.status(403).json({ error: "Master admin access required" }); } catch { return res.status(403).json({ error: "Master admin access required" }); }
  return res.json({ enabled: await masterAdminMfaEnabled(user.id) });
});

router.post("/auth/mfa/setup", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try {
    const setup = await beginMasterAdminMfaSetup(user.id);
    return res.json(setup);
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : "MFA setup failed" });
  }
});

router.post("/auth/mfa/confirm", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    await confirmMasterAdminMfa(user.id, code);
    await auditLog(user.id, undefined, "master_admin_mfa_enabled", "authentication", user.id, {}, req.ip, req.get("user-agent"));
    return res.json({ enabled: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "MFA confirmation failed" });
  }
});

router.post("/auth/verify-email", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the account email and six-digit verification code" });
  try {
    const user = await verifyEmailVerificationCode(email, code);
    if (!user) return res.status(400).json({ error: "Invalid or expired verification code" });
    const current = currentUser(req);
    if (!current || current.id !== user.id) {
      setSessionCookie(res, await createLocalSession(user.id, { ipAddress: req.ip, userAgent: req.get("user-agent") }));
    }
    await auditLog(user.id, undefined, "local_email_verified", "user", user.id, {}, req.ip, req.get("user-agent"));
    return res.json({ success: true, signedIn: true, user: userResponse(user) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Email verification failed" });
  }
});

router.post("/auth/resend-verification", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  try {
    const result = await db.execute(sql`SELECT id,email,email_verified FROM local_auth_users WHERE lower(email)=lower(${email}) LIMIT 1`);
    const row = result.rows[0] as any;
    if (row && !Boolean(row.email_verified)) await resendEmailVerification(String(row.id), String(row.email));
  } catch {
    // Keep the response generic to avoid exposing whether an email is registered.
  }
  return res.json({ accepted: true, message: "If the account is eligible, a verification code has been sent." });
});

router.post("/auth/sign-out", signOut);
router.post("/auth/logout", signOut);

async function resetRequest(req: Request, res: any) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  try { await requestPasswordReset(email); } catch {}
  return res.json({ accepted: true, message: "If an account uses this email, a verification code has been sent." });
}
router.post("/auth/reset/request", resetRequest);
router.post("/auth/password-reset-request", resetRequest);

router.post("/auth/reset/verify", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter a valid email and six-digit code" });
  return res.json({ valid: await verifyPasswordResetCode(email, code) });
});

async function resetComplete(req: Request, res: any) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : String(req.body?.token ?? "").trim();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validEmail(email) || !/^\d{6}$/.test(code) || !validPassword(password)) {
    return res.status(400).json({ error: "Enter the verification code and a valid 12-character password" });
  }

  try {
    const userId = await completePasswordReset(email, code, password);
    const token = await createLocalSession(userId, { ipAddress: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, token);
    const user = await localAuthUserForId(userId);
    if (!user) {
      clearSessionCookie(res);
      return res.status(404).json({ error: "Account not found" });
    }
    await auditLog(user.id, undefined, "local_password_reset", "user", user.id, {}, req.ip, req.get("user-agent"));
    return res.json({ status: "complete", createdSessionId: "local", user: userResponse(user) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Password reset failed" });
  }
}
router.post("/auth/reset/complete", resetComplete);
router.post("/auth/password-reset", resetComplete);


router.put("/auth/profile", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try {
    const updated = await updateLocalProfile(user.id, {
      firstName: typeof req.body?.firstName === "string" ? req.body.firstName : undefined,
      lastName: typeof req.body?.lastName === "string" ? req.body.lastName : undefined,
      username: req.body?.username === null ? null : typeof req.body?.username === "string" ? req.body.username : undefined,
    });
    await auditLog(updated.id, undefined, "local_profile_update", "user", updated.id, {}, req.ip, req.get("user-agent"));
    return res.json({ user: userResponse(updated) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Profile update failed" });
  }
});

router.post("/auth/change-password", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const cookie = String(req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith("lunavo_session="));
    const currentSessionToken = cookie ? decodeURIComponent(cookie.slice("lunavo_session=".length)) : undefined;
    const signOutOfOtherSessions = req.body?.signOutOfOtherSessions !== false;
    await changeLocalPassword(user.id, currentPassword, newPassword, currentSessionToken, signOutOfOtherSessions);
    await auditLog(user.id, undefined, "local_password_change", "user", user.id, {}, req.ip, req.get("user-agent"));
    return res.json({ success: true, message: "Password updated" });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Password update failed" });
  }
});

router.get("/auth/sessions", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  const cookie = String(req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith("lunavo_session="));
  const currentToken = cookie ? decodeURIComponent(cookie.slice("lunavo_session=".length)) : null;
  const sessions = await listLocalSessions(user.id, currentToken);
  return res.json({ sessions });
});

router.delete("/auth/sessions/:id", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return res.status(400).json({ error: "Invalid session id" });
  const revoked = await revokeLocalSession(user.id, id);
  if (!revoked) return res.status(404).json({ error: "Session not found" });
  await auditLog(user.id, undefined, "local_session_revoked", "authentication_session", id, {}, req.ip, req.get("user-agent"));
  return res.json({ success: true });
});

router.post("/auth/sessions/revoke-others", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  const cookie = String(req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith("lunavo_session="));
  const currentToken = cookie ? decodeURIComponent(cookie.slice("lunavo_session=".length)) : null;
  await revokeOtherLocalSessions(user.id, currentToken);
  await auditLog(user.id, undefined, "local_other_sessions_revoked", "authentication_session", user.id, {}, req.ip, req.get("user-agent"));
  return res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  return res.json({ user: userResponse(user) });
});

router.post("/auth/verify-email", async (_req, res) => {
  return res.json({ verified: true, message: "Local self-hosted accounts are verified at registration." });
});

export default router;
