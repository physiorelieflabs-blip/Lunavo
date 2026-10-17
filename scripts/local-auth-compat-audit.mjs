#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const middleware = await readFile("artifacts/api-server/src/lib/middleware.ts", "utf8");
const merchantAuthStart = middleware.indexOf("export async function merchantAuthMiddleware");
const merchantAuthEnd = middleware.indexOf("export function requireRole", merchantAuthStart);
assert.notEqual(merchantAuthStart, -1, "Merchant auth middleware must exist");
assert.notEqual(merchantAuthEnd, -1, "Merchant auth middleware must end before role helpers");
const merchantAuth = middleware.slice(merchantAuthStart, merchantAuthEnd);
assert.ok(
  merchantAuth.includes("merchantsTable.clerkUserId") &&
  merchantAuth.includes("merchantsTable.localAuthUserId"),
  "Shared merchant-auth middleware must resolve both legacy and self-hosted local-auth identities",
);

const subscriptionOptions = await readFile("artifacts/api-server/src/routes/subscription-options.ts", "utf8");
const subscriptionResolverStart = subscriptionOptions.indexOf("async function merchantFor(req: Request)");
const subscriptionResolverEnd = subscriptionOptions.indexOf("\n}\n\nrouter.get", subscriptionResolverStart);
assert.notEqual(subscriptionResolverStart, -1, "Subscription options merchant resolver must exist");
assert.notEqual(subscriptionResolverEnd, -1, "Subscription options merchant resolver must have a clear end");
const subscriptionResolver = subscriptionOptions.slice(subscriptionResolverStart, subscriptionResolverEnd);
assert.ok(
  subscriptionResolver.includes("merchantsTable.clerkUserId") &&
  subscriptionResolver.includes("merchantsTable.localAuthUserId"),
  "Subscription options must resolve both legacy and self-hosted local-auth identities",
);

const paymentBoundary = await readFile("artifacts/api-server/src/routes/payment-boundary.ts", "utf8");
const subscriptionRouteStart = paymentBoundary.indexOf('router.post("/subscription/use-earnings"');
assert.notEqual(subscriptionRouteStart, -1, "Subscription earnings route must exist");
const subscriptionRoute = paymentBoundary.slice(subscriptionRouteStart);
assert.ok(
  subscriptionRoute.includes("merchantsTable.clerkUserId") &&
  subscriptionRoute.includes("merchantsTable.localAuthUserId"),
  "Subscription earnings payments must resolve both legacy and self-hosted local-auth identities",
);

const localAuth = await readFile("artifacts/api-server/src/lib/local-auth.ts", "utf8");
const profileStart = localAuth.indexOf("export async function updateLocalProfile");
const profileEnd = localAuth.indexOf("export async function changeLocalPassword", profileStart);
assert.notEqual(profileStart, -1, "Local profile update function must exist");
assert.notEqual(profileEnd, -1, "Local password update function must follow profile update function");
const profileUpdate = localAuth.slice(profileStart, profileEnd);
assert.ok(
  profileUpdate.includes("clerk_user_id=") && profileUpdate.includes("local_auth_user_id="),
  "Profile updates must synchronize the merchant name for both legacy and local-auth identities",
);

console.log("Lunavo local-auth commerce compatibility: PASS");
