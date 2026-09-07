import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, isNotNull, lt, lte } from "drizzle-orm";
import {
  merchantsTable,
  paymentsTable,
  referralAttributionsTable,
  referralPeriodsTable,
  referralRewardsTable,
  subscriptionsTable,
  type ReferralPeriod,
  type Subscription,
} from "@workspace/db";

type Transaction = any;
const REFERRAL_DISCOUNT_USD = 30;

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function referralCodeHash(value: string): string {
  return createHash("sha256").update(normalizeReferralCode(value)).digest("hex");
}

function timezoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
}

function zonedMidnight(year: number, month: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, 1);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = timezoneParts(new Date(guess), timeZone);
    const target = Date.UTC(year, month - 1, 1);
    const observed = Date.UTC(actual.year, actual.month - 1, actual.day);
    guess += target - observed;
  }
  return new Date(guess);
}

export function referralPeriodForDate(timeZone: string | null | undefined, now = new Date()) {
  const zone = timeZone || "UTC";
  const current = timezoneParts(now, zone);
  const validFrom = zonedMidnight(current.year, current.month, zone);
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const validUntil = zonedMidnight(nextYear, nextMonth, zone);
  return {
    periodKey: `${current.year}-${String(current.month).padStart(2, "0")}`,
    validFrom,
    validUntil,
  };
}

function subscriptionGrossMinor(subscription: Subscription): number {
  const gross = Number(subscription.grossAmount || subscription.amountDue);
  return Math.max(0, Math.round(gross * 100));
}

export async function ensureReferralPeriodForPaidSubscription(
  tx: Transaction,
  merchantId: number,
  subscription: Subscription,
  now = new Date(),
): Promise<ReferralPeriod | null> {
  if (Number(subscription.amountPaid) + 0.005 < Number(subscription.amountDue)) return null;
  const period = referralPeriodForDate(subscription.billingTimezone, now);
  await tx
    .update(referralPeriodsTable)
    .set({ status: "expired" })
    .where(and(
      eq(referralPeriodsTable.merchantId, merchantId),
      eq(referralPeriodsTable.status, "active"),
      lte(referralPeriodsTable.validUntil, now),
    ));
  const existing = (
    await tx
      .select()
      .from(referralPeriodsTable)
      .where(and(eq(referralPeriodsTable.merchantId, merchantId), eq(referralPeriodsTable.periodKey, period.periodKey)))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.status !== "active" && now < existing.validUntil) {
      const [reactivated] = await tx
        .update(referralPeriodsTable)
        .set({ status: "active" })
        .where(eq(referralPeriodsTable.id, existing.id))
        .returning();
      return reactivated ?? existing;
    }
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `TS-REF-${randomBytes(6).toString("hex").toUpperCase()}`;
    const [created] = await tx
      .insert(referralPeriodsTable)
      .values({
        merchantId,
        periodKey: period.periodKey,
        code,
        codeHash: referralCodeHash(code),
        validFrom: period.validFrom,
        validUntil: period.validUntil,
        status: "active",
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  }
  throw new Error("A unique referral code could not be generated");
}

function normalizedIdentityEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${local.split("+")[0]}@${domain}`;
}

export async function attributeReferral(
  tx: Transaction,
  input: { code: string; referredMerchantId: number; now?: Date },
) {
  const now = input.now ?? new Date();
  const code = normalizeReferralCode(input.code);
  if (!/^TS-REF-[A-F0-9]{12}$/.test(code)) throw new Error("Invalid referral code");
  const [period] = await tx
    .select()
    .from(referralPeriodsTable)
    .where(and(
      eq(referralPeriodsTable.codeHash, referralCodeHash(code)),
      eq(referralPeriodsTable.status, "active"),
      lt(referralPeriodsTable.validFrom, now),
      gt(referralPeriodsTable.validUntil, now),
    ))
    .limit(1);
  if (!period) throw new Error("This referral code is expired or invalid");

  const [referrer, referred] = await Promise.all([
    tx.select().from(merchantsTable).where(eq(merchantsTable.id, period.merchantId)).limit(1).then((rows: any[]) => rows[0]),
    tx.select().from(merchantsTable).where(eq(merchantsTable.id, input.referredMerchantId)).limit(1).then((rows: any[]) => rows[0]),
  ]);
  if (!referrer || !referred) throw new Error("Referral merchant could not be found");
  if (referrer.status !== "active") {
    throw new Error("Only an active merchant can create referrals");
  }
  if (referred.status === "banned") {
    throw new Error("A banned merchant cannot receive a referral attribution");
  }
  if (referrer.id === referred.id || referrer.clerkUserId === referred.clerkUserId) {
    throw new Error("A merchant cannot refer itself");
  }
  if (normalizedIdentityEmail(referrer.email) === normalizedIdentityEmail(referred.email)) {
    throw new Error("This referral cannot be used because the merchant identities match");
  }

  const previouslyQualified = (
    await tx
      .select({ id: referralAttributionsTable.id })
      .from(referralAttributionsTable)
      .where(and(
        eq(referralAttributionsTable.referredMerchantId, referred.id),
        isNotNull(referralAttributionsTable.qualifyingPaymentId),
      ))
      .limit(1)
  )[0];
  if (previouslyQualified) {
    throw new Error("This merchant has already used its one qualifying referral reward");
  }

  const existing = (
    await tx
      .select()
      .from(referralAttributionsTable)
      .where(and(eq(referralAttributionsTable.referredMerchantId, referred.id), isNull(referralAttributionsTable.qualifyingPaymentId)))
      .orderBy(desc(referralAttributionsTable.createdAt))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.referralPeriodId === period.id && existing.referrerMerchantId === referrer.id) return existing;
    throw new Error("This merchant already has an active referral attribution");
  }

  const riskSignals: string[] = [];
  let riskScore = 0;
  if (referrer.email.split("@")[1]?.toLowerCase() === referred.email.split("@")[1]?.toLowerCase()) {
    riskSignals.push("shared_email_domain");
    riskScore += 15;
  }
  const normalizedContactEmail = (value: string | null) =>
    value ? normalizedIdentityEmail(value) : null;
  if (
    normalizedContactEmail(referrer.storeContactEmail) &&
    normalizedContactEmail(referrer.storeContactEmail) ===
      normalizedContactEmail(referred.storeContactEmail)
  ) {
    riskSignals.push("shared_store_contact_email");
    riskScore += 35;
  }
  const normalizedPhone = (value: string | null) =>
    value ? value.replace(/\D/g, "") : "";
  if (
    normalizedPhone(referrer.storePhone) &&
    normalizedPhone(referrer.storePhone) === normalizedPhone(referred.storePhone)
  ) {
    riskSignals.push("shared_store_phone");
    riskScore += 35;
  }
  if (Math.abs(referrer.registeredAt.getTime() - referred.registeredAt.getTime()) <= 10 * 60 * 1000) {
    riskSignals.push("near_simultaneous_registration");
    riskScore += 10;
  }
  const riskStatus = riskScore >= 50 ? "review" : "clear";
  const [attribution] = await tx
    .insert(referralAttributionsTable)
    .values({
      referrerMerchantId: referrer.id,
      referredMerchantId: referred.id,
      referralPeriodId: period.id,
      referralCodeHash: period.codeHash,
      usedAt: now,
      riskScore,
      riskStatus,
      riskSignals,
    })
    .onConflictDoNothing()
    .returning();
  if (!attribution) throw new Error("Referral attribution already exists");
  return attribution;
}

export async function qualifyReferralForPayment(
  tx: Transaction,
  input: {
    referredMerchantId: number;
    paymentId: number;
    subscription: Subscription;
    amountMinor: number;
    currency: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  if (Number(input.subscription.amountPaid) + 0.005 < Number(input.subscription.amountDue)) {
    return null;
  }
  const [attribution] = await tx
    .select()
    .from(referralAttributionsTable)
    .where(and(
      eq(referralAttributionsTable.referredMerchantId, input.referredMerchantId),
      isNull(referralAttributionsTable.qualifyingPaymentId),
    ))
    .orderBy(desc(referralAttributionsTable.createdAt))
    .limit(1);
  if (!attribution || !attribution.usedAt) return null;
  const [payment] = await tx
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, input.paymentId), eq(paymentsTable.merchantId, input.referredMerchantId)))
    .limit(1);
  if (!payment || payment.status !== "confirmed") return null;
  if (!["bank_transfer", "earnings", "flutterwave"].includes(payment.method)) return null;
  const [referrer] = await tx
    .select({ status: merchantsTable.status })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, attribution.referrerMerchantId))
    .limit(1);

  const referrerSubscription = (
    await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.merchantId, attribution.referrerMerchantId))
      .limit(1)
  )[0];
  const rewardCurrency = referrerSubscription?.currency ?? input.currency;
  const rewardFxRate = Number(referrerSubscription?.fxRate ?? 1);
  const grossAmountMinor = referrerSubscription
    ? subscriptionGrossMinor(referrerSubscription)
    : Math.round(REFERRAL_DISCOUNT_USD * 100);
  const discountAmountMinor = Math.min(
    grossAmountMinor,
    Math.round(REFERRAL_DISCOUNT_USD * Math.max(rewardFxRate, 0) * 100),
  );
  const payableAmountMinor = Math.max(0, grossAmountMinor - discountAmountMinor);
  const [updatedAttribution] = await tx
    .update(referralAttributionsTable)
    .set({
      qualifyingPaymentId: payment.id,
      qualifyingPaymentStatus: payment.status,
      qualifyingAmountMinor: input.amountMinor,
      qualifyingCurrency: input.currency,
    })
    .where(and(eq(referralAttributionsTable.id, attribution.id), isNull(referralAttributionsTable.qualifyingPaymentId)))
    .returning();
  if (!updatedAttribution) return null;

  const [reward] = await tx
    .insert(referralRewardsTable)
    .values({
      merchantId: attribution.referrerMerchantId,
      attributionId: attribution.id,
      qualifyingPaymentId: payment.id,
      grossAmountMinor,
      discountAmountMinor,
      payableAmountMinor,
      currency: rewardCurrency,
       status:
         attribution.riskStatus === "review" || referrer?.status !== "active"
           ? "review"
           : "earned",
    })
    .onConflictDoNothing()
    .returning();
  return reward ?? (
    await tx
      .select()
      .from(referralRewardsTable)
      .where(eq(referralRewardsTable.qualifyingPaymentId, payment.id))
      .limit(1)
  )[0] ?? null;
}

export async function rollSubscriptionPeriod(
  tx: Transaction,
  merchantId: number,
  subscription: Subscription,
  now = new Date(),
): Promise<Subscription> {
  const currentPeriod = referralPeriodForDate(subscription.billingTimezone, now);
  if (!subscription.billingPeriodKey) {
    const [initialized] = await tx
      .update(subscriptionsTable)
      .set({ billingPeriodKey: currentPeriod.periodKey, grossAmount: subscription.amountDue })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
    return initialized ?? subscription;
  }
  if (
    subscription.billingPeriodKey === currentPeriod.periodKey ||
    Number(subscription.amountPaid) + 0.005 < Number(subscription.amountDue)
  ) {
    return subscription;
  }

  const grossAmountMinor = subscriptionGrossMinor(subscription);
  const [reward] = await tx
    .select()
    .from(referralRewardsTable)
    .where(and(
      eq(referralRewardsTable.merchantId, merchantId),
      eq(referralRewardsTable.status, "earned"),
      isNull(referralRewardsTable.appliedSubscriptionId),
      eq(referralRewardsTable.currency, subscription.currency),
    ))
    .orderBy(desc(referralRewardsTable.createdAt))
    .limit(1);
  const discountMinor = reward?.discountAmountMinor ?? 0;
  const payableMinor = Math.max(0, grossAmountMinor - discountMinor);
  const [nextSubscription] = await tx
    .update(subscriptionsTable)
    .set({
      billingPeriodKey: currentPeriod.periodKey,
      grossAmount: (grossAmountMinor / 100).toFixed(2),
      amountDue: (payableMinor / 100).toFixed(2),
      referralDiscount: (discountMinor / 100).toFixed(2),
      referralRewardId: reward?.id ?? null,
      amountPaid: "0",
      earningsHeld: "0",
      paymentMethod: null,
      paymentMethodSelectedAt: null,
      status: payableMinor === 0 ? "active" : "pending",
    })
    .where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.billingPeriodKey, subscription.billingPeriodKey)))
    .returning();
  if (!nextSubscription) return subscription;
  if (reward) {
    await tx
      .update(referralRewardsTable)
      .set({ status: "applied", appliedSubscriptionId: nextSubscription.id })
      .where(and(eq(referralRewardsTable.id, reward.id), eq(referralRewardsTable.status, "earned")));
  }
  return nextSubscription;
}

export async function reverseReferralReward(
  tx: Transaction,
  paymentId: number,
  reason: string,
  now = new Date(),
) {
  const [reward] = await tx
    .select()
    .from(referralRewardsTable)
    .where(and(eq(referralRewardsTable.qualifyingPaymentId, paymentId), isNull(referralRewardsTable.reversedAt)))
    .limit(1);
  if (!reward) return null;
  const [updated] = await tx
    .update(referralRewardsTable)
    .set({
      status: reward.appliedSubscriptionId ? "recovery_required" : "reversed",
      reversedAt: now,
      reversalReason: reason.slice(0, 500),
    })
    .where(and(eq(referralRewardsTable.id, reward.id), isNull(referralRewardsTable.reversedAt)))
    .returning();
  return updated ?? reward;
}