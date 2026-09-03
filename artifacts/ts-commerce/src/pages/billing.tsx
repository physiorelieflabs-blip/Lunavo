import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, Clock3, CreditCard, LockKeyhole, TriangleAlert, WalletCards } from 'lucide-react';
import { useGetCurrencySettings, useGetSubscription, usePaySubscriptionFromEarnings, useSubmitBankTransfer, getGetSubscriptionQueryKey, getGetDashboardOverviewQueryKey, getListDashboardActivityQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

export default function Billing() {
  const subscription = useGetSubscription();
  const currencySettings = useGetCurrencySettings();
  const queryClient = useQueryClient();
  const earningsPayment = usePaySubscriptionFromEarnings();
  const transfer = useSubmitBankTransfer();
  const [method, setMethod] = useState<'earnings' | 'bank' | 'whop'>('earnings');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [senderName, setSenderName] = useState('');
  const [message, setMessage] = useState('');
  const [whopLoading, setWhopLoading] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('whop') !== 'return' || !params.get('checkout_id')) return;
    const checkoutIdentifier = params.get('checkout_id')!;
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    setWhopLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/subscription/whop-verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutId: checkoutIdentifier }),
        });
        const payload = await response.json() as { status?: string; message?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Whop payment could not be verified.');
        setMessage(payload.message || 'Whop payment verification completed.');
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
        ]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Whop payment could not be verified.');
      } finally {
        setWhopLoading(false);
      }
    })();
  }, [queryClient]);
  if (subscription.isLoading || currencySettings.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (subscription.isError || currencySettings.isError || !subscription.data) return <AppShell><ErrorState onRetry={() => { void subscription.refetch(); void currencySettings.refetch(); }} /></AppShell>;
  const data = subscription.data;
  const currency = data.currency ?? currencySettings.data?.currency ?? 'USD';
   const outstanding = Math.max(data.amountDue - data.amountPaid, 0);
  const serverOffset = new Date(data.serverNow).getTime() - tick;
  const countdownMs = Math.max(0, new Date(data.trialEndsAt).getTime() - (tick + serverOffset));
  const countdownTotalSeconds = Math.floor(countdownMs / 1000);
  const countdownDays = Math.floor(countdownTotalSeconds / 86400);
  const countdownHours = Math.floor((countdownTotalSeconds % 86400) / 3600);
  const countdownMinutes = Math.floor((countdownTotalSeconds % 3600) / 60);
  const countdownSeconds = countdownTotalSeconds % 60;
  const days = data.daysElapsed;
  const daysUntilSuspension = data.daysRemaining;
  const suspended = data.status === 'suspended';
  const onEarnings = () => {
    setMessage('');
    earningsPayment.mutate(undefined, { onSuccess: () => { setMessage('Payment applied from your dashboard balance.'); void Promise.all([queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }), queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() })]); }, onError: () => setMessage('We could not pay from dashboard. Confirm that enough dashboard balance is available, or choose Pay from bank.') });
  };
  const submitTransfer = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    transfer.mutate({ data: { amount: Number(amount), reference, senderName } }, { onSuccess: (payment) => { setMessage(`Pay from bank submission for ${money(payment.amount, payment.currency)} received. It remains unpaid until the master admin verifies it.`); setAmount(''); setReference(''); setSenderName(''); void Promise.all([queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }), queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() })]); }, onError: () => setMessage('We could not submit the Pay from bank payment. The amount may exceed the outstanding balance, the reference may already exist, or the details may be invalid.') });
  };
  const openWhopCheckout = async () => {
    setMessage('');
    setWhopLoading(true);
    try {
      const response = await fetch('/api/subscription/whop-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json() as { purchaseUrl?: string; error?: string };
      if (!response.ok || !payload.purchaseUrl) {
        throw new Error(payload.error || 'Whop checkout could not be opened.');
      }
      window.location.assign(payload.purchaseUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Whop checkout could not be opened.');
      setWhopLoading(false);
    }
  };
   return <AppShell><div className="mx-auto max-w-[1050px]"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Subscription ledger</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Keep your account moving.</h1><p className="mt-2 text-sm text-[#697687]">The {money(data.baseAmountUsd, 'USD')} monthly platform fee is {money(data.amountDue, currency)} in your billing currency.</p><p className="mt-1 text-xs text-[#697687]">Rate locked at {data.fxRate.toFixed(4)} · {data.fxSource}</p></div><Badge tone={suspended ? 'danger' : data.status === 'active' ? 'success' : 'warning'}>{data.status.replaceAll('_', ' ')}</Badge></div>
     {message && <div className="mt-7"><Notice tone={message.includes('not') || message.includes('could') ? 'danger' : 'success'} title={message.includes('not') || message.includes('could') ? 'Action not completed' : 'Update received'}>{message}</Notice></div>}
    {suspended ? <div className="mt-8"><Notice tone="danger" title="Your account is currently suspended">New orders and transfers are paused. Settle the outstanding subscription to restore access.</Notice></div> : daysUntilSuspension <= 7 && <div className="mt-8"><Notice title={`Action needed within ${daysUntilSuspension || 1} days`}>Held earnings cover part of your subscription. Settle the remaining balance before day {data.suspensionDay} to avoid interruption.</Notice></div>}
    <div className="mt-8 grid gap-4 md:grid-cols-[1.1fr_.9fr]"><section className="rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#d6aa46]">Outstanding</p><p className="mt-5 font-mono text-5xl tracking-[-.1em]">{money(outstanding, currency)}</p><p className="mt-3 text-sm text-[#aab6c2]">of {money(data.amountDue, currency)} due this cycle</p></div><LockKeyhole className="h-5 w-5 text-[#d6aa46]" /></div><div className="mt-9 h-2 overflow-hidden rounded-full bg-[#3b4b60]"><div className="h-full rounded-full bg-[#d6aa46]" style={{ width: `${Math.min((data.amountPaid / data.amountDue) * 100, 100)}%` }} /></div><div className="mt-3 flex justify-between text-xs text-[#aab6c2]"><span>{money(data.amountPaid, currency)} paid</span><span>Day {days} of {data.suspensionDay}</span></div></section><section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#a2772e]">Account clock</p><p className="mt-4 text-3xl font-extrabold tracking-[-.06em]">{data.daysRemaining === 0 ? 'Expired' : `${countdownDays}d ${String(countdownHours).padStart(2, '0')}h`}</p><p className="mt-1 text-sm text-[#697687]">{data.daysRemaining === 0 ? '15-day window has ended' : `exact countdown · ${String(countdownMinutes).padStart(2, '0')}m ${String(countdownSeconds).padStart(2, '0')}s remaining`}</p></div><Clock3 className="h-5 w-5 text-[#a2772e]" /></div><div className="mt-7 space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#697687]">Registered</span><strong>{dateLabel(data.registeredAt)}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Warning day</span><strong>Day {data.warningDay}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Suspension day</span><strong>{dateLabel(data.trialEndsAt)}</strong></div></div></section></div>
     <section className="mt-10"><SectionHeading eyebrow="Choose a route" title="Settle the subscription" description="Choose Pay from bank, Pay from dashboard, or a hosted Whop checkout." /><div className="grid gap-4 md:grid-cols-3"><button onClick={() => setMethod('earnings')} className={`rounded-xl border p-5 text-left ${method === 'earnings' ? 'border-[#bca26a] bg-[#f7edd2]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'}`} data-testid="button-method-earnings"><div className="flex items-center justify-between"><Banknote className="h-5 w-5 text-[#a2772e]" />{method === 'earnings' && <CheckCircle2 className="h-5 w-5 text-[#a2772e]" />}</div><p className="mt-6 font-extrabold">Pay from dashboard</p><p className="mt-1 text-sm text-[#697687]">Use earnings already available in your TS Commerce dashboard.</p></button><button onClick={() => setMethod('bank')} className={`rounded-xl border p-5 text-left ${method === 'bank' ? 'border-[#bca26a] bg-[#f7edd2]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'}`} data-testid="button-method-bank"><div className="flex items-center justify-between"><CreditCard className="h-5 w-5 text-[#a2772e]" />{method === 'bank' && <CheckCircle2 className="h-5 w-5 text-[#a2772e]" />}</div><p className="mt-6 font-extrabold">Pay from bank</p><p className="mt-1 text-sm text-[#697687]">Send money from your bank and submit the payment reference.</p></button><button onClick={() => setMethod('whop')} disabled={currency !== 'USD' || outstanding === 0} className={`rounded-xl border p-5 text-left disabled:cursor-not-allowed disabled:opacity-55 ${method === 'whop' ? 'border-[#bca26a] bg-[#f7edd2]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'}`} data-testid="button-method-whop"><div className="flex items-center justify-between"><WalletCards className="h-5 w-5 text-[#a2772e]" />{method === 'whop' && <CheckCircle2 className="h-5 w-5 text-[#a2772e]" />}</div><p className="mt-6 font-extrabold">Pay with Whop</p><p className="mt-1 text-sm text-[#697687]">{currency === 'USD' ? 'Use Whop-hosted card and bank payment methods.' : 'Available for USD billing only.'}</p></button></div></section>
       <section className="mt-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">{method === 'earnings' ? <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay from dashboard: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">Available in your dashboard: {money(data.earningsHeld, currency)}. The fee settles only when the full outstanding amount is available.</p></div><Button onClick={onEarnings} disabled={earningsPayment.isPending || outstanding === 0 || data.earningsHeld < outstanding} data-testid="button-pay-earnings">{earningsPayment.isPending ? 'Applying…' : outstanding === 0 ? 'Already settled' : data.earningsHeld < outstanding ? 'Insufficient dashboard balance' : 'Pay from dashboard'} <ArrowRight className="h-4 w-4" /></Button></div> : method === 'bank' ? <form onSubmit={submitTransfer} className="grid gap-5 md:grid-cols-2"><div className="md:col-span-2"><h3 className="font-extrabold">Pay from bank: submit payment for review</h3><p className="mt-1 text-sm text-[#697687]">Enter exactly what you sent from your bank. Partial payments are accepted and reduce the balance; any remainder stays due and is held from future sales after approval.</p></div><label className="text-sm font-bold">Amount sent<input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder={outstanding.toFixed(2)} data-testid="input-transfer-amount" /></label><label className="text-sm font-bold">Sender name<input value={senderName} onChange={(event) => setSenderName(event.target.value)} required minLength={2} autoComplete="name" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="Name on the account" data-testid="input-sender-name" /></label><label className="text-sm font-bold">Bank payment reference<input value={reference} onChange={(event) => setReference(event.target.value)} required minLength={3} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm uppercase outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="e.g. TRX-48291" data-testid="input-transfer-reference" /></label><div className="flex flex-wrap items-center gap-3 md:col-span-2"><SubmitButton loading={transfer.isPending}>Submit bank payment</SubmitButton><span className="text-xs text-[#697687]">The master admin must verify the bank payment before it is applied.</span></div></form> : <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay with Whop: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">You will be redirected to Whop’s hosted checkout. TS Commerce only activates the subscription after a server-side payment verification.</p><p className="mt-2 text-xs text-[#697687]">Whop supports the available payment methods for your location, including cards and bank methods where enabled.</p></div><Button onClick={() => void openWhopCheckout()} disabled={whopLoading || outstanding === 0 || currency !== 'USD'} data-testid="button-pay-whop">{whopLoading ? 'Opening checkout…' : outstanding === 0 ? 'Already settled' : 'Open Whop checkout'} <ArrowRight className="h-4 w-4" /></Button></div>}</section>
    <p className="mt-6 flex items-center gap-2 text-xs text-[#697687]"><TriangleAlert className="h-4 w-4 text-[#a2772e]" /> Pay from bank submissions are reviewed by the TS Commerce team. Keep your reference until the status updates.</p><Link href="/dashboard" className="mt-6 inline-flex text-sm font-extrabold text-[#8a6826] underline" data-testid="link-back-dashboard">Back to overview</Link>
  </div></AppShell>;
}