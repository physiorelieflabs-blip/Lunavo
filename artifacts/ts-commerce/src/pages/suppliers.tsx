import { useState } from 'react';
import { ExternalLink, RefreshCw, Store } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListSupplierProductsQueryKey, useImportSupplierProduct, useListSupplierProducts } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Suppliers() {
  const products = useListSupplierProducts();
  const importProduct = useImportSupplierProduct();
  const queryClient = useQueryClient();
  const [sourceUrl, setSourceUrl] = useState('');
  const [message, setMessage] = useState('');

  if (products.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (products.isError || !products.data) return <AppShell><ErrorState onRetry={() => void products.refetch()} /></AppShell>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    importProduct.mutate({ data: { sourceUrl } }, {
      onSuccess: (product) => {
        setMessage(`Imported “${product.title}” from ${product.sourceDomain}.`);
        setSourceUrl('');
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
      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
        <SectionHeading eyebrow="Import public product" title="Add supplier inventory" description="Paste a public product-page URL. Price, currency, title, description, and image metadata are imported when the page exposes them." />
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 md:flex-row">
          <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://supplier.example/product/..." className="h-11 min-w-0 flex-1 rounded-lg border border-[#46566a] bg-[#26364a] px-3 text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]" />
          <SubmitButton loading={importProduct.isPending}>Import product</SubmitButton>
        </form>
      </section>
      <section className="mt-8">
        <SectionHeading eyebrow="Your catalog references" title="Imported supplier products" action={<Button variant="ghost" onClick={() => void products.refetch()} aria-label="Refresh supplier products"><RefreshCw className="h-4 w-4" />Refresh</Button>} />
        {products.data.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.data.map((product) => <article key={product.id} className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="h-40 bg-[#eee9df]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#a2772e]"><Store className="h-8 w-8" /></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#a2772e]">{product.sourceDomain}</p><h3 className="mt-2 line-clamp-2 font-extrabold">{product.title}</h3></div><Badge tone="success">{product.status}</Badge></div>{product.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#697687]">{product.description}</p>}<div className="mt-5 flex items-center justify-between gap-3"><span className="font-mono text-sm font-bold">{product.price === null ? 'Price unavailable' : money(product.price, product.currency)}</span><a href={product.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Open source <ExternalLink className="h-3 w-3" /></a></div></div></article>)}</div> : <EmptyState title="No supplier products yet" description="Paste a public supplier product link above to start your internal catalog." />}
      </section>
    </div>
  </AppShell>;
}