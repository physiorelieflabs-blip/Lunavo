import { createHash } from "node:crypto";

const COOKIE = "lunavo_session";

type AuthRequest = { headers?: { cookie?: string }; auth?: { userId: string | null } };

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const chunk of header.split(";")) {
    const [key, ...value] = chunk.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionCookieName() { return COOKIE; }
export { tokenHash };

export function getAuth(req: AuthRequest): { userId: string | null } {
  const fromMiddleware = req.auth;
  if (fromMiddleware) return fromMiddleware;
  const token = parseCookie(req.headers?.cookie, COOKIE);
  if (!token) return { userId: null };
  return { userId: null };
}

export function clerkMiddleware() {
  return (_req: AuthRequest, _res: unknown, next: () => void) => next();
}

export function createClerkClient() {
  throw new Error("Hosted Clerk is not available in self-hosted Lunavo. Use the local authentication database.");
}
