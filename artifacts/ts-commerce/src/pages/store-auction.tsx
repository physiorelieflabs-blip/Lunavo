import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Gavel, ShieldCheck, Store, TrendingUp } from 'lucide-react';
import { Link, useRoute } from 'wouter';
import { customFetch } from '@workspace/api-client-react';
import { PublicHeader } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice } from '@/components/primitives';
import { money } from '@/lib/format';

type Auction = { id:number; name:string; asking_price:number; current_bid:number; currency:string; starts_at:string; ends_at:string; status:string; seller_description:string|null };
type Metric = { revenue_minor:number; verified_profit_minor:number; orders_count:number; customers_count:number; aov_minor:number; growth_percent:number; traffic_count:number; conversion_percent:number; expenses_minor:number; ad_spend_minor:number; ad_revenue_minor:number; store_age_days:number; inventory_units:number; valuation_indicator_minor:number; currency:string; captured_at:string };
type Bid = { amount:number; currency:string; created_at:string };

export default function StoreAuction() {
  const [, params] = useRoute('/store-auctions/:id');
  const id = Number(params?.id);
  const [data, setData] = useState<{ auction:Auction; verifiedMetrics:Metric[]; auctionHistory:Bid[] } | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!Number.isInteger(id) || id < 1) throw new Error('Invalid store auction');
    setData(await customFetch(`/api/public/store-auctions/${id}`, { responseType:'json' }));
  };
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : 'Store auction could not be loaded.')); }, [id]);
  const latest = data?.verifiedMetrics?.[0];
  const revenueHistory = useMemo(() => [...(data?.verifiedMetrics ?? [])].reverse().slice(-12), [data?.verifiedMetrics]);

  const bid = async (event:FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await customFetch(`/api/store-auctions/${id}/bids`, { method:'POST', body:JSON.stringify({ amount:Number(amount) }), responseType:'json' });
      setAmount(''); setMessage('Bid accepted by Lunavo. The auction trail has been refreshed.'); await load();
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Bid could not be submitted.'); }
    finally { setBusy(false); }
  };

  if (error) return <main className="min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader/><div className="mx-auto max-w-5xl px-5 py-10"><ErrorState onRetry={() => { setError(''); void load().catch(e => setError(e instanceof Error ? e.message : 'Store auction could not be loaded.')); }}/></div></main>;
  if (!data) return <main className="min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader/><div className="mx-auto max-w-5xl px-5 py-10"><LoadingState label="Loading verified store auction"/></div></main>;
  const { auction } = data;
  const current = Number(auction.current_bid || auction.asking_price);
  const maxRevenue = Math.max(1, ...revenueHistory.map(x => Number(x.revenue_minor || 0)));
  return <main className="min-h-[100dvh] bg-[#f5f1e8] text-[#182333]"><PublicHeader/><div className="mx-auto max-w-[1240px] px-5 pb-20 pt-8 md:px-10"><Link href="/auctions" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#a34c35]"><ArrowLeft className="h-4 w-4"/>Back to auctions</Link><section className="mt-6 overflow-hidden rounded-[2rem] bg-[#182333] p-7 text-[#f8f3e8] shadow-[0_22px_60px_rgba(24,35,51,.14)] md:p-10"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Verified store auction · #{auction.id}</p><h1 className="mt-3 text-4xl font-extrabold tracking-[-.07em] md:text-6xl">{auction.name}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#b9c3ce]">{auction.seller_description || 'Acquire an operating Lunavo store using verified internal performance records.'}</p></div><Badge tone="success">{auction.status}</Badge></div><div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#aeb9c5]">Current bid</p><p className="mt-2 font-mono text-3xl font-bold">{money(current, auction.currency)}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#aeb9c5]">Ends</p><p className="mt-2 text-sm font-bold">{new Date(auction.ends_at).toLocaleString()}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#aeb9c5]">Data policy</p><p className="mt-2 text-sm font-bold">Verified internal records</p></div></div></section>

<section className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[[TrendingUp,'Revenue',latest?money(Number(latest.revenue_minor)/100,latest.currency):'—'],[BarChart3,'Verified profit',latest?money(Number(latest.verified_profit_minor)/100,latest.currency):'—'],[Store,'Orders',latest?String(latest.orders_count):'—'],[Gavel,'Customers',latest?String(latest.customers_count):'—']].map(([Icon,label,value])=><div key={String(label)} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8eef3] text-[#315e6c]"><Icon className="h-5 w-5"/></span><p className="mt-4 text-xs font-bold text-[#697687]">{label}</p><p className="mt-1 font-mono text-2xl font-extrabold">{value}</p></div>)}</section>

<section className="mt-7 grid gap-7 lg:grid-cols-[1.25fr_.75fr]"><div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-[#c85d3f]"/><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#a2772e]">Verified performance</p><h2 className="font-extrabold">Revenue history</h2></div></div><div className="mt-7 flex h-48 items-end gap-2 border-b border-[#e3ddd2]">{revenueHistory.map((point,index)=><div key={`${point.captured_at}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><div title={money(Number(point.revenue_minor)/100,point.currency)} className="w-full rounded-t-md bg-[#315e6c]" style={{height:`${Math.max(5,Math.round(Number(point.revenue_minor)/maxRevenue*100))}%`}}/><span className="text-[8px] text-[#7b8795]">{new Date(point.captured_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div><p className="text-[10px] uppercase text-[#697687]">AOV</p><p className="mt-1 font-mono font-bold">{latest?money(Number(latest.aov_minor)/100,latest.currency):'—'}</p></div><div><p className="text-[10px] uppercase text-[#697687]">Ad spend</p><p className="mt-1 font-mono font-bold">{latest?money(Number(latest.ad_spend_minor)/100,latest.currency):'—'}</p></div><div><p className="text-[10px] uppercase text-[#697687]">Inventory</p><p className="mt-1 font-mono font-bold">{latest?latest.inventory_units:'—'}</p></div></div></div>

<aside className="space-y-5"><form onSubmit={bid} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#2f6958]"/><h2 className="font-extrabold">Place a store bid</h2></div><p className="mt-2 text-xs leading-5 text-[#697687]">Store acquisition bids are accepted only for authenticated merchant accounts and must beat the current accepted bid.</p><input required type="number" min={current+0.01} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-5 h-11 w-full rounded-xl border border-[#d5cdbd] bg-white px-3 font-mono text-sm" placeholder={String((current+0.01).toFixed(2))}/><Button disabled={busy || auction.status !== 'active'} className="mt-3 w-full"><Gavel className="h-4 w-4"/>{busy?'Submitting…':'Submit store bid'}</Button>{message&&<div className="mt-3"><Notice tone={message.startsWith('Bid accepted')?'success':'danger'} title="Auction update">{message}</Notice></div>}</form><div className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><h2 className="font-extrabold">Bid history</h2><div className="mt-4 space-y-3">{data.auctionHistory?.length?data.auctionHistory.slice(0,10).map((b,i)=><div key={`${b.created_at}-${i}`} className="flex items-center justify-between border-b border-[#eee9df] pb-3 last:border-0"><span className="text-xs text-[#697687]">{new Date(b.created_at).toLocaleString()}</span><b className="font-mono">{money(Number(b.amount),b.currency)}</b></div>):<p className="text-sm text-[#697687]">No accepted bids yet.</p>}</div></div></aside></section>

<section className="mt-7 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><h2 className="font-extrabold">Verified acquisition facts</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Store age',latest?`${latest.store_age_days} days`:'—'],['Growth',latest?`${latest.growth_percent}%`:'—'],['Conversion',latest?`${latest.conversion_percent}%`:'—'],['Valuation indicator',latest?money(Number(latest.valuation_indicator_minor)/100,latest.currency):'—']].map(([k,v])=><div key={k} className="rounded-xl bg-[#f5f1e8] p-4"><p className="text-[10px] uppercase text-[#697687]">{k}</p><p className="mt-1 font-mono font-bold">{v}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-[#697687]">Private customer identities, credentials and other restricted records are never exposed on the public auction page. Ownership transfers only after server-side payment verification.</p></section></div></main>;
}
