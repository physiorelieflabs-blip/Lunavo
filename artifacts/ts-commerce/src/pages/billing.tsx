import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Gift,
  Landmark,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import {
  customFetch,
  getGetCurrencySettingsQueryKey,
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

type ReferralOverview = {
  currentPeriod: { code: string; validUntil: string } | null;
  qualifyingReferralCount: number;
  freeMonthsRemaining: number;
  milestones: Array<{
    id: number;
    milestoneKey: string;
    qualifyingReferralCount: number;
    freeMonths: number;
    status: string;
    grantedAt: string;
  }>;
  rewards: Array<{
    id: number;
    discountAmountMinor: number;
    currency: string;
    status: string;
  }>;
};

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#d8d1c4] bg-[#fcfbf7] shadow-[0_12px_35px_rgba(31,43,56,.05)] ${className}`}>
      {children}
    </section>
  );
}

function RouteCard({
  active,
  icon,
  title,
  subtitle,
  description,
  onClick,
  testId,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(31,43,56,.08)] ${active ? 'border-[#a9853d] bg-[#fff8e8] shadow-[0_10px_28px_rgba(169,133,61,.10)]' : 'border-[#d8d1c4] bg-[#fcfbf7] hover:border-[#bca26a]'}`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${active ? 'bg-[#ead9ad] text-[#71551c]' : 'bg-[#f0ece3] text-[#7a8490]'}`}>
          {icon}
        </span>
        {active && <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1f6f58] text-white"><Check className="h-4 w-4" /></span>}
      </div>
      <div className="mt-5">
        <p className="text-base font-extrabold tracking-[-.02em] text-[#182333]">{title}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[.08em] text-[#9b7830]">{subtitle}</p>
        <p className="mt-3 text-sm leading-6 text-[#687482]">{description}</p>
      </div>
    </button>
  );
}

export default function Billing() {
  const subscription = useGetSubscription();
  const currencySettings = useGetCurrencySettings();
  const earningsPayment = usePaySubscriptionFromEarnings();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<PaymentMethod>('earnings');
  const [message, setMessage] = useState('');
  const [flutterwavePending, setFlutterwavePending] = useState(false);
  const [flutterwaveDestination, setFlutterwaveDestination] = useState<PaymentDestination | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referral, setReferral] = useState<ReferralOverview | null>(null);
  const [referralMessage, setReferralMessage] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [currencyPending, setCurrencyPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshBilling = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetCurrencySettingsQueryKey() }),
    ]);
  };

  useEffect(() => {
    const savedMethod = subscription.data?.paymentMethod;
    if (savedMethod === 'earnings' || savedMethod === 'Pay from dashboard') setMethod('earnings');
    if (['bank', 'flutterwave', 'Pay from bank', 'Pay with Flutterwave'].includes(savedMethod ?? '')) setMethod('bank');
  }, [subscription.data?.paymentMethod]);

  useEffect(() => {
    void customFetch<ReferralOverview>('/api/referrals', { responseType: 'json' })
      .then(setReferral)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('flutterwave') !== 'return') return;
    const transaction = params.get('transaction_id') ?? params.get('transactionId');
    window.history.replaceState({}, '', '/billing');
    if (!transaction) {
      setMessage('Flutterwave returned without a transaction ID. The payment remains unconfirmed until the provider can verify it.');
      return;
    }
    let active = true;
    void customFetch<{ message: string }>('/api/subscription/flutterwave-verify', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transaction }),
      responseType: 'json',
    }).then(async (result) => {
      if (!active) return;
      setMessage(result.message);
      await refreshBilling();
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : 'Flutterwave payment verification could not be completed.');
    });
    return () => { active = false; };
  }, [queryClient]);

  if (subscription.isLoading || currencySettings.isLoading) {
    return <AppShell><LoadingState label="Loading subscription billing" /></AppShell>;
  }

  if (subscription.isError || currencySettings.isError || !subscription.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <ErrorState onRetry={() => { void subscription.refetch(); void currencySettings.refetch(); }} />
        </div>
      </AppShell>
    );
  }

  const data = subscription.data;
  const currency = data.currency ?? currencySettings.data?.currency ?? 'USD';
  const availableCurrencies = currencySettings.data?.availableCurrencies ?? [];
  const outstanding = Math.max(0, data.amountDue - data.amountPaid);
  const earningsHeld = data.earningsHeld ?? 0;
  const locked = data.accessLocked || data.status === 'suspended';
  const dashboardMode = data.paymentMethod === 'earnings' || data.paymentMethod === 'Pay from dashboard';
  const serverDelta = new Date(data.serverNow).getTime() - tick;
  const deadlineMs = new Date(data.trialEndsAt).getTime();
  const countdownMs = Math.max(0, deadlineMs - (tick + serverDelta));
  const countdownTotalSeconds = Math.floor(countdownMs / 1000);
  const countdownDays = Math.floor(countdownTotalSeconds / 86400);
  const countdownHours = Math.floor((countdownTotalSeconds % 86400) / 3600);
  const countdownMinutes = Math.floor((countdownTotalSeconds % 3600) / 60);
  const countdownSeconds = countdownTotalSeconds % 60;
  const progress = data.amountDue > 0 ? Math.min(100, (data.amountPaid / data.amountDue) * 100) : 100;
  const messageIsError = /could not|cannot|failed|invalid|expired|unavailable|error|not completed/i.test(message);

  const statusLabel = locked
    ? 'Access locked'
    : dashboardMode
      ? '15-day earning window active'
      : data.status.replaceAll('_', ' ');

  const statusTone = locked ? 'danger' : dashboardMode ? 'warning' : 'success';

  const changePaymentCurrency = async (nextCurrency: string) => {
    if (!nextCurrency || nextCurrency === currency || currencyPending) return;
    setCurrencyPending(true);
    setMessage('');
    try {
      await customFetch('/api/settings/currency', {
        method: 'PUT',
        body: JSON.stringify({ currency: nextCurrency }),
        responseType: 'json',
      });
      setSelectedCurrency(nextCurrency);
      setFlutterwaveDestination(null);
      setTransactionId('');
      setMessage(`Your unpaid subscription is now priced in ${nextCurrency}.`);
      await refreshBilling();
    } catch (error) {
      setSelectedCurrency(currency);
      setMessage(error instanceof Error ? error.message : 'The payment currency could not be changed.');
    } finally {
      setCurrencyPending(false);
    }
  };

  const startFlutterwaveCheckout = async () => {
    setMessage('');
    setFlutterwavePending(true);
    try {
      const result = await customFetch<{ purchaseUrl: string | null; paymentDestination?: PaymentDestination | null }>(
        '/api/subscription/flutterwave-checkout',
        {
          method: 'POST',
          body: JSON.stringify({ attemptKey: crypto.randomUUID() }),
          responseType: 'json',
        },
      );

      if (result.paymentDestination) {
        setFlutterwaveDestination(result.paymentDestination);
        window.history.replaceState({}, '', '/billing?method=bank');
        requestAnimationFrame(() => document.getElementById('bank-payment-destination')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        setMessage('A real Flutterwave payment destination has been generated. Transfer the exact amount shown; your account changes only after provider verification.');
      } else if (result.purchaseUrl) {
        window.history.replaceState({}, '', '/billing?method=bank');
        window.location.assign(result.purchaseUrl);
        return;
      } else {
        throw new Error('Flutterwave did not return a payment destination or hosted payment page.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Flutterwave payment could not be started.');
    } finally {
      setFlutterwavePending(false);
    }
  };

  const chooseMethod = async (value: PaymentMethod) => {
    setMethod(value);
    setMessage('');
    try {
      const result = await customFetch<{ amountPaid?: number }>('/api/subscription', {
        method: 'POST',
        body: JSON.stringify({ method: value }),
        responseType: 'json',
      });
      if (value === 'earnings') {
        setMessage(result.amountPaid && result.amountPaid >= data.amountDue
          ? 'Your subscription is settled and the full workspace is active.'
          : 'Dashboard payment selected. Your entire workspace is unlocked for this 15-day earning window.');
      } else {
        setMessage('Bank payment selected. A fresh Flutterwave destination will be generated for this subscription currency.');
        setFlutterwaveDestination(null);
        await startFlutterwaveCheckout();
      }
      await refreshBilling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment route could not be selected.');
    }
  };

  const payFromDashboard = () => {
    setMessage('');
    earningsPayment.mutate(undefined, {
      onSuccess: async () => {
        setMessage('The available eligible dashboard earnings were applied to your subscription.');
        await refreshBilling();
      },
      onError: (error) => {
        setMessage(error instanceof Error ? error.message : 'Dashboard earnings could not be applied.');
      },
    });
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
      setReferral(await customFetch<ReferralOverview>('/api/referrals', { responseType: 'json' }));
    } catch (error) {
      setReferralMessage(error instanceof Error ? error.message : 'Referral code could not be recorded.');
    }
  };

  const copyAccount = async () => {
    if (!flutterwaveDestination) return;
    await navigator.clipboard.writeText(flutterwaveDestination.accountNumber);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const referralProgress = useMemo(
    () => Math.min(100, ((referral?.qualifyingReferralCount ?? 0) / 150) * 100),
    [referral?.qualifyingReferralCount],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1120px]">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a2772e]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Subscription & billing
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-.055em] text-[#182333] md:text-4xl">
              Keep your workspace active.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687482]">
              One place to manage your subscription, payment route, billing currency, and merchant referral benefits.
            </p>
          </div>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </header>

        {message && (
          <div className="mt-7" aria-live="polite">
            <Notice tone={messageIsError ? 'danger' : 'success'} title={messageIsError ? 'Action needs attention' : 'Billing update'}>
              {message}
            </Notice>
          </div>
        )}

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <Card className="overflow-hidden">
            <div className="bg-[#182333] p-6 text-[#f8f3e8] md:p-8">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#d6aa46]">Outstanding balance</p>
                  <p className="mt-4 text-5xl font-extrabold tracking-[-.07em]">{money(outstanding, currency)}</p>
                  <p className="mt-2 text-sm text-[#aeb8c4]">of {money(data.amountDue, currency)} due this billing period</p>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><BadgeDollarSign className="h-5 w-5 text-[#d6aa46]" /></span>
              </div>

              <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#d6aa46] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[#aeb8c4]">
                <span>{money(data.amountPaid, currency)} paid</span>
                <span>{Math.round(progress)}% complete</span>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[.12em] text-[#9facb9]">Currency</p>
                  <p className="mt-2 font-mono text-lg font-bold">{currency}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[.12em] text-[#9facb9]">Method</p>
                  <p className="mt-2 text-sm font-bold">{data.paymentMethod ?? 'Not selected'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[.12em] text-[#9facb9]">Rate source</p>
                  <p className="mt-2 truncate text-sm font-bold">{data.fxSource}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Access clock</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em]">
                  {locked ? 'Workspace protected' : dashboardMode ? `${countdownDays}d ${String(countdownHours).padStart(2, '0')}h` : 'Active'}
                </h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#efe6d0] text-[#8a6826]"><Clock3 className="h-5 w-5" /></span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#687482]">
              {locked
                ? 'Choose Pay from dashboard to unlock every merchant feature for 15 days, or choose Pay by bank and complete verified payment.'
                : dashboardMode
                  ? `Your dashboard earning window is active. ${String(countdownHours).padStart(2, '0')}h ${String(countdownMinutes).padStart(2, '0')}m ${String(countdownSeconds).padStart(2, '0')}s remain in the current window.`
                  : 'Your subscription is currently active.'}
            </p>

            {dashboardMode && !locked && (
              <div className="mt-6 rounded-xl border border-[#e0c982] bg-[#fff9e8] p-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#6e531a]"><Sparkles className="h-4 w-4" /> Full workspace access is enabled</div>
                <p className="mt-1 text-xs leading-5 text-[#806d42]">The 15-day clock is controlled by the server and cannot be reset by changing payment routes.</p>
              </div>
            )}
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-[#7a8490]">Billing period</span><strong>{dateLabel(data.registeredAt)}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-[#7a8490]">Access deadline</span><strong>{dateLabel(data.trialEndsAt)}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-[#7a8490]">Dashboard earnings held</span><strong>{money(earningsHeld, currency)}</strong></div>
            </div>
          </Card>
        </div>

        {locked && (
          <Card className="mt-6 border-[#e3c6bc] bg-[#fff8f5] p-5 md:p-6">
            <div className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4ddd6] text-[#9f4c3d]"><LockKeyhole className="h-5 w-5" /></span>
              <div>
                <h2 className="font-extrabold text-[#6f352d]">Your workspace is currently locked</h2>
                <p className="mt-1 text-sm leading-6 text-[#7f5e58]">
                  Billing remains available so you can choose your currency and payment route. No feature access is restored until the server confirms the applicable payment/access condition.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="mt-10">
          <SectionHeading
            eyebrow="Payment setup"
            title="Choose how you want to settle this period"
            description="Your selection controls access, but only verified money movement changes your subscription balance."
          />

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <RouteCard
              active={method === 'earnings'}
              icon={<Banknote className="h-5 w-5" />}
              title="Pay from dashboard"
              subtitle="15-day earning window"
              description="Immediately unlock the entire merchant workspace for one server-controlled 15-day window while you earn enough to settle the subscription."
              onClick={() => void chooseMethod('earnings')}
              testId="button-method-earnings"
            />
            <RouteCard
              active={method === 'bank'}
              icon={<Landmark className="h-5 w-5" />}
              title="Pay by bank with Flutterwave"
              subtitle="Provider-verified payment"
              description="Generate a real Flutterwave payment destination or open Flutterwave's secure bank-transfer page. Access changes only after verification."
              onClick={() => void chooseMethod('bank')}
              testId="button-method-bank"
            />
          </div>
        </div>

        <Card className="mt-5 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">Billing currency</p>
              <h2 className="mt-1 text-lg font-extrabold">Choose the currency you want to pay in</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#687482]">This remains available while locked. Changing currency reprices the unpaid subscription and invalidates stale payment attempts.</p>
            </div>
            <select
              value={selectedCurrency || currency}
              onChange={(event) => void changePaymentCurrency(event.target.value)}
              disabled={currencyPending}
              className="h-11 min-w-[160px] rounded-xl border border-[#d8d1c4] bg-[#f7f4ed] px-3 text-sm font-extrabold text-[#182333] outline-none focus:border-[#a9853d] focus:ring-2 focus:ring-[#d6aa46]/20"
              data-testid="select-subscription-currency"
            >
              {availableCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </Card>

        {method === 'earnings' ? (
          <Card className="mt-5 p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">Dashboard earnings</p>
                <h2 className="mt-1 text-xl font-extrabold">Apply eligible earnings to this subscription</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#687482]">
                  Current eligible amount: <strong>{money(earningsHeld, currency)}</strong>. The server will apply only what is available and will never over-deduct the balance.
                </p>
              </div>
              <Button onClick={payFromDashboard} disabled={earningsPayment.isPending || outstanding === 0 || earningsHeld <= 0} data-testid="button-pay-earnings">
                {earningsPayment.isPending ? 'Applying…' : outstanding === 0 ? 'Already settled' : earningsHeld <= 0 ? 'No eligible earnings yet' : 'Apply dashboard earnings'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ) : (
          <Card id="bank-payment-destination" className="mt-5 overflow-hidden">
            <div className="border-b border-[#d8d1c4] bg-[#f4f7f7] p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#234c58]"><ShieldCheck className="h-4 w-4" /> Flutterwave payment destination</div>
                  <p className="mt-1 text-xs leading-5 text-[#4e6b72]">Every bank detail below comes from the live provider response for this payment attempt.</p>
                </div>
                <button type="button" onClick={() => void startFlutterwaveCheckout()} disabled={flutterwavePending || outstanding === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9fc7d0] bg-white px-4 text-xs font-extrabold text-[#315e6c] hover:bg-[#eef7f8]">
                  <RefreshCw className={`h-4 w-4 ${flutterwavePending ? 'animate-spin' : ''}`} />
                  {flutterwavePending ? 'Generating…' : flutterwaveDestination ? 'Generate new details' : 'Generate payment details'}
                </button>
              </div>
            </div>

            {flutterwaveDestination ? (
              <div className="p-5 md:p-7">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#7d8792]">Bank</p><p className="mt-2 font-extrabold">{flutterwaveDestination.bankName}</p></div>
                  <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#7d8792]">Account name</p><p className="mt-2 font-extrabold">{flutterwaveDestination.accountName}</p></div>
                  <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-[10px] uppercase tracking-[.12em] text-[#7d8792]">Account number</p><p className="mt-2 font-mono text-2xl font-extrabold tracking-[.06em] text-[#182333]">{flutterwaveDestination.accountNumber}</p></div>
                      <button type="button" onClick={() => void copyAccount()} className="grid h-10 w-10 place-items-center rounded-xl border border-[#d8d1c4] bg-white text-[#657180] hover:text-[#182333]" aria-label="Copy bank account number">{copied ? <Check className="h-4 w-4 text-[#1f6f58]" /> : <Copy className="h-4 w-4" />}</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#7d8792]">Exact amount</p><p className="mt-2 font-mono text-xl font-extrabold">{money(flutterwaveDestination.amount, flutterwaveDestination.currency)}</p></div>
                  <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#7d8792]">Expires</p><p className="mt-2 text-sm font-extrabold">{flutterwaveDestination.expiresAt ? new Date(flutterwaveDestination.expiresAt).toLocaleString() : 'Provider did not supply an expiry'}</p></div>
                </div>

                <div className="mt-5 rounded-xl border border-[#e1dbcf] bg-[#f8f6f0] p-4 text-sm leading-6 text-[#586574]">
                  <strong className="text-[#182333]">Important:</strong> transfer the exact amount to the provider-returned account above. Your TS Commerce store code, customer code, and TS Pay reference identify the transaction; they are not bank accounts or payment destinations.
                </div>

                <form onSubmit={verifyBankPayment} className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    required
                    value={transactionId}
                    onChange={(event) => setTransactionId(event.target.value)}
                    className="h-11 flex-1 rounded-xl border border-[#d8d1c4] bg-white px-3 font-mono text-sm outline-none focus:border-[#9bbfc6] focus:ring-2 focus:ring-[#9fc7d0]/20"
                    placeholder="Flutterwave transaction ID after transfer"
                  />
                  <Button type="submit">Verify payment</Button>
                </form>
              </div>
            ) : (
              <div className="p-6 text-center md:p-10">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#eef4f5] text-[#315e6c]"><ExternalLink className="h-5 w-5" /></div>
                <h2 className="mt-4 text-lg font-extrabold">No payment destination generated yet</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#687482]">Generate the provider destination to see the actual bank details you should transfer money to. Nothing is marked paid merely by opening this page.</p>
                <button type="button" onClick={() => void startFlutterwaveCheckout()} disabled={flutterwavePending || outstanding === 0} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#182333] px-5 text-sm font-extrabold text-[#f8f3e8]">
                  <Landmark className="h-4 w-4" />
                  {flutterwavePending ? 'Generating…' : 'Generate real bank details'}
                </button>
              </div>
            )}
          </Card>
        )}

        <Card className="mt-8 overflow-hidden">
          <div className="border-b border-[#d8d1c4] p-6 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <SectionHeading
                eyebrow="Merchant referral program"
                title="Build toward 12 free months"
                description="A genuinely new merchant must complete a verified first subscription payment before a referral qualifies."
              />
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#efe5ce] text-[#8a6826]"><Gift className="h-5 w-5" /></span>
            </div>
          </div>

          <div className="grid gap-5 p-6 md:grid-cols-[1fr_.95fr] md:p-7">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7c8792]">Verified paid referrals</p><p className="mt-1 text-4xl font-extrabold tracking-[-.05em]">{referral?.qualifyingReferralCount ?? 0}</p></div>
                <p className="text-sm font-extrabold text-[#8a6826]">150+ unlocks 12 months free</p>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#ebe6db]"><div className="h-full rounded-full bg-[#a9853d]" style={{ width: `${referralProgress}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs text-[#7c8792]"><span>0</span><span>150 verified referrals</span></div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#7c8792]"><UsersRound className="h-4 w-4" /> Free months</div>
                  <p className="mt-2 text-2xl font-extrabold">{referral?.freeMonthsRemaining ?? 0}</p>
                  <p className="mt-1 text-xs leading-5 text-[#7c8792]">Subscription entitlement only. Never cash or withdrawable funds.</p>
                </div>
                <div className="rounded-xl border border-[#d8d1c4] bg-[#fbfaf6] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#7c8792]"><BadgeDollarSign className="h-4 w-4" /> Next referral reward</div>
                  <p className="mt-2 text-2xl font-extrabold">$9 off</p>
                  <p className="mt-1 text-xs leading-5 text-[#7c8792]">Applied to your next eligible $30 subscription, not credited as cash.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d8d1c4] bg-[#f8f5ed] p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#a2772e]">Current referral code</p>
              {referral?.currentPeriod ? (
                <>
                  <p className="mt-3 font-mono text-xl font-extrabold tracking-[.06em] text-[#182333]">{referral.currentPeriod.code}</p>
                  <p className="mt-1 text-xs text-[#77818c]">Valid until {dateLabel(referral.currentPeriod.validUntil)}</p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#687482]">Complete a verified subscription payment to activate your monthly referral code.</p>
              )}

              <form onSubmit={submitReferral} className="mt-5">
                <label className="text-xs font-bold uppercase tracking-[.1em] text-[#7c8792]">Have a referral code?</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={referralCode}
                    onChange={(event) => setReferralCode(event.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-[#d8d1c4] bg-white px-3 font-mono text-sm uppercase outline-none focus:border-[#a9853d]"
                    placeholder="TS-REF-XXXXXXXXXXXX"
                  />
                  <Button type="submit" disabled={!referralCode.trim()}>Apply</Button>
                </div>
                {referralMessage && <p className="mt-3 text-xs leading-5 text-[#4e6b72]">{referralMessage}</p>}
              </form>
            </div>
          </div>
        </Card>

        <div className="mt-6 flex flex-col gap-3 border-t border-[#d8d1c4] pt-6 text-xs leading-5 text-[#78828e] md:flex-row md:items-center md:justify-between">
          <p>All payment state changes are decided by TS Pay and the configured provider. Frontend buttons never create financial success.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 font-extrabold text-[#8a6826] underline underline-offset-4">Back to workspace <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </AppShell>
  );
}
