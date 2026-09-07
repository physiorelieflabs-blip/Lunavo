import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, Clock3, CreditCard, ExternalLink, LockKeyhole, TriangleAlert } from 'lucide-react';
import {
  customFetch,
  getGetDashboardOverviewQueryKey,
  getGetSubscriptionQueryKey,
  getListDashboardActivityQueryKey,
  useGetCurrencySettings,
  useGetSubscriptionBankDestination,
  useGetSubscription,
  usePaySubscriptionFromEarnings,
  useSubmitBankTransfer,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { dateLabel, money } from '@/lib/format';

type PaymentMethod = 'earnings' | 'flutterwave' | 'bank';

export default function Billing() {
  const subscription = useGetSubscription();
  const currencySettings = useGetCurrencySettings();
  const bankDestinationQuery = useGetSubscriptionBankDestination();
  const queryClient = useQueryClient();
  const earningsPayment = usePaySubscriptionFromEarnings();
  const transfer = useSubmitBankTransfer();
  const [method, setMethod] = useState<PaymentMethod>('earnings');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [senderName, setSenderName] = useState('');
  const [message, setMessage] = useState('');
  const [flutterwavePending, setFlutterwavePending] = useState(false);
  const [flutterwaveDestination, setFlutterwaveDestination] = useState<{
    bankName: string;
    accountName: string;
    accountNumber: string;
    amount: number;
    currency: string;
    providerReference: string | null;
    expiresAt: string | null;
  } | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [referral, setReferral] = useState<{
    currentPeriod: { code: string; validUntil: string } | null;
    rewards: Array<{ id: number; discountAmountMinor: number; currency: string; status: string }>;
  } | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralMessage, setReferralMessage] = useState('');

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
    if (savedMethod === 'Pay from bank' || savedMethod === 'bank') setMethod('bank');
    if (savedMethod === 'flutterwave' || savedMethod === 'Pay with Flutterwave') setMethod('flutterwave');
  }, [subscription.data?.paymentMethod]);

  useEffect(() => {
    void customFetch<typeof referral>('/api/referrals', { responseType: 'json' })
      .then(setReferral)
      .catch(() => undefined);
  }, []);

  if (subscription.isLoading || currencySettings.isLoading || bankDestinationQuery.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (subscription.isError || currencySettings.isError || bankDestinationQuery.isError || !subscription.data) return <AppShell><ErrorState onRetry={() => { void subscription.refetch(); void currencySettings.refetch(); void bankDestinationQuery.refetch(); }} /></AppShell>;

  const data = subscription.data;
  const bankDestination = {
    ...bankDestinationQuery,
    data: bankDestinationQuery.data ?? {
      configured: false,
      beneficiaryName: null,
      bankName: null,
      bankCode: null,
      accountNumber: null,
      currency: currencySettings.data?.currency ?? 'USD',
    },
  };
  const currency = data.currency ?? currencySettings.data?.currency ?? 'USD';
  const outstanding = Math.max(data.amountDue - data.amountPaid, 0);
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
  const graceCopy = data.gracePeriodHours === 24 ? '24-hour payment-selection window' : '14-day payment window after method selection';

  function refreshBilling() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
    ]);
  }

  const onEarnings = () => {
    setMessage('');
    earningsPayment.mutate(undefined, {
      onSuccess: () => { setMessage('Payment applied from your dashboard balance.'); void refreshBilling(); },
      onError: () => setMessage('We could not pay from dashboard. Confirm that enough dashboard balance is available, or choose another payment method.'),
    });
  };

  const submitTransfer = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!bankDestination.data.configured) {
      setMessage('The master admin has not configured a bank destination yet.');
      return;
    }
    transfer.mutate({ data: { amount: Number(amount), reference, senderName } }, {
      onSuccess: (payment) => {
        setMessage(`Pay from bank submission for ${money(payment.amount, payment.currency)} received. It remains unpaid until the master admin verifies it.`);
        setAmount('');
        setReference('');
        setSenderName('');
        void refreshBilling();
      },
       onError: () => setMessage('The bank payment could not be submitted. Retry with a new reference, or choose another payment method above.'),
    });
  };

  const chooseMethod = async (value: PaymentMethod) => {
    setMethod(value);
    if (value === 'flutterwave') return;
    setMessage('');
    try {
      const result = await customFetch<{ paymentMethod?: string; amountPaid?: number }>('/api/subscription', {
        method: 'POST',
        body: JSON.stringify({ method: value === 'earnings' ? 'earnings' : 'bank' }),
        responseType: 'json',
      });
      setMessage(
        result.amountPaid && result.amountPaid >= data.amountDue
          ? 'Your dashboard payment was applied and access is restored.'
          : value === 'earnings'
            ? 'Dashboard selected. You have 14 days from this choice to gather the money and settle the subscription.'
            : 'Bank selected. Send the amount below, then submit the transfer reference for verification.',
      );
      void refreshBilling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment method could not be selected. Retry or choose another method.');
    }
  };

  const startFlutterwaveCheckout = async () => {
    setMessage('');
    setFlutterwavePending(true);
    try {
      const result = await customFetch<{ purchaseUrl: string | null; paymentDestination?: { bankName: string; accountName: string; accountNumber: string; amount: number; currency: string; providerReference: string | null; expiresAt: string | null } | null }>('/api/subscription/flutterwave-checkout', {
        method: 'POST',
        body: JSON.stringify({}),
        responseType: 'json',
      });
      if (result.paymentDestination) {
        setFlutterwaveDestination(result.paymentDestination);
        setMessage(`Transfer the exact amount to the Flutterwave-generated account, then keep the payment reference for verification.`);
      } else if (result.purchaseUrl) {
        window.location.assign(result.purchaseUrl);
      } else {
        throw new Error('Flutterwave did not return a payment destination.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Flutterwave checkout could not be started.');
      setFlutterwavePending(false);
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
      const latest = await customFetch<typeof referral>('/api/referrals', { responseType: 'json' });
      setReferral(latest);
    } catch (error) {
      setReferralMessage(error instanceof Error ? error.message : 'Referral code could not be recorded.');
    }
  };

  const routeButton = (value: PaymentMethod, icon: ReactNode, title: string, description: string, testId: string) => (
    <button onClick={() => void chooseMethod(value)} className={`rounded-xl border p-5 text-left ${method === value ? 'border-[#bca26a] bg-[#f7edd2]' : 'border-[#d9d2c4] bg-[#fbfaf6] hover:border-[#bca26a]'}`} data-testid={testId}>
      <div className="flex items-center justify-between">{icon}{method === value && <CheckCircle2 className="h-5 w-5 text-[#a2772e]" />}</div>
      <p className="mt-6 font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-[#697687]">{description}</p>
    </button>
  );

  const messageIsError = /could|not return|error|failed|invalid|exceed/i.test(message);

  return <AppShell>
    <div className="mx-auto max-w-[1050px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Subscription ledger</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Keep your account moving.</h1>
          <p className="mt-2 text-sm text-[#697687]">The {money(data.baseAmountUsd, 'USD')} monthly platform fee is {money(data.amountDue, currency)} in your billing currency.</p>
          <p className="mt-1 text-xs text-[#697687]">Rate locked at {data.fxRate.toFixed(4)} · {data.fxSource}</p>
        </div>
        <Badge tone={suspended ? 'danger' : data.status === 'active' ? 'success' : 'warning'}>{data.status.replaceAll('_', ' ')}</Badge>
      </div>

       {message && <div className="mt-7"><Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'Action not completed' : 'Update received'}>{message}</Notice></div>}
        {locked ? <div className="mt-8"><Notice tone="danger" title="Billing access is locked">The workspace is locked. Retry the bank or Flutterwave payment, or choose dashboard earnings to restore access after a verified payment.</Notice></div> : data.daysRemaining <= 7 && <div className="mt-8"><Notice title={`Action needed within ${data.daysRemaining || 1} day${data.daysRemaining === 1 ? '' : 's'}`}>{data.paymentMethod ? `Your selected method has ${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} left. ` : 'Select a payment method within 24 hours. '}Settle the outstanding balance before the window closes.</Notice></div>}

      <div className="mt-8 grid gap-4 md:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-8">
          <div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#d6aa46]">Outstanding</p><p className="mt-5 font-mono text-5xl tracking-[-.1em]">{money(outstanding, currency)}</p><p className="mt-3 text-sm text-[#aab6c2]">of {money(data.amountDue, currency)} due this cycle</p></div><LockKeyhole className="h-5 w-5 text-[#d6aa46]" /></div>
          <div className="mt-9 h-2 overflow-hidden rounded-full bg-[#3b4b60]"><div className="h-full rounded-full bg-[#d6aa46]" style={{ width: `${data.amountDue > 0 ? Math.min((data.amountPaid / data.amountDue) * 100, 100) : 100}%` }} /></div>
           <div className="mt-3 flex justify-between text-xs text-[#aab6c2]"><span>{money(data.amountPaid, currency)} paid</span><span>{data.paymentMethod ? `Day ${data.daysElapsed} of ${data.suspensionDay}` : 'Select a payment method'}</span></div>
        </section>
        <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
           <div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#a2772e]">Account clock</p><p className="mt-4 text-3xl font-extrabold tracking-[-.06em]">{locked ? 'Locked' : `${countdownDays}d ${String(countdownHours).padStart(2, '0')}h`}</p><p className="mt-1 text-sm text-[#697687]">{locked ? `${graceCopy} has ended` : `${graceCopy} · ${String(countdownMinutes).padStart(2, '0')}m ${String(countdownSeconds).padStart(2, '0')}s remaining`}</p></div><Clock3 className="h-5 w-5 text-[#a2772e]" /></div>
            <div className="mt-7 space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#697687]">Registered</span><strong>{dateLabel(data.registeredAt)}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Payment method</span><strong>{selectedMethod}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Access deadline</span><strong>{dateLabel(data.trialEndsAt)}</strong></div></div>
        </section>
      </div>

      <section className="mt-10">
         <SectionHeading eyebrow="Choose a route" title="Settle the subscription" description="You have 24 hours to choose a method. After choosing one, the payment window is 14 days. If a bank payment fails, retry it or choose another method." />
        <div className="grid gap-4 md:grid-cols-3">
          {routeButton('earnings', <Banknote className="h-5 w-5 text-[#a2772e]" />, 'Pay from dashboard', 'Use earnings already available in your TS Commerce dashboard.', 'button-method-earnings')}
          {routeButton('flutterwave', <ExternalLink className="h-5 w-5 text-[#a2772e]" />, 'Pay with Flutterwave', 'Open secure hosted checkout and return here for verification.', 'button-method-flutterwave')}
          {routeButton('bank', <CreditCard className="h-5 w-5 text-[#a2772e]" />, 'Pay from bank', 'Send money from your bank and submit the payment reference.', 'button-method-bank')}
        </div>
         {method === 'flutterwave' && flutterwaveDestination && <div className="mt-5 rounded-xl border border-[#9fc7d0] bg-[#e8f6f8] p-5 text-sm text-[#234c58]"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#315e6c]">Flutterwave-generated payment destination</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><p><span className="text-xs text-[#477563]">Bank name</span><br /><strong>{flutterwaveDestination.bankName}</strong></p><p><span className="text-xs text-[#477563]">Account name</span><br /><strong>{flutterwaveDestination.accountName}</strong></p><p><span className="text-xs text-[#477563]">Account number</span><br /><strong className="font-mono">{flutterwaveDestination.accountNumber}</strong></p><p><span className="text-xs text-[#477563]">Exact amount</span><br /><strong className="font-mono">{money(flutterwaveDestination.amount, flutterwaveDestination.currency)}</strong></p><p><span className="text-xs text-[#477563]">Payment reference</span><br /><strong className="font-mono">{flutterwaveDestination.providerReference ?? 'Provider reference pending'}</strong></p>{flutterwaveDestination.expiresAt && <p><span className="text-xs text-[#477563]">Expires</span><br /><strong>{new Date(flutterwaveDestination.expiresAt).toLocaleString()}</strong></p>}</div><p className="mt-3 text-xs leading-5">This destination belongs only to this subscription payment session. Never use a TS code or transaction ID as the bank account number.</p></div>}
      </section>

       <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
         <SectionHeading eyebrow="Merchant referrals" title="Invite another merchant" description="Your referral code is created after a verified subscription payment. A qualifying referred merchant earns 30% off their next monthly subscription." />
         {referral?.currentPeriod ? <div className="mt-5 rounded-lg border border-[#b8d6ca] bg-[#eff8f3] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#2f6958]">Current code</p><p className="mt-2 font-mono text-xl font-extrabold tracking-[.08em]">{referral.currentPeriod.code}</p><p className="mt-1 text-xs text-[#477563]">Valid until {dateLabel(referral.currentPeriod.validUntil)}</p></div> : <p className="mt-4 text-sm text-[#697687]">Complete and verify your current subscription payment to unlock a monthly referral code.</p>}
         <form onSubmit={submitReferral} className="mt-5 flex flex-wrap gap-3"><input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} className="h-11 min-w-[220px] flex-1 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm uppercase outline-none focus:border-[#bca26a]" placeholder="Enter a merchant referral code" /><Button type="submit" disabled={!referralCode.trim()}>Apply referral code</Button></form>
         {referralMessage && <p className="mt-3 text-sm text-[#315e6c]">{referralMessage}</p>}
         {!!referral?.rewards.length && <div className="mt-5 text-sm text-[#697687]">{referral.rewards.slice(0, 3).map((reward) => <p key={reward.id}>Reward: {money(reward.discountAmountMinor / 100, reward.currency)} · {reward.status}</p>)}</div>}
       </section>

      <section className="mt-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        {method === 'earnings' ? <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay from dashboard: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">Available in your dashboard: {money(data.earningsHeld, currency)}. The fee settles only when the full outstanding amount is available.</p></div><Button onClick={onEarnings} disabled={earningsPayment.isPending || outstanding === 0 || data.earningsHeld < outstanding} data-testid="button-pay-earnings">{earningsPayment.isPending ? 'Applying…' : outstanding === 0 ? 'Already settled' : data.earningsHeld < outstanding ? 'Insufficient dashboard balance' : 'Pay from dashboard'} <ArrowRight className="h-4 w-4" /></Button></div>
          : method === 'flutterwave' ? <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-extrabold">Pay securely with Flutterwave: {money(outstanding, currency)}</h3><p className="mt-1 text-sm text-[#697687]">You will be redirected to Flutterwave’s hosted checkout. TS Commerce verifies the returned transaction before crediting your subscription.</p></div><Button onClick={() => void startFlutterwaveCheckout()} disabled={flutterwavePending || outstanding === 0} data-testid="button-pay-flutterwave">{flutterwavePending ? 'Opening checkout…' : outstanding === 0 ? 'Already settled' : 'Open Flutterwave checkout'} <ExternalLink className="h-4 w-4" /></Button></div>
            : <form onSubmit={submitTransfer} className="grid gap-5 md:grid-cols-2"><div className="md:col-span-2"><h3 className="font-extrabold">Pay from bank: transfer to TS Commerce</h3><p className="mt-1 text-sm text-[#697687]">Send the exact amount to the configured TS Commerce bank destination below, then submit the payment reference. If it is rejected, use a new reference to retry or choose another method above.</p></div><div className="rounded-lg border border-[#dfc27a] bg-[#fff7df] p-4 md:col-span-2">{bankDestination.data.configured ? <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#765817]">Beneficiary</p><p className="mt-1 font-extrabold text-[#182333]">{bankDestination.data.beneficiaryName}</p></div><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#765817]">Bank</p><p className="mt-1 font-extrabold text-[#182333]">{bankDestination.data.bankName} · {bankDestination.data.bankCode}</p></div><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#765817]">Account number</p><p className="mt-1 font-mono font-extrabold text-[#182333]">{bankDestination.data.accountNumber}</p></div><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#765817]">Send in</p><p className="mt-1 font-extrabold text-[#182333]">{bankDestination.data.currency}</p></div></div> : <p className="text-sm font-bold text-[#765817]">The master admin has not configured a bank destination yet. Return after it is added in Admin → Withdrawals.</p>}</div><label className="text-sm font-bold">Amount sent<input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder={outstanding.toFixed(2)} data-testid="input-transfer-amount" /></label><label className="text-sm font-bold">Sender name<input value={senderName} onChange={(event) => setSenderName(event.target.value)} required minLength={2} autoComplete="name" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="Name on the account" /></label><label className="text-sm font-bold md:col-span-2">Bank payment reference<input value={reference} onChange={(event) => setReference(event.target.value)} required minLength={3} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm uppercase outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="e.g. TRX-48291" data-testid="input-transfer-reference" /></label><div className="flex flex-wrap items-center gap-3 md:col-span-2"><SubmitButton loading={transfer.isPending}>Submit bank payment</SubmitButton><span className="text-xs text-[#697687]">The master admin verifies the bank payment before it updates the admin balance and your subscription.</span></div></form>}
      </section>

      <p className="mt-6 flex items-center gap-2 text-xs text-[#697687]"><TriangleAlert className="h-4 w-4 text-[#a2772e]" /> Flutterwave payments are verified server-side before they update your subscription. Manual bank submissions are reviewed by the TS Commerce team.</p>
      <Link href="/dashboard" className="mt-6 inline-flex text-sm font-extrabold text-[#8a6826] underline" data-testid="link-back-dashboard">Back to overview</Link>
    </div>
  </AppShell>;
}