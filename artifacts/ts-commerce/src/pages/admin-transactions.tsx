import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, WalletCards, AlertTriangle, Activity } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, MetricCard, SectionHeading } from '@/components/primitives';

type TxRow = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string | null;
  merchant_email: string | null;
  transaction_type: string;
  transaction_kind: string;
  status: string;
  verification_state: string;
  verified_at: string | null;
  amount_minor: number | string;
  currency: string;
  lunavo_fee_minor: number | string;
  provider_fee_minor: number | string;
  merchant_net_minor: number | string;
  provider: string | null;
  provider_reference: string | null;
  internal_reference: string | null;
  idempotency_key: string | null;
  source: string;
  created_at: string;
};
type SummaryRow = {
  currency: string;
  transaction_count: number | string;
  attention_count: number | string;
  verified_count: number | string;
  exception_count: number | string;
};
type PendingWithdrawal = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string;
  merchant_email: string;
  amount: number | string;
  currency: string;
  status: string;
  payout_provider: string | null;
  provider_status: string | null;
  created_at: string;
};
type PendingPaymentIntent = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string;
  merchant_email: string;
  order_id: number | string | null;
  amount_minor: number | string;
  currency: string;
  settlement_amount_minor: number | string | null;
  settlement_currency: string | null;
  method: string;
  status: string;
  evidence_reference: string | null;
  provider_transaction_id: string | null;
  provider_event_id: string | null;
  created_at: string;
  updated_at: string;
};
type ReconciliationException = {
  id: number | string;
  provider: string;
  event_id: string;
  provider_transaction_id: string | null;
  payment_reference: string | null;
  merchant_id: number | string | null;
  merchant_name: string | null;
  order_id: number | string | null;
  payment_intent_id: number | string | null;
  expected_amount_minor: number | string | null;
  observed_amount_minor: number | string | null;
  expected_currency: string | null;
  observed_currency: string | null;
  reason: string;
  status: string;
  created_at: string;
};
type PendingSaleRelease = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string;
  merchant_email: string;
  order_id: number | string | null;
  invoice_id: number | string | null;
  payment_record_id: number | string | null;
  payment_intent_id: number | string | null;
  source_type: string;
  source_reference: string;
  release_amount_minor: number | string;
  currency: string;
  provider_reference: string | null;
  provider_transaction_id: string | null;
  status: string;
  created_at: string;
};
type Feed = {
  transactions: TxRow[];
  summary: SummaryRow[];
  pendingWithdrawals: PendingWithdrawal[];
  pendingPaymentIntents: PendingPaymentIntent[];
  pendingSaleReleases: PendingSaleRelease[];
  openReconciliationExceptions: ReconciliationException[];
  sourceOfTruth: string;
  moneyMovement: 'ledger_release_only';
  message: string;
};
const money = (minor: number | string, currency: string) => {
  const value = Number(minor);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format((Number.isFinite(value) ? value : 0) / 100);
  } catch {
    return `${currency} ${((Number.isFinite(value) ? value : 0) / 100).toFixed(2)}`;
  }
};
const label = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : '—';
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

async function loadFeed(currency: string, verificationState: string, status: string): Promise<Feed> {
  const params = new URLSearchParams({ limit: '150' });
  if (currency) params.set('currency', currency);
  if (verificationState) params.set('verificationState', verificationState);
  if (status) params.set('status', status);
  const response = await fetch(`/api/admin/dashboard/transactions?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'The platform transaction feed could not be loaded.');
  }
  return response.json() as Promise<Feed>;
}

export default function AdminTransactions() {
  const [currency, setCurrency] = useState('');
  const [verificationState, setVerificationState] = useState('');
  const [status, setStatus] = useState('');
  const [saleReleaseActionId, setSaleReleaseActionId] = useState<string | null>(null);
  const [saleReleaseError, setSaleReleaseError] = useState<string | null>(null);
  const feed = useQuery({
    queryKey: ['admin-financial-control-feed', currency, verificationState, status],
    queryFn: () => loadFeed(currency, verificationState, status),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const totals = useMemo(() => (feed.data?.summary ?? []).reduce((sum, row) => ({
    transactions: sum.transactions + Number(row.transaction_count || 0),
    verified: sum.verified + Number(row.verified_count || 0),
    attention: sum.attention + Number(row.attention_count || 0),
    exceptions: sum.exceptions + Number(row.exception_count || 0),
  }), { transactions: 0, verified: 0, attention: 0, exceptions: 0 }), [feed.data?.summary]);

  async function approveSaleRelease(row: PendingSaleRelease) {
    const note = window.prompt(`Finance review for ${row.source_reference}. Confirm the evidence and enter your reason (at least 10 characters):`);
    if (note === null) return;
    if (note.trim().length < 10 || note.trim().length > 500) {
      setSaleReleaseError('Enter a Finance review note of 10–500 characters.');
      return;
    }
    setSaleReleaseError(null);
    setSaleReleaseActionId(String(row.id));
    try {
      const response = await fetch(`/api/admin/dashboard/sale-releases/${row.id}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Sale release was not approved.');
      await feed.refetch();
    } catch (error) {
      setSaleReleaseError(error instanceof Error ? error.message : 'Sale release was not approved.');
    } finally {
      setSaleReleaseActionId(null);
    }
  }

  return <AppShell admin>
    <div className="mx-auto max-w-[1380px] space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a2772e]">Master Admin / TS Pay</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Global money control</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697687]">One platform-wide feed for ledger projections, provider-verified payment events, fee lines, refunds, payout states, and items requiring reconciliation.</p>
        </div>
        <Button variant="secondary" onClick={() => void feed.refetch()} disabled={feed.isFetching}><RefreshCw className={`h-4 w-4 ${feed.isFetching ? 'animate-spin' : ''}`}/>Refresh feed</Button>
      </div>

      <div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4 text-sm leading-6 text-[#765817]">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><p><strong>Controlled release.</strong> New sale credits and positive cutover balances are held in the immutable TS Pay ledger until a Master Admin reviews them here. Approval only releases the ledger hold; it does not itself transfer money to a bank. Payouts stay pending until the payout provider confirms settlement.</p></div>
      </div>

      {feed.isLoading ? <LoadingState label="Loading platform money activity"/> :
       feed.isError ? <ErrorState onRetry={() => void feed.refetch()}/> : <>
        {saleReleaseError ? <div role="alert" className="rounded-xl border border-[#e4bcb5] bg-[#fff9f7] p-3 text-sm text-[#9c3023]">{saleReleaseError}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Held sale proceeds" value={(feed.data?.pendingSaleReleases.length ?? 0).toLocaleString()} detail="Awaiting Master Admin release" icon={<ShieldCheck className="h-5 w-5"/>}/>
          <MetricCard label="Activity rows" value={totals.transactions.toLocaleString()} detail="Matching the selected filters" icon={<Activity className="h-5 w-5"/>}/>
          <MetricCard label="Provider-verified" value={totals.verified.toLocaleString()} detail="Confirmed and verified records" icon={<ShieldCheck className="h-5 w-5"/>}/>
          <MetricCard label="Needs attention" value={totals.attention.toLocaleString()} detail="Pending/unverified ledger projections" icon={<AlertTriangle className="h-5 w-5"/>}/>
          <MetricCard label="Open payment attempts" value={(feed.data?.pendingPaymentIntents.length ?? 0).toLocaleString()} detail="Payment intents not yet terminal" icon={<WalletCards className="h-5 w-5"/>}/>
          <MetricCard label="Reconciliation cases" value={(feed.data?.openReconciliationExceptions.length ?? 0).toLocaleString()} detail="Open provider amount/reference mismatches" icon={<AlertTriangle className="h-5 w-5"/>}/>
        </div>

        <section className="rounded-2xl border border-[#dfc27a] bg-[#fffaf0] p-5 sm:p-6">
          <SectionHeading eyebrow="Mandatory pre-release gate" title="Sale proceeds awaiting Master Admin review" description="Each new positive sale ledger credit is automatically offset by an immutable hold in the same database transaction. The seller cannot spend that credit until a Master Admin approves it here. Pre-cutover positive ledger balances are queued for an explicit transition review too."/>
          {feed.data?.pendingSaleReleases.length ? <div className="mt-4 space-y-3">
            {feed.data.pendingSaleReleases.map(row => <div key={String(row.id)} className="rounded-xl border border-[#e3d5af] bg-white p-4" data-testid={`admin-sale-release-${row.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold">{row.merchant_name || `Merchant #${row.merchant_id}`} · #{row.merchant_id}</p><Badge tone="warning">Pending review</Badge></div>
                  <p className="mt-1 text-xs text-[#697687]">{row.merchant_email} · {label(row.source_type)} · {when(row.created_at)}</p>
                  <p className="mt-2 break-all font-mono text-[10px] text-[#697687]">{row.source_reference}</p>
                  <p className="mt-1 text-[10px] text-[#697687]">Provider reference: {row.provider_reference || '—'} · Transaction: {row.provider_transaction_id || '—'} · Order {row.order_id ?? '—'} · Invoice {row.invoice_id ?? '—'}</p>
                  {row.source_type === 'legacy_balance' ? <p className="mt-2 text-xs font-semibold text-[#765817]">Pre-cutover balance: review merchant history and resolve any reconciliation cases before approval.</p> : null}
                </div>
                <div className="flex min-w-[190px] flex-col items-end gap-3">
                  <p className="font-mono text-lg font-extrabold">{money(row.release_amount_minor,row.currency)} <span className="text-xs text-[#697687]">{row.currency}</span></p>
                  <Button onClick={() => void approveSaleRelease(row)} disabled={saleReleaseActionId !== null || feed.isFetching}>
                    {saleReleaseActionId === String(row.id) ? 'Reviewing…' : 'Approve release'}
                  </Button>
                </div>
              </div>
            </div>)}
          </div> : <EmptyState title="No sale proceeds awaiting review" description="New sale entries are held by the database gate until review. The queue will show pending releases and pre-cutover positive balances when present."/>}
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="Filters" title="Inspect the whole platform" description="Filter to a currency, settlement state, or transaction status. Rows needing reconciliation are sorted first."/>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-[#53647b]">Currency
              <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0,3))} maxLength={3} placeholder="All currencies" className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/>
            </label>
            <label className="text-xs font-bold text-[#53647b]">Verification state
              <select value={verificationState} onChange={e=>setVerificationState(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm">
                <option value="">All states</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="reconciliation_required">Needs reconciliation</option><option value="reversed">Reversed</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#53647b]">Transaction status
              <select value={status} onChange={e=>setStatus(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm">
                <option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="reconciliation_required">Needs reconciliation</option><option value="failed">Failed</option><option value="reversed">Reversed</option><option value="disputed">Disputed</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="TS Pay transaction stream" title="Money activity" description={`${feed.data?.transactions.length ?? 0} most recent records · read-only · reserve rows do not represent money received`}/>
          {feed.data?.transactions.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-[#ded8cd] bg-white">
            <table className="w-full min-w-[1080px] text-left text-xs">
              <thead className="bg-[#f0ede5] text-[10px] uppercase tracking-[.12em] text-[#697687]"><tr>
                <th className="px-3 py-3">Created / Reference</th><th className="px-3 py-3">Merchant</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Gross / currency</th><th className="px-3 py-3">Fees</th><th className="px-3 py-3">Merchant net</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Verification</th><th className="px-3 py-3">Provider</th>
              </tr></thead>
              <tbody className="divide-y divide-[#eee9df]">{feed.data.transactions.map(row => <tr key={String(row.id)} className={row.verification_state === 'reconciliation_required' ? 'bg-[#fff7df]/70' : ''} data-testid={`admin-money-row-${row.id}`}>
                <td className="px-3 py-3"><p className="font-semibold">{when(row.created_at)}</p><p className="mt-1 font-mono text-[10px] text-[#697687]">{row.internal_reference || row.idempotency_key || String(row.id)}</p></td>
                <td className="px-3 py-3"><p className="font-bold">{row.merchant_name || `Merchant #${row.merchant_id}`}</p><p className="mt-1 text-[10px] text-[#697687]">{row.merchant_email || '—'}</p></td>
                <td className="px-3 py-3"><p className="font-semibold">{label(row.transaction_type)}</p><p className="mt-1 text-[10px] text-[#697687]">{label(row.transaction_kind)} · {label(row.source)}</p></td>
                <td className="px-3 py-3 font-mono font-bold">{money(row.amount_minor,row.currency)}</td>
                <td className="px-3 py-3"><p>Lunavo {money(row.lunavo_fee_minor,row.currency)}</p><p className="mt-1 text-[10px] text-[#697687]">Provider {money(row.provider_fee_minor,row.currency)}</p></td>
                <td className="px-3 py-3 font-mono font-bold">{money(row.merchant_net_minor,row.currency)}</td>
                <td className="px-3 py-3"><Badge tone={row.status==='confirmed'?'success':row.status==='failed'||row.status==='reversed'?'danger':'warning'}>{label(row.status)}</Badge></td>
                <td className="px-3 py-3"><Badge tone={row.verification_state==='verified'?'success':row.verification_state==='reversed'?'danger':'warning'}>{label(row.verification_state)}</Badge></td>
                <td className="px-3 py-3"><p>{row.provider || 'Internal ledger'}</p><p className="mt-1 max-w-[190px] truncate font-mono text-[10px] text-[#697687]">{row.provider_reference || '—'}</p></td>
              </tr>)}</tbody>
            </table>
          </div> : <EmptyState title="No matching transactions" description="Verified payments and ledger activity will appear here after they are recorded by Lunavo's server-side financial boundary."/>}
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="Unsettled inflows" title="Payment attempts awaiting a final state" description="These payment intents are not counted as received or spendable funds. This operational queue is independent of the ledger-table status filter above."/>
          {feed.data?.pendingPaymentIntents.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-[#ded8cd] bg-white">
            <table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f0ede5] text-[10px] uppercase tracking-[.12em] text-[#697687]"><tr>
              <th className="px-3 py-3">Attempt</th><th className="px-3 py-3">Merchant / order</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Method / status</th><th className="px-3 py-3">Provider reference</th><th className="px-3 py-3">Created</th>
            </tr></thead><tbody className="divide-y divide-[#eee9df]">{feed.data.pendingPaymentIntents.map(row=><tr key={String(row.id)} data-testid={`admin-pending-payment-${row.id}`}>
              <td className="px-3 py-3 font-mono">PI-{row.id}</td><td className="px-3 py-3"><p className="font-bold">{row.merchant_name || `Merchant #${row.merchant_id}`}</p><p className="mt-1 text-[10px] text-[#697687]">{row.merchant_email} · Order {row.order_id ?? '—'}</p></td>
              <td className="px-3 py-3 font-mono font-bold">{money(row.amount_minor,row.currency)}{row.settlement_currency && row.settlement_amount_minor !== null && row.settlement_currency !== row.currency ? <p className="mt-1 text-[10px] text-[#697687]">Settlement {money(row.settlement_amount_minor,row.settlement_currency)}</p> : null}</td>
              <td className="px-3 py-3"><p>{label(row.method)}</p><Badge tone={['disputed','reconciliation_required'].includes(row.status)?'danger':'warning'}>{label(row.status)}</Badge></td>
              <td className="px-3 py-3"><p className="font-mono">{row.provider_transaction_id || '—'}</p><p className="mt-1 text-[10px] text-[#697687]">{row.provider_event_id || row.evidence_reference || 'No provider evidence yet'}</p></td><td className="px-3 py-3">{when(row.created_at)}</td>
            </tr>)}</tbody></table>
          </div> : <EmptyState title="No open payment attempts" description="All currently tracked payment intents have reached a terminal state."/>}
        </section>

        <section className="rounded-2xl border border-[#e4bcb5] bg-[#fff9f7] p-5 sm:p-6">
          <SectionHeading eyebrow="Finance action required" title="Open reconciliation exceptions" description="Amount, currency, or reference mismatches remain unresolved until a permitted Finance/Admin action resolves them. Raw provider payloads are not exposed in this screen."/>
          {feed.data?.openReconciliationExceptions.length ? <div className="mt-4 space-y-3">{feed.data.openReconciliationExceptions.map(row=><div key={String(row.id)} className="rounded-xl border border-[#e4bcb5] bg-white p-4" data-testid={`admin-reconciliation-${row.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-extrabold">Exception #{row.id} · {row.merchant_name || (row.merchant_id ? `Merchant #${row.merchant_id}` : 'Unmatched merchant')}</p><p className="mt-1 text-xs text-[#697687]">{row.provider} · {when(row.created_at)} · {label(row.status)}</p></div><Badge tone="danger">Unresolved</Badge></div>
            <p className="mt-3 text-sm font-semibold">{row.reason}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-[#f7f4ed] p-3"><p className="text-[10px] font-bold uppercase text-[#697687]">Expected</p><p className="mt-1 font-mono text-sm">{row.expected_amount_minor === null || !row.expected_currency ? '—' : money(row.expected_amount_minor,row.expected_currency)}</p></div><div className="rounded-lg bg-[#f7f4ed] p-3"><p className="text-[10px] font-bold uppercase text-[#697687]">Observed</p><p className="mt-1 font-mono text-sm">{row.observed_amount_minor === null || !row.observed_currency ? '—' : money(row.observed_amount_minor,row.observed_currency)}</p></div></div>
            <p className="mt-3 text-[10px] text-[#697687]">Payment reference: {row.payment_reference || row.provider_transaction_id || row.event_id} · Intent {row.payment_intent_id ?? '—'} · Order {row.order_id ?? '—'}</p>
          </div>)}</div> : <EmptyState title="No open reconciliation exceptions" description="No unresolved provider reconciliation records were found for the selected currency/merchant filter."/>}
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="Payout gate" title="Withdrawals awaiting provider settlement" description="These requests reserve available funds. They must not be counted as paid until the payout provider confirms settlement."/>
          {feed.data?.pendingWithdrawals.length ? <div className="mt-4 space-y-2">{feed.data.pendingWithdrawals.map(row=><div key={String(row.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ded8cd] bg-white p-4" data-testid={`admin-payout-row-${row.id}`}>
            <div><p className="text-sm font-bold">{row.merchant_name || `Merchant #${row.merchant_id}`} · #{row.id}</p><p className="mt-1 text-xs text-[#697687]">{row.merchant_email} · {row.payout_provider || 'provider unassigned'} · {label(row.provider_status)} · {when(row.created_at)}</p></div>
            <div className="flex items-center gap-3"><p className="font-mono text-sm font-bold">{money(Math.round(Number(row.amount)*100),row.currency)}</p><Badge tone={row.status==='approved'?'info':'warning'}>{label(row.status)}</Badge></div>
          </div>)}</div> : <EmptyState title="No pending payouts" description="All currently listed payout requests have been settled, rejected, or no pending requests exist."/>}
        </section>
       </>}
    </div>
  </AppShell>;
}
