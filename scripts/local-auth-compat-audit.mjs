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


const failedLoginStart = localAuth.indexOf("export async function verifyLocalCredentials");
const failedLoginEnd = localAuth.indexOf("async function deliverLocalMail", failedLoginStart);
assert.notEqual(failedLoginStart, -1, "Local credential verification must exist");
assert.notEqual(failedLoginEnd, -1, "Local credential verification must have a bounded function body");
const failedLogin = localAuth.slice(failedLoginStart, failedLoginEnd);
const failedAttemptUpdate = failedLogin.indexOf("SET failed_login_attempts=");
const failedAttemptReturn = failedLogin.indexOf("return { ok: false as const }", failedAttemptUpdate);
const transactionEnd = failedLogin.lastIndexOf("});");
const failedAttemptReject = failedLogin.indexOf('if (!result.ok) throw new Error("Invalid email or password")');
assert.ok(failedAttemptUpdate >= 0, "Invalid local passwords must update the failed-attempt counter");
assert.ok(failedAttemptReturn > failedAttemptUpdate, "Failed login must resolve the transaction after persisting the attempt");
assert.ok(transactionEnd >= 0 && failedAttemptReject > transactionEnd, "Failed login must be rejected only after the transaction resolves");
assert.ok(!failedLogin.slice(failedLogin.indexOf("const valid ="), transactionEnd).includes('throw new Error("Invalid email or password")'), "Failed login must not throw inside the transaction and roll back the lockout counter");


const authRoutes = await readFile("artifacts/api-server/src/routes/auth.ts", "utf8");
const sessionStart = authRoutes.indexOf('router.get("/auth/session"');
const sessionEnd = authRoutes.indexOf('router.post("/auth/sign-up"', sessionStart);
assert.notEqual(sessionStart, -1, "Local auth session endpoint must exist");
assert.notEqual(sessionEnd, -1, "Local auth session endpoint must have a bounded route body");
const authSession = authRoutes.slice(sessionStart, sessionEnd);
assert.ok(
  authSession.includes("local_auth_user_id=") && authSession.includes("clerk_user_id="),
  "Auth session lookup must resolve merchants through both legacy and self-hosted local-auth identities",
);

console.log("Lunavo local-auth commerce compatibility: PASS");
