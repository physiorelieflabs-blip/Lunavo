import { useState } from 'react';
import { ArrowRight, BadgeCheck, Filter, Gavel, Search, ShoppingBag, Sparkles, Store } from 'lucide-react';
import { Link } from 'wouter';
import { useListMarketplaceProducts } from '@workspace/api-client-react';
import { PublicHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Marketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [submitted, setSubmitted] = useState<{ search: string; category: string; currency: string; minPrice?: number; maxPrice?: number }>({ search: '', category: '', currency: '' });
  const parsePrice = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; };
  const products = useListMarketplaceProducts(submitted);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted({
      search: search.trim(),
      category: category.trim(),
      currency: currency.trim().toUpperCase(),
      minPrice: parsePrice(minPrice),
      maxPrice: parsePrice(maxPrice),
    });
  };

  return <main className="min-h-[100dvh] bg-[#f5f1e8] text-[#182333]">
    <PublicHeader />
    <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-8 md:px-10">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#182333] px-6 py-12 text-[#f8f3e8] shadow-[0_20px_60px_rgba(24,35,51,.15)] md:px-12 md:py-16">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border-[54px] border-[#d6aa46]/20" />
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">TS commerce marketplace</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-[-.07em] md:text-6xl">Discover products from independent stores.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-[#b8c2cc] md:text-base">This is the TS Commerce General Store — a customer-facing discovery marketplace for products that merchants have actively promoted. A product appears here only after marketplace review, an active merchant participation subscription, and a verified $5 product advertising payment.</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-extrabold"><Link href="/auctions" className="inline-flex items-center gap-2 rounded-xl bg-[#d6aa46] px-4 py-2.5 text-[#182333] hover:bg-[#e0b95d]">Browse live auctions <ArrowRight className="h-4 w-4" /></Link></div>
        <form onSubmit={submit} className="mt-8 grid gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_120px_120px_120px_auto]">
          <label className="sr-only" htmlFor="market-search">Search products</label><div className="flex items-center gap-2 rounded-xl bg-[#fbfaf6] px-3 text-[#697687]"><Search className="h-4 w-4" /><input id="market-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[#182333] outline-none" /></div>
          <label className="sr-only" htmlFor="market-category">Category</label><input id="market-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" className="h-11 rounded-xl bg-[#fbfaf6] px-3 text-sm text-[#182333] outline-none" />
          <label className="sr-only" htmlFor="market-currency">Currency</label><input id="market-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} maxLength={3} placeholder="USD" className="h-11 rounded-xl bg-[#fbfaf6] px-3 text-sm uppercase text-[#182333] outline-none" />
          <label className="sr-only" htmlFor="market-min">Minimum price</label><input id="market-min" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="decimal" placeholder="Min price" className="h-11 rounded-xl bg-[#fbfaf6] px-3 text-sm text-[#182333] outline-none" />
          <label className="sr-only" htmlFor="market-max">Maximum price</label><input id="market-max" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" placeholder="Max price" className="h-11 rounded-xl bg-[#fbfaf6] px-3 text-sm text-[#182333] outline-none" />
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#d6aa46] px-5 text-sm font-extrabold text-[#182333] hover:bg-[#e0b95d]"><Filter className="h-4 w-4" />Search</button>
        </form>
      </section>
      <div className="mt-10 flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Open discovery</p><h2 className="mt-1 text-2xl font-extrabold tracking-[-.05em]">Featured products</h2></div><p className="text-xs text-[#697687]">{products.data?.length ?? 0} results</p></div>
      <div className="mt-5">{products.isLoading ? <LoadingState label="Loading shopper marketplace" /> : products.isError ? <ErrorState onRetry={() => void products.refetch()} /> : products.data?.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{products.data.map((product, index) => <article key={`${product.merchantKey}-${product.id}`} className="group overflow-hidden rounded-2xl border border-[#ded7ca] bg-[#fcfbf7] shadow-[0_10px_28px_rgba(24,35,51,.05)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(24,35,51,.11)]">{<div className="relative aspect-[4/3] overflow-hidden bg-[#eee8dc]">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" /> : <div className="grid h-full place-items-center text-[#85601b]"><ShoppingBag className="h-10 w-10" /></div>}<div className="absolute left-3 top-3 flex gap-2">{index < 3 && <span className="inline-flex items-center gap-1 rounded-full bg-[#182333]/90 px-2.5 py-1 text-[10px] font-extrabold text-[#f8f3e8]"><Sparkles className="h-3 w-3 text-[#d6aa46]" />Promoted</span>}<span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#315e6c]"><BadgeCheck className="h-3 w-3" />Paid placement</span></div></div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a6826]"><Store className="h-3 w-3" />{product.merchantName}</div><h3 className="mt-2 line-clamp-2 text-base font-extrabold leading-6">{product.title}</h3></div></div>{product.category && <p className="mt-1 text-xs text-[#697687]">{product.category}</p>}{product.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#78828e]">{product.description}</p>}<div className="mt-5 flex items-center justify-between gap-3"><p className="font-mono text-lg font-bold">{money(product.price, product.currency)}</p><Link href={`/checkout/${product.merchantKey}?productId=${product.id}`} className="inline-flex items-center gap-2 rounded-lg bg-[#182333] px-3 py-2 text-xs font-extrabold text-[#f8f3e8] hover:bg-[#2b3a4b]">View product <ArrowRight className="h-3.5 w-3.5" /></Link></div></div></article>)}</div> : <EmptyState title="No promoted products match your search" description="Try a different category, currency, or price range. Products enter the shopper marketplace only after merchant approval and verified marketplace advertising participation." />}</div>
      <div className="mt-12 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 text-sm text-[#697687]"><p className="font-extrabold text-[#182333]">How the shopper marketplace works</p><p className="mt-1 leading-6">The General Store is a public shopper destination, separate from merchant CRM customers. A product appears only after the merchant's listing is approved, the merchant's marketplace participation is active, and that product's $5 advertising fee has been verified. Paid placement is labeled clearly so shoppers know what they are seeing.</p><div className="mt-4 flex flex-wrap gap-4"><Link href="/sign-up" className="inline-flex items-center gap-2 font-extrabold text-[#8a6826] underline">Open a merchant workspace <ArrowRight className="h-4 w-4" /></Link><Link href="/auctions" className="inline-flex items-center gap-2 font-extrabold text-[#8a6826] underline">Explore auction demand <Gavel className="h-4 w-4" /></Link></div></div>
    </div>
  </main>;
}