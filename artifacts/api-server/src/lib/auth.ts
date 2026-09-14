import { hash, verify } from 'argon2id';
import { randomBytes } from 'crypto';
import { db, users, sessions as sessionsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const SESSION_EXPIRY_DAYS = 30;
const SESSION_ROTATION_DAYS = 7;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
const EMAIL_VERIFICATION_EXPIRY_MINUTES = 24 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return verify(hash, password);
}

export function generateRandomToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<{ sessionId: string; sessionToken: string }> {
  const sessionId = `sess_${randomBytes(16).toString('hex')}`;
  const sessionToken = generateSessionToken();
  const sessionTokenHash = await hash(sessionToken, ARGON2_OPTIONS);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(sessionsTable).values({
    id: sessionId,
    userId,
    ipAddress,
    userAgent,
    sessionTokenHash,
    expiresAt,
  });

  return { sessionId, sessionToken };
}

export async function verifySession(
  sessionId: string,
  sessionToken: string
): Promise<{ userId: string } | null> {
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessionsTable.id, sessionId),
      eq(sessionsTable.revokedAt, null)
    ),
  });

  if (!session) return null;
  if (new Date() > session.expiresAt) return null;

  const tokenValid = await verify(session.sessionTokenHash, sessionToken);
  if (!tokenValid) return null;

  // Update last activity
  await db
    .update(sessionsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(sessionsTable.id, sessionId));

  return { userId: session.userId };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(sessionsTable.id, sessionId));
}

export async function checkLoginAttempts(email: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) return true;
  if (!user.accountLockedUntil) return true;

  if (new Date() > user.accountLockedUntil) {
    // Lock has expired
    await db
      .update(users)
      .set({ accountLockedUntil: null })
      .where(eq(users.id, user.id));
    return true;
  }

  return false;
}

export async function recordFailedLogin(email: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) return;

  // If account is already locked, don't update
  if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
    return;
  }

  // For now, implement simple rate limiting via timestamps
  // A production system would use Redis or similar
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60000);

  await db
    .update(users)
    .set({ accountLockedUntil: lockUntil })
    .where(eq(users.id, user.id));
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      accountLockedUntil: null,
    })
    .where(eq(users.id, userId));
}

export function generateEmailVerificationToken(): { token: string; expiresAt: Date } {
  const token = generateRandomToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + EMAIL_VERIFICATION_EXPIRY_MINUTES);
  return { token, expiresAt };
}

export function generatePasswordResetToken(): { token: string; expiresAt: Date } {
  const token = generateRandomToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_EXPIRY_MINUTES);
  return { token, expiresAt };
}

export async function verifyEmailToken(
  email: string,
  token: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) return false;
  if (user.emailVerificationToken !== token) return false;
  if (!user.emailVerificationTokenExpiresAt) return false;
  if (new Date() > user.emailVerificationTokenExpiresAt) return false;

  // Verify and mark email as verified
  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  return true;
}

export async function verifyPasswordResetToken(
  email: string,
  token: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) return false;
  if (user.passwordResetToken !== token) return false;
  if (!user.passwordResetTokenExpiresAt) return false;
  if (new Date() > user.passwordResetTokenExpiresAt) return false;

  return true;
}
