import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArrowRight, BrainCircuit, Boxes, ChartNoAxesCombined, CheckCircle2, RefreshCw, ShieldCheck, ShoppingCart, Sparkles, UsersRound, Warehouse } from "lucide-react";
import { Link } from "wouter";

type Product = { id:number; title:string; stock:number|null; supplierStock?:number|null; inventoryKnown?:boolean; inventoryStrategy?:string; reservedUnits?:number; supplierStockRisk?:boolean; supplierFallbackScorecard?:{supplierName:string;score:number;recommendation:"preferred"|"watch"|"avoid";fulfillmentJobs:number;failureRate:number|null;onTimeRate:number|null}; supplierDataAgeHours?:number|null; supplierDataStale?:boolean; supplierSyncStatus?:string; supplierSyncEnabled?:boolean; marginBasis?:string; landedCostScenarios?:Array<{id:string;name:string;destinationCountry:string;currency:string;quantity:number;landedCostMinor:number;contributionMarginMinor:number;contributionMarginBps:number;createdAt:string|null;evidenceStatus:string}>; latestSupplierQuotes?:Array<{id:string;supplierName:string|null;destinationCountry:string;currency:string;quantity:number;status:string;quotedUnitPriceMinor:number|null;quotedShippingMinor:number|null;quotedTotalMinor:number|null;deliveryDays:number|null;expiresAt:string|null;expired:boolean;evidenceStatus:string}>; revenue30Minor?:number; sellingPriceMinor:number|null; landedCostMinor:number|null; grossMarginBps:number|null; sold30:number; trendFactor:number; projected30:number; reorderUnits:number; priorities:string[] };
type Customer = { id:number; name:string; orderCount:number; comparableOrderCount?:number; grossMinor:number; currencyCoverage?:string; currencies?:string[]; recencyDays:number|null; churnRiskBps:number; segment:string; nextBestAction:string; marketingEligible:boolean };
type Graph = { generatedAt:string; destinationCountry?:string|null; landedCostScope?:string; merchant:{storeName:string;currency:string}; products:Product[]; customers:Customer[]; summary:{productCount:number;customerCount:number;reorderCandidateCount:number;decliningProductCount:number;scaleWinnerCount:number;atRiskCustomerCount:number;supplierStockRiskCount?:number;landedCostScenarioCount?:number;supplierQuoteRequestCount?:number;activeSupplierQuoteCount?:number;supplierScorecardCount?:number;suppliersPreferredCount?:number;suppliersAvoidCount?:number;fulfillmentExceptionCount?:number;staleFulfillmentJobCount?:number;fulfillmentJobCount?:number;topProducts:Product[];reorderCandidates:Product[];supplierRiskProducts?:Product[];winners:Product[];atRiskCustomers:Customer[]}; graph:string[]; authorityRules:string[]; modernPlatformParity?:Array<{feature:string;status:string;connectedTo:string[]}>; intelligenceCapabilities?:string[]; decisionLoop?:string[] };
type Plan = { brain:{model:string;contributors:string[];roles:string[];consensus:string;content:string}; persisted:boolean; commandRun?:{id:string;created_at?:string}; replayed?:boolean };
type CommandHistory = { id:string; question:string; brain_model:string|null; contributors:unknown; roles:unknown; consensus:string; status:string; created_at:string; plan:unknown };

const currencyDigits=(currency:string)=>{try{return new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits;}catch{return 2;}};
const money=(minor:number|null,currency:string)=>{
  if(minor==null||!Number.isSafeInteger(minor))return "—";
  const digits=currencyDigits(currency);
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(minor/(10**digits));}
  catch{return currency+" "+(minor/(10**digits)).toFixed(digits);}
};
const pct=(bps:number|null)=>bps==null?"—":(bps/100).toFixed(1)+"%";
const tone=(items:string[])=>items.includes("reorder")?"border-amber-200 bg-amber-50":items.includes("scale_winner")?"border-emerald-200 bg-emerald-50":"border-border bg-card";

export default function DropshipIntelligence(){
  const [graph,setGraph]=useState<Graph|null>(null);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [recentRuns,setRecentRuns]=useState<CommandHistory[]>([]);
  const [selectedHistory,setSelectedHistory]=useState("");
  const [destinationCountry,setDestinationCountry]=useState("");
  const idempotencyRef=useRef<string|null>(null);

  const load=async()=>{
    setError("");
    const destination=destinationCountry.trim().toUpperCase();
    const query=/^[A-Z]{2}$/.test(destination)?"?destinationCountry="+encodeURIComponent(destination):"";
    const r=await fetch("/api/merchant/dropship/intelligence"+query,{credentials:"same-origin",headers:{Accept:"application/json"}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||"Could not load dropship intelligence");
    setGraph(data);
  };

  const loadRuns=async()=>{
    try{
      const r=await fetch("/api/merchant/dropship/commands/recent?limit=8",{credentials:"same-origin",headers:{Accept:"application/json"}});
      const data=await r.json().catch(()=>({}));
      if(r.ok&&Array.isArray(data.runs)) setRecentRuns(data.runs);
    }catch{/* history is supplementary; the operating graph must remain usable */}
  };

  useEffect(()=>{
    const normalized=destinationCountry.trim().toUpperCase();
    if(normalized.length===1||normalized.length>2)return;
    if(normalized && !/^[A-Z]{2}$/.test(normalized))return;
    void load().catch(e=>setError(e instanceof Error?e.message:"Could not load intelligence"));
  },[destinationCountry]);
  useEffect(()=>{void loadRuns();},[]);

  const run=async()=>{
    setBusy(true);
    setError("");
    try{
      const r=await fetch("/api/merchant/dropship/intelligence/run",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({question:"Find the highest-leverage connected actions across products, supplier routing, landed cost, demand, inventory, fulfillment, customers, marketing and automation. Keep all money, stock and publishing changes approval-gated.",destinationCountry:(/^[A-Z]{2}$/.test(destinationCountry.trim().toUpperCase())?destinationCountry.trim().toUpperCase():null),idempotencyKey:(idempotencyRef.current??(idempotencyRef.current=crypto.randomUUID()))})
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||"Could not run local intelligence");
      setPlan(data);
      setGraph(data.graph);
      idempotencyRef.current=null;
      await loadRuns();
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[.1em] text-white/70">
            Destination country (ISO code)
            <input
              value={destinationCountry}
              onChange={event=>{idempotencyRef.current=null;setDestinationCountry(event.target.value.replace(/[^a-z]/gi,"").slice(0,2).toUpperCase());}}
              maxLength={2}
              placeholder="NG"
              aria-label="Destination country ISO code"
              className="h-11 w-24 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
          <button onClick={()=>void run()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#12345a] disabled:opacity-60">
            <Sparkles className="h-4 w-4"/>{busy?"Thinking across the graph…":"Run max-consensus brain"}
          </button>
          <Link href="/dropship-workbench" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white hover:bg-white/10">Cost & supplier quotes →</Link>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/65">{graph.landedCostScope==="explicit_destination_and_store_currency" ? "Margin view is scoped to "+graph.destinationCountry+" using a unique matching saved scenario when available." : "Global view: destination-specific scenarios stay visible, but no single landed cost is selected until you choose a destination."}</p>
      {plan&&<div className="mt-6 rounded-2xl border border-white/10 bg-white/[.07] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BrainCircuit className="h-4 w-4"/>
          <span className="text-xs font-black">Ensemble coverage: {plan.brain.consensus.replaceAll("_"," ")}</span>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">{plan.brain.roles.length} specialist roles</span>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">{plan.brain.contributors.length} local model contributions</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/70">{plan.brain.content}</p>
      </div>}
    </section>

    {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {[
        ["Products",graph.summary.productCount,Boxes],
        ["Customers",graph.summary.customerCount,UsersRound],
        ["Reorder",graph.summary.reorderCandidateCount,Warehouse],
        ["Winners",graph.summary.scaleWinnerCount,ChartNoAxesCombined],
        ["Declining",graph.summary.decliningProductCount,ShoppingCart],
        ["At risk",graph.summary.atRiskCustomerCount,UsersRound],
        ["Supplier stock risks",graph.summary.supplierStockRiskCount??graph.summary.supplierRiskProducts?.length??0,Warehouse],
        ["Fulfillment exceptions",graph.summary.fulfillmentExceptionCount??0,RefreshCw],
        ["Stuck fulfillment",graph.summary.staleFulfillmentJobCount??0,Boxes],
        ["Landed-cost scenarios",graph.summary.landedCostScenarioCount??0,ShieldCheck],
        ["Supplier quote records",graph.summary.supplierQuoteRequestCount??0,ShoppingCart],
        ["Active supplier quotes",graph.summary.activeSupplierQuoteCount??0,ShieldCheck],
        ["Preferred suppliers",graph.summary.suppliersPreferredCount??0,CheckCircle2],
        ["Low-scoring suppliers",graph.summary.suppliersAvoidCount??0,ShieldCheck]
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
              <span className="rounded-full border border-border bg-white/70 px-2 py-1 text-[10px] font-black">{pct(p.grossMarginBps)} contribution</span>
            </div>
            <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-4">
              <div><span className="text-muted-foreground">Selling</span><p className="font-black">{money(p.sellingPriceMinor,graph.merchant.currency)}</p></div>
              <div><span className="text-muted-foreground">Landed cost (verified)</span><p className="font-black">{p.landedCostMinor==null?"Not evidenced":money(p.landedCostMinor,graph.merchant.currency)}</p></div>
              <div><span className="text-muted-foreground">Merchant stock</span><p className="font-black">{p.stock==null?"Unknown":p.stock} {p.reservedUnits?`(${p.reservedUnits} reserved)`:""}</p></div>
              <div><span className="text-muted-foreground">Reorder</span><p className="font-black">{p.reorderUnits||"—"}</p></div>
              <div><span className="text-muted-foreground">Supplier stock</span><p className="font-black">{p.supplierStock==null?"Unknown":p.supplierStock}</p></div>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{p.marginBasis??"Margin estimate may exclude logistics and other costs."}</p>
            {p.supplierFallbackScorecard&&<div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 p-2 text-[10px]"><span className="font-black">Fallback supplier signal</span><span>{p.supplierFallbackScorecard.supplierName}</span><span className="font-extrabold">{p.supplierFallbackScorecard.score}/100 · {p.supplierFallbackScorecard.recommendation}</span><span className="text-muted-foreground">{p.supplierFallbackScorecard.fulfillmentJobs} fulfillment jobs · {p.supplierFallbackScorecard.failureRate==null?"failure rate unknown":pct(Math.round(p.supplierFallbackScorecard.failureRate*100))+" failure"}</span><p className="w-full text-[9px] text-muted-foreground">Supplier history is advisory; small/no samples are not proof of reliability.</p></div>}
            <p className={"mt-1 text-[10px] font-bold "+(p.supplierDataStale?"text-amber-700":"text-muted-foreground")}>Supplier feed: {p.supplierSyncEnabled?p.supplierSyncStatus??"configured":"monitoring not configured"}{p.supplierDataAgeHours==null?" · observation time unknown":` · ${p.supplierDataAgeHours.toFixed(1)}h since last observation`}{p.supplierDataStale?" · stale/failed source data":""}</p>
            {p.landedCostScenarios?.length ? <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3"><p className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Destination landed-cost scenarios</p><div className="mt-2 flex flex-wrap gap-2">{p.landedCostScenarios.slice(0,2).map(s=><span key={s.id} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold">{s.destinationCountry} · {money(s.landedCostMinor,s.currency)} · {pct(s.contributionMarginBps)} margin</span>)}</div><p className="mt-2 text-[9px] leading-4 text-muted-foreground">{p.landedCostScenarios[0]?.evidenceStatus}</p></div>:<p className="mt-2 text-[10px] text-muted-foreground">No saved destination-specific landed-cost scenario for this product.</p>}
            {p.latestSupplierQuotes?.length ? <div className="mt-2 flex flex-wrap gap-2">{p.latestSupplierQuotes.slice(0,2).map(q=><span key={q.id} className="rounded-lg border border-border px-2 py-1 text-[10px]">{q.supplierName??"Supplier"} · {q.status} · {q.destinationCountry} · {q.quotedTotalMinor==null?"price pending":money(q.quotedTotalMinor,q.currency)}{q.expired?" · expired":""}</span>)}</div>:null}
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

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Persistent operating memory</p><h2 className="mt-1 text-xl font-black">Recent brain runs</h2></div>
        <button onClick={()=>void loadRuns()} className="rounded-xl border border-border px-3 py-2 text-xs font-black">Refresh history</button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {recentRuns.length===0?<p className="text-xs text-muted-foreground">No saved runs yet. Run the max-consensus brain to create an auditable advisory plan.</p>:recentRuns.map(run=>{
          const saved=run.plan&&typeof run.plan==="object"&&!Array.isArray(run.plan)?(run.plan as {content?:unknown}).content:null;
          const content=typeof saved==="string"?saved:"No saved plan text.";
          return <button key={run.id} onClick={()=>setSelectedHistory(content)} className="rounded-xl border border-border p-3 text-left hover:bg-muted/50">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase text-accent">{run.consensus} consensus</span><span className="text-[10px] text-muted-foreground">{new Date(run.created_at).toLocaleString()}</span></div>
            <p className="mt-2 text-xs font-extrabold">{run.question}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{run.brain_model??"Local model not recorded"} · {run.status}</p>
          </button>;
        })}
      </div>
      {selectedHistory&&<div className="mt-3 rounded-xl bg-muted/60 p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black">Saved recommendation</p><button onClick={()=>setSelectedHistory("")} className="text-xs font-bold">Close</button></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5">{selectedHistory}</p></div>}
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      {graph.graph.map((item,i)=><div key={item} className="rounded-2xl border border-border bg-card p-5">
        <p className="font-mono text-[10px] font-black text-accent">0{String(i+1)}</p>
        <p className="mt-2 text-sm font-extrabold">{item.split(" -> ")[0]}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.replaceAll(" -> "," → ")}</p>
      </div>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Modern dropship parity</p>
        <h2 className="mt-1 text-xl font-black">The platform pieces are connected</h2>
        <div className="mt-4 space-y-2">
          {(graph.modernPlatformParity ?? []).map(item => <div key={item.feature} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-3"><p className="text-xs font-extrabold">{item.feature}</p><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-black uppercase">{item.status.replaceAll("_"," ")}</span></div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{item.connectedTo.join(" → ")}</p>
          </div>)}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Decision loop</p>
        <h2 className="mt-1 text-xl font-black">One operating brain, many capabilities</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {(graph.decisionLoop ?? []).map((step,i) => <div key={step} className="rounded-xl bg-muted/60 p-3"><span className="font-mono text-[9px] font-black text-accent">0{i+1}</span><p className="mt-1 text-xs leading-5 font-semibold">{step.replaceAll(" -> "," → ")}</p></div>)}
        </div>
        <div className="mt-4 grid gap-2">
          {(graph.intelligenceCapabilities ?? []).slice(0,6).map(item => <p key={item} className="rounded-xl border border-border px-3 py-2 text-[10px] leading-4 text-muted-foreground">{item}</p>)}
        </div>
      </div>
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
