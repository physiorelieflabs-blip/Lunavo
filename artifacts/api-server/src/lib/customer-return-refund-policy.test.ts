import { describe, expect, it } from "vitest";
import { decideReturnRefund } from "./customer-return-refund-policy";

const base = {
  requestType: "return",
  requestStatus: "received",
  requestedQuantity: 1,
  purchasedQuantity: 1,
  inspectionGrade: "resellable",
  amountMinor: 10000,
  paidAmountMinor: 10000,
  priorRefundAmountMinor: 0,
  paymentCurrency: "USD",
  paymentIntentAmountMinor: 10000,
  paymentIntentCurrency: "USD",
  settlementAmountMinor: 10000,
  settlementCurrency: "USD",
  restockReturnedItems: true,
  inventoryStrategy: "tracked",
  availabilityQuantity: 3,
};

describe("return refund execution policy", () => {
  it("allows a full verified refund and restock only for a full resellable return with aligned payment currency", () => {
    expect(decideReturnRefund(base)).toEqual({ ok: true, inventoryRestock: true });
  });

  it("allows a bounded partial refund but does not restock when restock was not requested", () => {
    expect(decideReturnRefund({
      ...base,
      requestedQuantity: 1,
      purchasedQuantity: 2,
      amountMinor: 4000,
      paidAmountMinor: 10000,
      restockReturnedItems: false,
    })).toEqual({ ok: true, inventoryRestock: false });
  });

  it("blocks returns that are not received and blocks exchange refunds", () => {
    expect(decideReturnRefund({ ...base, requestStatus: "approved" }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, requestType: "exchange" }).ok).toBe(false);
  });

  it("blocks an amount above the verified payment remainder", () => {
    const result = decideReturnRefund({ ...base, amountMinor: 8000, priorRefundAmountMinor: 3000 });
    expect(result).toMatchObject({ ok: false, reason: "This refund would exceed the remaining verified payment amount." });
  });

  it("blocks restock for partial quantities, damaged goods, previous refunds, unknown stock, or mismatched settlement", () => {
    expect(decideReturnRefund({ ...base, requestedQuantity: 1, purchasedQuantity: 2 }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, inspectionGrade: "damaged" }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, priorRefundAmountMinor: 1 }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, availabilityQuantity: null }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, settlementCurrency: "NGN" }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, settlementAmountMinor: 9999 }).ok).toBe(false);
    expect(decideReturnRefund({ ...base, inventoryStrategy: "source_based" }).ok).toBe(false);
  });

  it("blocks provider refund preparation when settlement values differ even if stock restock was not requested", () => {
    expect(decideReturnRefund({
      ...base,
      restockReturnedItems: false,
      settlementCurrency: "NGN",
    })).toMatchObject({ ok: false });
  });
});
