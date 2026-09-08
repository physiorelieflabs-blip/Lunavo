export type AdBrainInput = {
  storeName: string; productTitle: string; description?: string | null; category?: string | null; brand?: string | null;
  price?: number | null; currency?: string | null; availability?: string | null; sourceCost?: number | null;
  audience?: string | null; goal?: string | null; offer?: string | null;
};
export type AdBrainPlan = { hook:string; valueProp:string; proof:string; cta:string; caption:string; hashtags:string[]; script:Array<{seconds:number;text:string;scene:'hook'|'product'|'proof'|'cta'}>; score:number; reasoning:string[]; };
const clean=(value:unknown,fallback='')=>typeof value==='string'?value.trim().replace(/\s+/g,' '):fallback;
export function planAd(input:AdBrainInput):AdBrainPlan {
 const title=clean(input.productTitle,'Featured product'), desc=clean(input.description), category=clean(input.category), brand=clean(input.brand), currency=clean(input.currency,'USD');
 const price=typeof input.price==='number'&&Number.isFinite(input.price)?currency+' '+input.price.toFixed(2):'', audience=clean(input.audience,'shoppers');
 const goal=clean(input.goal,'sales').toLowerCase(), offer=clean(input.offer), words=desc.split(' ').filter(Boolean);
 const benefit=words.length>=6?words.slice(0,12).join(' '):'Discover '+title.toLowerCase()+' with a clear value proposition';
 const hooks=goal.includes('awareness')?['Meet '+title+'.','A better way to discover '+title+'.','This is worth a closer look.']:goal.includes('traffic')?['Looking for '+title+'?','See why shoppers are checking out '+title+'.','Your next find is here.']:['Stop scrolling—meet '+title+'.','Need '+title+'? Start here.',title+': made for the right shopper.'];
 const hook=hooks[Math.abs(title.length)%hooks.length]!, proof=input.availability&&/in stock|available|ready/i.test(input.availability)?'Available now':brand?brand+' · '+(category||'shop collection'):category?'Featured in '+category:'Shop direct from the store';
 const cta=offer?(offer+' · Shop now'):price?('From '+price+' · Shop now'):'Tap to shop';
 const caption=hook+' '+benefit+'. '+proof+'. '+cta;
 const hashtags=Array.from(new Set(['#TSCommerce',category?'#'+category.replace(/[^a-zA-Z0-9]+/g,''):'',brand?'#'+brand.replace(/[^a-zA-Z0-9]+/g,''):'','#ShopSmall','#OnlineShopping'].filter(Boolean))).slice(0,8);
 const script=[{seconds:3,text:hook,scene:'hook' as const},{seconds:5,text:benefit,scene:'product' as const},{seconds:3,text:proof,scene:'proof' as const},{seconds:4,text:cta,scene:'cta' as const}];
 const reasoning=['Uses persisted store/product facts plus merchant-supplied audience and offer context.','No unsupported discount claim is generated unless the merchant supplied an offer.',input.sourceCost!==null&&input.sourceCost!==undefined&&input.price!==null&&input.price!==undefined?'Source cost and selling price are available for economics decisions; cost is not shown publicly.':'Supplier economics are incomplete, so no margin claim is generated.'];
 const score=Math.max(60,Math.min(98,72+(price?6:0)+(offer?7:0)+(category?4:0)+(brand?3:0)+(input.availability?3:0)));
 return {hook,valueProp:benefit,proof,cta,caption,hashtags,script,score,reasoning,source:'local_fallback'};
}
import { completeGeminiChat } from './gemini';

export async function planAdWithBrain(input: AdBrainInput): Promise<AdBrainPlan> {
  const fallback = planAd(input);
  try {
    const response = await completeGeminiChat([
      { role: 'system', content: 'You are TS Commerce Ad Brain. Create truthful, high-converting ecommerce creative. Return JSON with hook,valueProp,proof,cta,caption,hashtags,script,score. Never invent reviews, discounts, stock, certifications, guarantees, product capabilities, or customer outcomes. Use only supplied facts. Script must contain hook, product, proof and cta scenes.' },
      { role: 'user', content: JSON.stringify(input) },
    ]);
    const raw = response.content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
    const rawScript = Array.isArray(data.script) ? data.script.slice(0, 4) : [];
    const script = rawScript.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const sceneValue = String(row.scene ?? '');
      if (!(sceneValue === 'hook' || sceneValue === 'product' || sceneValue === 'proof' || sceneValue === 'cta')) return [];
      const seconds = Number(row.seconds);
      const text = str(row.text, 240);
      return Number.isFinite(seconds) && seconds > 0 && text ? [{ seconds: Math.min(20, Math.max(2, Math.round(seconds))), text, scene: sceneValue as 'hook'|'product'|'proof'|'cta' }] : [];
    });
    const hashtags = Array.isArray(data.hashtags) ? data.hashtags.map((item: unknown) => str(item, 40)).filter(Boolean).slice(0, 8) : [];
    const score = Number(data.score);
    const hook = str(data.hook, 180);
    const cta = str(data.cta, 180);
    if (!hook || !cta || script.length < 4) return fallback;
    return {
      hook, valueProp: str(data.valueProp, 400) || fallback.valueProp, proof: str(data.proof, 180) || fallback.proof, cta,
      caption: str(data.caption, 700) || fallback.caption, hashtags: hashtags.length ? hashtags : fallback.hashtags,
      script: script as AdBrainPlan['script'], score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : fallback.score,
      reasoning: [...fallback.reasoning, 'Strategy reviewed by the configured TS Commerce AI brain before rendering.'], source: 'model',
    };
  } catch { return fallback; }
}
