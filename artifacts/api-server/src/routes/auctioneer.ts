import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, auctionListingsTable, auctionBidsTable, merchantsTable } from "@workspace/db";
import { recommendAuctionStrategy, type AuctioneerStrategy } from "../lib/auctioneer-strategy";

const router=Router();
const strategies=new Set<AuctioneerStrategy>(["balanced","premium","competitive","urgency"]);
router.post("/merchant/auctions/:id/auctioneer",async(req,res)=>{
 const auth=getAuth(req); if(!auth.userId)return res.status(401).json({error:"Authentication required"});
 const id=Number(req.params.id); if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid auction"});
 const [merchant]=await db.select({id:merchantsTable.id}).from(merchantsTable).where(eq(merchantsTable.clerkUserId,auth.userId)).limit(1);
 if(!merchant)return res.status(404).json({error:"Merchant account not found"});
 const enabled=Boolean(req.body?.enabled), strategy=req.body?.strategy as AuctioneerStrategy;
 if(!strategies.has(strategy))return res.status(400).json({error:"Invalid auctioneer strategy"});
 const [auction]=await db.select().from(auctionListingsTable).where(and(eq(auctionListingsTable.id,id),eq(auctionListingsTable.merchantId,merchant.id))).limit(1);
 if(!auction)return res.status(404).json({error:"Auction not found"});
 if(!enabled)return res.json({enabled:false,auctionId:id,message:"AI auctioneer disabled; the merchant remains the auctioneer."});
 const bids=await db.select({email:auctionBidsTable.bidderEmail,amount:auctionBidsTable.amount}).from(auctionBidsTable).where(and(eq(auctionBidsTable.auctionId,id),eq(auctionBidsTable.riskStatus,"accepted")));
 const uniqueBidders=new Set(bids.map(b=>b.email.trim().toLowerCase())).size;
 const currentBid=bids.length?Math.max(...bids.map(b=>Number(b.amount))):null;
 const minutesRemaining=Math.max(0,(new Date(auction.endsAt).getTime()-Date.now())/60000);
 const recommendation=recommendAuctionStrategy(strategy,{startingPrice:Number(auction.startingPrice),currentBid,bidCount:bids.length,minutesRemaining,uniqueBidders,targetPrice:req.body?.targetPrice==null?null:Number(req.body.targetPrice)});
 await db.execute(sql`INSERT INTO auctioneer_settings (auction_id,merchant_id,enabled,strategy,minimum_target_minor,maximum_discount_bps,max_extension_minutes,daily_action_limit,updated_at) VALUES (${id},${merchant.id},true,${strategy},${recommendation.suggestedTarget*100},${Math.max(0,Math.min(5000,Number(req.body?.maximumDiscountBps??0)))},${Math.max(0,Math.min(1440,Number(req.body?.maxExtensionMinutes??0)))},${Math.max(0,Math.min(500,Number(req.body?.dailyActionLimit??20)))},now()) ON CONFLICT (auction_id) DO UPDATE SET enabled=true,strategy=EXCLUDED.strategy,minimum_target_minor=EXCLUDED.minimum_target_minor,maximum_discount_bps=EXCLUDED.maximum_discount_bps,max_extension_minutes=EXCLUDED.max_extension_minutes,daily_action_limit=EXCLUDED.daily_action_limit,updated_at=now()`);
 res.json({enabled:true,auctioneer:"merchant",aiAssistant:true,auctionId:id,recommendation,guardrails:["No fake bids","No fabricated bidder activity","No deceptive claims","All payments remain inside Lunavo dashboard/TS Pay flow"]});
});
export default router;
