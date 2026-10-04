import { useState } from "react";
import { ArrowRight, Search, ShieldCheck, UsersRound, Truck, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge, Button, EmptyState, Notice, SectionHeading } from "@/components/primitives";

type Passport={passport:{score:number;confidence:string};independentMerchants:number;observations:number;qualityScore:number|null;trackingScore:number|null;defectRateBps:number|null;refundRateBps:number|null;etaMaxDays:number|null;privacy:string};

function pct(v:number|null){return v==null?"—":(v/100).toFixed(1)+"%";}

export default function SupplierReputation(){
  const [domain,setDomain]=useState("");
  const [result,setResult]=useState<Passport|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function lookup(e:any){
    e.preventDefault();setBusy(true);setError("");setResult(null);
    try{
      const value=domain.trim().toLowerCase();
      if(!/^[a-z0-9.-]+$/.test(value))throw new Error("Enter a supplier domain such as supplier.example");
      const r=await fetch("/api/public/supplier-intelligence/"+encodeURIComponent(value),{headers:{Accept:"application/json"}});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(String(b.error||"No public passport is available for this supplier yet."));
      setResult(b as Passport);
    }catch(err){setError(err instanceof Error?err.message:"Supplier passport lookup failed");}
    finally{setBusy(false);}
  }

  return <main className="min-h-[100dvh] bg-[#f5f1e8] px-5 py-8 text-[#182333]">
    <div className="mx-auto max-w-[1120px]">
      <header className="flex items-center justify-between gap-4"><Link href="/" className="font-mono text-xs font-black tracking-[.14em]">Lunavo</Link><Link href="/sign-up" className="rounded-lg bg-[#182333] px-4 py-2 text-xs font-extrabold text-[#f8f3e8]">Start selling <ArrowRight className="ml-1 inline h-3.5 w-3.5"/></Link></header>
      <section className="mt-16 max-w-4xl"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a2772e]">Lunavo Supplier Reputation Network</p><h1 className="mt-3 text-5xl font-extrabold tracking-[-.08em] md:text-7xl">Check supplier evidence before you risk your store.</h1><p className="mt-5 max-w-3xl text-base leading-8 text-[#697687]">Search a supplier domain and see an aggregate passport built from merchants who explicitly chose to contribute anonymized observations. A supplier does not receive a score from one anonymous complaint.</p></section>
      <form onSubmit={lookup} className="mt-8 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#8994a2]"/><input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="supplier.example" className="h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] pl-10 pr-4 text-sm outline-none focus:border-[#bca26a]" /></div><Button type="submit" disabled={busy}>{busy?"Checking…":"Check supplier"}</Button></form>
      {error&&<div className="mt-5"><Notice tone="danger" title="No public passport">{error}</Notice></div>}
      {result&&<section className="mt-8 grid gap-5 lg:grid-cols-[1fr_.75fr]">
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Aggregate passport</p><h2 className="mt-2 text-3xl font-extrabold">{domain}</h2></div><Badge tone={result.passport.score>=80?"success":result.passport.score>=60?"warning":"danger"}>{result.passport.score}/100</Badge></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-[#f3efe7] p-4"><UsersRound className="h-4 w-4 text-[#a2772e]"/><p className="mt-2 text-[10px] uppercase tracking-[.08em] text-[#778290]">Independent merchants</p><p className="mt-1 font-mono text-xl font-black">{result.independentMerchants}</p></div><div className="rounded-xl bg-[#f3efe7] p-4"><PackageCheck className="h-4 w-4 text-[#a2772e]"/><p className="mt-2 text-[10px] uppercase tracking-[.08em] text-[#778290]">Observations</p><p className="mt-1 font-mono text-xl font-black">{result.observations}</p></div><div className="rounded-xl bg-[#f3efe7] p-4"><ShieldCheck className="h-4 w-4 text-[#a2772e]"/><p className="mt-2 text-[10px] uppercase tracking-[.08em] text-[#778290]">Confidence</p><p className="mt-1 font-mono text-xl font-black">{result.passport.confidence}</p></div><div className="rounded-xl bg-[#f3efe7] p-4"><Truck className="h-4 w-4 text-[#a2772e]"/><p className="mt-2 text-[10px] uppercase tracking-[.08em] text-[#778290]">Max ETA evidence</p><p className="mt-1 font-mono text-xl font-black">{result.etaMaxDays==null?"—":result.etaMaxDays+"d"}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-[#8994a2]">Quality</p><p className="font-mono text-lg font-black">{result.qualityScore==null?"—":result.qualityScore+"/100"}</p></div><div><p className="text-xs text-[#8994a2]">Tracking</p><p className="font-mono text-lg font-black">{result.trackingScore==null?"—":result.trackingScore+"/100"}</p></div><div><p className="text-xs text-[#8994a2]">Refund rate</p><p className="font-mono text-lg font-black">{pct(result.refundRateBps)}</p></div></div></div>
        <div className="rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8]"><SectionHeading eyebrow="Privacy boundary" title="Evidence without exposure." description={result.privacy}/><p className="mt-6 text-sm leading-6 text-[#b8c2cc]">Lunavo does not publish merchant names, order IDs, revenue, customer data, private notes, or individual complaints through this network.</p></div>
      </section>}
      {!result&&!error&&<div className="mt-10"><EmptyState title="Search a supplier" description="Public passports appear only after at least three independent merchants have opted their observations into the network." /></div>}
    </div>
  </main>;
}
