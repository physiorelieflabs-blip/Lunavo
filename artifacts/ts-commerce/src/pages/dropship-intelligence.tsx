import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, BrainCircuit, CheckCircle2, CircleDollarSign, Clock3, PackageSearch, RefreshCw, Route, ShieldCheck, Truck, Warehouse, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from "@/components/primitives";
import { money } from "@/lib/format";

type Product = {
  id:number; title:string; supplierDomain:string; sourceUrl:string; currency:string; sellingPrice:number;
  supplierCost:number|null; shippingCost:number|null; availability:string|null; availabilityQuantity:number|null;
  economics:{decision:"SCALE"|"TEST"|"FIX"|"PAUSE";risk:"low"|"medium"|"high"|"critical";viabilityScore:number;landedCostMinor:number|null;contributionBeforeAdsMinor:number|null;marginBpsBeforeAds:number|null;breakEvenCpaMinor:number|null;breakEvenRoasX100:number|null;reasons:string[]};
};
type Supplier = {domain:string;name:string;observations:number;productsObserved:number;fulfilledOrders:number;deliveredOrders:number;qualityScore:number|null;trackingScore:number|null;refundRateBps:number|null;etaMaxDays:number|null;passport:{score:number;confidence:string}};
type SupplierOption = {productId:number;productTitle:string;supplierDomain:string;supplierName:string;supplierCost:number|null;shippingCost:number|null;currency:string;etaMinDays:number|null;etaMaxDays:number|null;qualityScore:number|null;trackingScore:number|null;observedAt:string};
type Tracking = {orderId:number;orderNumber:string;status:string;carrier:string|null;trackingNumber:string|null;lastRecordedAt:string;expectedDeliveryAt:string|null;lastRecordedEvent:string|null;gap:{state:"healthy"|"warning"|"critical"|"unknown";gapHours:number|null;message:string}};
type Alert = {id:string;severity:string;title:string;message:string};
type Overview = {generatedAt:string;sourceOfTruth:string;products:Product[];suppliers:Supplier[];tracking:Tracking[];alerts:Alert[];metrics:{products:number;scale:number;test:number;fix:number;pause:number;openAlerts:number;criticalAlerts:number;trackingGaps:number}};

const inputClass="mt-1 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]";
function tone(decision:string):"success"|"warning"|"danger"|"info"|"neutral"{return decision==="SCALE"?"success":decision==="PAUSE"?"danger":decision==="FIX"?"warning":"info";}
function pct(bps:number|null){return bps==null?"—":(bps/100).toFixed(1)+"%";}

export default function DropshipIntelligence(){
  const [data,setData]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("command");
  const [selected,setSelected]=useState<Product|null>(null);
  const [adSpend,setAdSpend]=useState("");
  const [targetMargin,setTargetMargin]=useState("20");
  const [busy,setBusy]=useState<number|null>(null);
  const [scanBusy,setScanBusy]=useState(false);
  const [observation,setObservation]=useState({
    supplierProductId:"",supplierDomain:"",supplierName:"",sourceUrl:"",destinationCountry:"",
    observedCost:"",shippingCost:"",currency:"USD",etaMinDays:"",etaMaxDays:"",qualityScore:"",trackingScore:"",
    defectRate:"",refundRate:"",notes:""
  });

  async function load(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/dropship-intelligence/overview",{credentials:"same-origin",headers:{Accept:"application/json"}});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(b.error||"Dropship Intelligence could not be loaded"));
      setData(b as Overview);
    }catch(e){setError(e instanceof Error?e.message:"Dropship Intelligence could not be loaded");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function assess(product:Product){
    setBusy(product.id);setNotice("");
    try{
      const r=await fetch("/api/dropship-intelligence/products/"+product.id+"/assess",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",Accept:"application/json"},body:JSON.stringify({
        adSpendPerOrder:adSpend===""?undefined:Number(adSpend),targetMarginBps:Math.round((Number(targetMargin)||0)*100)
      })});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(b.error||"Product assessment failed"));
      setNotice(product.title+" → "+b.economics.decision+" · score "+b.economics.viabilityScore+"/100");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Product assessment failed");}
    finally{setBusy(null);}
  }

  async function saveObservation(event:any){
    event.preventDefault();setNotice("");
    try{
      const b={...observation,
        supplierProductId:observation.supplierProductId?Number(observation.supplierProductId):undefined
      };
      const r=await fetch("/api/dropship-intelligence/observations",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",Accept:"application/json"},body:JSON.stringify(b)});
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(body.error||"Supplier observation could not be saved"));
      setNotice("Supplier evidence recorded. Future decisions will use it.");
      setObservation(v=>({...v,observedCost:"",shippingCost:"",etaMinDays:"",etaMaxDays:"",qualityScore:"",trackingScore:"",defectRate:"",refundRate:"",notes:""}));
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Supplier observation could not be saved");}
  }

  async function scanTracking(){
    setScanBusy(true);setNotice("");
    try{
      const r=await fetch("/api/dropship-intelligence/scan",{method:"POST",credentials:"same-origin",headers:{Accept:"application/json"}});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(b.error||"Tracking radar failed"));
      setNotice("Tracking radar scanned "+b.scanned+" handoffs and raised "+(b.alerts?.length||0)+" gap alerts.");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Tracking radar failed");}
    finally{setScanBusy(false);}
  }

  async function resolveAlert(id:string){
    const r=await fetch("/api/dropship-intelligence/alerts/"+encodeURIComponent(id)+"/resolve",{method:"POST",credentials:"same-origin",headers:{Accept:"application/json"}});
    if(r.ok)await load();else setNotice("That alert could not be resolved.");
  }

  if(loading)return <AppShell><LoadingState label="Building your Dropship Intelligence map" /></AppShell>;
  if(error||!data)return <AppShell><ErrorState onRetry={()=>void load()} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1360px]">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a2772e]">Dropship Intelligence OS</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-.07em] md:text-6xl">Stop guessing what to sell.</h1>
          <p className="mt-4 text-sm leading-7 text-[#697687] md:text-base">Recorded supplier, margin, fulfillment and tracking evidence becomes one operating signal: <strong>scale, test, fix, or pause.</strong> Missing data stays missing.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Badge tone="info"><ShieldCheck className="mr-1 h-3.5 w-3.5"/>Evidence-backed</Badge><Button variant="secondary" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button><Button onClick={()=>void scanTracking()} disabled={scanBusy}><Route className="h-4 w-4"/>{scanBusy?"Scanning…":"Run tracking radar"}</Button></div>
      </header>

      {notice&&<div className="mt-6"><Notice tone={/could not|failed|invalid|error/i.test(notice)?"danger":"success"} title="Dropship Intelligence">{notice}</Notice></div>}

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Products",data.metrics.products,PackageSearch],["Scale-ready",data.metrics.scale,ArrowUpRight],["Testing",data.metrics.test,BrainCircuit],
          ["Needs fix",data.metrics.fix,AlertTriangle],["Pause",data.metrics.pause,XCircle],["Tracking gaps",data.metrics.trackingGaps,Clock3]
        ].map(item=>{const Icon=item[2] as any;return <div key={String(item[0])} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold uppercase tracking-[.1em] text-[#778290]">{String(item[0])}</span><Icon className="h-4 w-4 text-[#a2772e]"/></div><p className="mt-3 font-mono text-2xl font-black">{String(item[1])}</p></div>;})}
      </section>

      <nav className="mt-8 flex flex-wrap gap-2 border-b border-[#ded8cd] pb-3">{[["command","Profit command center"],["suppliers","Supplier passports"],["tracking","Tracking + recovery"]].map(item=><button key={item[0]} type="button" onClick={()=>setTab(item[0])} className={"rounded-full px-4 py-2 text-xs font-extrabold "+(tab===item[0]?"bg-[#182333] text-[#f8f3e8]":"bg-[#f3efe7] text-[#697687]")}>{item[1]}</button>)}</nav>

      {tab==="command"&&<div className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
        <section><SectionHeading eyebrow="Smart Kill / Scale Gate" title="Every product gets a reason, not a vibe." description="Uses merchant selling price, supplier cost, shipping, platform fee, ad spend and recorded supplier evidence."/><div className="mt-5 space-y-4">
          {data.products.length?data.products.map(product=><article key={product.id} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(product.economics.decision)}>{product.economics.decision}</Badge><Badge tone={product.economics.risk==="high"||product.economics.risk==="critical"?"danger":"neutral"}>{product.economics.risk} risk</Badge><span className="text-xs text-[#8994a2]">{product.supplierDomain}</span></div><h2 className="mt-2 text-xl font-extrabold">{product.title}</h2></div><div className="text-right"><p className="font-mono text-lg font-black">{money(product.sellingPrice,product.currency)}</p><p className="text-[11px] text-[#8994a2]">sell price</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">{[
              ["Evidence score",product.economics.viabilityScore+"/100"],["Landed cost",product.economics.landedCostMinor==null?"Unknown":money(product.economics.landedCostMinor/100,product.currency)],
              ["Break-even CPA",product.economics.breakEvenCpaMinor==null?"Unknown":money(product.economics.breakEvenCpaMinor/100,product.currency)],["Margin",pct(product.economics.marginBpsBeforeAds)]
            ].map(item=><div key={item[0]} className="rounded-lg bg-[#f3efe7] p-3"><p className="text-[10px] uppercase tracking-[.08em] text-[#778290]">{item[0]}</p><p className="mt-1 font-mono text-lg font-black">{item[1]}</p></div>)}</div>
            <div className="mt-4 rounded-xl border border-[#e0d9cc] bg-white p-4"><p className="text-xs font-black uppercase tracking-[.08em] text-[#697687]">Why this decision</p><div className="mt-2 space-y-1.5">{product.economics.reasons.map((x,i)=><p key={i} className="text-sm leading-6 text-[#536174]">• {x}</p>)}</div></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>setSelected(product)}>Tune economics</Button><a href={product.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-extrabold"><ArrowUpRight className="h-3.5 w-3.5"/>Supplier source</a><Button onClick={()=>void assess(product)} disabled={busy===product.id}>{busy===product.id?"Rechecking…":"Recalculate guardrail"}</Button></div>
          </article>):<EmptyState title="No active products yet" description="Import a real supplier product and price it to start the evidence engine."/>}
        </div></section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#2c3948] bg-[#182333] p-6 text-[#f8f3e8]"><div className="flex items-center gap-3"><BrainCircuit className="h-5 w-5 text-[#d6aa46]"/><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Profit Shield</p><h2 className="mt-1 text-xl font-extrabold">Protect the next ad dollar.</h2></div></div><p className="mt-3 text-sm leading-6 text-[#b8c2cc]">Set your expected ad cost and target margin. Lunavo stores the resulting guardrail on the product.</p><label className="mt-5 block text-sm font-bold">Ad spend / order<input value={adSpend} onChange={e=>setAdSpend(e.target.value)} type="number" min="0" step="0.01" className={inputClass+" border-[#536174] bg-[#263644] text-[#f8f3e8]"}/></label><label className="mt-3 block text-sm font-bold">Target contribution margin %<input value={targetMargin} onChange={e=>setTargetMargin(e.target.value)} type="number" min="0" max="90" step="1" className={inputClass+" border-[#536174] bg-[#263644] text-[#f8f3e8]"}/></label>{selected?<div className="mt-5 rounded-xl border border-[#536174] bg-[#202e3d] p-4"><p className="text-xs font-extrabold">{selected.title}</p><p className="mt-1 text-xs text-[#b8c2cc]">Current: {selected.economics.decision}</p><SubmitButton className="mt-4 w-full" loading={busy===selected.id} onClick={()=>void assess(selected)}>Apply guardrail</SubmitButton></div>:<p className="mt-5 text-xs text-[#8f9cab]">Choose “Tune economics” on a product.</p>}</section>
          {selected&&<section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading eyebrow="Cashflow Survival Map" title="Know the cash a winning product can consume." description="Transparent working-capital exposure from recorded landed cost and entered ad spend. It is not a promise about settlement timing or available bank balance."/>
            {selected.economics.landedCostMinor==null?<p className="mt-4 rounded-xl bg-[#fff7df] p-4 text-sm leading-6 text-[#765817]">Record supplier cost and shipping first. Lunavo refuses to invent a capital requirement.</p>:<div className="mt-4 space-y-3">{[10,50,100].map(n=>{const landed=selected.economics.landedCostMinor! * n;const ads=Math.round(Number(adSpend||0)*100*n);const capital=landed+ads;const revenue=selected.economics.revenueMinor*n;return <div key={n} className="rounded-xl border border-[#e0d9cc] bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="font-extrabold">{n} orders</p><p className="font-mono text-sm font-black">{money(revenue/100,selected.currency)} revenue</p></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[#8994a2]">Supplier + shipping</p><p className="mt-1 font-mono font-black">{money(landed/100,selected.currency)}</p></div><div><p className="text-[#8994a2]">Ad budget</p><p className="mt-1 font-mono font-black">{money(ads/100,selected.currency)}</p></div></div><div className="mt-3 rounded-lg bg-[#f3efe7] p-3"><p className="text-[10px] uppercase tracking-[.08em] text-[#778290]">Working-capital exposure</p><p className="mt-1 font-mono text-lg font-black">{money(capital/100,selected.currency)}</p></div></div>})}</div>}
          </section>
          <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="What changed" title="Dropshipping without blind spots." description="Seller discussions repeatedly call out supplier reliability, unstable delivery, tracking gaps, margin uncertainty and scattered chargeback evidence as operational bottlenecks."/><div className="mt-5 space-y-3 text-sm text-[#536174]"><div className="flex gap-3"><CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]"/>No positive-profit claim when landed cost is unknown.</div><div className="flex gap-3"><Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]"/>Supplier confidence increases with real observations.</div><div className="flex gap-3"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]"/>Silent tracking becomes a recovery signal.</div></div></section>
        </aside>
      </div>}

      {tab==="suppliers"&&<div className="mt-7 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <section><SectionHeading eyebrow="Supplier Passport" title="Know who deserves your scale." description="Quality, tracking, evidence volume and actual Lunavo fulfillment shape the passport. Low evidence means low confidence."/><div className="mt-5 space-y-3">{data.suppliers.length?data.suppliers.map(s=><article key={s.domain} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Badge tone={s.passport.score>=80?"success":s.passport.score>=60?"warning":"danger"}>{s.passport.score}/100</Badge><span className="text-[11px] uppercase tracking-[.08em] text-[#8994a2]">{s.passport.confidence} confidence</span></div><h3 className="mt-2 text-lg font-extrabold">{s.name}</h3><p className="text-xs text-[#697687]">{s.domain}</p></div><p className="font-mono text-sm">{s.fulfilledOrders} fulfilled orders</p></div><div className="mt-4 grid gap-3 sm:grid-cols-4">{[["Quality",s.qualityScore==null?"—":s.qualityScore+"/100"],["Tracking",s.trackingScore==null?"—":s.trackingScore+"/100"],["Refund",pct(s.refundRateBps)],["Max ETA",s.etaMaxDays==null?"—":s.etaMaxDays+"d"]].map(x=><div key={x[0]} className="rounded-lg bg-[#f3efe7] p-3"><p className="text-[10px] text-[#778290]">{x[0]}</p><p className="mt-1 font-mono font-black">{x[1]}</p></div>)}</div></article>):<EmptyState title="No supplier passports yet" description="Record your first supplier observation."/>}</div></section>
        <section className="mt-7 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Supplier Switchboard" title="Compare alternatives before you scale." description="The switchboard compares your latest recorded observations for the same Lunavo product across different supplier domains. It does not claim live quotes."/><div className="mt-5 space-y-3">{Object.entries(data.supplierOptions.reduce<Record<string,SupplierOption[]>>((acc,row)=>{(acc[String(row.productId)]??=[]).push(row);return acc;},{})).filter(([,rows])=>rows.length>1).map(([productId,rows])=><div key={productId} className="rounded-xl border border-[#e0d9cc] bg-white p-4"><div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-[#a2772e]"/><p className="font-extrabold">{rows[0].productTitle}</p></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[#8994a2]"><tr><th className="pb-2">Supplier</th><th className="pb-2">Landed</th><th className="pb-2">ETA</th><th className="pb-2">Quality</th><th className="pb-2">Tracking</th></tr></thead><tbody className="divide-y divide-[#eee9df]">{rows.map(row=><tr key={row.supplierDomain}><td className="py-3"><p className="font-extrabold">{row.supplierName}</p><p className="text-[#8994a2]">{row.supplierDomain}</p></td><td className="py-3 font-mono">{row.supplierCost==null||row.shippingCost==null?"Unknown":money(row.supplierCost+row.shippingCost,row.currency)}</td><td className="py-3 font-mono">{row.etaMaxDays==null?"Unknown":String(row.etaMinDays??row.etaMaxDays)+"–"+row.etaMaxDays+"d"}</td><td className="py-3 font-mono">{row.qualityScore==null?"—":row.qualityScore}</td><td className="py-3 font-mono">{row.trackingScore==null?"—":row.trackingScore}</td></tr>)}</tbody></table></div></div>)}</div>{data.supplierOptions.every((row,i,arr)=>arr.filter(x=>x.productId===row.productId).length<2)&&<p className="mt-4 rounded-xl bg-[#f3efe7] p-4 text-sm text-[#697687]">Record observations for the same product from two or more supplier domains and Lunavo will automatically build the comparison.</p>}</section><section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Add evidence" title="Record what you actually observed." description="This stays manual when no external supplier/carrier API is connected. Lunavo never turns missing data into fake certainty."/><form onSubmit={saveObservation} className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Supplier domain<input required className={inputClass} value={observation.supplierDomain} onChange={e=>setObservation(v=>({...v,supplierDomain:e.target.value}))} placeholder="supplier.example"/></label><label className="text-sm font-bold">Supplier name<input className={inputClass} value={observation.supplierName} onChange={e=>setObservation(v=>({...v,supplierName:e.target.value}))} placeholder="Acme Supply"/></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Product ID<input className={inputClass} value={observation.supplierProductId} onChange={e=>setObservation(v=>({...v,supplierProductId:e.target.value}))} placeholder="Optional"/></label><label className="text-sm font-bold">Destination<input className={inputClass} value={observation.destinationCountry} onChange={e=>setObservation(v=>({...v,destinationCountry:e.target.value}))} placeholder="US"/></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Supplier cost<input className={inputClass} type="number" min="0" step="0.01" value={observation.observedCost} onChange={e=>setObservation(v=>({...v,observedCost:e.target.value}))}/></label><label className="text-sm font-bold">Shipping cost<input className={inputClass} type="number" min="0" step="0.01" value={observation.shippingCost} onChange={e=>setObservation(v=>({...v,shippingCost:e.target.value}))}/></label></div>
          <div className="grid gap-3 sm:grid-cols-4">{[["etaMinDays","Min days"],["etaMaxDays","Max days"],["qualityScore","Quality /100"],["trackingScore","Tracking /100"]].map(x=><label key={x[0]} className="text-sm font-bold">{x[1]}<input className={inputClass} type="number" min="0" max={x[0].includes("Score")?"100":"365"} value={(observation as any)[x[0]]} onChange={e=>setObservation(v=>({...v,[x[0]]:e.target.value}))}/></label>)}</div>
          <label className="block text-sm font-bold">Source URL<input className={inputClass} value={observation.sourceUrl} onChange={e=>setObservation(v=>({...v,sourceUrl:e.target.value}))} placeholder="https://supplier.example/product/..."/></label>
          <label className="block text-sm font-bold">Notes<textarea className="mt-1 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm outline-none" rows={4} value={observation.notes} onChange={e=>setObservation(v=>({...v,notes:e.target.value}))} placeholder="Quote, sample, tracking evidence, defect report…"/></label>
          <Button type="submit" className="w-full"><CheckCircle2 className="h-4 w-4"/>Record supplier evidence</Button>
        </form></section>
      </div>}

      {tab==="tracking"&&<div className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
        <section><SectionHeading eyebrow="Tracking-Gap Radar" title="Catch the silent days before the customer does." description="Without a carrier API, Lunavo monitors the last event you actually recorded. It never pretends that a silent carrier is a live feed."/><div className="mt-5 space-y-3">{data.tracking.length?data.tracking.map(t=><article key={t.orderId} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Badge tone={t.gap.state==="critical"?"danger":t.gap.state==="warning"?"warning":"success"}>{t.gap.state}</Badge><span className="font-mono text-xs font-black">{t.orderNumber}</span></div><h3 className="mt-2 font-extrabold">{t.carrier||"Carrier not recorded"} · {t.trackingNumber||"No tracking number"}</h3><p className="mt-1 text-xs text-[#697687]">{t.lastRecordedEvent||"No latest event text recorded"}</p></div><p className="font-mono text-sm">{t.gap.gapHours==null?"—":t.gap.gapHours+"h silent"}</p></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#697687]">Last recorded: {new Date(t.lastRecordedAt).toLocaleString()}{t.expectedDeliveryAt?" · expected "+new Date(t.expectedDeliveryAt).toLocaleDateString():""}</p><a href={"/dropshipping?orderId="+t.orderId} className="inline-flex items-center gap-2 rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-extrabold">Open fulfillment record <ArrowUpRight className="h-3.5 w-3.5"/></a></div></article>):<EmptyState title="No active tracked orders" description="Record a tracking checkpoint and the radar will monitor its recorded event age."/>}</div></section>
        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Recovery inbox" title="Open alerts"/><div className="mt-4 space-y-3">{data.alerts.length?data.alerts.map(a=><div key={a.id} className="rounded-xl border border-[#e0d9cc] bg-white p-4"><div className="flex items-center justify-between gap-3"><Badge tone={a.severity==="critical"?"danger":a.severity==="high"?"warning":"info"}>{a.severity}</Badge><button type="button" onClick={()=>void resolveAlert(a.id)} className="text-xs font-extrabold text-[#315e6c]">Resolve</button></div><p className="mt-2 text-sm font-extrabold">{a.title}</p><p className="mt-1 text-xs leading-5 text-[#697687]">{a.message}</p></div>):<p className="rounded-xl bg-[#f3efe7] p-4 text-sm text-[#697687]">No unresolved dropship alerts.</p>}</div></section>
      </div>}
    </div>
  </AppShell>;
}
