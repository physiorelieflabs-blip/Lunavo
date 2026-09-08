import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { ArrowRight, BrainCircuit, CheckCircle2, FlaskConical, LockKeyhole, Radar, Rocket, Search, ShieldCheck, Siren, Sparkles, Telescope, TimerReset, WandSparkles } from 'lucide-react';

const capabilities = [
  ['Commerce Time Machine','Replay decisions against historical business state.','observe'],
  ['Business Simulator','Test price, discount, supplier and inventory changes without production writes.','prepare'],
  ['Product Resurrection','Find dormant products with recoverable demand and prepare a comeback plan.','prepare'],
  ['Supplier Twin','Fingerprint supplier reliability from fulfillment history and exceptions.','observe'],
  ['Profit Firewall','Trace margin leakage before it becomes expensive.','observe'],
  ['Store Genome','Create a private fingerprint of catalog, conversion and retention patterns.','observe'],
  ['AI Store Surgeon','Diagnose storefront weaknesses and prepare reversible repairs.','prepare'],
  ['Research Swarm','Split research into local specialist jobs for demand, competition and economics.','prepare'],
  ['Commerce Radar','Watch for demand shifts, stock pressure and anomalous orders.','observe'],
  ['Customer Journey Simulator','Test checkout, retention and upsell paths using stored aggregates.','prepare'],
  ['Catalog Doctor','Find duplicate SKUs, missing attributes and inconsistent variants.','prepare'],
  ['Autonomous Incident Center','Correlate operational failures into a single recovery plan.','prepare'],
  ['Local AI Memory','Persist merchant-approved context in your own database.','observe'],
  ['Merchant Command Language','Turn plain-language goals into scoped, reviewable workflows.','approve'],
  ['One-Click Business Launch','Assemble a store blueprint, catalog structure and launch checklist.','prepare'],
  ['Digital Business Twin','Experiment against a private model before touching production.','observe'],
  ['Decision Replay','Explain evidence, assumptions and the chain behind recommendations.','observe'],
  ['Emergency Commerce Mode','Pause risky automation while preserving verified financial records.','approve'],
  ['Autonomous Merchandising Lab','Prepare collections, bundles and merchandising experiments.','approve'],
  ['Demand Gravity Map','Find demand concentration and emerging product clusters.','observe'],
  ['Margin Escape Room','Trace profit leaks across cost, shipping, discount, fees and refunds.','observe'],
  ['Failure Predictor','Detect patterns that precede stockouts, late fulfillment and exceptions.','observe'],
  ['Experiment Orchestrator','Design controlled experiments with metrics and rollback criteria.','prepare'],
  ['Business Autopilot','Coordinate approved local workflows behind risk gates.','approve'],
] as const;

export default function FrontierLab() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [simulation, setSimulation] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const filtered = useMemo(() => capabilities.filter(([name, text]) => `${name} ${text}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const selectedFeature = capabilities.find(([name]) => name === selected);

  return <AppShell><div className="mx-auto max-w-[1440px] space-y-7">
    <section className="overflow-hidden rounded-[28px] border border-border bg-primary p-6 text-primary-foreground md:p-9">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.16em] text-accent"><FlaskConical className="h-3.5 w-3.5"/> Frontier Lab · local-first</div><h1 className="mt-5 text-4xl font-black tracking-[-.07em] md:text-6xl">Make commerce<br/>borderline unfair.</h1><p className="mt-4 text-sm leading-7 text-white/65 md:text-base">A playground for the next generation of TS Commerce intelligence: prediction, simulation, business memory, operational defence and autonomous workflows — without making an external AI API the core of the product.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:w-[390px]"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/45">Frontier capabilities</p><p className="mt-2 text-3xl font-black">{capabilities.length}</p><p className="text-xs text-white/50">local-first designs</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/45">Money movement</p><p className="mt-2 font-black">Blocked here</p><p className="text-xs text-white/50">TS Pay controls financial state</p></div></div></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">Capability explorer</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Pick an impossible feature.</h2></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search frontier features" className="h-10 w-full rounded-xl border border-border bg-muted pl-9 pr-3 text-sm font-bold outline-none focus:border-accent"/></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(([name,text,risk])=><button type="button" key={name} onClick={()=>setSelected(name)} className="rounded-xl border border-border bg-muted/30 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent"><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent"><Sparkles className="h-4 w-4"/></span><span className="rounded-full bg-background px-2 py-1 text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">{risk}</span></div><p className="mt-4 text-sm font-black">{name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></button>)}</div></div>
      <aside className="rounded-2xl border border-border bg-muted/40 p-5">{selectedFeature ? <><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><BrainCircuit className="h-5 w-5"/></span><div><p className="font-black">{selectedFeature[0]}</p><p className="text-[10px] font-black uppercase tracking-[.1em] text-accent">{selectedFeature[2]} mode</p></div></div><p className="mt-5 text-sm leading-6 text-muted-foreground">{selectedFeature[1]}</p><div className="mt-5 space-y-2 text-xs"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent"/>Local-first capability</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent"/>No external AI key required</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent"/>No direct money movement</div></div></> : <div className="grid min-h-[220px] place-items-center text-center"><div><Radar className="mx-auto h-8 w-8 text-accent"/><p className="mt-4 font-black">Select a capability</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The lab will show its safety boundary and intended operating mode.</p></div></div>}</aside>
    </section>

    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-3"><TimerReset className="h-5 w-5 text-accent"/><p className="font-black">Decision Time Machine</p></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Compare a historical decision with an alternative path using persisted evidence.</p><button type="button" onClick={()=>setSimulation(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground"><Telescope className="h-4 w-4"/> Replay locally</button>{simulation&&<p className="mt-3 text-[11px] font-bold text-accent">Replay workspace prepared. No production data changed.</p>}</div>
      <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent"/><p className="font-black">Profit Firewall</p></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Trace potential margin leakage through landed cost, discounts, provider fees and refunds.</p><div className="mt-4 rounded-xl bg-muted p-3 text-[11px] font-bold">Observe → explain → prepare → approve</div></div>
      <div className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground"><div className="flex items-center gap-3"><Siren className="h-5 w-5 text-accent"/><p className="font-black">Emergency Commerce Mode</p></div><p className="mt-3 text-xs leading-5 text-white/60">A future server-enforced kill switch for risky automation. Payment evidence and ledger records remain intact.</p><button type="button" onClick={()=>setSafeMode(!safeMode)} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${safeMode?'bg-accent text-accent-foreground':'bg-white/10 text-white'}`}><LockKeyhole className="h-4 w-4"/>{safeMode?'Armed locally':'Arm local preview'}</button></div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Rocket className="h-5 w-5"/></span><div><p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-accent">Operating principle</p><h2 className="mt-1 text-xl font-black">AI can recommend. The platform decides.</h2></div></div><div className="mt-5 grid gap-3 md:grid-cols-4">{[['Observe','Read persisted evidence'],['Explain','Show evidence + assumptions'],['Prepare','Create reversible work'],['Approve','Apply through owning workflow']].map(([a,b])=><div key={a} className="rounded-xl border border-border p-4"><p className="font-black">{a}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{b}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-muted-foreground">Flutterwave remains the external payment rail for actual regulated payment processing; it is not the intelligence layer or source of truth for TS Pay.</p></section>
  </div></AppShell>;
}
