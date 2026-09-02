import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, CircleDollarSign, CreditCard, PackageCheck, RefreshCw, UsersRound } from 'lucide-react';
import { getGetCurrencySettingsQueryKey, getGetDashboardOverviewQueryKey, getGetMarketExchangeRateQueryKey, useGetCurrencySettings, useGetDashboardOverview, useGetMarketExchangeRate, useListDashboardActivity, useUpdateCurrencySettings } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, ErrorState, LoadingState, MetricCard, Notice, SectionHeading } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

export default function Dashboard() {
  const overview = useGetDashboardOverview();
  const activity = useListDashboardActivity();
  if (overview.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (overview.isError || !overview.data) return <AppShell><ErrorState onRetry={() => { void overview.refetch(); }} /></AppShell>;
  const data = overview.data;
  const subscription = data.subscription;
  const needsAttention = ['warning', 'suspended', 'past_due'].includes(subscription.status);
  return <AppShell><div className="mx-auto max-w-[1320px]">
     <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Merchant overview</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl" data-testid="text-store-name">{data.storeName}</h1><p className="mt-1 text-sm text-[#697687]">/{data.storeSlug} · your business at a glance</p></div><Badge tone={subscription.status === 'active' ? 'success' : 'warning'}>{subscription.status.replaceAll('_', ' ')}</Badge></div>
     <CurrencySettingsCard currentCurrency={data.currency} />
      <FxConverterCard quoteCurrency={data.currency} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-4 md:p-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#2f6958]">TS Pay</p><p className="mt-1 text-sm font-extrabold text-[#245746]">Move available funds to your bank</p><p className="mt-1 text-xs text-[#477563]">Secure your payout destination, authenticator, and transfer request in one place.</p></div>
        <Link href="/withdrawals" className="inline-flex items-center gap-2 rounded-lg bg-[#2f6958] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#245746]" data-testid="button-dashboard-withdraw">Withdraw available funds <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
     {needsAttention && <div className="mt-7"><Notice tone={subscription.status === 'suspended' ? 'danger' : 'warning'} title={subscription.status === 'suspended' ? 'Your account is suspended' : 'Your subscription needs attention'}>You have {money(subscription.amountDue - subscription.amountPaid, data.currency)} remaining on your platform subscription. <Link href="/billing" className="font-extrabold underline" data-testid="link-notice-billing">Review billing</Link>.</Notice></div>}
     <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Revenue" value={money(data.revenue, data.currency)} detail={<span className="inline-flex items-center gap-1 text-[#2f6958]"><ArrowUpRight className="h-3.5 w-3.5" />{data.revenueChange}% from last period</span>} icon={<CircleDollarSign className="h-5 w-5" />} /><MetricCard label="Available balance" value={money(data.availableBalance, data.currency)} detail="Ready to transfer" icon={<Banknote className="h-5 w-5" />} accent /><MetricCard label="Orders" value={data.orders.toLocaleString()} detail="Across all channels" icon={<PackageCheck className="h-5 w-5" />} /><MetricCard label="Customers" value={data.customers.toLocaleString()} detail="Unique buyers" icon={<UsersRound className="h-5 w-5" />} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_.8fr]"><section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-6"><SectionHeading eyebrow="Cash position" title="Revenue movement" description="A view of your recorded gross revenue." action={<Link href="/orders" className="text-xs font-extrabold text-[#8a6826] underline" data-testid="link-record-sale">Record a sale</Link>} />{data.revenueSeries.some((point) => point.amount > 0) ? <div className="flex h-52 items-end gap-2 border-b border-l border-[#d9d2c4] px-3 pb-0 pt-6 md:gap-4">{data.revenueSeries.map((point, index) => { const max = Math.max(...data.revenueSeries.map((item) => item.amount), 1); return <div key={point.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="relative w-full max-w-10 rounded-t-md bg-[#c4a152] transition-all duration-300 group-hover:bg-[#182333]" style={{ height: `${(point.amount / max) * 88}%` }} title={money(point.amount, data.currency)} data-testid={`bar-revenue-${index}`} /><span className="font-mono text-[10px] text-[#8994a2]">{point.label}</span></div>; })}</div> : <EmptyState title="No revenue recorded yet" description="Record your first paid sale to start building your revenue history." />}</section><section className="rounded-xl border border-[#d9d2c4] bg-[#182333] p-5 text-[#f8f3e8] md:p-6"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">Settlement view</p><h2 className="mt-3 text-xl font-extrabold">Where funds sit</h2><div className="mt-7 space-y-5"><BalanceRow label="Available" value={money(data.availableBalance, data.currency)} /><BalanceRow label="Pending" value={money(data.pendingBalance, data.currency)} /><BalanceRow label="Reserved for withdrawals" value={money(data.withdrawalReserved, data.currency)} /><BalanceRow label="Held for platform fee" value={money(data.earningsHeldForSubscription, data.currency)} brass /></div><div className="mt-7 border-t border-[#46566a] pt-4 text-xs leading-5 text-[#aab6c2]">Held earnings and withdrawal requests are reserved automatically. Only available funds can be requested.</div></section></div>
     <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]"><section><SectionHeading eyebrow="Ledger" title="Recent activity" action={<Link href="/billing" className="text-xs font-extrabold text-[#8a6826] underline" data-testid="link-view-billing">View billing</Link>} />{activity.isLoading ? <LoadingState label="Loading activity" /> : activity.data?.length ? <div className="divide-y divide-[#ded8cd] rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] px-5">{activity.data.map((item) => <div className="flex items-center gap-4 py-4" key={item.id} data-testid={`activity-${item.id}`} data-currency={item.currency}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.tone === 'negative' ? 'bg-[#f6e2de] text-[#a33e38]' : 'bg-[#e3eee9] text-[#2f6958]'}`}>{item.tone === 'negative' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{item.title}</p><p className="truncate text-xs text-[#697687]">{item.description} · {timeAgo(item.occurredAt)}</p></div><span className={`font-mono text-sm ${item.tone === 'negative' ? 'text-[#a33e38]' : 'text-[#2f6958]'}`}>{item.amount === null ? '—' : `${item.tone === 'negative' ? '−' : '+'}${money(item.amount, item.currency)}`}</span></div>)}</div> : <EmptyState title="No activity yet" description="When your first order moves through the ledger, it will appear here." />}</section><section><SectionHeading eyebrow="Subscription" title="Platform plan" /><div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><div className="flex items-start justify-between"><div><p className="font-mono text-3xl tracking-[-.08em]">{money(30, data.currency)}<span className="font-sans text-sm tracking-normal text-[#697687]"> / month</span></p><p className="mt-2 text-xs text-[#697687]">{subscription.paymentMethod ? `Paid via ${subscription.paymentMethod}` : 'No payment method on file'}</p></div><CreditCard className="h-5 w-5 text-[#a2772e]" /></div><div className="mt-6 space-y-3 text-sm"><div className="flex justify-between"><span className="text-[#697687]">Paid this cycle</span><strong>{money(subscription.amountPaid, data.currency)}</strong></div><div className="flex justify-between"><span className="text-[#697687]">Held from earnings</span><strong>{money(subscription.earningsHeld, data.currency)}</strong></div></div><Link href="/billing" className="mt-6 block rounded-lg bg-[#e9e1cd] px-4 py-3 text-center text-sm font-extrabold text-[#79591b] hover:bg-[#e3d7b9]" data-testid="link-manage-subscription">Manage subscription</Link></div></section></div>
  </div></AppShell>;
}

function FxConverterCard({ quoteCurrency }: { quoteCurrency: string }) {
  const [amount, setAmount] = useState('100');
  const rate = useGetMarketExchangeRate(
    { base: 'USD', quote: quoteCurrency },
    { query: { queryKey: getGetMarketExchangeRateQueryKey({ base: 'USD', quote: quoteCurrency }), refetchInterval: 15 * 60 * 1000 } },
  );
  const numericAmount = Number(amount);
  const converted = Number.isFinite(numericAmount) && rate.data ? numericAmount * rate.data.rate : 0;
  return <section className="mt-4 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 md:p-5" data-testid="section-market-fx">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#315e6c]">Market conversion</p><h2 className="mt-1 font-extrabold">See today’s rate before you price.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#477563]">Live public-market reference for planning only. It never relabels historical orders, balances, or ledger entries.</p></div>
      <RefreshCw className={`h-5 w-5 text-[#315e6c] ${rate.isFetching ? 'animate-spin' : ''}`} />
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr_auto] sm:items-end">
      <label className="text-sm font-bold text-[#315e6c]">USD amount<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[#bfd6dc] bg-white/70 px-3 font-mono text-sm outline-none focus:border-[#315e6c]" data-testid="input-fx-amount" /></label>
      <div className="rounded-lg border border-[#bfd6dc] bg-white/70 px-3 py-2.5 font-mono text-sm text-[#315e6c]">{rate.isLoading ? 'Loading market rate…' : rate.data ? `1 USD = ${rate.data.rate.toFixed(4)} ${quoteCurrency}` : 'Market rate unavailable'}</div>
      <div className="rounded-lg bg-[#315e6c] px-4 py-2.5 text-right font-mono text-sm font-bold text-white">{rate.data ? converted.toFixed(2) : '—'} {quoteCurrency}</div>
    </div>
    {rate.data && <p className="mt-3 text-[11px] text-[#477563]">Source: {rate.data.source} · updated {new Date(rate.data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{rate.data.asOf ? ` · market as of ${new Date(rate.data.asOf).toLocaleDateString()}` : ''}. Refreshes every 15 minutes.</p>}
  </section>;
}

function BalanceRow({ label, value, brass = false }: { label: string; value: string; brass?: boolean }) {
  return <div className="flex items-center justify-between border-b border-[#46566a] pb-3 last:border-0"><span className={`text-sm ${brass ? 'text-[#d6aa46]' : 'text-[#aab6c2]'}`}>{label}</span><strong className={`font-mono text-sm ${brass ? 'text-[#f0d894]' : 'text-[#f8f3e8]'}`}>{value}</strong></div>;
}

function CurrencySettingsCard({ currentCurrency }: { currentCurrency: string }) {
  const settings = useGetCurrencySettings();
  const update = useUpdateCurrencySettings();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState(currentCurrency);
  const [message, setMessage] = useState('');
  const save = () => {
    setMessage('');
    update.mutate({ data: { currency } }, {
      onSuccess: (result) => {
        setCurrency(result.currency);
        setMessage(`Dashboard and new withdrawals now use ${result.currency}.`);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetCurrencySettingsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
        ]);
      },
      onError: () => setMessage('Currency could not be updated. Choose one of the supported currencies.'),
    });
  };
  const changed = currency !== currentCurrency;
  return <section className="mt-7 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4 md:p-5" data-testid="section-currency-settings">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Payout preference</p><h2 className="mt-1 font-extrabold">Choose your local currency</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#697687]">This controls dashboard amounts and the currency used for new withdrawals. Existing orders keep their recorded currency; no silent exchange-rate conversion is applied.</p></div>
      <div className="flex items-center gap-2"><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm font-bold outline-none focus:border-[#bca26a]" aria-label="Dashboard currency" data-testid="select-dashboard-currency">{(settings.data?.availableCurrencies ?? [currentCurrency]).map((item) => <option key={item} value={item}>{item}</option>)}</select><button type="button" onClick={save} disabled={!changed || update.isPending} className="h-10 rounded-lg bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] disabled:cursor-not-allowed disabled:opacity-50">{update.isPending ? 'Saving…' : 'Save currency'}</button></div>
    </div>
    {message && <p className={`mt-3 text-xs font-bold ${message.includes('could not') ? 'text-[#a33e38]' : 'text-[#2f6958]'}`}>{message}</p>}
  </section>;
}