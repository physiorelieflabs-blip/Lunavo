import { useState } from 'react';
import { ArrowRight, Check, CircleAlert, Globe2, Pause, Send, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetMarketplaceManagementQueryKey,
  useCreateMarketplaceListing,
  useGetMarketplaceManagement,
  useListSupplierProducts,
  useSubmitMarketplaceBilling,
  useUpdateMarketplaceListing,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { money } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

export default function MarketplaceManagement() {
  const queryClient = useQueryClient();
  const management = useGetMarketplaceManagement();
  const products = useListSupplierProducts();
  const createListing = useCreateMarketplaceListing();
  const updateListing = useUpdateMarketplaceListing();
  const submitBilling = useSubmitMarketplaceBilling();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [message, setMessage] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetMarketplaceManagementQueryKey() });
  const addListing = () => {
    const productId = Number(selectedProduct);
    if (!Number.isInteger(productId) || productId < 1) return;
    createListing.mutate({ data: { supplierProductId: productId } }, {
      onSuccess: () => { setSelectedProduct(''); setMessage('Listing submitted for marketplace review. The listing fee remains due until it is verified.'); refresh(); },
      onError: () => setMessage('Only a published, priced product can be submitted.'),
    });
  };
  const changeListing = (id: number, status: 'paused' | 'removed') => {
    updateListing.mutate({ id, data: { status } }, {
      onSuccess: () => { setMessage(status === 'paused' ? 'Listing paused.' : 'Listing removed from marketplace management.'); refresh(); },
      onError: () => setMessage('The listing could not be updated.'),
    });
  };
  const submitReference = (id: number) => {
    if (paymentReference.trim().length < 3) return;
    submitBilling.mutate({ id, data: { paymentReference: paymentReference.trim() } }, {
      onSuccess: () => { setPaymentReference(''); setMessage('Payment reference submitted for review. No external payment was claimed.'); refresh(); },
      onError: () => setMessage('That marketplace fee is no longer due or could not be updated.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Marketplace operations</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em]">Manage participation with a clear trail.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Submit eligible products, see review states, and attach fee references. Marketplace status never exposes private customers, inventory detail, or ledger data.</p></div>
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline">View public marketplace <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {message && <div className="mt-6"><Notice tone={message.startsWith('Only') || message.startsWith('The') || message.startsWith('That') ? 'danger' : 'success'} title={message.startsWith('Only') || message.startsWith('The') || message.startsWith('That') ? 'Marketplace update failed' : 'Marketplace updated'}>{message}</Notice></div>}

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#182333] bg-[#182333] p-5 text-[#f8f3e8]"><Globe2 className="h-5 w-5 text-[#d6aa46]" /><p className="mt-4 font-mono text-3xl">{management.data?.listings.length ?? 0}</p><p className="mt-1 text-xs text-[#aab6c2]">Managed listings</p></div>
        <div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5"><CircleAlert className="h-5 w-5 text-[#a2772e]" /><p className="mt-4 font-mono text-3xl text-[#765817]">{management.data?.listings.filter((listing) => listing.status === 'pending').length ?? 0}</p><p className="mt-1 text-xs text-[#765817]">Awaiting review</p></div>
        <div className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-5"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#315e6c]">Monthly participation</p><p className="mt-3 font-mono text-2xl font-extrabold text-[#315e6c]">{management.data?.monthlyFee ? money(management.data.monthlyFee.amount, management.data.monthlyFee.currency) : 'Loading'}</p><p className="mt-1 text-xs text-[#477563]">{management.data?.monthlyFee.status ?? 'due'} · review before paying</p></div>
      </section>

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="New listing" title="Submit a published product" description="A listing starts pending. It becomes eligible for public discovery only after review and verified fee handling." /><div className="flex flex-col gap-3 md:flex-row"><select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)} className={`${inputClass} mt-0 flex-1`}><option value="">Choose an active, priced product</option>{(products.data ?? []).filter((product) => product.visibility === 'active' && product.sellingPrice !== null).map((product) => <option key={product.id} value={product.id}>{product.title} · {money(product.sellingPrice ?? 0, product.currency)}</option>)}</select><Button onClick={addListing} disabled={!selectedProduct || createListing.isPending}><Send className="h-4 w-4" />{createListing.isPending ? 'Submitting…' : 'Submit for review'}</Button></div><p className="mt-3 text-xs text-[#697687]">{products.isLoading ? 'Loading eligible products…' : products.data?.length ? 'Only published products with a selling price can be submitted.' : 'Publish a product in Suppliers before submitting it here.'}</p></section>

      <section className="mt-8"><SectionHeading eyebrow="Listing history" title="Review state by product" description="Paused and removed are merchant-controlled states. Review and fee states are kept separate." />{management.isLoading ? <LoadingState label="Loading marketplace management" /> : management.isError ? <ErrorState onRetry={() => void management.refetch()} /> : management.data?.listings.length ? <div className="space-y-3">{management.data.listings.map((listing) => <div key={listing.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold">{listing.productTitle}</h3><p className="mt-1 text-xs text-[#697687]">Product {listing.productStatus} · submitted {new Date(listing.createdAt).toLocaleDateString()}</p></div><div className="flex flex-wrap gap-2"><Badge tone={listing.status === 'approved' ? 'success' : listing.status === 'pending' ? 'warning' : 'neutral'}>{listing.status}</Badge><Badge tone={listing.listingFeeStatus === 'paid' ? 'success' : 'warning'}>fee {listing.listingFeeStatus}</Badge></div></div>{listing.reviewNote && <p className="mt-3 text-xs leading-5 text-[#536174]">{listing.reviewNote}</p>}<div className="mt-4 flex flex-wrap gap-2">{listing.status === 'approved' && <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => changeListing(listing.id, 'paused')}><Pause className="h-3.5 w-3.5" />Pause</Button>}{listing.status !== 'removed' && <Button variant="danger" className="min-h-8 px-3 text-xs" onClick={() => changeListing(listing.id, 'removed')}><X className="h-3.5 w-3.5" />Remove</Button>}</div></div>)}</div> : <EmptyState title="No listings yet" description="Submit a published product to begin a reviewable marketplace participation history." />}</section>

      <section className="mt-8 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-6"><SectionHeading eyebrow="Fee records" title="Attach manual payment references" description="This workspace records a reference for review; it does not claim card capture or external settlement." />{management.data?.billing.length ? <div className="space-y-3">{management.data.billing.map((record) => <div key={record.id} className="rounded-lg border border-[#dfc27a] bg-white/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-[#765817]">{record.kind === 'listing' ? 'Listing fee' : 'Monthly participation fee'} · {money(record.amount, record.currency)}</p><p className="mt-1 text-xs text-[#765817]">{record.status}{record.paymentReference ? ` · ${record.paymentReference}` : ''}</p></div><Badge tone={record.status === 'paid' ? 'success' : record.status === 'submitted' ? 'info' : 'warning'}>{record.status}</Badge></div>{record.status === 'due' && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Manual bank transfer reference" className={`${inputClass} mt-0`} /><Button className="shrink-0" onClick={() => submitReference(record.id)} disabled={paymentReference.trim().length < 3 || submitBilling.isPending}><Check className="h-4 w-4" />Submit reference</Button></div>}</div>)}</div> : <EmptyState title="No fee records yet" description="Fee records appear when a product is submitted for marketplace participation." />}</section>
    </div>
  </AppShell>;
}