import { type FormEvent, useState } from 'react';
import { CheckCircle2, Link2, ShieldCheck } from 'lucide-react';
import { useParams } from 'wouter';
import { getGetPublicPaymentLinkQueryKey, useCreatePaymentLinkCheckout, useGetPublicPaymentLink } from '@workspace/api-client-react';
import { Button, ErrorState, LoadingState, Notice, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

export default function PaymentLinkCheckout() {
  const { token = '' } = useParams<{ token: string }>();
  const link = useGetPublicPaymentLink(token, { query: { queryKey: getGetPublicPaymentLinkQueryKey(token), retry: false } });
  const checkout = useCreatePaymentLinkCheckout();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [completed, setCompleted] = useState<{ orderNumber: string; total: number; currency: string } | null>(null);

  if (link.isLoading) return <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5"><div className="w-full max-w-md"><LoadingState label="Loading secure payment link" /></div></main>;
  if (link.isError || !link.data) return <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5"><ErrorState onRetry={() => void link.refetch()} /></main>;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    checkout.mutate({ token, data: { customerName, customerEmail, customerPhone: customerPhone || undefined, shippingAddress, marketingConsent, idempotencyKey: crypto.randomUUID() } }, {
      onSuccess: (result) => {
        if (result.paymentUrl) {
          window.location.assign(result.paymentUrl);
          return;
        }
        setCompleted({ orderNumber: result.orderNumber, total: result.total, currency: result.currency });
        setMessage('Your order is pending merchant payment confirmation.');
      },
      onError: () => setMessage('This payment link could not create an order. Check your details or ask the merchant for a fresh link.'),
    });
  };

  return <main className="noise min-h-[100dvh] bg-[#f5f1e8] px-5 py-8 text-[#182333] md:py-14">
    <div className="mx-auto max-w-[620px]">
      <header className="mb-8 flex items-center justify-between gap-4"><p className="font-mono text-xs font-medium tracking-[.08em]">TS / COMMERCE</p><span className="flex items-center gap-2 text-xs font-bold text-[#697687]"><ShieldCheck className="h-4 w-4 text-[#2f6958]" />Secure order intake</span></header>
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] md:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Payment link</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.06em]">{link.data.title}</h1>
        {link.data.description && <p className="mt-3 text-sm leading-6 text-[#697687]">{link.data.description}</p>}
        <div className="mt-6 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#85601b]">Amount due</p><p className="mt-2 font-mono text-3xl font-extrabold text-[#765817]">{money(link.data.amount, link.data.currency)}</p><p className="mt-2 text-xs leading-5 text-[#765817]">Submitting this form creates a pending order. Payment is confirmed by the merchant before it enters the sales ledger.</p></div>
        {message && <div className="mt-5"><Notice tone={message.startsWith('This') ? 'danger' : 'success'} title={message.startsWith('This') ? 'Order not created' : 'Checkout update'}>{message}</Notice></div>}
        {completed ? <div className="mt-6 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-5"><CheckCircle2 className="h-7 w-7 text-[#2f6958]" /><h2 className="mt-3 text-xl font-extrabold">Order received</h2><p className="mt-2 text-sm leading-6 text-[#2f6958]">Reference <span className="font-mono font-bold">{completed.orderNumber}</span> · {money(completed.total, completed.currency)}. The merchant will confirm payment and follow up with next steps.</p></div> : <form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-bold">Full name<input required minLength={2} maxLength={160} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClass} autoComplete="name" /></label><label className="block text-sm font-bold">Email<input required type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className={inputClass} autoComplete="email" /></label><label className="block text-sm font-bold">Phone <span className="font-normal text-[#697687]">(optional)</span><input maxLength={40} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={inputClass} autoComplete="tel" /></label><label className="block text-sm font-bold">Shipping address<input required minLength={8} maxLength={500} value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} className={inputClass} autoComplete="street-address" placeholder="Where should the merchant deliver?" /></label><label className="flex items-start gap-3 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-4 py-3 text-sm leading-5"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1" />I agree to receive marketing updates from this merchant.</label><SubmitButton loading={checkout.isPending}><Link2 className="h-4 w-4" />{checkout.isPending ? 'Submitting…' : 'Submit order request'}</SubmitButton></form>}
      </section>
      <p className="mt-5 text-center text-xs leading-5 text-[#697687]">Your details are shared with the merchant connected to this link. The order stays pending until payment is verified.</p>
    </div>
  </main>;
}