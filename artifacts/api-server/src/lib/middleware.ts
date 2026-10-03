import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError, TenantIsolationError } from './errors';
import { db, auditLogsTable, merchantsTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: any;
      merchantId?: string;
      sessionId?: string;
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = `req_${randomUUID()}`;
  res.setHeader('X-Request-ID', req.requestId);
  return next();
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = (req as Request & { auth?: { userId: string | null }; localUser?: any }).auth;
    const localUser = (req as Request & { auth?: { userId: string | null }; localUser?: any }).localUser;

    if (!auth?.userId) {
      throw new AuthenticationError("Authentication required");
    }

    const userId = String(auth.userId);
    const user = localUser ?? (
      await db.execute(sql`SELECT id,email,username,first_name,last_name,role FROM local_auth_users WHERE id=${userId} LIMIT 1`)
    ).rows[0];

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    req.userId = userId;
    req.user = user;
    req.sessionId = undefined;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized", message: "Authentication required" });
  }
}
export async function merchantAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new AuthenticationError('User not authenticated');
    }

    // Get merchant associated with this user
    const merchant = (await db.select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(eq(merchantsTable.clerkUserId, req.userId))
      .limit(1))[0];

    if (!merchant) {
      throw new AuthorizationError('No merchant associated with this account');
    }

    req.merchantId = String(merchant.id);

    return next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      res.status(401).json({ error: 'unauthorized', message: error.message });
      return;
    }
    res.status(403).json({ error: 'forbidden', message: 'Access denied' });
    return;
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions' });
    }

    return next();
  };
}

export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }

  if (req.user.role !== 'master_admin') {
    return res.status(403).json({ error: 'forbidden', message: 'Master Admin access required' });
  }

  return next();
}

export async function auditLog(
  userId: string | undefined,
  merchantId: string | undefined,
  action: string,
  resourceType: string,
  resourceId: string,
  changes?: any,
  ipAddress?: string,
  userAgent?: string,
  status: 'success' | 'failure' = 'success',
  errorMessage?: string
) {
  try {
    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId,
      merchantId,
      action,
      resourceType,
      resourceId,
      changes,
      ipAddress,
      userAgent,
      status,
      errorMessage,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

export function validateTenantAccess(
  userMerchantId: string,
  resourceMerchantId: string
) {
  if (userMerchantId !== resourceMerchantId) {
    throw new TenantIsolationError();
  }
}
