import type { Request } from "express";

export type AuthContext = { userId: string | null };

export function getAuth(req: Request): AuthContext {
  const value = (req as Request & { auth?: { userId?: string | null } }).auth;
  return { userId: value?.userId ? String(value.userId) : null };
}
