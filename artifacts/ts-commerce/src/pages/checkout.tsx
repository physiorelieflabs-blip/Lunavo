import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, ShoppingBag } from 'lucide-react';
import { useRoute } from 'wouter';
import { useCreatePublicCheckout, useGetPublicStore } from '@workspace/api-client-react';
import { Logo, PublicHeader } from '@/components/app-shell';
import { Button, EmptyState, ErrorState, LoadingState, Notice, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Checkout() {
  const [, params] = useRoute('/checkout/:merchantKey');
  const merchantKey = params?.merchantKey ?? '';
  const store = useGetPublicStore(merchantKey);
  const checkout = useCreatePublicCheckout();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<typeof checkout.data> | null>(null);
  const [message, setMessage] = useState('');
  const selected = useMemo(
    () => store.data?.products.find((product) => product.id === selectedId) ?? null,
    [selectedId, store.data?.products],
  );

  if (store.isLoading) return <main className="min-h-[100dvh] bg-[#f1eee7] px-5 py-8"><LoadingState label="Loading storefront" /></main>;
  if (store.isError || !store.data) return <main className="min-h-[100dvh] bg-[#f1eee7] px-5 py-8"><ErrorState onRetry={() => void store.refetch()} /></main>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setMessage('Choose a product before checking out.');
      return;
    }
    setMessage('');
    checkout.mutate({
      merchantKey,
      data: {
        supplierProductId: selected.id,
        customerName,
        customerEmail,
        customerPhone: customerPhone || undefined,
        shippingAddress,
        quantity: Number(quantity),
        marketingConsent,
        idempotencyKey: crypto.randomUUID(),
      },
    }, {
      onSuccess: (order) => {
        setReceipt(order);
        setCustomerName('');
        setCustomerEmail('');
        setCustomerPhone('');
        setShippingAddress('');
        setMarketingConsent(false);
      },
      onError: () => setMessage('We could not submit this order. Check your details and try again.'),
    });
  };

  return <main className="min-h-[100dvh] bg-[#f1eee7] text-[#182333]">
    <PublicHeader />
    <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-6 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Public checkout</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-5xl">{store.data.storeName}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#697687]">Choose an item and send your order details securely to this store.</p></div>
        <Logo />
      </div>
      {receipt ? <section className="mt-10 rounded-2xl border border-[#b8d6ca] bg-[#eff8f3] p-7 md:p-10"><CheckCircle2 className="h-8 w-8 text-[#2f6958]" /><p className="mt-5 font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">Order received</p><h2 className="mt-2 text-2xl font-extrabold">Thanks — {receipt.orderNumber}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#315e6c]">{receipt.paymentMessage}</p><div className="mt-6 max-w-md divide-y divide-[#b8d6ca] border-y border-[#b8d6ca] text-sm"><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Subtotal</span><strong className="font-mono" data-testid="receipt-subtotal">{money(receipt.subtotal, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Tax</span><strong className="font-mono" data-testid="receipt-tax">{money(receipt.tax, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Shipping</span><strong className="font-mono" data-testid="receipt-shipping">{money(receipt.shipping, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3 text-base"><span className="font-extrabold text-[#245746]">Order total</span><strong className="font-mono text-[#182333]" data-testid="receipt-total">{money(receipt.total, receipt.currency)}</strong></div></div><Button variant="secondary" className="mt-7" onClick={() => setReceipt(null)}>Place another order</Button></section> : <div className="mt-10 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <section>
          {store.data.products.length ? <div className="grid gap-4 sm:grid-cols-2">{store.data.products.map((product) => <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className={`overflow-hidden rounded-2xl border text-left transition ${selectedId === product.id ? 'border-[#a2772e] ring-2 ring-[#d6aa46]/40' : 'border-[#d9d2c4]'} bg-[#fbfaf6]`}><div className="h-44 bg-[#eee9df]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#a2772e]"><ShoppingBag className="h-9 w-9" /></div>}</div><div className="p-5"><h2 className="font-extrabold">{product.title}</h2>{product.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#697687]">{product.description}</p>}<p className="mt-5 font-mono text-lg font-bold">{money(product.price, product.currency)}</p></div></button>)}</div> : <EmptyState title="This store has no products yet" description="The merchant has not published a priced product." />}
        </section>
        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Order details</p><h2 className="mt-2 text-xl font-extrabold">Complete your order</h2>
          {selected ? <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-[#f3efe5] p-4"><div><p className="text-sm font-extrabold">{selected.title}</p><p className="mt-1 text-xs text-[#697687]">Unit price {money(selected.price, selected.currency)}</p></div><a href={selected.id ? undefined : '#'} onClick={(event) => event.preventDefault()} className="text-[#8a6826]" aria-label="Selected product"><ExternalLink className="h-4 w-4" /></a></div> : <div className="mt-5 rounded-xl border border-dashed border-[#cfc7b8] p-4 text-sm text-[#697687]">Select a product to continue.</div>}
          {message && <div className="mt-5"><Notice tone="danger" title="Checkout not completed">{message}</Notice></div>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">Quantity<input type="number" min="1" max="100" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Full name<input required minLength={2} maxLength={160} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Email<input required type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Phone <span className="font-normal text-[#697687]">(optional)</span><input value={customerPhone} maxLength={40} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Shipping address<textarea required minLength={8} maxLength={500} value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-sm outline-none focus:border-[#bca26a]" /></label>
             <label className="flex items-start gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-xs leading-5 text-[#536174]"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1 accent-[#a2772e]" data-testid="input-marketing-consent" /><span>I agree to receive relevant product and store updates from this merchant. I can withdraw consent later.</span></label>
            <div className="rounded-lg bg-[#eef7f8] px-3 py-3 text-xs leading-5 text-[#315e6c]">This checkout submits an order request. The merchant confirms payment before the order enters fulfillment.</div>
            <SubmitButton loading={checkout.isPending}><ShoppingBag className="h-4 w-4" />Submit order</SubmitButton>
          </form>
        </section>
      </div>}
    </div>
  </main>;
}