export type PricingInputs = {
  supplierCostMinor: number;
  shippingMinor?: number;
  taxMinor?: number;
  fixedFeesMinor?: number;
  percentageFeeBps?: number;
  targetMarginPercent: number;
  marketLowMinor?: number;
  marketHighMinor?: number;
  demandScore?: number;
  competitionScore?: number;
  minPriceMinor?: number;
  maxPriceMinor?: number;
};
export type PricingResult={recommendedPriceMinor:number|null;maximumCommercialPriceMinor:number|null;floorPriceMinor:number;marketReferenceMinor:number|null;pricingStatus:"evidence_backed"|"insufficient_market_evidence"};
const finite=(v:number|undefined,fallback=0)=>Number.isFinite(v)?Number(v):fallback;
const nonNegative=(v:number|undefined)=>Math.max(0,finite(v));

/** Evidence-only dynamic pricing. A missing market range never becomes a fabricated maximum. */
export function recommendDynamicPrice(input:PricingInputs):PricingResult{
 if(!Number.isSafeInteger(input.supplierCostMinor)||input.supplierCostMinor<=0)throw new Error("Invalid supplier cost");
 if(!Number.isFinite(input.targetMarginPercent)||input.targetMarginPercent<0||input.targetMarginPercent>=100)throw new Error("Invalid target margin");
 const baseCost=input.supplierCostMinor+nonNegative(input.shippingMinor)+nonNegative(input.taxMinor)+nonNegative(input.fixedFeesMinor);
 const feeRate=Math.max(0,finite(input.percentageFeeBps))/10000;
 const denominator=1-feeRate-input.targetMarginPercent/100;if(denominator<=0)throw new Error("Target margin is incompatible with percentage fees");
 const floor=Math.max(Math.ceil(baseCost/denominator),nonNegative(input.minPriceMinor));
 const low=Number.isSafeInteger(input.marketLowMinor)&&input.marketLowMinor!>0?input.marketLowMinor!:null;
 const high=Number.isSafeInteger(input.marketHighMinor)&&input.marketHighMinor!>0?input.marketHighMinor!:null;
 if(low===null||high===null||high<low)return {recommendedPriceMinor:null,maximumCommercialPriceMinor:null,floorPriceMinor:floor,marketReferenceMinor:low??high,pricingStatus:"insufficient_market_evidence"};
 const reference=Math.round((low+high)/2);
 const demand=Math.max(0,Math.min(100,finite(input.demandScore,50)));
 const competition=Math.max(0,Math.min(100,finite(input.competitionScore,50)));
 const evidenceMax=Math.max(floor,high);
 const configuredMax=Number.isSafeInteger(input.maxPriceMinor)&&input.maxPriceMinor!>0?input.maxPriceMinor!:evidenceMax;
 const maximum=Math.min(evidenceMax,configuredMax);
 const recommended=Math.min(maximum,Math.max(floor,Math.round(reference*(1+(demand-competition)/1000))));
 return {recommendedPriceMinor:recommended,maximumCommercialPriceMinor:maximum,floorPriceMinor:floor,marketReferenceMinor:reference,pricingStatus:"evidence_backed"};
}
