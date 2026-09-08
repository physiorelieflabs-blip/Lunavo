import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Download, ExternalLink, Film, Hash, Play, RefreshCw, Sparkles, WandSparkles } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';

type Product = { id:number; title:string; imageUrl:string|null; description:string|null; category:string|null; brand:string|null; sellingPrice:number|null; currency:string; availability:string|null; price:number|null; };
type Creative = { id:string; campaignId:string; productId:number|null; platform:string; aspectRatio:string; durationSeconds:number; title:string; caption:string|null; hashtags:string[]; status:string; errorMessage:string|null; createdAt:string; completedAt:string|null; };
type Campaign = { id:string; productId:number|null; status:string; goal:string; audience:string|null; offer:string|null; brainSummary:string|null; createdAt:string; };

export default function AdStudio() {
  const [products,setProducts]=useState<Product[]>([]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [creatives,setCreatives]=useState<Creative[]>([]);
  const [productId,setProductId]=useState('');
  const [goal,setGoal]=useState('sales');
  const [audience,setAudience]=useState('');
  const [offer,setOffer]=useState('');
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [message,setMessage]=useState('');
  const [lastBrain,setLastBrain]=useState<{score:number;hook:string;valueProp:string;proof:string;cta:string;reasoning:string[]}|null>(null);

  const load=async()=>{
    setLoading(true);
    try{
      const [p,c]=await Promise.all([
        customFetch<{products:Product[]}>('/api/supplier-products'),
        customFetch<{campaigns:Campaign[];creatives:Creative[]}>('/api/ads/generator/campaigns'),
      ]);
      setProducts(p.products||[]); setCampaigns(c.campaigns||[]); setCreatives(c.creatives||[]);
      if(!productId && p.products?.[0]) setProductId(String(p.products[0].id));
    }catch(e){setMessage(e instanceof Error?e.message:'Ad Studio could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const selected = products.find(p=>String(p.id)===productId)||null;
  const generate=async()=>{
    if(!selected){setMessage('Choose a real product with a primary image.');return;}
    setGenerating(true);setMessage('');
    try{
      const result=await customFetch<{campaignId:string;brain:{score:number;hook:string;valueProp:string;proof:string;cta:string;reasoning:string[]};creatives:Array<{id:string;platform:string;status:string}>}>('/api/ads/generator/generate',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({productId:selected.id,goal,audience,offer})
      });
      setLastBrain(result.brain);
      setMessage('Ad Brain finished and the self-hosted renderer produced the available platform variants.');
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:'Video generation failed.');}
    finally{setGenerating(false);}
  };

  const completed=useMemo(()=>creatives.filter(c=>c.status==='completed'),[creatives]);
  const latestCampaign=campaigns[0];

  if(loading)return <AppShell><LoadingState label="Loading Ad Studio" /></AppShell>;
  if(!products.length)return <AppShell><ErrorState onRetry={()=>void load()} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1240px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Self-hosted creative engine</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-.07em]">Turn every product into social ads.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#697687]">TS Commerce Ad Studio uses your real product data to plan the angle, write the hook/caption/CTA, render MP4 videos on your own server, and give you ready-to-share platform variants.</p></div>
        <Badge tone="success"><Sparkles className="mr-1 inline h-3.5 w-3.5"/>No paid video API required</Badge>
      </div>
      {message&&<div className="mt-6"><Notice tone={message.includes('failed')||message.includes('could not')||message.includes('Choose')?'danger':'success'} title="Ad Studio">{message}</Notice></div>}

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-8">
        <div className="flex items-start gap-3"><WandSparkles className="mt-1 h-6 w-6 text-[#d6aa46]"/><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Ad Brain</p><h2 className="mt-2 text-2xl font-extrabold">Give it the product. Let it build the angle.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#b8c2cc]">The planner uses persisted title, description, category, brand, pricing, availability and supplier economics where available. It will not invent discounts, stock, margins, reviews, certifications or customer claims.</p></div></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
          <label className="text-sm font-bold">Product<select value={productId} onChange={e=>setProductId(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#536174] bg-[#243344] px-3 text-[#f8f3e8]">{products.map(p=><option key={p.id} value={p.id}>{p.title}{p.imageUrl?'':' — needs image'}</option>)}</select></label>
          <label className="text-sm font-bold">Goal<select value={goal} onChange={e=>setGoal(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#536174] bg-[#243344] px-3 text-[#f8f3e8]"><option value="sales">Sales</option><option value="traffic">Traffic</option><option value="awareness">Awareness</option></select></label>
          <label className="text-sm font-bold">Audience<input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="e.g. busy parents" className="mt-2 h-11 w-full rounded-lg border border-[#536174] bg-[#243344] px-3 text-[#f8f3e8]"/></label>
        </div>
        <label className="mt-4 block text-sm font-bold">Offer / CTA context<input value={offer} onChange={e=>setOffer(e.target.value)} placeholder="Optional: Free delivery this week" className="mt-2 h-11 w-full rounded-lg border border-[#536174] bg-[#243344] px-3 text-[#f8f3e8]"/></label>
        <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={generate} disabled={generating||!selected?.imageUrl} className="bg-[#d6aa46] text-[#182333] hover:bg-[#e0b95d]">{generating?<><RefreshCw className="h-4 w-4 animate-spin"/>Rendering ads…</>:<><Film className="h-4 w-4"/>Generate social ad pack</>}</Button><p className="text-xs text-[#aeb9c4]">Creates Reels, Shorts, feed and landscape MP4 variants from the same approved product source.</p></div>
      </section>

      {lastBrain&&<section className="mt-8 rounded-2xl border border-[#c4dadd] bg-[#eef7f8] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#315e6c]">Brain result</p><h2 className="mt-2 text-2xl font-extrabold text-[#182333]">{lastBrain.hook}</h2><p className="mt-2 text-sm leading-6 text-[#477563]">{lastBrain.valueProp}</p></div><div className="rounded-xl bg-white px-4 py-3 text-center"><p className="text-[10px] uppercase tracking-[.12em] text-[#697687]">Creative score</p><p className="mt-1 font-mono text-2xl font-extrabold text-[#182333]">{lastBrain.score}/100</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#697687]">Proof</p><p className="mt-2 text-sm font-extrabold text-[#182333]">{lastBrain.proof}</p></div><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#697687]">CTA</p><p className="mt-2 text-sm font-extrabold text-[#182333]">{lastBrain.cta}</p></div><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#697687]">Reasoning</p><p className="mt-2 text-xs leading-5 text-[#536174]">{lastBrain.reasoning.join(' ')}</p></div></div></section>}

      <section className="mt-8"><SectionHeading eyebrow="Ready to share" title="Generated creatives" description="Download an MP4 and use its caption/hashtags on the social channel you choose. Publishing remains your account's action." />{completed.length?<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{completed.map(c=><article key={c.id} className="overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="aspect-[9/14] bg-[#101923]"><video controls playsInline preload="metadata" src={`/api/ads/generator/creatives/${c.id}`} className="h-full w-full object-contain"/></div><div className="p-4"><div className="flex items-center justify-between gap-2"><Badge tone="success">{c.platform}</Badge><span className="text-[10px] text-[#697687]">{c.aspectRatio} · {c.durationSeconds}s</span></div><p className="mt-3 text-sm font-extrabold">{c.title}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-[#697687]">{c.caption}</p><div className="mt-3 flex flex-wrap gap-1">{(c.hashtags||[]).slice(0,5).map(h=><span key={h} className="inline-flex items-center gap-1 rounded-full bg-[#f1eee7] px-2 py-1 text-[10px] text-[#697687]"><Hash className="h-2.5 w-2.5"/>{h.replace('#','')}</span>)}</div><a href={`/api/ads/generator/creatives/${c.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-3 py-2 text-xs font-extrabold text-[#f8f3e8]"><Download className="h-3.5 w-3.5"/>Download MP4</a></div></article>)}</div>:<div className="mt-5 rounded-2xl border border-dashed border-[#cfc7b9] bg-[#fbfaf6] p-10 text-center"><Clapperboard className="mx-auto h-8 w-8 text-[#a2772e]"/><p className="mt-4 text-sm font-extrabold">No rendered creatives yet</p><p className="mt-1 text-xs text-[#697687]">Choose a product above and generate its social pack.</p></div>}</section>

      <section className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><Play className="h-5 w-5 text-[#a2772e]"/><p className="mt-3 text-sm font-extrabold">Social-first formats</p><p className="mt-1 text-xs leading-5 text-[#697687]">Vertical 9:16 plus square and landscape variants are rendered by the server.</p></div><div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><Hash className="h-5 w-5 text-[#315e6c]"/><p className="mt-3 text-sm font-extrabold">Caption kit</p><p className="mt-1 text-xs leading-5 text-[#697687]">Every creative gets a caption and restrained hashtag set generated from real product context.</p></div><div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><ExternalLink className="h-5 w-5 text-[#8a6826]"/><p className="mt-3 text-sm font-extrabold">You control publishing</p><p className="mt-1 text-xs leading-5 text-[#697687]">Upload to Instagram, TikTok, YouTube Shorts or another network using your own account and permissions.</p></div></section>

      {latestCampaign?.brainSummary&&<section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><p className="text-xs font-mono uppercase tracking-[.14em] text-[#a2772e]">Latest generator record</p><p className="mt-2 text-sm leading-6 text-[#536174]">{latestCampaign.brainSummary}</p></section>}
    </div>
  </AppShell>;
}
