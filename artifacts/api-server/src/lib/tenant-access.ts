import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  merchantLocationsTable,
  merchantMembershipLocationsTable,
  merchantMembershipsTable,
  merchantRolePermissionsTable,
  merchantRolesTable,
  merchantsTable,
} from "@workspace/db";

/**
 * Permission keys are intentionally stable API policy identifiers. UI labels
 * must not be used for authorization decisions.
 */
export const permissionKeys = [
  "team.manage", "locations.manage", "orders.read", "orders.manage",
  "pos.operate", "inventory.read", "inventory.adjust", "fulfillment.manage",
  "customers.read", "customers.manage", "customers.export", "payments.verify", "refunds.manage",
  "withdrawals.manage", "bank_accounts.manage", "ai.approve", "ai.execute",
  "marketplace.manage", "finance.read", "finance.manage",
] as const;
export type PermissionKey = (typeof permissionKeys)[number];

export const roleTemplates: Record<string, readonly PermissionKey[]> = {
  owner: permissionKeys,
  admin: permissionKeys.filter((key) => key !== "withdrawals.manage" && key !== "bank_accounts.manage"),
  manager: ["orders.read", "orders.manage", "pos.operate", "inventory.read", "inventory.adjust", "fulfillment.manage", "customers.read", "customers.manage", "marketplace.manage"],
  cashier: ["orders.read", "pos.operate", "customers.read"],
  support: ["orders.read", "customers.read"],
  fulfillment: ["orders.read", "inventory.read", "fulfillment.manage"],
  accountant: ["finance.read", "finance.manage", "payments.verify", "refunds.manage"],
  analyst: ["orders.read", "inventory.read", "customers.read", "finance.read"],
};

/**
 * Lazily creates a tenant's built-ins and legacy owner membership. This keeps
 * pre-membership merchant accounts operational while moving authority to DB.
 */
export async function ensureTenantOwnerMembership(merchantId: number, clerkUserId: string) {
  await db.transaction(async (tx) => {
    for (const [key, permissions] of Object.entries(roleTemplates)) {
      const [role] = await tx.insert(merchantRolesTable).values({
        merchantId, key, name: key[0]!.toUpperCase() + key.slice(1), isSystem: true,
      }).onConflictDoNothing().returning();
      const current = role ?? (await tx.select().from(merchantRolesTable)
        .where(and(eq(merchantRolesTable.merchantId, merchantId), eq(merchantRolesTable.key, key))).limit(1))[0];
      if (current) {
        await tx.insert(merchantRolePermissionsTable).values(
          permissions.map((permission) => ({ roleId: current.id, permission })),
        ).onConflictDoNothing();
      }
    }
    const owner = (await tx.select().from(merchantRolesTable)
      .where(and(eq(merchantRolesTable.merchantId, merchantId), eq(merchantRolesTable.key, "owner"))).limit(1))[0];
    if (!owner) throw new Error("Could not initialize tenant owner role");
    await tx.insert(merchantMembershipsTable).values({
      merchantId, clerkUserId, roleId: owner.id, status: "active", acceptedAt: new Date(),
    }).onConflictDoNothing();
  });
}

export type TenantAccess = {
  merchantId: number;
  membershipId: string;
  roleKey: string;
  permissions: Set<string>;
  locationIds: Set<string> | null;
};

/** Resolves authorization solely from Clerk identity and durable tenant state. */
export async function getTenantAccess(clerkUserId: string, merchantId: number): Promise<TenantAccess | null> {
  const merchant = (await db.select({ clerkUserId: merchantsTable.clerkUserId }).from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId)).limit(1))[0];
  if (merchant?.clerkUserId === clerkUserId) await ensureTenantOwnerMembership(merchantId, clerkUserId);
  const membership = (await db.select({
    id: merchantMembershipsTable.id, roleKey: merchantRolesTable.key,
  }).from(merchantMembershipsTable).innerJoin(merchantRolesTable, eq(merchantMembershipsTable.roleId, merchantRolesTable.id))
    .where(and(eq(merchantMembershipsTable.merchantId, merchantId), eq(merchantMembershipsTable.clerkUserId, clerkUserId), eq(merchantMembershipsTable.status, "active"))).limit(1))[0];
  if (!membership) return null;
  const [permissionRows, scopeRows] = await Promise.all([
    db.select({ permission: merchantRolePermissionsTable.permission }).from(merchantRolePermissionsTable)
      .where(eq(merchantRolePermissionsTable.roleId, (await db.select({ roleId: merchantMembershipsTable.roleId }).from(merchantMembershipsTable).where(eq(merchantMembershipsTable.id, membership.id)).limit(1))[0]!.roleId)),
    db.select({ locationId: merchantMembershipLocationsTable.locationId }).from(merchantMembershipLocationsTable)
      .where(eq(merchantMembershipLocationsTable.membershipId, membership.id)),
  ]);
  return {
    merchantId, membershipId: membership.id, roleKey: membership.roleKey,
    permissions: new Set(permissionRows.map((row) => row.permission)),
    // An empty mapping means tenant-wide scope; a populated mapping is restrictive.
    locationIds: scopeRows.length ? new Set(scopeRows.map((row) => row.locationId)) : null,
  };
}

export function hasPermission(access: TenantAccess, permission: PermissionKey) {
  return access.permissions.has(permission);
}

/**
 * Route services use this after deriving a merchant from server-owned state.
 * It deliberately accepts no client merchant or location identifiers.
 */
export async function requirePermission(
  clerkUserId: string,
  merchantId: number,
  permission: PermissionKey,
): Promise<TenantAccess> {
  const access = await getTenantAccess(clerkUserId, merchantId);
  if (!access) throw new Error("Active tenant membership required");
  if (!hasPermission(access, permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
  return access;
}

export async function requireLocationScope(access: TenantAccess, locationId: string) {
  const location = (await db.select({ id: merchantLocationsTable.id }).from(merchantLocationsTable)
    .where(and(eq(merchantLocationsTable.id, locationId), eq(merchantLocationsTable.merchantId, access.merchantId))).limit(1))[0];
  return Boolean(location) && (access.locationIds === null || access.locationIds.has(locationId));
}

export async function validateTenantLocations(merchantId: number, locationIds: string[]) {
  if (!locationIds.length) return true;
  const rows = await db.select({ id: merchantLocationsTable.id }).from(merchantLocationsTable)
    .where(and(eq(merchantLocationsTable.merchantId, merchantId), inArray(merchantLocationsTable.id, locationIds)));
  return rows.length === new Set(locationIds).size;
}