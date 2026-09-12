export type AuctioneerStrategy = "balanced" | "premium" | "competitive" | "urgency";
export type AuctionSignal = { startingPrice:number; currentBid:number|null; bidCount:number; minutesRemaining:number; uniqueBidders:number; targetPrice?:number|null };
export function recommendAuctionStrategy(strategy:AuctioneerStrategy,s:AuctionSignal){
 const current=s.currentBid??s.startingPrice;
 const momentum=Math.min(1,s.bidCount/20), scarcity=Math.max(0,Math.min(1,1-s.minutesRemaining/(24*60))), competition=Math.max(0,Math.min(1,s.uniqueBidders/10));
 const uplift=strategy==="premium"?.18:strategy==="competitive"?.08:strategy==="urgency"?.12:.13;
 const suggestedTarget=Math.max(s.targetPrice??0,current*(1+uplift*(.55+momentum*.25+competition*.2+scarcity*.15)));
 return {suggestedTarget:Number(suggestedTarget.toFixed(2)),strategy,signals:{momentum,scarcity,competition},actions:["Improve listing presentation using verified facts.","Highlight differentiating value without unverifiable claims.",strategy==="urgency"?"Use truthful closing-time reminders; never fabricate competing bids.":"Keep bidder communications informative and non-deceptive."]};
}
