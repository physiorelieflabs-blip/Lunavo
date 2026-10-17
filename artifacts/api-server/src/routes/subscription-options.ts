import { Router, type Request } from "express";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { db, merchantsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { SUPPORTED_CURRENCIES } from "../lib/currency-support";

const router = Router();

const METHODS = [
  { id: "card", label: "Card", rail: "Flutterwave hosted checkout", paymentOptions: "card" },
  { id: "bank_transfer", label: "Bank transfer", rail: "Flutterwave virtual account", paymentOptions: "banktransfer" },
  { id: "ussd", label: "USSD", rail: "Flutterwave hosted checkout", paymentOptions: "ussd" },
  { id: "mobile_money", label: "Mobile money", rail: "Flutterwave hosted checkout", paymentOptions: "mobilemoney" },
  { id: "all_flutterwave", label: "All available methods", rail: "Flutterwave hosted checkout", paymentOptions: "card,banktransfer,ussd,mobilemoney" },
  { id: "earnings", label: "Pay from eligible TS Commerce earnings", rail: "TS Pay internal ledger", paymentOptions: null },
] as const;

function currencies(): string[] {
  // Keep the picker aligned with the exact-decimal registry used by checkout and the ledger.
  return [...SUPPORTED_CURRENCIES];
}

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const merchant = (await db.select().from(merchantsTable).where(or(
    eq(merchantsTable.clerkUserId, userId),
    eq(merchantsTable.localAuthUserId, userId),
  )).limit(1))[0] ?? null;
  if (!merchant) return null;
  await requirePermission(userId, merchant.id, "team.manage");
  return merchant;
}

router.get("/subscription/options", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req);
  if (!merchant) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({
    methods: METHODS,
    currencies: currencies(),
    subscription: { baseAmountUsd: 30, pricingMode: "USD-base with selected billing/settlement currency", noTrial: true },
    providerTruth: "A currency can be selected internally, but a payment rail is started only when the configured provider actually supports that currency and method. No payment is marked successful from client input.",
  });
});

export default router;
