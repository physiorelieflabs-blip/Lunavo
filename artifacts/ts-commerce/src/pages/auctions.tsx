import { useState } from 'react';
import { ArrowLeft, Gavel, Mail, Search, ShieldCheck, Timer } from 'lucide-react';
import { Link, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { type AuctionSummary, getGetAuctionQueryKey, getListAuctionsQueryKey, useGetAuction, useListAuctions, usePlaceAuctionBid } from '@workspace/api-client-react';
import { PublicHeader } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@/components/primitives';
import { money } from '@/lib/format';

const inputClass = 'h-11 w-full rounded-xl border border-[#d5cdbd] bg-[#fbfaf6] px-3 text-sm text-[#182333] outline-none transition focus:border-[#c85d3f] focus:ring-2 focus:ring-[#c85d3f]/15';

export default function Auctions() {
  const [, params] = useRoute('/auctions/:id');
  return params?.id ? <AuctionDetail id={Number(params.id)} /> : <AuctionDiscovery />;
}

function AuctionDiscovery() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const auctions = useListAuctions({ search: submitted || undefined });
  return <main className="min-h-[100dvh] bg-[#f5f1e8] text-[#182333]">
    <PublicHeader />
    <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-8 md:px-10">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#182333] px-6 py-12 text-[#f8f3e8] shadow-[0_20px_60px_rgba(24,35,51,.15)] md:px-12 md:py-16">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[48px] border-[#d6aa46]/20" />
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Lunavo · live auctions</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-[-.07em] md:text-6xl">Bid on remarkable products from independent stores.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-[#b8c2cc] md:text-base">Explore Lunavo auctions with clear closing times, protected bid handling, and a visible bid trail.</p>
        <form onSubmit={(event) => { event.preventDefault(); setSubmitted(search.trim()); }} className="mt-8 flex max-w-2xl gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
          <label className="sr-only" htmlFor="auction-search">Search auctions</label>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#fbfaf6] px-3 text-[#697687]"><Search className="h-4 w-4" /><input id="auction-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search live auctions" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[#182333] outline-none" /></div>
          <Button type="submit" className="min-w-[118px] shrink-0 whitespace-nowrap bg-[#d6aa46] text-[#182333] shadow-none hover:bg-[#e0b95d]">Find auctions</Button>
        </form>
      </section>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Open bidding</p><h2 className="mt-1 text-2xl font-extrabold tracking-[-.05em]">Live auctions</h2></div>
        <Link href="/general-store" className="text-sm font-extrabold text-[#a34c35] underline underline-offset-4">Browse the General Store</Link>
      </div>
      <div className="mt-5">{auctions.isLoading ? <LoadingState label="Loading auctions" /> : auctions.isError ? <ErrorState onRetry={() => void auctions.refetch()} /> : auctions.data?.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{auctions.data.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div> : <EmptyState title="No live auctions yet" description="Merchants can publish an auction from a published product. Check back soon or browse the General Store." />}</div>
    </div>
  </main>;
}

function AuctionCard({ auction }: { auction: AuctionSummary }) {
  return <Link href={`/auctions/${auction.id}`} className="group block overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] shadow-[0_10px_25px_rgba(31,39,48,.04)] transition hover:-translate-y-1 hover:border-[#c85d3f]">
    <div className="aspect-[4/3] bg-[#e9e3d8]">{auction.imageUrl ? <img src={auction.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-[#697687]"><Gavel className="h-10 w-10" /></div>}</div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#a2772e]">{auction.merchantName}</p><h3 className="mt-1 font-extrabold">{auction.title}</h3></div><Badge tone="success">Live</Badge></div><div className="mt-5 grid grid-cols-2 gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#697687]">Current bid</p><p className="mt-1 font-mono text-lg font-bold">{auction.currentBid === null ? money(auction.startingPrice, auction.currency) : money(auction.currentBid, auction.currency)}</p></div><div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#697687]">Closes</p><p className="mt-1 text-sm font-bold">{new Date(auction.endsAt).toLocaleDateString()}</p></div></div></div>
  </Link>;
}

function AuctionDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const auction = useGetAuction(id);
  const placeBid = usePlaceAuctionBid();
  const [form, setForm] = useState({ bidderName: '', bidderEmail: '', amount: '' });
  if (auction.isLoading) return <main className="min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader /><div className="mx-auto max-w-[1240px] px-5 py-10"><LoadingState label="Loading auction" /></div></main>;
  if (auction.isError || !auction.data) return <main className="min-h-[100dvh] bg-[#f5f1e8]"><PublicHeader /><div className="mx-auto max-w-[1240px] px-5 py-10"><ErrorState onRetry={() => void auction.refetch()} /></div></main>;
  const item = auction.data;
  const minimum = item.currentBid === null ? item.startingPrice : item.currentBid;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    placeBid.mutate({ id, data: { bidderName: form.bidderName, bidderEmail: form.bidderEmail, amount: Number(form.amount) } }, {
      onSuccess: () => {
        setForm((current) => ({ ...current, amount: '' }));
        void queryClient.invalidateQueries({ queryKey: getGetAuctionQueryKey(id) });
        void queryClient.invalidateQueries({ queryKey: getListAuctionsQueryKey() });
      },
    });
  };
  return <main className="min-h-[100dvh] bg-[#f5f1e8] text-[#182333]"><PublicHeader /><div className="mx-auto max-w-[1120px] px-5 pb-20 pt-8 md:px-10"><Link href="/auctions" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#a34c35]"><ArrowLeft className="h-4 w-4" />Back to auctions</Link><div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_.9fr]"><section className="overflow-hidden rounded-[2rem] border border-[#d9d2c4] bg-[#fbfaf6]"><div className="aspect-[4/3] max-h-[520px] bg-[#e9e3d8]">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#697687]"><Gavel className="h-16 w-16" /></div>}</div><div className="p-6 md:p-8"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">{item.merchantName} · Auction #{item.id}</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-.06em] md:text-5xl">{item.title}</h1><p className="mt-4 text-sm leading-7 text-[#536174]">{item.description || 'A carefully selected product offered through the Lunavo marketplace.'}</p><div className="mt-7 flex flex-wrap gap-3"><Badge tone={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Badge><span className="inline-flex items-center gap-2 text-sm font-bold text-[#536174]"><Timer className="h-4 w-4 text-[#c85d3f]" />Closes {new Date(item.endsAt).toLocaleString()}</span></div></div></section><aside className="space-y-5"><section className="rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8]"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#b8c2cc]">Current bid</p><p className="mt-2 font-mono text-4xl font-bold">{item.currentBid === null ? money(item.startingPrice, item.currency) : money(item.currentBid, item.currency)}</p><p className="mt-2 text-xs text-[#b8c2cc]">{item.bidCount} bid{item.bidCount === 1 ? '' : 's'} · minimum next bid {money(minimum + 0.01, item.currency)}</p></section><form onSubmit={submit} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><div className="flex items-center gap-2"><Gavel className="h-5 w-5 text-[#c85d3f]" /><h2 className="font-extrabold">Place your bid</h2></div><p className="mt-2 text-xs leading-5 text-[#697687]">Your bid is protected by Lunavo's auction integrity controls and recorded for the auction trail.</p><div className="mt-5 space-y-3"><input required minLength={2} value={form.bidderName} onChange={(event) => setForm({ ...form, bidderName: event.target.value })} placeholder="Your name" className={inputClass} /><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#697687]" /><input required type="email" value={form.bidderEmail} onChange={(event) => setForm({ ...form, bidderEmail: event.target.value })} placeholder="Email for auction updates" className={`${inputClass} pl-10`} /></div><input required type="number" min={minimum + 0.01} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder={`At least ${money(minimum + 0.01, item.currency)}`} className={inputClass} /></div>{placeBid.isError && <p className="mt-3 text-xs font-bold text-[#a33e38]">{(placeBid.error as Error)?.message || 'That bid was not accepted. Try a higher amount.'}</p>}{placeBid.isSuccess && <p className="mt-3 text-xs font-bold text-[#2f6958]">Bid accepted. You are currently in the live bid trail.</p>}<Button type="submit" disabled={placeBid.isPending || item.status !== 'active'} className="mt-5 w-full"><ShieldCheck className="h-4 w-4" />{placeBid.isPending ? 'Submitting…' : 'Submit bid'}</Button></form><section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><h2 className="font-extrabold">Bid trail</h2><div className="mt-4 space-y-3">{item.bids.length ? item.bids.map((bid) => <div key={bid.id} className="flex items-center justify-between gap-3 border-b border-[#eee9df] pb-3 last:border-0 last:pb-0"><div><p className="text-sm font-bold">{bid.bidderName}</p><p className="text-xs text-[#697687]">{new Date(bid.createdAt).toLocaleString()}</p></div><p className="font-mono font-bold">{money(bid.amount, item.currency)}</p></div>) : <p className="text-sm text-[#697687]">No bids yet. Be the first to set the pace.</p>}</div></section></aside></div></div></main>;
}