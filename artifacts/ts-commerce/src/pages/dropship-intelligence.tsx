import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArrowRight, BrainCircuit, Boxes, ChartNoAxesCombined, RefreshCw, ShieldCheck, ShoppingCart, Sparkles, UsersRound, Warehouse } from "lucide-react";
import { Link } from "wouter";

type Product = { id:number; title:string; stock:number|null; sellingPriceMinor:number|null; landedCostMinor:number|null; grossMarginBps:number|null; sold30:number; trendFactor:number; projected30:number; reorderUnits:number; priorities:string[] };
type Customer = { id:number; name:string; orderCount:number; grossMinor:number; recencyDays:number|null; churnRiskBps:number; segment:string; nextBestAction:string; marketingEligible:boolean };
type Graph = { generatedAt:string; merchant:{storeName:string;currency:string}; products:Product[]; customers:Customer[]; summary:{productCount:number;customerCount:number;reorderCandidateCount:number;decliningProductCount:number;scaleWinnerCount:number;atRiskCustomerCount:number;topProducts:Product[];reorderCandidates:Product[];winners:Product[];atRiskCustomers:Customer[]}; graph:string[]; authorityRules:string[] };
type Plan = { brain:{model:string;contributors:string[];roles:string[];consensus:string;content:string}; persisted:boolean };

const money=(minor:number|null,currency:string)=>minor==null?"—":new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(minor/100);
const pct=(bps:number|null)=>bps==null?"—":(bps/100).toFixed(1)+"%";
const tone=(items:string[])=>items.includes("reorder")?"border-amber-200 bg-amber-50":items.includes("scale_winner")?"border-emerald-200 bg-emerald-50":"border-border bg-card";

export default function DropshipIntelligence(){
  const [graph,setGraph]=useState<Graph|null>(null);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const load=async()=>{
    setError("");
    const r=await fetch("/api/merchant/dropship/intelligence",{credentials:"same-origin",headers:{Accept:"application/json"}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||"Could not load dropship intelligence");
    setGraph(data);
  };

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Could not load intelligence"));},[]);

  const run=async()=>{
    setBusy(true);
    setError("");
    try{
      const r=await fetch("/api/merchant/dropship/intelligence/run",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({question:"Find the highest-leverage connected actions across products, supplier routing, landed cost, demand, inventory, fulfillment, customers, marketing and automation. Keep all money, stock and publishing changes approval-gated."})
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||"Could not run local intelligence");
      setPlan(data);
      setGraph(data.graph);
    }catch(e){
      setError(e instanceof Error?e.message:"Local intelligence failed");
    }finally{
      setBusy(false);
    }
  };

  const top=useMemo(()=>graph?.summary.topProducts?.slice(0,6)??[],[graph]);

  if(!graph){
    return <AppShell><section className="py-20 text-center">{error?<><p className="text-sm font-bold text-destructive">{error}</p><button onClick={()=>void load()} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-bold">Retry</button></>:<p className="text-sm font-bold text-muted-foreground">Loading operating graph…</p>}</section></AppShell>;
  }

  return <AppShell><div className="space-y-6">
    <section className="overflow-hidden rounded-[24px] border border-[#173b68] bg-[#0c2747] p-6 text-white shadow-[0_22px_55px_rgba(12,39,71,.18)] sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#8fb8e8]">Lunavo operating graph</p>
          <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-[-.055em] sm:text-4xl">One brain for sourcing, pricing, inventory, fulfillment and growth.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Deterministic commerce signals are calculated first. Multiple self-hosted specialists then critique and synthesize the connected plan. Nothing here becomes money, stock or external-publishing authority by itself.</p>
        </div>
        <button onClick={()=>void run()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#12345a] disabled:opacity-60">
          <Sparkles className="h-4 w-4"/>{busy?"Thinking across the graph…":"Run max-consensus brain"}
        </button>
      </div>
      {plan&&<div className="mt-6 rounded-2xl border border-white/10 bg-white/[.07] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BrainCircuit className="h-4 w-4"/>
          <span className="text-xs font-black">Consensus: {plan.brain.consensus}</span>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">{plan.brain.roles.length} specialist roles</span>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">{plan.brain.contributors.length} local model contributions</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/70">{plan.brain.content}</p>
      </div>}
    </section>

    {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ["Products",graph.summary.productCount,Boxes],
        ["Customers",graph.summary.customerCount,UsersRound],
        ["Reorder",graph.summary.reorderCandidateCount,Warehouse],
        ["Winners",graph.summary.scaleWinnerCount,ChartNoAxesCombined],
        ["Declining",graph.summary.decliningProductCount,ShoppingCart],
        ["At risk",graph.summary.atRiskCustomerCount,UsersRound]
      ].map(([label,value,Icon])=><div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">{String(label)}</p><Icon className="h-4 w-4 text-accent"/></div>
        <p className="mt-3 text-2xl font-black">{String(value)}</p>
      </div>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Product intelligence</p><h2 className="mt-1 text-xl font-black">What deserves attention now</h2></div>
          <Link href="/sourcing" className="text-xs font-black text-accent">Open sourcing →</Link>
        </div>
        <div className="mt-4 grid gap-3">
          {top.map(p=><div key={p.id} className={"rounded-xl border p-4 "+tone(p.priorities)}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-extrabold">{p.title||("Product #"+p.id)}</p><p className="mt-1 text-xs text-muted-foreground">{p.sold30} units / 30d · {p.projected30.toFixed(1)} projected · trend {p.trendFactor.toFixed(2)}×</p></div>
              <span className="rounded-full border border-border bg-white/70 px-2 py-1 text-[10px] font-black">{pct(p.grossMarginBps)} margin</span>
            </div>
            <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-4">
              <div><span className="text-muted-foreground">Selling</span><p className="font-black">{money(p.sellingPriceMinor,graph.merchant.currency)}</p></div>
              <div><span className="text-muted-foreground">Landed</span><p className="font-black">{money(p.landedCostMinor,graph.merchant.currency)}</p></div>
              <div><span className="text-muted-foreground">Stock</span><p className="font-black">{p.stock==null?"Unknown":p.stock}</p></div>
              <div><span className="text-muted-foreground">Reorder</span><p className="font-black">{p.reorderUnits||"—"}</p></div>
            </div>
          </div>)}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Customer lifecycle</p>
        <h2 className="mt-1 text-xl font-black">Next-best actions</h2>
        <div className="mt-4 space-y-3">
          {graph.summary.atRiskCustomers.slice(0,6).map(c=><div key={c.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold">{c.name||("Customer #"+c.id)}</p><span className="text-[10px] font-black">{pct(c.churnRiskBps)} churn risk</span></div>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.segment} · {c.orderCount} orders · {money(c.grossMinor,graph.merchant.currency)}</p>
            <p className="mt-2 text-xs font-bold text-accent">{c.nextBestAction}{c.marketingEligible?" · marketing eligible":" · consent required"}</p>
          </div>)}
        </div>
        <Link href="/customers" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-accent">Open customer workspace <ArrowRight className="h-3 w-3"/></Link>
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      {graph.graph.map((item,i)=><div key={item} className="rounded-2xl border border-border bg-card p-5">
        <p className="font-mono text-[10px] font-black text-accent">0{String(i+1)}</p>
        <p className="mt-2 text-sm font-extrabold">{item.split(" -> ")[0]}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.replaceAll(" -> "," → ")}</p>
      </div>)}
    </section>

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent"/><h2 className="text-sm font-black">Authority boundaries</h2></div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{graph.authorityRules.map(rule=><p key={rule} className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">{rule}</p>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/autopilot" className="rounded-xl border border-border px-3 py-2 text-xs font-black">Configure Autopilot</Link>
        <Link href="/automations" className="rounded-xl border border-border px-3 py-2 text-xs font-black">Connect automation</Link>
        <button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black"><RefreshCw className="h-3 w-3"/>Refresh</button>
      </div>
    </section>
  </div></AppShell>;
}
