import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, Clock3, ExternalLink, LockKeyhole, TriangleAlert } from 'lucide-react';
import {
  customFetch,
  getGetDashboardOverviewQueryKey,
  getGetSubscriptionQueryKey,
  getListDashboardActivityQueryKey,
  useGetCurrencySettings,
  useGetSubscription,
  usePaySubscriptionFromEarnings,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

type PaymentMethod = 'earnings' | 'bank';
type PaymentDestination = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  expiresAt: string | null;
};

export default function Billing() {
  const subscription = useGetSubscription();
  const currencySettings = useGetCurrencySettings();
  const queryClient = useQueryClient();
  const earningsPayment = usePaySubscriptionFromEarnings();
  const [method, setMethod] = useState<PaymentMethod>('earnings');
  const [message, setMessage] = useState('');
  const [flutterwavePending, setFlutterwavePending] = useState(false);
  const [flutterwaveDestination, setFlutterwaveDestination] = useState<PaymentDestination | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [tick, setTick] = useState(() => Date.now());
  const [referral, setReferral] = useState<{
    currentPeriod: { code: string; validUntil: string } | null;
    qualifyingReferralCount: number;
    freeMonthsRemaining: number;
    milestones: Array<{ id: number; milestoneKey: string; qualifyingReferralCount: number; freeMonths: number; status: string; grantedAt: string }>;
    rewards: Array<{ id: number; discountAmountMinor: number; currency: string; status: string }>;
  } | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralMessage, setReferralMessage] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [currencyPending, setCurrencyPending] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('transaction_id') ?? params.get('transactionId');
    if (params.get('flutterwave') !== 'return') return;
    if (!transactionId) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      setMessage('Flutterwave did not return a transaction ID. Confirm the payment status before trying again.');
      return;
    }
    let active = true;
    void customFetch<{ message: string }>('/api/subscription/flutterwave-verify', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transactionId }),
      responseType: 'json',
    }).then((result) => {
      if (!active) return;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      setMessage(result.message);
      void refreshBilling();
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : 'Flutterwave payment verification could not be completed.');
    });
    return () => { active = false; };
  }, [queryClient]);

  useEffect(() => {
    const savedMethod = subscription.data?.paymentMethod;
    if (savedMethod === 'Pay from dashboard' || savedMethod === 'earnings') setMethod('earnings');
    if (savedMethod === 'Pay from bank' || savedMethod === 'bank' || savedMethod === 'flutterwave' || savedMethod === 'Pay with Flutterwave') setMethod('bank');
  }, [subscription.data?.paymentMethod]);

  useEffect(() => {
    void customFetch<typeof referral>('/api/referrals', { responseType: 'json' })
      .then(setReferral)
      .catch(() => undefined);
  }, []);

  if (subscription.isLoading || currencySettings.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (subscription.isError || currencySettings.isError || !subscription.data) {
    return <AppShell><ErrorState onRetry={() => { void subscription.refetch(); void currencySettings.refetch(); }} /></AppShell>;
  }

  const data = subscription.data;
  const currency = data.currency ?? currencySettings.data?.currency ?? 'USD';
  const availableCurrencies = currencySettings.data?.availableCurrencies ?? [];
  const billingLocked = data.accessLocked || data.status === 'suspended';
  const outstanding = Math.max(data.amountDue - data.amountPaid, 0);
  const earningsHeld = data.earningsHeld ?? 0;
  const serverOffset = new Date(data.serverNow).getTime() - tick;
  const countdownMs = Math.max(0, new Date(data.trialEndsAt).getTime() - (tick + serverOffset));
  const countdownTotalSeconds = Math.floor(countdownMs / 1000);
  const countdownDays = Math.floor(countdownTotalSeconds / 86400);
  const countdownHours = Math.floor((countdownTotalSeconds % 86400) / 3600);
  const countdownMinutes = Math.floor((countdownTotalSeconds % 3600) / 60);
  const countdownSeconds = countdownTotalSeconds % 60;
  const suspended = data.status === 'suspended';
  const locked = data.accessLocked || suspended;
  const selectedMethod = data.paymentMethod ?? 'No payment method selected';
  const graceCopy = data.paymentMethod ? '15-day payment window after method selection' : 'Choose a payment method to unlock the workspace';
  const messageIsError = /could|not return|error|failed|invalid|expired|retired/i.test(message);

  function refreshBilling() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
    ]);
  }

  async function changePaymentCurrency(nextCurrency: string) {
    if (!nextCurrency || nextCurrency === currency || currencyPending) return;
    setCurrencyPending(true);
    setMessage('');
    try {
      await customFetch<{ currency: string; availableCurrencies: string[] }>('/api/settings/currency', {
        method: 'PUT',
        body: JSON.stringify({ currency: nextCurrency }),
        responseType: 'json',
      });
      setSelectedCurrency(nextCurrency);
      setMessage(`Subscription currency changed to ${nextCurrency}. You can now pay in that currency.`);
      await refreshBilling();
      setFlutterwaveDestination(null);
      setTransactionId('');
      if (method === 'bank') {
        window.history.replaceState({}, '', '/billing?method=bank');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment currency could not be changed.');
      setSelectedCurrency(currency);
    } finally {
      setCurrencyPending(false);
    }
  }

  const onEarnings = () => {
    setMessage('');
    earningsPayment.mutate(undefined, {
      onSuccess: () => { setMessage('Payment applied from your dashboard balance.'); void refreshBilling(); },
      onError: () => setMessage('We could not pay from dashboard. Confirm that enough dashboard balance is available, or choose Pay by bank.'),
    });
  };

  async function startFlutterwaveCheckout() {
    setMessage('');
    setFlutterwavePending(true);
    try {
      const result = await customFetch<{ purchaseUrl: string | null; paymentDestination?: PaymentDestination | null }>('/api/subscription/flutterwave-checkout', {
        method: 'POST',
        body: JSON.stringify({ attemptKey: crypto.randomUUID() }),
        responseType: 'json',
      });
      if (result.paymentDestination) {
        setFlutterwaveDestination(result.paymentDestination);
        window.history.replaceState({}, '', '/billing?method=bank');
        requestAnimationFrame(() => document.getElementById('bank-payment-destination')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        setMessage('Transfer the exact amount to the temporary Flutterwave account. TS Commerce verifies the incoming payment before changing your subscription state.');
      } else if (result.purchaseUrl) {
        window.history.replaceState({}, '', '/billing?method=bank');
        window.location.assign(result.purchaseUrl);
        return;
      } else {
        throw new Error('Flutterwave did not return bank details or a hosted payment page.');
      }
      setFlutterwavePending(false);
    } catch (error) {
      setFlutterwavePending(false);
      setMessage(error instanceof Error ? error.message : 'Flutterwave payment could not be started.');
    }
  }

  const chooseMethod = async (value: PaymentMethod) => {
    setMethod(value);
    setMessage('');
    try {
      const result = await customFetch<{ amountPaid?: number }>('/api/subscription', {
        method: 'POST',
        body: JSON.stringify({ method: value }),
        responseType: 'json',
      });
      setMessage(
        result.amountPaid && result.amountPaid >= data.amountDue
          ? 'Your dashboard payment was applied and access is restored.'
          : value === 'earnings'
            ? 'Dashboard selected. You have 15 days from this choice to settle the subscription.'
            : 'Pay by bank selected. Flutterwave is generating a fresh temporary account.',
      );
      void refreshBilling();
      if (value === 'bank') await startFlutterwaveCheckout();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment method could not be selected.');
    }
  };

  const verifyBankPayment = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      const result = await customFetch<{ message: string }>('/api/subscription/flutterwave-verify', {
        method: 'POST',
        body: JSON.stringify({ transaction_id: transactionId.trim() }),
        responseType: 'json',
      });
      setMessage(result.message);
      setTransactionId('');
      await refreshBilling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Flutterwave could not verify this payment yet.');
    }
  };

  const submitReferral = async (event: FormEvent) => {
    event.preventDefault();
    setReferralMessage('');
    try {
      const result = await customFetch<{ message: string }>('/api/referrals/attribute', {
        method: 'POST',
        body: JSON.stringify({ code: referralCode }),
        responseType: 'json',
      });
      setReferralMessage(result.message);
      setReferralCode('');
      setReferral(await customFetch<typeof referral>('/api/referrals', { responseType: 'json' }));
    } catch (error) {
      setReferralMessage(error instanceof Error ? error.message : 'Referral code could not be recorded.');
    }
  };

  const routeButton = (value: PaymentMethod, icon: ReactNode, title: string, description: string, testId: string) => (
    <button type="button" onClick={() => void chooseMethod(value)} className={`rounded-xl border p-5 text-left ${method === value ? 'border-[#bca26a] bg-[#f7edd2]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'}`} data-testid={testId}>
      <div className="flex items-center justify-between">{icon}{method === value && <CheckCircle2 className="h-5 w-5 text-[#a2772e]" />}</div>
      <p className="mt-6 font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-[#697687]">{description}</p>
    </button>
  );

  return <AppShell>
    <div className="mx-auto max-w-[1050px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Subscription ledger</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Keep your account moving.</h1><p className="mt-2 text-sm text-[#697687]">The {money(data.baseAmountUsd, 'USD')} monthly platform fee is {money(data.amountDue, currency)} in your billing currency.</p><p className="mt-1 text-xs text-[#697687]">Rate locked at {data.fxRate.toFixed(4)} · {data.fxSource}</p></div><Badge tone={suspended ? 'danger' : data.status === 'active' ? 'success' : 'warning'}>{data.status.replaceAll('_', ' ')}</Badge></div>
      {message && <div className="mt-7"><Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'Action not completed' : 'Update received'}>{message}</Notice></div>}
       {billingLocked ? <div className="mt-8"><Notice tone="danger" title="Workspace is locked until you choose a payment route">Select <strong>Pay from dashboard</strong> to unlock every workspace feature for a 15-day earning window, or select <strong>Pay by bank</strong> to open the real Flutterwave payment destination. Your payment currency can be changed here before a payment is confirmed.</Notice></div> : data.daysRemaining <= 7 && <div className="mt-8"><Notice title={`Action needed within ${data.daysRemaining || 1} day${data.daysRemaining === 1 ? '' : 's'}`}>Your selected method has {data.daysRemaining} day{data.daysRemaining === 1 ? '' : 's'} left. Settle the outstanding balance before the window closes.</Notice></div>}
      <div className="mt-8 grid gap-4 md:grid-cols-[1.1fr_.9fr]"><section className="rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#d6aa46]">Outstanding</p><p className="mt-5 font-mono text-5xl tracking-[-.1em]">{money(outstanding, currency)}</p><p className="mt-3 text-sm text-[#aab6c2]">of {money(data.amountDue, currency)} due this cycle</p></div><LockKeyhole className="h-5 w-5 text-[#d6aa46]" /></div><div className="mt-9 h-2 overflow-hidden rounded-full bg-[#3b4b60]"><div className="h-full rounded-full bg-[#d6aa46]" style={{ width: `${data.amountDue > 0 ? Math.min((data.amountPaid / data.amountDue) * 100, 100) : 100}%` }} /></div><div className="mt-3 flex justify-between text-xs text-[#aab6c2]"><span>{money(data.amountPaid, currency)} paid</span><span>{data.paymentMethod ? `Day ${data.daysElapsed} of ${data.suspensionDay}` : 'Select a payment method'}</span></div></section><section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#a2772e]">Account clock</p><p className="mt-4 text-3xl font-extrabold tracking-[-.06em]">{locked ? 'Locked' : `${countdownDays}d ${String(countdownHours).padStart(2, '0')}h`}</p><p className="mt-1 text-sm text-[#697687]">{locked ? `${graceCopy} has ended` : `${graceCopy} · ${String(countdownMinutes).padStart(2, '0')}m ${String(countdownSeconds).padStart(2, '0')}s remaining`}</p></div><Clock3 className="h-5 w-5 text-[#a2772e]" /></div><div className="mt-7 space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#697687]">Registered</span><strong>{dateLabel(data.registeredAt)}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Payment method</span><strong>{selectedMethod}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Access deadline</span><strong>{dateLabel(data.trialEndsAt)}</strong></div></div></section></div>
       <section className="mt-10"><SectionHeading eyebrow="Choose a route" title="Settle the subscription" description="You can change the currency before payment is confirmed, even when the workspace is locked. Pay from dashboard unlocks the entire workspace for 15 days so you can earn enough to settle the fee. Pay by bank takes you to the real Flutterwave-generated bank destination for the selected currency." />
       <div className="mb-5 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5">
         <div className="flex flex-wrap items-end justify-between gap-4">
           <div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#a2772e]">Payment currency</p><h3 className="mt-2 text-xl font-extrabold">Choose the currency you want to pay in</h3><p className="mt-1 text-sm text-[#697687]">This control remains available while the account is locked. Unpaid payment attempts can be replaced with a newly priced currency.</p></div>
           <select value={selectedCurrency || currency} onChange={(event) => void changePaymentCurrency(event.target.value)} disabled={currencyPending} className="h-11 min-w-[150px] rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm font-extrabold text-[#182333] outline-none focus:border-[#bca26a]" data-testid="select-subscription-currency">
             {availableCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
           </select>
         </div>
       </div>
       <div className="grid gap-4 md:grid-cols-2">{routeButton('earnings', <Banknote className="h-5 w-5 text-[#a2772e]" />, 'Pay from dashboard', 'Unlock the entire workspace for 15 days from the moment you choose dashboard earnings.', 'button-method-earnings')}{routeButton('bank', <ExternalLink className="h-5 w-5 text-[#a2772e]" />, 'Pay by bank · Flutterwave', 'Open the page showing the real temporary bank details generated by Flutterwave for this payment.', 'button-method-bank')}</div>{method === 'bank' && flutterwaveDestination && <div id="bank-payment-destination" className="mt-5 rounded-xl border border-[#9fc7d0] bg-[#e8f6f8] p-5 text-sm text-[#234c58]"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Fresh Flutterwave bank details</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><p><span className="text-xs text-[#477563]">Bank name</span><br /><strong>{flutterwaveDestination.bankName}</strong></p><p><span className="text-xs text-[#477563]">Account name</span><br /><strong>TS Commerce</strong></p><p><span className="text-xs text-[#477563]">Account number</span><br /><strong className="font-mono">{flutterwaveDestination.accountNumber}</strong></p><p><span className="text-xs text-[#477563]">Exact amount</span><br /><strong className="font-mono">{money(flutterwaveDestination.amount, flutterwaveDestination.currency)}</strong></p>{flutterwaveDestination.expiresAt && <p><span className="text-xs text-[#477563]">Expires</span><br /><strong>{new Date(flutterwaveDestination.expiresAt).toLocaleString()}</strong></p>}</div><p className="mt-3 text-xs leading-5">Transfer the exact amount to this temporary bank account. Flutterwave and TS Commerce verify the transfer before features unlock. No merchant-owned bank details are used.</p><button type="button" onClick={() => void startFlutterwaveCheckout()} className="mt-4 text-sm font-extrabold text-[#315e6c] underline">Generate a new account</button></div>}</section>
       <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8"><SectionHeading eyebrow="Merchant referrals" title="Invite another merchant" description="Each genuinely new merchant who completes a verified first $30 subscription can earn you 30% off your next subscription. Reach 150 or more verified paid referrals to receive 12 free TS Commerce subscription months. The 12 months is a non-cash subscription entitlement." />{referral && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-[#bfd6dc] bg-[#eef7f8] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#315e6c]">Verified referrals</p><p className="mt-2 text-2xl font-extrabold text-[#234c58]">{referral.qualifyingReferralCount} <span className="text-sm font-normal">/ 150</span></p><p className="mt-1 text-xs text-[#477563]">Only verified subscription payments count.</p></div><div className="rounded-lg border border-[#dfc27a] bg-[#fff7df] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#765817]">Free subscription months</p><p className="mt-2 text-2xl font-extrabold text-[#765817]">{referral.freeMonthsRemaining}</p><p className="mt-1 text-xs text-[#765817]">Non-cash, non-transferable entitlement.</p></div></div>}{referral?.currentPeriod ? <div className="mt-5 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#2f6958]">Current code</p><p className="mt-2 font-mono text-xl font-extrabold tracking-[.08em]">{referral.currentPeriod.code}</p><p className="mt-1 text-xs text-[#477563]">Valid until {dateLabel(referral.currentPeriod.validUntil)}</p></div> : <p className="mt-4 text-sm text-[#697687]">Complete and verify your current subscription payment to unlock a monthly referral code.</p>}<form onSubmit={submitReferral} className="mt-5 flex flex-wrap gap-3"><input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} className="h-11 min-w-[220px] flex-1 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm uppercase outline-none focus:border-[#bca26a]" placeholder="Enter a merchant referral code" /><Button type="submit" disabled={!referralCode.trim()}>Apply referral code</Button></form>{referralMessage && <p className="mt-3 text-sm text-[#315e6c]">{referralMessage}</p>}{!!referral?.rewards.length && <div className="mt-5 text-sm text-[#697687]">{referral.rewards.slice(0, 3).map((reward) => <p key={reward.id}>Referrer reward: {money(reward.discountAmountMinor / 100, reward.currency)} off · {reward.status}</p>)}</div>}</section>
       {method === 'bank' && flutterwaveDestination && <form onSubmit={verifyBankPayment} className="mt-5 flex flex-wrap gap-3 rounded-xl border border-[#9fc7d0] bg-[#e8f6f8] p-5"><input required value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="h-11 min-w-[220px] flex-1 rounded-lg border border-[#9fc7d0] bg-white/70 px-3 font-mono text-sm outline-none" placeholder="Flutterwave transaction ID after transfer" /><Button type="submit">Verify payment</Button></form>}
       <section className="mt-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">{method === 'earnings' ? <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay from dashboard: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">Available in your dashboard: {money(earningsHeld, currency)}. The fee settles only when the full outstanding amount is available.</p></div><Button onClick={onEarnings} disabled={earningsPayment.isPending || outstanding === 0 || earningsHeld < outstanding} data-testid="button-pay-earnings">{earningsPayment.isPending ? 'Applying…' : outstanding === 0 ? 'Already settled' : earningsHeld < outstanding ? 'Insufficient dashboard balance' : 'Pay from dashboard'} <ArrowRight className="h-4 w-4" /></Button></div> : <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay by bank with Flutterwave: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">Use the temporary account above or generate another one. Flutterwave verifies the incoming payment before TS Commerce updates your subscription.</p></div><Button onClick={() => void startFlutterwaveCheckout()} disabled={flutterwavePending || outstanding === 0} data-testid="button-pay-by-bank">{flutterwavePending ? 'Generating account…' : outstanding === 0 ? 'Already settled' : flutterwaveDestination ? 'Generate new account' : 'Generate payment account'} <ExternalLink className="h-4 w-4" /></Button></div>}</section>
       <p className="mt-6 flex items-center gap-2 text-xs text-[#697687]"><TriangleAlert className="h-4 w-4 text-[#a2772e]" /> Flutterwave verifies the payment server-side before TS Commerce updates your subscription and unlocks features. Bank details come only from Flutterwave, either directly here or on its secure payment page.</p>
      <Link href="/dashboard" className="mt-6 inline-flex text-sm font-extrabold text-[#8a6826] underline" data-testid="link-back-dashboard">Back to overview</Link>
    </div>
  </AppShell>;
}