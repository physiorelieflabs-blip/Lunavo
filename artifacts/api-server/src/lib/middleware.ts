import { Request, Response, NextFunction } from 'express';
import { verifySession } from './auth';
import { AuthenticationError, AuthorizationError, TenantIsolationError } from './errors';
import { db, users as usersTable, merchants, auditLogs } from '@workspace/db';
import { eq } from 'drizzle-orm';

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
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionCookie = req.cookies?.lunavo_session;
    const authHeader = req.headers.authorization;

    let sessionId: string | undefined;
    let sessionToken: string | undefined;

    // Try cookie first
    if (sessionCookie && typeof sessionCookie === 'string') {
      const [id, token] = sessionCookie.split(':');
      sessionId = id;
      sessionToken = token;
    }

    // Try Authorization header
    if (!sessionId && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const [id, secret] = token.split(':');
      sessionId = id;
      sessionToken = secret;
    }

    if (!sessionId || !sessionToken) {
      throw new AuthenticationError('Missing session');
    }

    const session = await verifySession(sessionId, sessionToken);
    if (!session) {
      throw new AuthenticationError('Invalid or expired session');
    }

    const user = await db.query.users.findFirst({
      where: eq(usersTable.id, session.userId),
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    req.userId = session.userId;
    req.user = user;
    req.sessionId = sessionId;

    next();
  } catch (error) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }
}

export async function merchantAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      throw new AuthenticationError('User not authenticated');
    }

    // Get merchant associated with this user
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.userId, req.userId),
    });

    if (!merchant) {
      throw new AuthorizationError('No merchant associated with this account');
    }

    req.merchantId = merchant.id;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return res.status(401).json({ error: 'unauthorized', message: error.message });
    }
    res.status(403).json({ error: 'forbidden', message: 'Access denied' });
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

    next();
  };
}

export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }

  if (req.user.role !== 'master_admin') {
    return res.status(403).json({ error: 'forbidden', message: 'Master Admin access required' });
  }

  next();
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
    await db.insert(auditLogs).values({
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
