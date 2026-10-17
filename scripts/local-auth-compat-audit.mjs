#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
