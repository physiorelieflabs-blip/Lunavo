import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Bookmark, Check, Filter, Gavel, Heart, Search, ShoppingBag, Sparkles, Store, X } from 'lucide-react';
import { Link } from 'wouter';
import { PublicHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/primitives';
import { money } from '@/lib/format';
import { customFetch } from '@workspace/api-client-react';

type ShopProduct = {
  id: number;
  merchantKey: string | null;
  merchantName: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  currency: string;
  category: string | null;
  brand: string | null;
  availability: string | null;
  availabilityQuantity: number | null;
  sponsored: boolean;
  storeUrl: string | null;
  productUrl: string | null;
};

type DiscoveryResponse = { products: ShopProduct[]; categories: string[]; generatedAt: string };
type ConciergeResponse = { summary: string; recommendations: Array<ShopProduct & { reason: string }>; model: string };

export default function Marketplace() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState<'featured' | 'price-low' | 'price-high'>('featured');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState<number[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('lunavo-saved-products') ?? '[]'); } catch { return []; }
  });
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeQuery, setConciergeQuery] = useState('');
  const [concierge, setConcierge] = useState<ConciergeResponse | null>(null);
  const [conciergeBusy, setConciergeBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    window.localStorage.setItem('lunavo-saved-products', JSON.stringify(savedIds));
  }, [savedIds]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (category) params.set('category', category);
      if (currency.trim()) params.set('currency', currency.trim().toUpperCase());
      if (minPrice && Number.isFinite(Number(minPrice))) params.set('minPrice', String(Number(minPrice)));
      if (maxPrice && Number.isFinite(Number(maxPrice))) params.set('maxPrice', String(Number(maxPrice)));
      params.set('limit', '60');
      const result = await customFetch<DiscoveryResponse>(`/api/shop/discovery?${params.toString()}`, { responseType: 'json' });
      setProducts(result.products);
      setCategories(result.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Lunavo shopper marketplace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const displayed = useMemo(() => {
    const copy = [...products];
    if (sort === 'price-low') copy.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') copy.sort((a, b) => b.price - a.price);
    return copy;
  }, [products, sort]);

  const toggleSaved = (id: number) => {
    setSavedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const runConcierge = async () => {
    if (conciergeQuery.trim().length < 3) return;
    setConciergeBusy(true);
    try {
      const result = await customFetch<ConciergeResponse>('/api/shop/ai-concierge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: conciergeQuery.trim() }),
        responseType: 'json',
      });
      setConcierge(result);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The shopping concierge is temporarily unavailable.');
    } finally {
      setConciergeBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f5f1e8] text-[#182333]">
      <PublicHeader />
      <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-6 md:px-8 md:pt-8">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#182333] px-6 py-9 text-[#f8f3e8] shadow-[0_24px_70px_rgba(24,35,51,.16)] md:px-10 md:py-12">
          <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full border-[70px] border-[#d6aa46]/15" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#d6aa46]"><ShoppingBag className="h-3.5 w-3.5" /> Lunavo · shopper marketplace</div>
              <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-[-.07em] md:text-6xl">A serious place to discover independent commerce.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#bdc7d1] md:text-base">The General Store is the public shopper experience—not a merchant CRM. Products shown here are paid marketplace placements from active merchants and are clearly labeled as promoted.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setConciergeOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-[#d6aa46] px-4 py-2.5 text-sm font-extrabold text-[#182333] hover:bg-[#e2bd68]"><Sparkles className="h-4 w-4" /> Ask the shopping AI</button>
                <Link href="/auctions" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-extrabold text-[#f8f3e8] hover:bg-white/10"><Gavel className="h-4 w-4" /> Live auctions</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d6aa46]/15 text-[#d6aa46]"><BadgeCheck className="h-5 w-5" /></span><div><p className="text-sm font-extrabold">Paid discovery, clearly disclosed</p><p className="mt-1 text-xs leading-5 text-[#adb8c4]">Merchants pay for placement. Shoppers still control what they buy.</p></div></div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center"><div><p className="font-mono text-xl font-extrabold">{products.length}</p><p className="text-[10px] uppercase tracking-[.1em] text-[#8f9baa]">Visible now</p></div><div><p className="font-mono text-xl font-extrabold">{categories.length}</p><p className="text-[10px] uppercase tracking-[.1em] text-[#8f9baa]">Categories</p></div><div><p className="font-mono text-xl font-extrabold">{savedIds.length}</p><p className="text-[10px] uppercase tracking-[.1em] text-[#8f9baa]">Saved</p></div></div>
            </div>
          </div>
          {conciergeOpen && <div className="relative z-10 mt-7 rounded-2xl border border-[#596677] bg-[#223247] p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.15em] text-[#d6aa46]">Shopping concierge</p>
            <p className="mt-2 text-sm text-[#c6ced6]">Describe a need, budget, style, or recipient. The AI can only recommend products that are actually in the current paid-discovery catalog.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={conciergeQuery} onChange={(e) => setConciergeQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runConcierge(); }} className="h-11 flex-1 rounded-xl border border-[#536174] bg-[#182333] px-3 text-sm text-[#f8f3e8] outline-none placeholder:text-[#8f9baa] focus:border-[#d6aa46]" placeholder="e.g. I need a minimalist gift under ₦50,000" /><button type="button" onClick={() => void runConcierge()} disabled={conciergeBusy || conciergeQuery.trim().length < 3} className="h-11 rounded-xl bg-[#d6aa46] px-5 text-sm font-extrabold text-[#182333] disabled:opacity-50">{conciergeBusy ? 'Thinking…' : 'Recommend'}</button></div>
            {concierge && <div className="mt-5 rounded-xl border border-[#536174] bg-[#182333] p-4"><p className="text-sm leading-6 text-[#dce3e9]">{concierge.summary}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{concierge.recommendations.map((product) => <div key={product.id} className="rounded-xl border border-[#3e4d5e] bg-[#223247] p-3"><p className="text-[10px] uppercase tracking-[.1em] text-[#8f9baa]">{product.merchantName}</p><p className="mt-1 font-extrabold">{product.title}</p><p className="mt-2 font-mono text-sm font-bold text-[#d6aa46]">{money(product.price, product.currency)}</p><p className="mt-2 text-xs leading-5 text-[#aeb9c4]">{product.reason}</p>{product.productUrl && <Link href={product.productUrl} className="mt-3 inline-flex text-xs font-extrabold text-[#f8f3e8] underline">View product <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>}</div>)}</div></div>}
          </div>}
        </section>

        {notice && <div className="mt-5"><Notice tone="danger" title="Shopping AI update"><div className="flex items-start justify-between gap-3">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><X className="h-4 w-4" /></button></div></Notice></div>}

        <section className="mt-8 rounded-2xl border border-[#ddd5c8] bg-[#fcfbf7] p-4 shadow-[0_8px_24px_rgba(24,35,51,.04)] md:p-5">
          <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="grid gap-3 lg:grid-cols-[1.5fr_1fr_110px_120px_120px_auto]">
            <div className="flex items-center gap-2 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3"><Search className="h-4 w-4 text-[#7d8792]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search the marketplace" /></div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none"><option value="">All categories</option>{categories.map((item) => <option key={item ?? 'uncategorized'} value={item ?? ''}>{item}</option>)}</select>
            <input value={currency} onChange={(event) => setCurrency(event.target.value)} maxLength={3} className="h-11 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm uppercase outline-none" placeholder="USD" />
            <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="decimal" className="h-11 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none" placeholder="Min" />
            <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" className="h-11 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none" placeholder="Max" />
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#182333] px-5 text-sm font-extrabold text-[#f8f3e8] hover:bg-[#2b3a4b]"><Filter className="h-4 w-4" />Apply</button>
          </form>
        </section>

        <div className="mt-9 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Paid discovery feed</p><h2 className="mt-1 text-2xl font-extrabold tracking-[-.05em]">Products shoppers can actually buy</h2><p className="mt-2 text-sm text-[#697687]">{displayed.length} currently eligible placement{displayed.length === 1 ? '' : 's'}</p></div><div className="flex items-center gap-2"><label htmlFor="shop-sort" className="text-xs font-bold uppercase tracking-[.1em] text-[#7d8792]">Sort</label><select id="shop-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-lg border border-[#d9d2c4] bg-[#fcfbf7] px-3 text-xs font-bold outline-none"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div></div>

        <div className="mt-5">{loading ? <LoadingState label="Loading paid discovery marketplace" /> : error ? <ErrorState onRetry={() => void load()} /> : displayed.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{displayed.map((product, index) => <article key={product.id} className="group relative overflow-hidden rounded-2xl border border-[#ddd5c8] bg-[#fcfbf7] shadow-[0_10px_28px_rgba(24,35,51,.045)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(24,35,51,.10)]"><div className="relative aspect-[4/3] overflow-hidden bg-[#eee8dc]">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" /> : <div className="grid h-full place-items-center text-[#85601b]"><ShoppingBag className="h-10 w-10" /></div>}<div className="absolute left-3 top-3 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-[#182333]/90 px-2.5 py-1 text-[10px] font-extrabold text-[#f8f3e8]"><Sparkles className="h-3 w-3 text-[#d6aa46]" />Promoted</span><span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#315e6c]"><BadgeCheck className="h-3 w-3" />Paid placement</span></div><button type="button" onClick={() => toggleSaved(product.id)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#56616d] shadow-sm hover:text-[#b14f36]" aria-label={savedIds.includes(product.id) ? 'Remove saved product' : 'Save product'}>{savedIds.includes(product.id) ? <Heart className="h-4 w-4 fill-current text-[#b14f36]" /> : <Bookmark className="h-4 w-4" />}</button></div><div className="p-5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a6826]"><Store className="h-3 w-3" />{product.merchantName}</div><h3 className="mt-2 line-clamp-2 text-base font-extrabold leading-6">{product.title}</h3></div></div>{product.category && <p className="mt-1 text-xs text-[#697687]">{product.category}</p>}{product.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#78828e]">{product.description}</p>}<div className="mt-5 flex items-end justify-between gap-3"><div><p className="font-mono text-lg font-bold">{money(product.price, product.currency)}</p><p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#7d8792]">{product.availability ?? 'Availability shown at checkout'}</p></div>{product.productUrl ? <Link href={product.productUrl} className="inline-flex items-center gap-2 rounded-lg bg-[#182333] px-3 py-2 text-xs font-extrabold text-[#f8f3e8] hover:bg-[#2b3a4b]">Shop <ArrowRight className="h-3.5 w-3.5" /></Link> : null}</div></div></article>)}</div> : <EmptyState title="No promoted products match" description="Try another search or filter. Public discovery is intentionally restricted to eligible, approved, paid placements." />}</div>

        <section className="mt-12 grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-[#d9d2c4] bg-[#fcfbf7] p-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">01 · Transparency</p><h3 className="mt-2 font-extrabold">Ads are labeled.</h3><p className="mt-2 text-sm leading-6 text-[#697687]">Paid placement affects discovery visibility. It does not turn an unapproved product into a trustworthy product.</p></div><div className="rounded-2xl border border-[#d9d2c4] bg-[#fcfbf7] p-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">02 · Commerce</p><h3 className="mt-2 font-extrabold">Checkout stays merchant-specific.</h3><p className="mt-2 text-sm leading-6 text-[#697687]">Shopper orders remain associated with the actual merchant/store and flow through Lunavo Pay's verified payment path.</p></div><div className="rounded-2xl border border-[#d9d2c4] bg-[#fcfbf7] p-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">03 · Intelligence</p><h3 className="mt-2 font-extrabold">AI recommends real inventory.</h3><p className="mt-2 text-sm leading-6 text-[#697687]">The shopping concierge can reason over the live eligible catalog without inventing products, prices, or seller claims.</p></div></section>
      </div>
    </main>
  );
}
