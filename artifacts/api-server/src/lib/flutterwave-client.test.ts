import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { it as test } from "vitest";
import {
  flutterwaveAmount,
  flutterwavePaymentOptionsForCurrency,
  flutterwaveCredentialMode,
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

test("Flutterwave credential mode is classified without exposing the key", () => {
  const previous = process.env.FLUTTERWAVE_SECRET_KEY;
  process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-example";
  assert.equal(flutterwaveCredentialMode(), "test");
  process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK-example";
  assert.equal(flutterwaveCredentialMode(), "live");
  process.env.FLUTTERWAVE_SECRET_KEY = "unexpected-format";
  assert.equal(flutterwaveCredentialMode(), "unknown");
  if (previous === undefined) delete process.env.FLUTTERWAVE_SECRET_KEY;
  else process.env.FLUTTERWAVE_SECRET_KEY = previous;
});

test("Flutterwave webhook signatures accept the configured hash and HMAC form only", () => {
  const previous = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  const rawBody = Buffer.from('{"event":"charge.completed"}');
  process.env.FLUTTERWAVE_WEBHOOK_SECRET = "test-webhook-secret";
  const signature = createHmac("sha256", "test-webhook-secret").update(rawBody).digest("base64");
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, signature), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, "wrong-signature"), false);
  assert.equal(verifyFlutterwaveWebhookSignature(Buffer.from("{}"), signature), false);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, undefined, "test-webhook-secret"), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, undefined, "wrong-secret"), false);
  if (previous === undefined) delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  else process.env.FLUTTERWAVE_WEBHOOK_SECRET = previous;
});

test("Flutterwave payment capabilities are currency-specific", () => {
  assert.equal(flutterwavePaymentOptionsForCurrency("NGN"), "card,account,banktransfer,ussd,nqr,opay");
  assert.equal(flutterwavePaymentOptionsForCurrency("GHS"), "card,mobilemoneyghana");
  assert.equal(flutterwavePaymentOptionsForCurrency("KES"), "card,mpesa");
  assert.equal(flutterwavePaymentOptionsForCurrency("GBP"), "card,account");
  assert.equal(flutterwavePaymentOptionsForCurrency("EUR"), "card,account");
  assert.equal(flutterwavePaymentOptionsForCurrency("ZAR"), "card,account");
  assert.equal(flutterwavePaymentOptionsForCurrency("UNKNOWN"), "card");
});
