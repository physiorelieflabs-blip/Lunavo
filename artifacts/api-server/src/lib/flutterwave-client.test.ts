import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  flutterwaveAmount,
  flutterwaveStatus,
  flutterwaveTransactionId,
  verifyFlutterwaveWebhookSignature,
} from "./flutterwave-client";

test("Flutterwave transaction helpers normalize provider responses", () => {
  assert.equal(flutterwaveTransactionId({ id: 4812 }), "4812");
  assert.equal(flutterwaveAmount({ amount: "19.99", currency: "NGN" }), 19.99);
  assert.equal(flutterwaveAmount({ charged_amount: 20, currency: "NGN" }), 20);
  assert.equal(flutterwaveStatus({ status: "successful" }), "paid");
  assert.equal(flutterwaveStatus({ status: "reversed" }), "failed");
  assert.equal(flutterwaveStatus({ status: "pending" }), "pending");
});

test("Flutterwave webhook signatures accept the configured hash and HMAC form only", () => {
  const previous = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  const rawBody = Buffer.from('{"event":"charge.completed"}');
  process.env.FLUTTERWAVE_WEBHOOK_SECRET = "test-webhook-secret";
  const hmac = createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, "test-webhook-secret"), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, hmac), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, "wrong-secret"), false);
  assert.equal(verifyFlutterwaveWebhookSignature(Buffer.from("{}"), hmac), false);
  if (previous === undefined) delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  else process.env.FLUTTERWAVE_WEBHOOK_SECRET = previous;
});