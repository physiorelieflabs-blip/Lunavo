import { useState } from 'react';
import { Copy, ExternalLink, RefreshCw, Store } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { getListSupplierProductsQueryKey, useImportSupplierProduct, useListSupplierProducts } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Suppliers() {
  const products = useListSupplierProducts();
  const importProduct = useImportSupplierProduct();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [sourceUrl, setSourceUrl] = useState('');
  const [supplierUrl, setSupplierUrl] = useState('');
  const [profitType, setProfitType] = useState<'fixed' | 'percentage'>('fixed');
  const [profitValue, setProfitValue] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [message, setMessage] = useState('');
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const checkoutUrl = user ? `${window.location.origin}${basePath}/checkout/${user.id}` : '';

  if (products.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (products.isError || !products.data) return <AppShell><ErrorState onRetry={() => void products.refetch()} /></AppShell>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    importProduct.mutate({ data: { sourceUrl, supplierUrl, profitType, profitValue: Number(profitValue), costPrice: costPrice ? Number(costPrice) : undefined } }, {
      onSuccess: (product) => {
        setMessage(`Imported “${product.title}” and priced it for ${product.sellingPrice === null ? 'catalog review' : 'your checkout'}.`);
        setSourceUrl('');
        setSupplierUrl('');
        setProfitValue('');
        setCostPrice('');
        void queryClient.invalidateQueries({ queryKey: getListSupplierProductsQueryKey() });
      },
      onError: () => setMessage('This page could not be imported. It may require login, block automated access, or not expose public product metadata.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Public supplier links</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Bring in a product by pasting its link.</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#697687]">No API key is needed. TS Commerce reads public product metadata and keeps the imported record in your internal catalog. Private, login-only, or blocked pages are reported clearly instead of being guessed.</p>
      {message && <div className="mt-7"><Notice tone={message.startsWith('This page') ? 'danger' : 'success'} title={message.startsWith('This page') ? 'Import not completed' : 'Supplier catalog updated'}>{message}</Notice></div>}
      {checkoutUrl && <section className="mt-8 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">Your checkout link</p><h2 className="mt-1 text-xl font-extrabold">Share your public storefront</h2><p className="mt-1 text-sm text-[#315e6c]">Customers can place orders here. You confirm payment before fulfillment.</p></div><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(checkoutUrl); setMessage('Checkout link copied.'); }}><Copy className="h-4 w-4" />Copy link</Button></div><p className="mt-4 break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-[#315e6c]">{checkoutUrl}</p></section>}
      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
        <SectionHeading eyebrow="Import public product" title="Add supplier inventory" description="Paste the product link, the supplier/store link, and your profit rule. No supplier API key is needed." />
        <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">Product page URL<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://supplier.example/product/..." className="mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]" /></label>
          <label className="text-sm font-bold">Supplier/store URL<input type="url" value={supplierUrl} onChange={(event) => setSupplierUrl(event.target.value)} required placeholder="https://supplier.example" className="mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]" /></label>
          <label className="text-sm font-bold">Profit rule<select value={profitType} onChange={(event) => setProfitType(event.target.value as 'fixed' | 'percentage')} className="mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 text-sm text-[#f8f3e8] outline-none focus:border-[#d6aa46]"><option value="fixed">Fixed amount</option><option value="percentage">Percentage markup</option></select></label>
          <label className="text-sm font-bold">Cost override <span className="font-normal text-[#aab6c2]">(optional)</span><input type="number" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} min="0.01" step="0.01" placeholder="Use page price" className="mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 font-mono text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]" /></label>
          <label className="text-sm font-bold">{profitType === 'fixed' ? 'Profit amount' : 'Markup percentage'}<input type="number" value={profitValue} onChange={(event) => setProfitValue(event.target.value)} required min="0" step="0.01" placeholder={profitType === 'fixed' ? '15.00' : '25'} className="mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 font-mono text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]" /></label>
          <div className="md:col-span-2"><SubmitButton loading={importProduct.isPending}>Import and price product</SubmitButton></div>
        </form>
      </section>
      <section className="mt-8">
        <SectionHeading eyebrow="Your catalog references" title="Imported supplier products" action={<Button variant="ghost" onClick={() => void products.refetch()} aria-label="Refresh supplier products"><RefreshCw className="h-4 w-4" />Refresh</Button>} />
        {products.data.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.data.map((product) => <article key={product.id} className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="h-40 bg-[#eee9df]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#a2772e]"><Store className="h-8 w-8" /></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#a2772e]">{product.sourceDomain}</p><h3 className="mt-2 line-clamp-2 font-extrabold">{product.title}</h3></div><Badge tone="success">{product.status}</Badge></div>{product.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#697687]">{product.description}</p>}<div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-[#f3efe5] p-3 text-xs"><div><p className="text-[#697687]">Supplier cost</p><p className="mt-1 font-mono font-bold">{product.price === null ? 'Unavailable' : money(product.price, product.currency)}</p></div><div><p className="text-[#697687]">Your selling price</p><p className="mt-1 font-mono font-bold text-[#2f6958]">{product.sellingPrice === null ? 'Needs cost' : money(product.sellingPrice, product.currency)}</p></div></div><p className="mt-3 text-xs text-[#697687]">{product.profitType === 'percentage' ? `${product.profitValue}% markup` : `${money(product.profitValue, product.currency)} profit`}</p><div className="mt-5 flex items-center justify-between gap-3"><a href={product.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Product page <ExternalLink className="h-3 w-3" /></a><a href={product.supplierUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Supplier <ExternalLink className="h-3 w-3" /></a></div></div></article>)}</div> : <EmptyState title="No supplier products yet" description="Paste a public supplier product link above to start your internal catalog." />}
      </section>
    </div>
  </AppShell>;
}