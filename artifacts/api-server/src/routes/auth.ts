import { Router } from 'express';
import { db, users, merchants } from '@workspace/db';
import { eq } from 'drizzle-orm';
import {
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyEmailToken,
  verifyPasswordResetToken,
  checkLoginAttempts,
  recordFailedLogin,
  recordSuccessfulLogin,
} from '../lib/auth';
import {
  registrationSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema,
  emailSchema,
  merchantKeySchema,
} from '../lib/validation';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  formatErrorResponse,
} from '../lib/errors';
import { authMiddleware, auditLog } from '../lib/middleware';
import { randomBytes } from 'crypto';

const router = Router();

// ============================================================================
// POST /auth/register - User registration with email verification
// ============================================================================
router.post('/auth/register', async (req, res) => {
  try {
    const input = registrationSchema.parse(req.body);

    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (existing) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Generate email verification token
    const { token: verificationToken, expiresAt: verificationExpiresAt } =
      generateEmailVerificationToken();

    // Create user
    const userId = `user_${randomBytes(16).toString('hex')}`;
    await db.insert(users).values({
      id: userId,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      role: 'user',
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationTokenExpiresAt: verificationExpiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create merchant account
    const merchantKey = input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 50);

    const merchantId = `merchant_${randomBytes(16).toString('hex')}`;
    const referralCode = generateReferralCode();

    await db.insert(merchants).values({
      id: merchantId,
      userId,
      merchantKey,
      companyName: input.companyName,
      email: input.email,
      status: 'active',
      currencyCode: 'USD',
      referralCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Log audit event
    await auditLog(
      userId,
      merchantId,
      'user_registration',
      'user',
      userId,
      { email: input.email },
      req.ip,
      req.get('user-agent')
    );

    // TODO: Send verification email

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      userId,
      merchantId,
      verificationRequired: true,
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    const statusCode = error instanceof ValidationError ? 400 : error instanceof ConflictError ? 409 : 500;
    res.status(statusCode).json(formatted);
  }
});

// ============================================================================
// POST /auth/verify-email - Verify email address
// ============================================================================
router.post('/auth/verify-email', async (req, res) => {
  try {
    const input = emailVerificationSchema.parse(req.body);

    const success = await verifyEmailToken(input.email, input.token);
    if (!success) {
      throw new ValidationError('Invalid or expired verification token');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    await auditLog(
      user?.id,
      undefined,
      'email_verified',
      'user',
      user?.id || '',
      {},
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json(formatted);
  }
});

// ============================================================================
// POST /auth/login - User login
// ============================================================================
router.post('/auth/login', async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);

    // Check if account is locked
    const canLogin = await checkLoginAttempts(input.email);
    if (!canLogin) {
      throw new AuthenticationError('Account temporarily locked. Try again later.');
    }

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user || !user.passwordHash) {
      // Record failed attempt
      await recordFailedLogin(input.email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedLogin(input.email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new AuthenticationError('Please verify your email before logging in');
    }

    // Create session
    const { sessionId, sessionToken } = await createSession(
      user.id,
      req.ip || '',
      req.get('user-agent') || ''
    );

    // Record successful login
    await recordSuccessfulLogin(user.id);

    // Log audit event
    await auditLog(
      user.id,
      undefined,
      'login',
      'user',
      user.id,
      {},
      req.ip,
      req.get('user-agent')
    );

    // Set secure cookie
    res.cookie('lunavo_session', `${sessionId}:${sessionToken}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    res.json({
      success: true,
      message: 'Login successful',
      sessionId,
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    const statusCode = error instanceof ValidationError ? 400 : error instanceof AuthenticationError ? 401 : 500;
    res.status(statusCode).json(formatted);
  }
});

// ============================================================================
// POST /auth/logout - User logout
// ============================================================================
router.post('/auth/logout', authMiddleware, async (req, res) => {
  try {
    if (req.sessionId) {
      await revokeSession(req.sessionId);
    }

    await auditLog(
      req.userId,
      undefined,
      'logout',
      'user',
      req.userId || '',
      {},
      req.ip,
      req.get('user-agent')
    );

    res.clearCookie('lunavo_session');
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({ error: 'logout_failed', message: 'Failed to logout' });
  }
});

// ============================================================================
// POST /auth/password-reset-request - Request password reset
// ============================================================================
router.post('/auth/password-reset-request', async (req, res) => {
  try {
    const input = passwordResetRequestSchema.parse(req.body);

    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If an account exists, a password reset link has been sent',
      });
    }

    const { token, expiresAt } = generatePasswordResetToken();

    await db
      .update(users)
      .set({
        passwordResetToken: token,
        passwordResetTokenExpiresAt: expiresAt,
      })
      .where(eq(users.id, user.id));

    await auditLog(
      user.id,
      undefined,
      'password_reset_requested',
      'user',
      user.id,
      {},
      req.ip,
      req.get('user-agent')
    );

    // TODO: Send password reset email with token

    res.json({
      success: true,
      message: 'If an account exists, a password reset link has been sent',
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json(formatted);
  }
});

// ============================================================================
// POST /auth/password-reset - Reset password with token
// ============================================================================
router.post('/auth/password-reset', async (req, res) => {
  try {
    const input = passwordResetSchema.parse(req.body);

    const tokenValid = await verifyPasswordResetToken(input.email, input.token);
    if (!tokenValid) {
      throw new ValidationError('Invalid or expired password reset token');
    }

    const passwordHash = await hashPassword(input.newPassword);

    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    await db
      .update(users)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    // Revoke all existing sessions
    // Note: This would require updating the sessions table
    // For now, the user will need to login again

    await auditLog(
      user.id,
      undefined,
      'password_changed',
      'user',
      user.id,
      {},
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.',
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json(formatted);
  }
});

// ============================================================================
// GET /auth/me - Get current user
// ============================================================================
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.userId, req.userId!),
    });

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role,
        emailVerified: req.user.emailVerified,
      },
      merchant: merchant ? {
        id: merchant.id,
        merchantKey: merchant.merchantKey,
        companyName: merchant.companyName,
        status: merchant.status,
        currentBalance: merchant.currentBalance,
        availableBalance: merchant.availableBalance,
      } : null,
    });
  } catch (error) {
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch user data' });
  }
});

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default router;
