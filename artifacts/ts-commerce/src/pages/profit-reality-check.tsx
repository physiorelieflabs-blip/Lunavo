import { useState } from "react";
import { ArrowRight, BrainCircuit, CircleDollarSign, ShieldCheck, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { Badge, Button, Notice } from "@/components/primitives";

type Result={economics:{decision:"SCALE"|"TEST"|"FIX"|"PAUSE";risk:string;viabilityScore:number;landedCostMinor:number|null;contributionBeforeAdsMinor:number|null;marginBpsBeforeAds:number|null;breakEvenCpaMinor:number|null;breakEvenRoasX100:number|null;reasons:string[]};methodology:string;callToAction:string};

const input="mt-1 h-11 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm outline-none focus:border-[#bca26a]";
const money=(value:number,currency:string)=>new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:2}).format(value);

export default function ProfitRealityCheck(){
  const [form,setForm]=useState({currency:"USD",sellingPrice:"",supplierCost:"",shippingCost:"",adSpendPerOrder:"",providerFeePerOrder:"",refundRatePercent:"",targetMarginPercent:"20"});
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:any){
    e.preventDefault();setBusy(true);setError("");setResult(null);
    try{
      const r=await fetch("/api/public/profit-reality-check",{method:"POST",headers:{"content-type":"application/json",Accept:"application/json"},body:JSON.stringify(form)});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(b.error||"The calculation could not be completed"));
      setResult(b as Result);
    }catch(err){setError(err instanceof Error?err.message:"The calculation could not be completed");}
    finally{setBusy(false);}
  }
  return <main className="min-h-[100dvh] bg-[#f5f1e8] px-5 py-8 text-[#182333]">
    <div className="mx-auto max-w-[1180px]">
      <header className="flex items-center justify-between gap-4"><Link href="/" className="font-mono text-xs font-black tracking-[.14em]">Lunavo</Link><Link href="/sign-up" className="rounded-lg bg-[#182333] px-4 py-2 text-xs font-extrabold text-[#f8f3e8]">Build with Lunavo <ArrowRight className="ml-1 inline h-3.5 w-3.5"/></Link></header>
      <section className="mt-16 max-w-4xl"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a2772e]">Free seller tool</p><h1 className="mt-3 text-5xl font-extrabold tracking-[-.08em] md:text-7xl">Profit Reality Check.</h1><p className="mt-5 max-w-3xl text-base leading-8 text-[#697687]">Put the real numbers in. Lunavo shows landed cost, contribution margin, break-even CPA and a transparent keep-testing-or-stop signal. No fake “winning product” generator.</p></section>
      <div className="mt-10 grid gap-7 lg:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={submit} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold sm:col-span-2">Currency<select className={input} value={form.currency} onChange={e=>setForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>NGN</option><option>GBP</option><option>EUR</option><option>GHS</option><option>KES</option><option>ZAR</option></select></label>
            <label className="text-sm font-bold">Selling price<input required type="number" min="0.01" step="0.01" className={input} value={form.sellingPrice} onChange={e=>setForm(v=>({...v,sellingPrice:e.target.value}))}/></label>
            <label className="text-sm font-bold">Supplier cost<input required type="number" min="0" step="0.01" className={input} value={form.supplierCost} onChange={e=>setForm(v=>({...v,supplierCost:e.target.value}))}/></label>
            <label className="text-sm font-bold">Shipping cost<input required type="number" min="0" step="0.01" className={input} value={form.shippingCost} onChange={e=>setForm(v=>({...v,shippingCost:e.target.value}))}/></label>
            <label className="text-sm font-bold">Ad spend / order<input type="number" min="0" step="0.01" className={input} value={form.adSpendPerOrder} onChange={e=>setForm(v=>({...v,adSpendPerOrder:e.target.value}))}/></label>
            <label className="text-sm font-bold">Provider fee / order<input type="number" min="0" step="0.01" className={input} value={form.providerFeePerOrder} onChange={e=>setForm(v=>({...v,providerFeePerOrder:e.target.value}))}/></label>
            <label className="text-sm font-bold">Refund rate %<input type="number" min="0" max="100" step="0.1" className={input} value={form.refundRatePercent} onChange={e=>setForm(v=>({...v,refundRatePercent:e.target.value}))}/></label>
          </div>
          <label className="mt-4 block text-sm font-bold">Target contribution margin %<input type="number" min="0" max="90" step="1" className={input} value={form.targetMarginPercent} onChange={e=>setForm(v=>({...v,targetMarginPercent:e.target.value}))}/></label>
          {error&&<div className="mt-4"><Notice tone="danger" title="Calculation failed">{error}</Notice></div>}
          <Button type="submit" className="mt-5 w-full" disabled={busy}>{busy?"Calculating…":"Check the economics"}</Button>
          <p className="mt-4 text-[11px] leading-5 text-[#8994a2]">Lunavo adds its 1% platform fee to the calculation. Enter provider fees and ad costs when they are known.</p>
        </form>
        <section className="rounded-2xl border border-[#2c3948] bg-[#182333] p-6 md:p-8 text-[#f8f3e8]">
          {result?<div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Verdict</p><h2 className="mt-2 text-4xl font-extrabold">{result.economics.decision}</h2></div><Badge tone={result.economics.risk==="critical"||result.economics.risk==="high"?"danger":result.economics.decision==="SCALE"?"success":"warning"}>{result.economics.viabilityScore}/100</Badge></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[#223243] p-4"><CircleDollarSign className="h-4 w-4 text-[#d6aa46]"/><p className="mt-2 text-xs text-[#9da9b5]">Landed cost</p><p className="mt-1 font-mono text-xl font-black">{money((result.economics.landedCostMinor??0)/100,form.currency)}</p></div><div className="rounded-xl bg-[#223243] p-4"><TrendingUp className="h-4 w-4 text-[#d6aa46]"/><p className="mt-2 text-xs text-[#9da9b5]">Break-even CPA</p><p className="mt-1 font-mono text-xl font-black">{result.economics.breakEvenCpaMinor==null?"Unknown":money(result.economics.breakEvenCpaMinor/100,form.currency)}</p></div><div className="rounded-xl bg-[#223243] p-4"><ShieldCheck className="h-4 w-4 text-[#d6aa46]"/><p className="mt-2 text-xs text-[#9da9b5]">Margin</p><p className="mt-1 font-mono text-xl font-black">{result.economics.marginBpsBeforeAds==null?"Unknown":(result.economics.marginBpsBeforeAds/100).toFixed(1)+"%"}</p></div></div><div className="mt-6 rounded-xl border border-[#465568] bg-[#202e3d] p-5"><p className="text-xs font-black uppercase tracking-[.08em] text-[#d8e1e3]">Why</p><div className="mt-3 space-y-2">{result.economics.reasons.map((x,i)=><p key={i} className="text-sm leading-6 text-[#c0cad3]">{x}</p>)}</div></div><p className="mt-6 text-sm leading-7 text-[#b8c2cc]">{result.callToAction}</p><Link href="/sign-up" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#d6aa46] px-4 py-3 text-sm font-extrabold text-[#182333]">Put the decision into Lunavo <ArrowRight className="h-4 w-4"/></Link></div>:<div className="grid min-h-[520px] place-items-center text-center"><div><BrainCircuit className="mx-auto h-10 w-10 text-[#d6aa46]"/><h2 className="mt-5 text-2xl font-extrabold">No guessing. Just economics.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#b8c2cc]">Enter your actual product numbers and Lunavo will show exactly what the numbers support.</p><div className="mt-5 flex justify-center gap-3 text-xs text-[#9da9b5]"><span className="flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5"/>Cost</span><span className="flex items-center gap-1"><CircleDollarSign className="h-3.5 w-3.5"/>Margin</span><span className="flex items-center gap-1"><TriangleAlert className="h-3.5 w-3.5"/>Risk</span></div></div></div>}
        </section>
      </div>
    </div>
  </main>;
}
