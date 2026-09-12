import { createClerkClient } from "@clerk/express";

const MASTER_ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";

function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required for master-admin authorization");
  return createClerkClient({ secretKey });
}

/**
 * The master administrator is the platform's supreme operator. Authorization
 * is based on server-side Clerk identity, never on a client supplied role.
 * A Clerk user ID may be pinned in production; the verified canonical email
 * remains the bootstrap identity so the installation can be configured safely.
 */
export async function isMasterAdmin(clerkUserId: string): Promise<boolean> {
  const pinnedId = process.env.LUNAVO_MASTER_ADMIN_CLERK_USER_ID?.trim();
  if (pinnedId && pinnedId === clerkUserId) return true;

  const user = await clerkClient().users.getUser(clerkUserId);
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  return primary?.emailAddress?.trim().toLowerCase() === MASTER_ADMIN_EMAIL && primary?.verification?.status === "verified";
}

export async function requireMasterAdmin(clerkUserId: string): Promise<void> {
  if (!(await isMasterAdmin(clerkUserId))) {
    const error = new Error("Master admin access required");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export const MASTER_ADMIN_ROLE = "master_admin" as const;
