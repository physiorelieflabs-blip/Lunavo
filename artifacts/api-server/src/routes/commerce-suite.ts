import { Router, type Request, type Response } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { getAuth } from "../lib/auth-compat";
import { requirePermission, type PermissionKey } from "../lib/tenant-access";
import { db, merchantsTable, customersTable, supplierProductsTable, autoDsSettingsTable, fulfillmentJobsTable, discountCodesTable, loyaltyAccountsTable, affiliateOffersTable, digitalProductsTable } from "@workspace/db";
import { toMinorUnits } from "../lib/money";

const router = Router();
async function merchantFor(req: Request, permission: PermissionKey) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const merchant = (await db.select().from(merchantsTable).where(and(eq(merchantsTable.status, "active"), or(eq(merchantsTable.clerkUserId, userId), eq(merchantsTable.localAuthUserId, userId)))).limit(1))[0] ?? null;
  if (!merchant) return null;
  await requirePermission(userId, merchant.id, permission);
  return merchant;
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }

router.get("/automation/auto-ds", async (req,res) => {
  const merchant=await merchantFor(req, "fulfillment.manage"); if(!merchant) return fail(res,401,"Authentication required");
  const settings=(await db.select().from(autoDsSettingsTable).where(eq(autoDsSettingsTable.merchantId,merchant.id)).limit(1))[0] ?? null;
  const jobs=await db.select().from(fulfillmentJobsTable).where(eq(fulfillmentJobsTable.merchantId,merchant.id)).orderBy(desc(fulfillmentJobsTable.createdAt)).limit(100);
  res.json({settings:settings??{merchantId:merchant.id,enabled:false,mode:"assisted",autoAllocateSupplierCost:false,requireApprovalBeforeExternalOrder:true,minimumMarginPercent:"10",defaultCarrier:null},capabilities:{automaticInternalRouting:true,automaticSupplierApiOrdering:false,reason:"External supplier websites without an order API cannot be treated as APIs. Auto-DS prepares and routes orders; external supplier checkout requires a supported adapter or approval."},jobs});
});

router.post("/automation/auto-ds", async (req,res) => {
  const merchant=await merchantFor(req, "fulfillment.manage"); if(!merchant) return fail(res,401,"Authentication required");
  const minimum=Number(req.body?.minimumMarginPercent); if(!Number.isFinite(minimum)||minimum<0||minimum>100) return fail(res,400,"Minimum margin must be between 0 and 100");
  const current=(await db.select().from(autoDsSettingsTable).where(eq(autoDsSettingsTable.merchantId,merchant.id)).limit(1))[0];
  const values={enabled:req.body?.enabled===true,mode:req.body?.mode==="auto"?"auto":"assisted",autoAllocateSupplierCost:req.body?.autoAllocateSupplierCost===true,requireApprovalBeforeExternalOrder:req.body?.requireApprovalBeforeExternalOrder!==false,minimumMarginPercent:minimum.toFixed(2),defaultCarrier:typeof req.body?.defaultCarrier==="string"?req.body.defaultCarrier.trim().slice(0,120)||null:null,updatedAt:new Date()};
  const saved=current?(await db.update(autoDsSettingsTable).set(values).where(eq(autoDsSettingsTable.id,current.id)).returning())[0]:(await db.insert(autoDsSettingsTable).values({merchantId:merchant.id,...values}).returning())[0];
  if(!saved)return fail(res,500,"Auto-DS settings could not be saved");
  res.json({settings:saved,note:values.mode==="auto"?"Eligible paid supplier-backed orders will be routed automatically into fulfillment jobs. External supplier checkout remains adapter/approval gated.":"Orders are prepared as assisted fulfillment jobs for review."});
});

router.get("/automation/fulfillment-jobs", async(req,res)=>{const m=await merchantFor(req, "fulfillment.manage");if(!m)return fail(res,401,"Authentication required");res.json({jobs:await db.select().from(fulfillmentJobsTable).where(eq(fulfillmentJobsTable.merchantId,m.id)).orderBy(desc(fulfillmentJobsTable.createdAt)).limit(100)});});

router.post("/automation/fulfillment-jobs/:id/status", async(req,res)=>{
  const m=await merchantFor(req, "fulfillment.manage"); if(!m) return fail(res,401,"Authentication required");
  const jobId=String(req.params.id ?? "").trim(); if(!/^[0-9a-fA-F-]{36}$/.test(jobId)) return fail(res,400,"Invalid fulfillment job id");
  const nextStatus=typeof req.body?.status==="string"?req.body.status.trim():"";
  const allowed:Record<string,string[]>={
    ready:["approved","failed"],
    approved:["ordered","failed"],
    ordered:["shipped","failed"],
    shipped:["delivered","failed"],
    delivered:[],
    failed:["ready"],
  };
  const current=(await db.select().from(fulfillmentJobsTable).where(and(eq(fulfillmentJobsTable.id,jobId),eq(fulfillmentJobsTable.merchantId,m.id))).limit(1))[0];
  if(!current) return fail(res,404,"Fulfillment job not found");
  if(!allowed[String(current.status)]?.includes(nextStatus)) return fail(res,409,"Invalid fulfillment transition from "+String(current.status)+" to "+nextStatus);
  const patch:any={status:nextStatus,updatedAt:new Date()};
  if(nextStatus==="ordered" && typeof req.body?.supplierOrderReference==="string") patch.supplierOrderReference=req.body.supplierOrderReference.trim().slice(0,160);
  if(nextStatus==="shipped"){
    patch.carrier=typeof req.body?.carrier==="string"?req.body.carrier.trim().slice(0,120):null;
    patch.trackingNumber=typeof req.body?.trackingNumber==="string"?req.body.trackingNumber.trim().slice(0,160):null;
    patch.trackingUrl=typeof req.body?.trackingUrl==="string"?req.body.trackingUrl.trim().slice(0,1000):null;
    patch.shippedAt=new Date();
  }
  if(nextStatus==="delivered") patch.deliveredAt=new Date();
  if(nextStatus==="failed") patch.lastError=typeof req.body?.reason==="string"?req.body.reason.trim().slice(0,500):"Fulfillment failed";
  const [job]=await db.update(fulfillmentJobsTable).set(patch).where(and(eq(fulfillmentJobsTable.id,current.id),eq(fulfillmentJobsTable.merchantId,m.id),eq(fulfillmentJobsTable.status,current.status))).returning();
  if(!job) return fail(res,409,"Fulfillment job changed concurrently; reload and retry");
  res.json({job});
});

router.post("/automation/fulfillment-jobs/:id/approve", async(req,res)=>{const m=await merchantFor(req, "fulfillment.manage");if(!m)return fail(res,401,"Authentication required");const jobId=String(req.params.id ?? "").trim();if(!/^[0-9a-fA-F-]{36}$/.test(jobId))return fail(res,400,"Invalid fulfillment job id");const[j]=await db.update(fulfillmentJobsTable).set({status:"approved",updatedAt:new Date(),attempts:0}).where(and(eq(fulfillmentJobsTable.id,jobId),eq(fulfillmentJobsTable.merchantId,m.id),eq(fulfillmentJobsTable.status,"ready"))).returning();if(!j)return fail(res,404,"Ready fulfillment job not found");res.json({job:j,next:"Open the supplier checkout URL or use a configured supplier fulfillment adapter."});});

router.get("/commerce/discount-codes", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");res.json({codes:await db.select().from(discountCodesTable).where(eq(discountCodesTable.merchantId,m.id)).orderBy(desc(discountCodesTable.createdAt))});});
router.post("/commerce/discount-codes", async (req, res) => {
  const m = await merchantFor(req, "team.manage");
  if (!m) return fail(res, 401, "Authentication required");

  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const kind = req.body?.kind;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || (kind !== "fixed" && kind !== "percentage")) {
    return fail(res, 400, "Enter a valid code and choose percentage or fixed amount");
  }

  const valueMinor = toMinorUnits(req.body?.value, 2);
  const minimumMinor = toMinorUnits(req.body?.minimumSubtotal ?? "0", 2);
  if (valueMinor === null || valueMinor <= 0 || minimumMinor === null || minimumMinor < 0
    || (kind === "percentage" && valueMinor > 10_000)) {
    return fail(res, 400, "Enter a positive discount value; percentage discounts cannot exceed 100%");
  }

  const usageLimitInput = req.body?.usageLimit;
  let usageLimit: number | null = null;
  if (usageLimitInput !== undefined && usageLimitInput !== null && usageLimitInput !== "") {
    usageLimit = Number(usageLimitInput);
    if (!Number.isSafeInteger(usageLimit) || usageLimit <= 0 || usageLimit > 2_147_483_647) {
      return fail(res, 400, "Usage limit must be a positive whole number");
    }
  }

  const parseDate = (input: unknown): Date | null | undefined => {
    if (input === undefined || input === null || input === "") return null;
    if (typeof input !== "string" || input.length > 80) return undefined;
    const milliseconds = Date.parse(input);
    if (!Number.isFinite(milliseconds)) return undefined;
    return new Date(milliseconds);
  };
  const startsAt = parseDate(req.body?.startsAt);
  const endsAt = parseDate(req.body?.endsAt);
  if (startsAt === undefined || endsAt === undefined || (startsAt && endsAt && endsAt <= startsAt)) {
    return fail(res, 400, "Enter valid promotion dates; the end must be after the start");
  }

  const decimal = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
  const [created] = await db.insert(discountCodesTable).values({
    merchantId: m.id,
    code,
    kind,
    value: decimal(valueMinor),
    minimumSubtotal: decimal(minimumMinor),
    currency: m.currency,
    usageLimit,
    startsAt,
    endsAt,
    active: true,
  }).onConflictDoNothing({
    target: [discountCodesTable.merchantId, discountCodesTable.code],
  }).returning();
  if (!created) return fail(res, 409, "That discount code already exists for this store");
  res.status(201).json({ code: created });
});
router.post("/commerce/discount-codes/:id/deactivate", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");const[c]=await db.update(discountCodesTable).set({active:false,updatedAt:new Date()}).where(and(eq(discountCodesTable.id,Number(req.params.id)),eq(discountCodesTable.merchantId,m.id))).returning();if(!c)return fail(res,404,"Discount code not found");res.json({code:c});});

router.get("/commerce/loyalty", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");const accounts=await db.select({id:loyaltyAccountsTable.id,customerId:loyaltyAccountsTable.customerId,pointsBalance:loyaltyAccountsTable.pointsBalance,lifetimePoints:loyaltyAccountsTable.lifetimePoints,tier:loyaltyAccountsTable.tier,customerName:customersTable.name,customerEmail:customersTable.email}).from(loyaltyAccountsTable).innerJoin(customersTable,eq(loyaltyAccountsTable.customerId,customersTable.id)).where(eq(loyaltyAccountsTable.merchantId,m.id)).orderBy(desc(loyaltyAccountsTable.pointsBalance)).limit(200);res.json({accounts});});

router.get("/commerce/affiliate-offers", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");const offers=await db.select({id:affiliateOffersTable.id,productId:affiliateOffersTable.supplierProductId,productTitle:supplierProductsTable.title,status:affiliateOffersTable.status,commissionBps:affiliateOffersTable.commissionBps,destinationUrl:affiliateOffersTable.destinationUrl}).from(affiliateOffersTable).innerJoin(supplierProductsTable,eq(affiliateOffersTable.supplierProductId,supplierProductsTable.id)).where(eq(affiliateOffersTable.merchantId,m.id)).orderBy(desc(affiliateOffersTable.createdAt));res.json({offers});});
router.post("/commerce/affiliate-offers", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");const productId=Number(req.body?.productId),pct=Number(req.body?.commissionPercent??30);if(!Number.isInteger(productId)||productId<1||!Number.isFinite(pct)||pct<1||pct>100)return fail(res,400,"Choose a valid product and commission");const p=(await db.select({id:supplierProductsTable.id}).from(supplierProductsTable).where(and(eq(supplierProductsTable.id,productId),eq(supplierProductsTable.merchantId,m.id))).limit(1))[0];if(!p)return fail(res,404,"Product not found");const[o]=await db.insert(affiliateOffersTable).values({merchantId:m.id,supplierProductId:productId,commissionBps:Math.round(pct*100),destinationUrl:"/affiliate/"+m.id+"/"+productId,status:"review"}).onConflictDoNothing().returning();if(!o)return fail(res,409,"Affiliate offer already exists");res.status(201).json({offer:o});});

router.get("/commerce/digital-products", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");res.json({products:await db.select().from(digitalProductsTable).where(eq(digitalProductsTable.merchantId,m.id)).orderBy(desc(digitalProductsTable.createdAt))});});
router.post("/commerce/digital-products", async(req,res)=>{const m=await merchantFor(req, "team.manage");if(!m)return fail(res,401,"Authentication required");const kind=["digital","course","membership","service"].includes(req.body?.kind)?req.body.kind:"digital";const supplierProductId=Number.isInteger(Number(req.body?.supplierProductId))?Number(req.body.supplierProductId):null;if(supplierProductId){const p=(await db.select({id:supplierProductsTable.id}).from(supplierProductsTable).where(and(eq(supplierProductsTable.id,supplierProductId),eq(supplierProductsTable.merchantId,m.id))).limit(1))[0];if(!p)return fail(res,404,"Source product not found");}const[p]=await db.insert(digitalProductsTable).values({merchantId:m.id,supplierProductId,kind,accessMode:req.body?.accessMode==="membership"?"membership":"purchase",dripEnabled:req.body?.dripEnabled===true,certificateEnabled:req.body?.certificateEnabled===true,curriculumPublic:req.body?.curriculumPublic===true}).returning();res.status(201).json({product:p});});

export default router;
