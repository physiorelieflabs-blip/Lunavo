import { calculatePriceCeiling } from "./autonomous-store-policy";
import { scoreProductOpportunity } from "./opportunity-scoring";

export type ProductOpportunityInput={externalKey:string;productName:string;currency:string;landedCostMinor:number;marketLowMinor:number|null;marketHighMinor:number|null;demand:number;lowCompetition:number;growth:number;supplier:number;marketFit:number;risk:number};
export type AutonomousOpportunity=ProductOpportunityInput&{recommendedPriceMinor:number|null;maximumCommercialPriceMinor:number|null;totalScore:number;label:"excellent"|"strong"|"watch"|"avoid"};
export function buildAutonomousOpportunity(input:ProductOpportunityInput):AutonomousOpportunity{
 const score=scoreProductOpportunity({demand:input.demand,competition:100-input.lowCompetition,growth:input.growth,profit:input.marketHighMinor!=null&&input.landedCostMinor>0?Math.max(0,Math.min(100,(input.marketHighMinor-input.landedCostMinor)/input.landedCostMinor*100)):0,supplier:input.supplier,marketFit:input.marketFit,risk:input.risk});
 const maximumCommercialPriceMinor=calculatePriceCeiling({landedCostMinor:input.landedCostMinor,marketLowMinor:input.marketLowMinor,marketHighMinor:input.marketHighMinor,targetMarginPercent:30});
 const recommendedPriceMinor=maximumCommercialPriceMinor==null?null:Math.max(input.landedCostMinor,input.marketLowMinor==null?maximumCommercialPriceMinor:Math.min(maximumCommercialPriceMinor,Math.round((input.marketLowMinor+maximumCommercialPriceMinor)/2)));
 return {...input,recommendedPriceMinor,maximumCommercialPriceMinor,totalScore:score.total,label:score.label};
}
export function rankAutonomousOpportunities(items:AutonomousOpportunity[]){return [...items].sort((a,b)=>b.totalScore-a.totalScore||(b.demand-b.risk)-(a.demand-a.risk)||a.productName.localeCompare(b.productName));}
export function buildDailyAdSlots(dailyCount:number,startHour=8,endHour=22){const count=Math.max(0,Math.min(100,Math.trunc(dailyCount)));if(!count)return[] as Date[];const start=Math.max(0,Math.min(23,Math.trunc(startHour))),end=Math.max(start+1,Math.min(24,Math.trunc(endHour))),span=(end-start)*60;return Array.from({length:count},(_,i)=>{const d=new Date();d.setHours(start,0,0,0);d.setMinutes(Math.floor((i+.5)*span/count));return d;});}
