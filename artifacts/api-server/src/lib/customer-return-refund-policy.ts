export type ReturnInspectionGrade = "resellable" | "damaged" | "unsellable";

export type ReturnRefundDecisionInput = {
  requestType: string;
  requestStatus: string;
  requestedQuantity: number;
  purchasedQuantity: number;
  inspectionGrade: string;
  amountMinor: number;
  paidAmountMinor: number;
  priorRefundAmountMinor: number;
  paymentCurrency: string;
  paymentIntentAmountMinor: number;
  paymentIntentCurrency: string;
  restockReturnedItems: boolean;
  inventoryStrategy: string | null;
  availabilityQuantity: number | null;
};

export type ReturnRefundDecision =
  | { ok: true; inventoryRestock: boolean }
  | { ok: false; reason: string };

export function decideReturnRefund(input: ReturnRefundDecisionInput): ReturnRefundDecision {
  if (input.requestType !== "return") {
    return { ok: false, reason: "Exchange requests cannot create cash refunds from this workflow." };
  }
  if (input.requestStatus !== "received") {
    return { ok: false, reason: "The return must be physically received before inspection and refund preparation." };
  }
  if (!Number.isSafeInteger(input.requestedQuantity) || input.requestedQuantity < 1 ||
      !Number.isSafeInteger(input.purchasedQuantity) || input.purchasedQuantity < input.requestedQuantity) {
    return { ok: false, reason: "Return quantity does not match a valid purchased quantity." };
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, reason: "Refund amount must be a positive whole number of currency minor units." };
  }
  if (!Number.isSafeInteger(input.paidAmountMinor) || input.paidAmountMinor <= 0 ||
      !Number.isSafeInteger(input.priorRefundAmountMinor) || input.priorRefundAmountMinor < 0) {
    return { ok: false, reason: "No verified payment or valid refund balance is available for this order." };
  }
  if (input.amountMinor + input.priorRefundAmountMinor > input.paidAmountMinor) {
    return { ok: false, reason: "This refund would exceed the remaining verified payment amount." };
  }
  if (!["resellable", "damaged", "unsellable"].includes(input.inspectionGrade)) {
    return { ok: false, reason: "Choose a valid inspection result." };
  }
  if (!input.restockReturnedItems) return { ok: true, inventoryRestock: false };

  if (input.inspectionGrade !== "resellable") {
    return { ok: false, reason: "Only items inspected as resellable may be returned to stock." };
  }
  if (input.requestedQuantity !== input.purchasedQuantity) {
    return { ok: false, reason: "The current stock-restock action supports full-order returns only." };
  }
  if (input.priorRefundAmountMinor !== 0 || input.amountMinor !== input.paidAmountMinor) {
    return { ok: false, reason: "Restocking is only allowed with a full refund and no earlier refund requests." };
  }
  if (input.paymentIntentAmountMinor !== input.paidAmountMinor ||
      input.paymentIntentCurrency.trim().toUpperCase() !== input.paymentCurrency.trim().toUpperCase()) {
    return { ok: false, reason: "Payment and settlement amounts/currencies differ; automatic stock restock is blocked." };
  }
  if (!input.inventoryStrategy || input.inventoryStrategy === "source_based" || input.availabilityQuantity === null ||
      !Number.isSafeInteger(input.availabilityQuantity) || input.availabilityQuantity < 0) {
    return { ok: false, reason: "This product does not have reliable tracked inventory for automatic restock." };
  }
  return { ok: true, inventoryRestock: true };
}
