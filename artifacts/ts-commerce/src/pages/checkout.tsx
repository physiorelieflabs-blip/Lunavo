import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, ShoppingBag } from 'lucide-react';
import { useRoute } from 'wouter';
import { useCreatePublicCheckout, useGetPublicStore, useGetPublicStorePaymentDestination, useSubmitPublicPaymentReference } from '@workspace/api-client-react';
import { Logo, PublicHeader } from '@/components/app-shell';
import { Button, EmptyState, ErrorState, LoadingState, Notice, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Checkout() {
  const [, params] = useRoute('/checkout/:merchantKey');
  const merchantKey = params?.merchantKey ?? '';
  const store = useGetPublicStore(merchantKey);
  const paymentDestination = useGetPublicStorePaymentDestination(merchantKey);
  const checkout = useCreatePublicCheckout();
  const submitEvidence = useSubmitPublicPaymentReference();
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const requested = Number(new URLSearchParams(window.location.search).get('productId'));
    return Number.isInteger(requested) && requested > 0 ? requested : null;
  });
  const [quantity, setQuantity] = useState('1');
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<typeof checkout.data> | null>(null);
  const [message, setMessage] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
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
    if (!paymentDestination.data?.configured) {
      setMessage('This store is not ready to accept Flutterwave payments yet.');
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
        paymentCurrency: paymentCurrency || paymentDestination.data.currency,
        marketingConsent,
        idempotencyKey: crypto.randomUUID(),
      },
    }, {
      onSuccess: (order) => {
        setReceipt(order);
        if (order.paymentUrl) window.location.assign(order.paymentUrl);
      },
      onError: () => setMessage('We could not submit this order. Check your details and try again.'),
    });
  };

  const submitPaymentEvidence = (event: FormEvent) => {
    event.preventDefault();
    if (!receipt?.paymentToken) return;
    submitEvidence.mutate({
      paymentToken: receipt.paymentToken,
      data: { paymentReference: paymentReference.trim() },
    }, {
      onSuccess: (result) => {
        setMessage(result.paymentMessage);
        setPaymentReference('');
      },
      onError: () => setMessage('Payment evidence could not be submitted. Check the reference and try again.'),
    });
  };

  return <main className="min-h-[100dvh] bg-[#f1eee7] text-[#182333]">
    <PublicHeader />
    <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-6 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Public checkout</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-5xl">{store.data.storeName}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#697687]">Choose an item and send your order details securely to this store.</p></div>
        <Logo />
      </div>
      {receipt ? <section className="mt-10 rounded-2xl border border-[#b8d6ca] bg-[#eff8f3] p-7 md:p-10"><CheckCircle2 className="h-8 w-8 text-[#2f6958]" /><p className="mt-5 font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">Order received</p><h2 className="mt-2 text-2xl font-extrabold">Thanks — {receipt.orderNumber}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#315e6c]">{receipt.paymentMessage}</p><div className="mt-6 max-w-md divide-y divide-[#b8d6ca] border-y border-[#b8d6ca] text-sm"><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Subtotal</span><strong className="font-mono" data-testid="receipt-subtotal">{money(receipt.subtotal, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Tax</span><strong className="font-mono" data-testid="receipt-tax">{money(receipt.tax, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3"><span className="text-[#477563]">Shipping</span><strong className="font-mono" data-testid="receipt-shipping">{money(receipt.shipping, receipt.currency)}</strong></div><div className="flex items-center justify-between py-3 text-base"><span className="font-extrabold text-[#245746]">Order total</span><strong className="font-mono text-[#182333]" data-testid="receipt-total">{money(receipt.total, receipt.currency)}</strong></div></div>{receipt.paymentDestination && <div className="mt-7 max-w-xl rounded-xl border border-[#9fc7d0] bg-[#e8f6f8] p-5 text-sm text-[#234c58]"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Flutterwave payment account</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><p><span className="text-xs text-[#477563]">Bank</span><br /><strong>{receipt.paymentDestination.bankName}</strong></p><p><span className="text-xs text-[#477563]">Account name</span><br /><strong>{receipt.paymentDestination.accountName}</strong></p><p><span className="text-xs text-[#477563]">Account number</span><br /><strong className="font-mono">{receipt.paymentDestination.accountNumber}</strong></p><p><span className="text-xs text-[#477563]">Exact amount</span><br /><strong className="font-mono">{money(receipt.paymentDestination.amount, receipt.paymentDestination.currency)}</strong></p><p><span className="text-xs text-[#477563]">Payment reference</span><br /><strong className="font-mono">{receipt.paymentDestination.providerReference ?? receipt.paymentIntentId ?? 'Use the Flutterwave reference shown in your provider confirmation'}</strong></p>{receipt.paymentDestination.expiresAt && <p><span className="text-xs text-[#477563]">Expires</span><br /><strong>{new Date(receipt.paymentDestination.expiresAt).toLocaleString()}</strong></p>}</div><p className="mt-3 text-xs leading-5">This account was generated by Flutterwave for this payment session. Transfer the exact amount, then submit the Flutterwave transaction ID below.</p></div>}{receipt.paymentStatus !== 'verified' && <form onSubmit={submitPaymentEvidence} className="mt-7 max-w-xl rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5"><h3 className="font-extrabold text-[#765817]">Verify your Flutterwave payment</h3><p className="mt-1 text-xs leading-5 text-[#765817]">Enter the Flutterwave transaction ID. TS Commerce verifies it server-side and posts the sale to the merchant dashboard only after settlement.</p><label className="mt-4 block text-sm font-bold text-[#765817]">Flutterwave transaction ID or reference<input required minLength={2} maxLength={240} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfc27a] bg-[#fffdf5] px-3 font-mono text-sm outline-none focus:border-[#a2772e]" placeholder="Provider transaction ID" /></label><div className="mt-4"><SubmitButton loading={submitEvidence.isPending}>Verify Flutterwave payment</SubmitButton></div></form>}{message && <div className="mt-5"><Notice tone={message.includes('could not') ? 'danger' : 'success'} title="Payment update">{message}</Notice></div>}<Button variant="secondary" className="mt-7" onClick={() => setReceipt(null)}>Place another order</Button></section> : <div className="mt-10 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <section>
           {store.data.products.length ? <div className="grid gap-4 sm:grid-cols-2">{store.data.products.map((product) => <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className={`overflow-hidden rounded-2xl border text-left transition ${selectedId === product.id ? 'border-[#a2772e] ring-2 ring-[#d6aa46]/40' : 'border-[#d9d2c4]'} bg-[#fbfaf6]`}><div className="h-44 bg-[#eee9df]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#a2772e]"><ShoppingBag className="h-9 w-9" /></div>}</div><div className="p-5"><h2 className="font-extrabold">{product.title}</h2>{product.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#697687]">{product.description}</p>}<p className="mt-5 font-mono text-lg font-bold">{money(product.price, product.currency)}</p></div></button>)}</div> : <EmptyState title="This store has no products yet" description="The merchant has not published a priced product." />}
        </section>
        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Order details</p><h2 className="mt-2 text-xl font-extrabold">Complete your order</h2>
            {selected ? <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-[#f3efe5] p-4"><div><p className="text-sm font-extrabold">{selected.title}</p><p className="mt-1 text-xs text-[#697687]">Unit price {money(selected.price, selected.currency)}</p></div><a href={selected.id ? undefined : '#'} onClick={(event) => event.preventDefault()} className="text-[#8a6826]" aria-label="Selected product"><ExternalLink className="h-4 w-4" /></a></div> : <div className="mt-5 rounded-xl border border-dashed border-[#cfc7b8] p-4 text-sm text-[#697687]">Select a product to continue.</div>}
          {message && <div className="mt-5"><Notice tone="danger" title="Checkout not completed">{message}</Notice></div>}
           <div className="mt-6 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4">
             <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Payment destination</p>
              {paymentDestination.isLoading ? <p className="mt-2 text-sm text-[#315e6c]">Checking Flutterwave payment readiness…</p> : paymentDestination.data?.configured ? <p className="mt-2 text-sm leading-5 text-[#315e6c]">Flutterwave generates a short-lived account for this exact payment session. Merchant bank details are never shown or accepted in this storefront.</p> : <p className="mt-2 text-sm leading-5 text-[#9b463d]">Flutterwave checkout is not configured, so this store cannot accept payments yet.</p>}
           </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">Quantity<input type="number" min="1" max="100" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a]" /></label>
             <label className="block text-sm font-bold">Pay in currency<select value={paymentCurrency || paymentDestination.data?.currency || selected?.currency || 'USD'} onChange={(event) => setPaymentCurrency(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]">{(paymentDestination.data?.paymentCurrencies ?? [selected?.currency || 'USD']).map((currency) => <option key={currency} value={currency}>{currency}{currency === (selected?.currency ?? paymentDestination.data?.currency) ? ' · store settlement currency' : ''}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#697687]">Flutterwave creates the payment account in the currency you choose; verified proceeds settle into the merchant dashboard currency.</span></label>
            <label className="block text-sm font-bold">Full name<input required minLength={2} maxLength={160} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Email<input required type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Phone <span className="font-normal text-[#697687]">(optional)</span><input value={customerPhone} maxLength={40} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" /></label>
            <label className="block text-sm font-bold">Shipping address<textarea required minLength={8} maxLength={500} value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-sm outline-none focus:border-[#bca26a]" /></label>
             <label className="flex items-start gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-xs leading-5 text-[#536174]"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1 accent-[#a2772e]" data-testid="input-marketing-consent" /><span>I agree to receive relevant product and store updates from this merchant. I can withdraw consent later.</span></label>
             <div className="rounded-lg bg-[#eef7f8] px-3 py-3 text-xs leading-5 text-[#315e6c]">This checkout uses Flutterwave only. The order enters fulfillment after server verification, and the verified sale is posted to the merchant dashboard.</div>
            <SubmitButton loading={checkout.isPending} disabled={!paymentDestination.data?.configured}><ShoppingBag className="h-4 w-4" />Submit order</SubmitButton>
          </form>
        </section>
      </div>}
    </div>
  </main>;
}