import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, BarChart3, Boxes, CircleDollarSign, Search, Sparkles, Store, Target, TrendingUp } from "lucide-react";

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

export default function CommerceGrowth() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [message, setMessage] = useState("");
  const sources = useQuery({ queryKey: ["growth-sources"], queryFn: () => api("/growth/sourcing/sources") });
  const products = useQuery({ queryKey: ["growth-sourcing-products"], queryFn: () => api("/growth/sourcing/products") });
  const campaigns = useQuery({ queryKey: ["growth-campaigns"], queryFn: () => api("/growth/advertising/campaigns") });
  const opportunities = useQuery({ queryKey: ["growth-opportunities"], queryFn: () => api("/growth/opportunities") });
  const health = useQuery({ queryKey: ["growth-health"], queryFn: () => api("/growth/store-health") });

  const stats = useMemo(() => ({
    sources: sources.data?.sources?.length ?? 0,
    products: products.data?.products?.length ?? 0,
    campaigns: campaigns.data?.campaigns?.length ?? 0,
    opportunities: opportunities.data?.opportunities?.filter((item: any) => item.status === "open").length ?? 0,
  }), [sources.data, products.data, campaigns.data, opportunities.data]);

  async function addSource(event: React.FormEvent) {
    event.preventDefault(); setMessage("");
    try {
      await api("/growth/sourcing/sources", { method: "POST", body: JSON.stringify({ sourceUrl }) });
      setSourceUrl(""); setMessage("Source saved. Product extraction can now be run through the sourcing workflow.");
      await sources.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save source"); }
  }

  return <main className="min-h-[100dvh] bg-background px-5 py-8 text-foreground md:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-accent">TS / COMMERCE GROWTH OS</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-.06em]">Source, launch and grow from one control room.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Turn supplier links into reviewed products, paid marketplace exposure and evidence-backed growth actions. Payments remain server-verified and never get fabricated by the UI.</p></div>
        <Link href="/general-store" className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-extrabold text-background">Open General Store <ArrowRight className="h-4 w-4" /></Link>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{label:"Sourcing sources",value:stats.sources,icon:Search},{label:"Sourced products",value:stats.products,icon:Boxes},{label:"Growth campaigns",value:stats.campaigns,icon:Target},{label:"Open opportunities",value:stats.opportunities,icon:Sparkles}].map(({label,value,icon:Icon}) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-accent"/><p className="mt-4 text-3xl font-extrabold tracking-[-.05em]">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p></div>)}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl border border-border bg-card p-6 md:p-7">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10"><Search className="h-5 w-5 text-accent"/></span><div><h2 className="text-xl font-extrabold">Universal sourcing</h2><p className="mt-1 text-sm text-muted-foreground">Paste a legitimate supplier or product URL. No supplier API key is required.</p></div></div>
          <form onSubmit={addSource} className="mt-6 flex flex-col gap-3 sm:flex-row"><input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} required type="url" placeholder="https://supplier.example/product/..." className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-accent/20"/><button className="h-12 rounded-xl bg-foreground px-5 text-sm font-extrabold text-background">Add source</button></form>
          {message && <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm" role="status">{message}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">{["Extract product data","Review & normalize","Publish when ready"].map((step,i)=><div key={step} className="rounded-xl border border-border p-4"><span className="font-mono text-xs text-accent">0{i+1}</span><p className="mt-2 text-sm font-extrabold">{step}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Persistent workflow state; no silent supplier credentials.</p></div>)}</div>
        </div>
        <div className="rounded-3xl border border-border bg-foreground p-6 text-background md:p-7"><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-accent">Store Doctor</p><h2 className="mt-3 text-2xl font-extrabold tracking-[-.04em]">Know what needs fixing before customers do.</h2><div className="mt-6 flex items-end gap-3"><span className="text-6xl font-extrabold tracking-[-.08em]">{health.data?.health?.score ?? "—"}</span><span className="pb-2 text-sm text-background/60">/ 100 health score</span></div><p className="mt-4 text-sm leading-6 text-background/70">The health engine is designed to surface catalog quality, conversion, inventory, checkout and merchandising opportunities from real store data.</p></div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-3"><CircleDollarSign className="h-5 w-5 text-accent"/><h2 className="text-xl font-extrabold">General Store advertising</h2></div><p className="mt-2 text-sm text-muted-foreground">$5 per product creates paid-placement eligibility. It never creates a fake payment or guarantees ranking.</p><div className="mt-5 space-y-2">{(campaigns.data?.campaigns ?? []).slice(0,5).map((campaign:any)=><div key={campaign.id} className="flex items-center justify-between rounded-xl border border-border p-4"><div><p className="text-sm font-extrabold">Product #{campaign.productId}</p><p className="text-xs text-muted-foreground">Payment: {campaign.paymentStatus} · Placement: {campaign.status}</p></div><span className="text-xs font-bold">${(campaign.feeMinor/100).toFixed(2)}</span></div>)}{!campaigns.data?.campaigns?.length && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No advertising campaigns yet.</p>}</div></div>
        <div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-accent"/><h2 className="text-xl font-extrabold">Growth opportunities</h2></div><div className="mt-5 space-y-2">{(opportunities.data?.opportunities ?? []).slice(0,5).map((item:any)=><div key={item.id} className="rounded-xl border border-border p-4"><div className="flex justify-between gap-4"><p className="text-sm font-extrabold">{item.title}</p><span className="text-xs font-bold">{item.score ?? "—"}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.explanation}</p></div>)}{!opportunities.data?.opportunities?.length && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Your evidence-backed growth queue will appear here.</p>}</div></div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">{[{icon:Store,title:"One catalog, every channel",body:"Storefront, General Store, payment links, POS and embeddable commerce can share the same product truth."},{icon:BarChart3,title:"Profit-first intelligence",body:"Separate sales, discounts, shipping, provider fees, TS Commerce fees and merchant net instead of hiding economics."},{icon:Sparkles,title:"AI with guardrails",body:"AI can explain evidence and prepare actions; money movement, publication and sensitive operations remain approval-gated."}].map(({icon:Icon,title,body})=><div key={title} className="rounded-2xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-accent"/><h3 className="mt-4 font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></div>)}</section>
    </div>
  </main>;
}
